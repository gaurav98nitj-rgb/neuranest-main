"""
Social Listening NLP Pipeline — Daily Celery Task.

Processes review aspects and brand mentions to:
1. Run sentiment analysis on un-scored items
2. Detect feature requests in review aspects
3. Generate embeddings for clustering
4. Cluster negative aspects into complaint themes
5. Update brand_sentiment_daily rollups
"""
import json
from datetime import datetime, date

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()


def _process_review_aspects(session) -> dict:
    """
    Process review aspects: sentiment, feature request detection, embeddings.
    Only processes aspects that haven't been analyzed yet (sentiment IS NULL).
    """
    from app.services.nlp import analyze_sentiment, detect_feature_request, generate_embeddings

    # Fetch unprocessed aspects (no sentiment yet, or no embedding)
    rows = session.execute(text("""
        SELECT ra.id, ra.aspect, ra.evidence_snippet, ra.sentiment, ra.embedding IS NULL as needs_embedding
        FROM review_aspects ra
        WHERE ra.sentiment IS NULL
           OR (ra.embedding IS NULL AND ra.evidence_snippet IS NOT NULL)
        LIMIT 5000
    """)).fetchall()

    if not rows:
        logger.info("nlp_pipeline: no unprocessed review aspects")
        return {"aspects_processed": 0, "feature_requests_found": 0}

    logger.info("nlp_pipeline: processing review aspects", count=len(rows))

    # Batch sentiment analysis
    texts_for_sentiment = []
    ids_for_sentiment = []
    texts_for_embedding = []
    ids_for_embedding = []

    for row in rows:
        text_content = row.evidence_snippet or row.aspect
        if row.sentiment is None and text_content:
            texts_for_sentiment.append(text_content)
            ids_for_sentiment.append(row.id)
        if row.needs_embedding and text_content:
            texts_for_embedding.append(text_content)
            ids_for_embedding.append(row.id)

    # Run sentiment analysis
    sentiment_updated = 0
    feature_requests = 0

    if texts_for_sentiment:
        for i, txt in enumerate(texts_for_sentiment):
            try:
                result = analyze_sentiment(txt)
                fr_result = detect_feature_request(txt)

                session.execute(text("""
                    UPDATE review_aspects
                    SET sentiment = :sentiment,
                        confidence = :confidence,
                        is_feature_request = :is_fr
                    WHERE id = :id
                """), {
                    "id": ids_for_sentiment[i],
                    "sentiment": result.label,
                    "confidence": result.confidence,
                    "is_fr": fr_result.is_feature_request,
                })
                sentiment_updated += 1
                if fr_result.is_feature_request:
                    feature_requests += 1

            except Exception as e:
                logger.warning("nlp_pipeline: aspect sentiment failed",
                               aspect_id=ids_for_sentiment[i], error=str(e))

    # Generate embeddings in batch
    embeddings_updated = 0
    if texts_for_embedding:
        try:
            embeddings = generate_embeddings(texts_for_embedding)
            for i, emb in enumerate(embeddings):
                if emb:
                    session.execute(text("""
                        UPDATE review_aspects
                        SET embedding = :embedding
                        WHERE id = :id
                    """), {
                        "id": ids_for_embedding[i],
                        "embedding": str(emb),
                    })
                    embeddings_updated += 1
        except Exception as e:
            logger.error("nlp_pipeline: embedding generation failed", error=str(e))

    logger.info("nlp_pipeline: review aspects done",
                sentiment_updated=sentiment_updated,
                embeddings_updated=embeddings_updated,
                feature_requests=feature_requests)

    return {
        "aspects_processed": sentiment_updated,
        "embeddings_generated": embeddings_updated,
        "feature_requests_found": feature_requests,
    }


def _process_brand_mentions(session) -> dict:
    """
    Process brand mentions: sentiment analysis on un-scored mentions.
    """
    from app.services.nlp import analyze_sentiment

    rows = session.execute(text("""
        SELECT id, text
        FROM brand_mentions
        WHERE sentiment IS NULL AND text IS NOT NULL
        LIMIT 5000
    """)).fetchall()

    if not rows:
        return {"mentions_processed": 0}

    logger.info("nlp_pipeline: processing brand mentions", count=len(rows))

    processed = 0
    for row in rows:
        try:
            result = analyze_sentiment(row.text)
            session.execute(text("""
                UPDATE brand_mentions
                SET sentiment = :sentiment, sentiment_score = :score
                WHERE id = :id
            """), {
                "id": row.id,
                "sentiment": result.label,
                "score": result.score,
            })
            processed += 1
        except Exception as e:
            logger.warning("nlp_pipeline: mention sentiment failed",
                           mention_id=row.id, error=str(e))

    return {"mentions_processed": processed}


def _cluster_negative_aspects(session) -> dict:
    """
    Cluster negative review aspects into complaint themes using HDBSCAN.
    Only clusters aspects with embeddings and negative sentiment.
    """
    from app.services.clustering import cluster_texts

    rows = session.execute(text("""
        SELECT ra.id, ra.evidence_snippet, ra.aspect, ra.confidence,
               ra.embedding::text as embedding_text
        FROM review_aspects ra
        WHERE ra.sentiment = 'negative'
          AND ra.embedding IS NOT NULL
          AND ra.cluster_id IS NULL
        ORDER BY ra.id
        LIMIT 10000
    """)).fetchall()

    if len(rows) < 3:
        logger.info("nlp_pipeline: not enough negative aspects to cluster", count=len(rows))
        return {"clustered": 0, "clusters_found": 0}

    logger.info("nlp_pipeline: clustering negative aspects", count=len(rows))

    texts = [r.evidence_snippet or r.aspect for r in rows]
    ids = [r.id for r in rows]

    # Parse embeddings from string representation
    embeddings = []
    for row in rows:
        try:
            emb_str = row.embedding_text.strip("[]")
            emb = [float(x) for x in emb_str.split(",")]
            embeddings.append(emb)
        except (ValueError, AttributeError):
            embeddings.append([])

    sentiment_scores = [float(r.confidence) * -1 if r.confidence else -0.5 for r in rows]

    result = cluster_texts(
        texts=texts,
        embeddings=embeddings,
        min_cluster_size=3,
        min_samples=2,
        sentiment_scores=sentiment_scores,
    )

    # Update cluster_id on aspects
    clustered = 0
    for i, label in enumerate(result.labels):
        if label >= 0:
            session.execute(text("""
                UPDATE review_aspects SET cluster_id = :cid WHERE id = :id
            """), {"id": ids[i], "cid": label})
            clustered += 1

    logger.info("nlp_pipeline: clustering done",
                clustered=clustered, clusters=len(result.clusters), noise=result.noise_count)

    return {
        "clustered": clustered,
        "clusters_found": len(result.clusters),
        "noise": result.noise_count,
        "cluster_details": [
            {"id": c.cluster_id, "label": c.label, "size": c.size, "keywords": c.top_keywords}
            for c in result.clusters
        ],
    }


def _update_brand_sentiment_rollups(session) -> dict:
    """
    Compute daily sentiment rollups per brand from brand_mentions.
    Upserts into brand_sentiment_daily.
    """
    today = date.today()

    # Get brands with recent mentions
    brands = session.execute(text("""
        SELECT DISTINCT brand_id FROM brand_mentions
        WHERE mention_date >= CURRENT_DATE - INTERVAL '7 days'
    """)).fetchall()

    if not brands:
        return {"brands_rolled_up": 0}

    rolled_up = 0
    for brand_row in brands:
        bid = str(brand_row.brand_id)

        # Per-source rollup
        sources = session.execute(text("""
            SELECT
                source,
                COUNT(*) as mention_count,
                COUNT(*) FILTER (WHERE sentiment = 'positive') as pos,
                COUNT(*) FILTER (WHERE sentiment = 'negative') as neg,
                COUNT(*) FILTER (WHERE sentiment = 'neutral') as neu,
                AVG(sentiment_score) as avg_score,
                AVG(engagement) as avg_eng
            FROM brand_mentions
            WHERE brand_id = :bid AND mention_date = :dt
            GROUP BY source
        """), {"bid": bid, "dt": today}).fetchall()

        total_mentions = 0
        total_pos = 0
        total_neg = 0
        total_neu = 0
        all_scores = []

        for src in sources:
            session.execute(text("""
                INSERT INTO brand_sentiment_daily
                    (brand_id, date, source, mention_count,
                     positive_count, negative_count, neutral_count,
                     avg_sentiment, avg_engagement)
                VALUES (:bid, :dt, :src, :cnt, :pos, :neg, :neu, :avg_s, :avg_e)
                ON CONFLICT (brand_id, date, source)
                DO UPDATE SET
                    mention_count = :cnt, positive_count = :pos,
                    negative_count = :neg, neutral_count = :neu,
                    avg_sentiment = :avg_s, avg_engagement = :avg_e
            """), {
                "bid": bid, "dt": today, "src": src.source,
                "cnt": src.mention_count, "pos": src.pos,
                "neg": src.neg, "neu": src.neu,
                "avg_s": round(float(src.avg_score), 4) if src.avg_score else None,
                "avg_e": round(float(src.avg_eng), 2) if src.avg_eng else None,
            })

            total_mentions += src.mention_count
            total_pos += src.pos
            total_neg += src.neg
            total_neu += src.neu
            if src.avg_score is not None:
                all_scores.append(float(src.avg_score))

        # "all" source rollup
        avg_all = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
        session.execute(text("""
            INSERT INTO brand_sentiment_daily
                (brand_id, date, source, mention_count,
                 positive_count, negative_count, neutral_count, avg_sentiment)
            VALUES (:bid, :dt, 'all', :cnt, :pos, :neg, :neu, :avg_s)
            ON CONFLICT (brand_id, date, source)
            DO UPDATE SET
                mention_count = :cnt, positive_count = :pos,
                negative_count = :neg, neutral_count = :neu,
                avg_sentiment = :avg_s
        """), {
            "bid": bid, "dt": today,
            "cnt": total_mentions, "pos": total_pos,
            "neg": total_neg, "neu": total_neu,
            "avg_s": avg_all,
        })

        rolled_up += 1

    return {"brands_rolled_up": rolled_up}


@celery_app.task(
    name="app.tasks.nlp_pipeline.run_social_listening_nlp_daily",
    bind=True, max_retries=1, default_retry_delay=180,
    soft_time_limit=1800, time_limit=2400,
)
def run_social_listening_nlp_daily(self):
    """
    Daily NLP pipeline:
    1. Analyze sentiment on new review aspects
    2. Detect feature requests
    3. Generate embeddings
    4. Cluster negative aspects into complaint themes
    5. Analyze sentiment on new brand mentions
    6. Update brand sentiment daily rollups
    """
    started = datetime.utcnow()
    today = date.today()
    total_errors = 0
    results = {}

    logger.info("nlp_pipeline: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="nlp_pipeline_daily",
            run_date=today, status="running", started_at=started
        )

    # Step 1-3: Process review aspects (sentiment + feature requests + embeddings)
    try:
        with get_sync_db() as session:
            results["review_aspects"] = _process_review_aspects(session)
    except Exception as e:
        total_errors += 1
        logger.error("nlp_pipeline: review aspects failed", error=str(e))
        results["review_aspects"] = {"error": str(e)}
        with get_sync_db() as session:
            log_error(session, "nlp_pipeline", type(e).__name__, str(e), {"step": "review_aspects"})

    # Step 4: Cluster negative aspects
    try:
        with get_sync_db() as session:
            results["clustering"] = _cluster_negative_aspects(session)
    except Exception as e:
        total_errors += 1
        logger.error("nlp_pipeline: clustering failed", error=str(e))
        results["clustering"] = {"error": str(e)}
        with get_sync_db() as session:
            log_error(session, "nlp_pipeline", type(e).__name__, str(e), {"step": "clustering"})

    # Step 5: Process brand mentions
    try:
        with get_sync_db() as session:
            results["brand_mentions"] = _process_brand_mentions(session)
    except Exception as e:
        total_errors += 1
        logger.error("nlp_pipeline: brand mentions failed", error=str(e))
        results["brand_mentions"] = {"error": str(e)}
        with get_sync_db() as session:
            log_error(session, "nlp_pipeline", type(e).__name__, str(e), {"step": "brand_mentions"})

    # Step 6: Brand sentiment rollups
    try:
        with get_sync_db() as session:
            results["rollups"] = _update_brand_sentiment_rollups(session)
    except Exception as e:
        total_errors += 1
        logger.error("nlp_pipeline: rollups failed", error=str(e))
        results["rollups"] = {"error": str(e)}
        with get_sync_db() as session:
            log_error(session, "nlp_pipeline", type(e).__name__, str(e), {"step": "rollups"})

    # Wrap up
    status = "success" if total_errors == 0 else ("partial" if total_errors < 4 else "failed")
    total_processed = (
        results.get("review_aspects", {}).get("aspects_processed", 0) +
        results.get("brand_mentions", {}).get("mentions_processed", 0)
    )

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_processed, total_processed, 0, total_errors)

    results["run_id"] = run_id
    results["status"] = status
    results["errors"] = total_errors
    results["duration_seconds"] = (datetime.utcnow() - started).total_seconds()

    logger.info("nlp_pipeline: complete", **{k: v for k, v in results.items() if k != "clustering"})
    return results
