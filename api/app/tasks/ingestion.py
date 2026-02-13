"""
Data ingestion tasks: Google Trends & Reddit.

Google Trends: Fetches interest_over_time for active topics via pytrends.
Reddit: Fetches mention counts from seed subreddits via PRAW or httpx fallback.
"""
import time
import random
import uuid
import json
from datetime import datetime, date, timedelta

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()

# ─── Config ───
GOOGLE_TRENDS_BATCH_SIZE = 5  # pytrends limit per request
GOOGLE_TRENDS_SLEEP_MIN = 3   # seconds between requests
GOOGLE_TRENDS_SLEEP_MAX = 6
GOOGLE_TRENDS_TIMEFRAME = "today 3-m"  # last 3 months
GOOGLE_TRENDS_MAX_RETRIES = 3

REDDIT_SUBREDDITS = [
    "ecommerce", "AmazonSeller", "Entrepreneur", "dropship",
    "FulfillmentByAmazon", "SideProject", "shutupandtakemymoney",
    "BuyItForLife", "gadgets", "InternetIsBeautiful",
]
REDDIT_USER_AGENT = "NeuraNest/1.0 (trend intelligence platform)"


def _get_active_keywords(session) -> list[dict]:
    """Fetch active topics and their primary keywords."""
    rows = session.execute(text("""
        SELECT t.id as topic_id, t.name as topic_name, t.slug,
               COALESCE(
                   (SELECT k.keyword FROM keywords k WHERE k.topic_id = t.id LIMIT 1),
                   t.name
               ) as keyword
        FROM topics t
        WHERE t.is_active = true
        ORDER BY t.name
    """)).fetchall()
    return [{"topic_id": str(r.topic_id), "topic_name": r.topic_name,
             "slug": r.slug, "keyword": r.keyword} for r in rows]


def _batch_keywords(keywords: list[dict], batch_size: int) -> list[list[dict]]:
    """Split keywords into batches for pytrends."""
    return [keywords[i:i + batch_size] for i in range(0, len(keywords), batch_size)]


# ═══════════════════════════════════════════════════════
#  GOOGLE TRENDS INGESTION
# ═══════════════════════════════════════════════════════

@celery_app.task(name="app.tasks.ingestion.ingest_google_trends",
                 bind=True, max_retries=2, default_retry_delay=300)
def ingest_google_trends(self):
    """
    Daily Google Trends ingestion for all active topics.
    Fetches interest_over_time via pytrends, upserts into source_timeseries.
    """
    started = datetime.utcnow()
    today = date.today()
    total_fetched = 0
    total_inserted = 0
    total_skipped = 0
    total_errors = 0

    logger.info("google_trends_ingest: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="google_trends_ingest_daily",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        from pytrends.request import TrendReq

        pytrends = TrendReq(hl="en-US", tz=360, retries=2, backoff_factor=0.5)

        with get_sync_db() as session:
            keywords = _get_active_keywords(session)

        if not keywords:
            logger.warning("google_trends_ingest: no active topics found")
            with get_sync_db() as session:
                update_ingestion_run(session, run_id, "success", 0, 0, 0, 0)
            return {"status": "no_topics", "run_id": run_id}

        batches = _batch_keywords(keywords, GOOGLE_TRENDS_BATCH_SIZE)
        logger.info("google_trends_ingest: processing batches",
                     total_keywords=len(keywords), batches=len(batches))

        for batch_idx, batch in enumerate(batches):
            kw_list = [item["keyword"] for item in batch]
            topic_map = {item["keyword"]: item["topic_id"] for item in batch}

            for attempt in range(GOOGLE_TRENDS_MAX_RETRIES):
                try:
                    pytrends.build_payload(kw_list, timeframe=GOOGLE_TRENDS_TIMEFRAME, geo="US")
                    df = pytrends.interest_over_time()

                    if df is not None and not df.empty:
                        # Drop the isPartial column if present
                        if "isPartial" in df.columns:
                            df = df.drop(columns=["isPartial"])

                        with get_sync_db() as session:
                            for keyword_col in df.columns:
                                topic_id = topic_map.get(keyword_col)
                                if not topic_id:
                                    continue

                                for dt_idx, value in df[keyword_col].items():
                                    row_date = dt_idx.date() if hasattr(dt_idx, "date") else dt_idx
                                    total_fetched += 1

                                    try:
                                        session.execute(text("""
                                            INSERT INTO source_timeseries
                                                (topic_id, source, date, geo, raw_value, normalized_value, created_at)
                                            VALUES (:tid, 'google_trends', :dt, 'US', :raw, :norm, :now)
                                            ON CONFLICT (topic_id, source, date, geo)
                                            DO UPDATE SET raw_value = :raw, normalized_value = :norm
                                        """), {
                                            "tid": topic_id, "dt": row_date,
                                            "raw": float(value), "norm": min(100, max(0, float(value))),
                                            "now": datetime.utcnow(),
                                        })
                                        total_inserted += 1
                                    except Exception as e:
                                        total_errors += 1
                                        logger.error("google_trends_ingest: row insert error",
                                                      keyword=keyword_col, error=str(e))

                    # Also fetch related queries for topic enrichment
                    try:
                        related = pytrends.related_queries()
                        with get_sync_db() as session:
                            for kw, queries in related.items():
                                topic_id = topic_map.get(kw)
                                if not topic_id or queries is None:
                                    continue
                                for qtype in ["top", "rising"]:
                                    qdf = queries.get(qtype)
                                    if qdf is None or qdf.empty:
                                        continue
                                    for _, row in qdf.head(5).iterrows():
                                        query_kw = row.get("query", "")
                                        if query_kw:
                                            session.execute(text("""
                                                INSERT INTO keywords (id, topic_id, keyword, source, geo, language)
                                                VALUES (:id, :tid, :kw, 'gtrends', 'US', 'en')
                                                ON CONFLICT (keyword, source, geo) DO NOTHING
                                            """), {
                                                "id": str(uuid.uuid4()),
                                                "tid": topic_id,
                                                "kw": query_kw[:500],
                                            })
                    except Exception as e:
                        logger.warning("google_trends_ingest: related queries failed", error=str(e))

                    break  # Success, exit retry loop

                except Exception as e:
                    if "429" in str(e) or "Too Many" in str(e):
                        wait = 60 * (attempt + 1) + random.randint(0, 30)
                        logger.warning("google_trends_ingest: rate limited, waiting",
                                        wait_seconds=wait, attempt=attempt + 1)
                        time.sleep(wait)
                    else:
                        total_errors += 1
                        logger.error("google_trends_ingest: batch error",
                                      batch=batch_idx, error=str(e), attempt=attempt + 1)
                        if attempt == GOOGLE_TRENDS_MAX_RETRIES - 1:
                            with get_sync_db() as session:
                                log_error(session, "google_trends_ingest", type(e).__name__,
                                          str(e), {"batch": kw_list})
                        time.sleep(10)

            # Rate limiting between batches
            sleep_time = random.uniform(GOOGLE_TRENDS_SLEEP_MIN, GOOGLE_TRENDS_SLEEP_MAX)
            time.sleep(sleep_time)

        status = "success" if total_errors == 0 else "partial"

    except ImportError:
        logger.error("google_trends_ingest: pytrends not installed. Run: pip install pytrends")
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "google_trends_ingest", "ImportError",
                      "pytrends package not installed")

    except Exception as e:
        logger.error("google_trends_ingest: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "google_trends_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_fetched, total_inserted, total_skipped, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "fetched": total_fetched, "inserted": total_inserted, "errors": total_errors,
    }
    logger.info("google_trends_ingest: complete", **result)
    return result


# ═══════════════════════════════════════════════════════
#  REDDIT MENTIONS INGESTION
# ═══════════════════════════════════════════════════════

@celery_app.task(name="app.tasks.ingestion.ingest_reddit_mentions",
                 bind=True, max_retries=2, default_retry_delay=300)
def ingest_reddit_mentions(self):
    """
    Daily Reddit mention counts for active topics.
    Uses PRAW if credentials are configured, otherwise uses httpx + public JSON API.
    """
    started = datetime.utcnow()
    today = date.today()
    total_fetched = 0
    total_inserted = 0
    total_errors = 0

    logger.info("reddit_ingest: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="reddit_mentions_ingest_daily",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        from app.config import get_settings
        cfg = get_settings()

        with get_sync_db() as session:
            keywords = _get_active_keywords(session)

        if not keywords:
            with get_sync_db() as session:
                update_ingestion_run(session, run_id, "success", 0, 0, 0, 0)
            return {"status": "no_topics", "run_id": run_id}

        # Determine Reddit client
        use_praw = bool(cfg.REDDIT_CLIENT_ID and cfg.REDDIT_CLIENT_SECRET)
        reddit = None

        if use_praw:
            try:
                import praw
                reddit = praw.Reddit(
                    client_id=cfg.REDDIT_CLIENT_ID,
                    client_secret=cfg.REDDIT_CLIENT_SECRET,
                    user_agent=REDDIT_USER_AGENT,
                )
                logger.info("reddit_ingest: using PRAW (authenticated)")
            except ImportError:
                logger.warning("reddit_ingest: praw not installed, falling back to httpx")
                use_praw = False

        if not use_praw:
            import httpx
            logger.info("reddit_ingest: using httpx (public JSON API)")

        subreddit_str = "+".join(REDDIT_SUBREDDITS)

        for kw_item in keywords:
            keyword = kw_item["keyword"]
            topic_id = kw_item["topic_id"]

            try:
                mention_count = 0
                total_score = 0
                comment_count = 0
                top_subreddit = None

                if use_praw and reddit:
                    # Search across subreddits for posts in last 24h
                    results = reddit.subreddit(subreddit_str).search(
                        keyword, time_filter="day", sort="relevance", limit=100
                    )
                    sub_counts = {}
                    for post in results:
                        mention_count += 1
                        total_score += post.score
                        comment_count += post.num_comments
                        sub_name = post.subreddit.display_name
                        sub_counts[sub_name] = sub_counts.get(sub_name, 0) + 1

                    if sub_counts:
                        top_subreddit = max(sub_counts, key=sub_counts.get)

                else:
                    # Fallback: public Reddit JSON API (no auth needed, rate limited)
                    import httpx
                    url = f"https://www.reddit.com/search.json?q={keyword}&sort=new&t=day&limit=25"
                    headers = {"User-Agent": REDDIT_USER_AGENT}

                    with httpx.Client(timeout=15) as client:
                        resp = client.get(url, headers=headers)
                        if resp.status_code == 200:
                            data = resp.json()
                            posts = data.get("data", {}).get("children", [])
                            sub_counts = {}
                            for post_wrap in posts:
                                post = post_wrap.get("data", {})
                                mention_count += 1
                                total_score += post.get("score", 0)
                                comment_count += post.get("num_comments", 0)
                                sub_name = post.get("subreddit", "")
                                sub_counts[sub_name] = sub_counts.get(sub_name, 0) + 1

                            if sub_counts:
                                top_subreddit = max(sub_counts, key=sub_counts.get)
                        elif resp.status_code == 429:
                            logger.warning("reddit_ingest: rate limited, sleeping 60s")
                            time.sleep(60)

                total_fetched += 1

                # Upsert into source_timeseries
                metadata = {
                    "mention_count": mention_count,
                    "avg_score": round(total_score / max(mention_count, 1), 1),
                    "comment_count": comment_count,
                    "top_subreddit": top_subreddit,
                }

                with get_sync_db() as session:
                    session.execute(text("""
                        INSERT INTO source_timeseries
                            (topic_id, source, date, geo, raw_value, normalized_value, created_at)
                        VALUES (:tid, 'reddit', :dt, 'US', :raw, :norm, :now)
                        ON CONFLICT (topic_id, source, date, geo)
                        DO UPDATE SET raw_value = :raw, normalized_value = :norm
                    """), {
                        "tid": topic_id, "dt": today,
                        "raw": float(mention_count),
                        "norm": min(100, float(mention_count) * 2),  # Rough normalization
                        "now": datetime.utcnow(),
                    })
                    total_inserted += 1

                # Rate limit: be nice to Reddit
                time.sleep(random.uniform(1.5, 3.0))

            except Exception as e:
                total_errors += 1
                logger.error("reddit_ingest: keyword error", keyword=keyword, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "reddit_ingest", type(e).__name__,
                              str(e), {"keyword": keyword, "topic_id": topic_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("reddit_ingest: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "reddit_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_fetched, total_inserted, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "fetched": total_fetched, "inserted": total_inserted, "errors": total_errors,
    }
    logger.info("reddit_ingest: complete", **result)
    return result
