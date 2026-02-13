"""
UDSI Signal Fusion — Unified Demand Signal Index.

Combines all available signals into a single 0-100 score per topic:
  - Google Trends momentum (growth + acceleration)
  - Reddit social velocity
  - Amazon competition gap (inverse competition)
  - Review gap (quality gaps = opportunity)
  - Forecast uplift (Prophet predictions)

Writes to signal_fusion_daily + updates topics.udsi_score.
"""
import uuid
import json
from datetime import datetime, date, timedelta

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()

# Signal weights (sum to 1.0)
WEIGHTS = {
    "google": 0.30,
    "reddit": 0.15,
    "amazon_gap": 0.20,
    "review_gap": 0.15,
    "forecast": 0.10,
    "cross_source": 0.10,
}


def _normalize(value, min_val=0, max_val=100):
    """Clamp and normalize a value to 0-100."""
    return round(max(0, min(100, float(value))), 2)


def _compute_google_signal(session, topic_id: str) -> float:
    """Google Trends signal: recent growth + acceleration."""
    rows = session.execute(text("""
        SELECT normalized_value FROM source_timeseries
        WHERE topic_id = :tid AND source = 'google_trends' AND geo = 'US'
        ORDER BY date DESC LIMIT 13
    """), {"tid": topic_id}).fetchall()

    if len(rows) < 4:
        return 50.0  # neutral default

    values = [float(r.normalized_value) for r in reversed(rows) if r.normalized_value]
    if not values:
        return 50.0

    # Current value relative to range
    level = values[-1]

    # 4-week growth
    if len(values) >= 5:
        old = (values[-5] + values[-4]) / 2
        new = (values[-1] + values[-2]) / 2
        growth = ((new - old) / max(old, 1)) * 100
    else:
        growth = 0

    # Acceleration
    if len(values) >= 8:
        recent_growth = (values[-1] - values[-4]) / max(values[-4], 1) * 100
        earlier_growth = (values[-4] - values[-8]) / max(values[-8], 1) * 100
        accel = recent_growth - earlier_growth
    else:
        accel = 0

    # Combine: 40% level, 40% growth, 20% acceleration
    signal = 0.4 * level + 0.4 * _normalize(growth * 3 + 50) + 0.2 * _normalize(accel * 5 + 50)
    return _normalize(signal)


def _compute_reddit_signal(session, topic_id: str) -> float:
    """Reddit signal: mention velocity and engagement."""
    rows = session.execute(text("""
        SELECT raw_value FROM source_timeseries
        WHERE topic_id = :tid AND source = 'reddit' AND geo = 'US'
        ORDER BY date DESC LIMIT 4
    """), {"tid": topic_id}).fetchall()

    if not rows:
        return 50.0

    values = [float(r.raw_value) for r in reversed(rows) if r.raw_value]
    if not values:
        return 50.0

    latest = values[-1]
    # Normalize: 0 mentions = 30, 25+ mentions = 90
    mention_score = _normalize(30 + latest * 2.4)

    # Velocity
    if len(values) >= 2:
        velocity = (values[-1] - values[0]) / max(values[0], 1) * 100
        velocity_score = _normalize(velocity * 2 + 50)
    else:
        velocity_score = 50

    return _normalize(0.6 * mention_score + 0.4 * velocity_score)


def _compute_amazon_gap_signal(session, topic_id: str) -> float:
    """Amazon competition gap: inverse competition = opportunity."""
    row = session.execute(text("""
        SELECT listing_count, median_reviews, brand_hhi, avg_rating, top3_brand_share
        FROM amazon_competition_snapshot
        WHERE topic_id = :tid
        ORDER BY date DESC LIMIT 1
    """), {"tid": topic_id}).fetchone()

    if not row:
        return 50.0

    listing_count = row.listing_count or 100
    median_reviews = row.median_reviews or 500
    brand_hhi = float(row.brand_hhi) if row.brand_hhi else 0.2
    avg_rating = float(row.avg_rating) if row.avg_rating else 4.0
    top3 = float(row.top3_brand_share) if row.top3_brand_share else 0.3

    # Low listings = high opportunity
    listing_score = _normalize(100 - (listing_count / 20))
    # Low reviews = easier entry
    review_barrier = _normalize(100 - (median_reviews / 100))
    # High HHI = concentrated market = harder entry (invert)
    concentration = _normalize((1 - brand_hhi) * 100)
    # Low avg rating = quality gap opportunity
    rating_gap = _normalize((5.0 - avg_rating) * 50)
    # Low top3 share = fragmented = opportunity
    fragmentation = _normalize((1 - top3) * 100)

    return _normalize(
        0.25 * listing_score +
        0.20 * review_barrier +
        0.20 * concentration +
        0.20 * rating_gap +
        0.15 * fragmentation
    )


def _compute_review_gap_signal(session, topic_id: str) -> float:
    """Review gap: negative sentiment + feature requests = product opportunity."""
    # Get ASINs linked to this topic
    asins = session.execute(text("""
        SELECT asin FROM topic_top_asins WHERE topic_id = :tid
    """), {"tid": topic_id}).fetchall()

    if not asins:
        return 50.0

    asin_list = [r.asin for r in asins]
    placeholders = ",".join(f"'{a}'" for a in asin_list)

    # Count negative aspects and feature requests
    stats = session.execute(text(f"""
        SELECT
            COUNT(*) FILTER (WHERE ra.sentiment = 'negative') as neg_count,
            COUNT(*) FILTER (WHERE ra.is_feature_request = true) as fr_count,
            COUNT(*) as total
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        WHERE r.asin IN ({placeholders})
    """)).fetchone()

    total = stats.total or 1
    neg_pct = (stats.neg_count or 0) / total * 100
    fr_pct = (stats.fr_count or 0) / total * 100

    # Higher negative + feature requests = MORE opportunity (customers want better)
    return _normalize(neg_pct * 1.5 + fr_pct * 3 + 20)


def _compute_forecast_signal(session, topic_id: str) -> float:
    """Forecast signal: predicted growth direction."""
    row = session.execute(text("""
        SELECT yhat, yhat_lower, yhat_upper
        FROM forecasts
        WHERE topic_id = :tid AND horizon_months = 3
        ORDER BY generated_at DESC LIMIT 1
    """), {"tid": topic_id}).fetchone()

    current = session.execute(text("""
        SELECT normalized_value FROM source_timeseries
        WHERE topic_id = :tid AND source = 'google_trends'
        ORDER BY date DESC LIMIT 1
    """), {"tid": topic_id}).fetchone()

    if not row or not current:
        return 50.0

    cur_val = float(current.normalized_value) if current.normalized_value else 50
    forecast_val = float(row.yhat) if row.yhat else cur_val
    pct_change = ((forecast_val - cur_val) / max(cur_val, 1)) * 100

    return _normalize(pct_change * 2 + 50)


def _compute_cross_source_signal(session, topic_id: str) -> float:
    """Cross-source agreement: more sources showing growth = stronger signal."""
    sources = session.execute(text("""
        SELECT source, array_agg(normalized_value ORDER BY date DESC) as vals
        FROM source_timeseries
        WHERE topic_id = :tid AND date >= :cutoff
        GROUP BY source
    """), {"tid": topic_id, "cutoff": date.today() - timedelta(days=60)}).fetchall()

    if not sources:
        return 50.0

    growing_count = 0
    total_sources = len(sources)

    for src in sources:
        vals = [float(v) for v in (src.vals or []) if v is not None]
        if len(vals) >= 2 and vals[0] > vals[-1]:  # newest > oldest
            growing_count += 1

    agreement = growing_count / max(total_sources, 1)
    # Also bonus for having more sources
    source_bonus = min(total_sources * 10, 30)

    return _normalize(agreement * 70 + source_bonus)


def _determine_confidence(sources_count, data_weeks, has_reviews, has_forecast):
    """Determine confidence level based on data availability."""
    score = 0
    if sources_count >= 3:
        score += 3
    elif sources_count >= 2:
        score += 2
    else:
        score += 1
    if data_weeks >= 12:
        score += 2
    elif data_weeks >= 4:
        score += 1
    if has_reviews:
        score += 1
    if has_forecast:
        score += 1

    if score >= 6:
        return "high"
    elif score >= 4:
        return "medium"
    return "low"


@celery_app.task(name="app.tasks.signal_fusion.compute_udsi_daily",
                 bind=True, max_retries=1, default_retry_delay=120)
def compute_udsi_daily(self):
    """
    Compute UDSI (Unified Demand Signal Index) for all active topics.
    Combines Google Trends, Reddit, Amazon, Reviews, and Forecast into one score.
    """
    started = datetime.utcnow()
    today = date.today()
    total_topics = 0
    total_computed = 0
    total_errors = 0

    logger.info("udsi_fusion: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="udsi_fusion_daily",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        with get_sync_db() as session:
            topics = session.execute(text("""
                SELECT id, name, stage FROM topics WHERE is_active = true
            """)).fetchall()

        for topic in topics:
            topic_id = str(topic.id)
            total_topics += 1

            try:
                with get_sync_db() as session:
                    google = _compute_google_signal(session, topic_id)
                    reddit = _compute_reddit_signal(session, topic_id)
                    amazon_gap = _compute_amazon_gap_signal(session, topic_id)
                    review_gap = _compute_review_gap_signal(session, topic_id)
                    forecast = _compute_forecast_signal(session, topic_id)
                    cross_source = _compute_cross_source_signal(session, topic_id)

                    # Weighted UDSI score
                    udsi = _normalize(
                        WEIGHTS["google"] * google +
                        WEIGHTS["reddit"] * reddit +
                        WEIGHTS["amazon_gap"] * amazon_gap +
                        WEIGHTS["review_gap"] * review_gap +
                        WEIGHTS["forecast"] * forecast +
                        WEIGHTS["cross_source"] * cross_source
                    )

                    # Confidence
                    src_count = session.execute(text("""
                        SELECT COUNT(DISTINCT source) FROM source_timeseries WHERE topic_id = :tid
                    """), {"tid": topic_id}).scalar() or 0

                    data_weeks_row = session.execute(text("""
                        SELECT (MAX(date) - MIN(date)) / 7 as weeks
                        FROM source_timeseries WHERE topic_id = :tid
                    """), {"tid": topic_id}).fetchone()
                    data_weeks = int(data_weeks_row.weeks) if data_weeks_row and data_weeks_row.weeks else 0

                    has_reviews = session.execute(text("""
                        SELECT EXISTS(
                            SELECT 1 FROM topic_top_asins tta
                            JOIN reviews r ON r.asin = tta.asin
                            WHERE tta.topic_id = :tid
                        )
                    """), {"tid": topic_id}).scalar()

                    has_forecast = session.execute(text("""
                        SELECT EXISTS(SELECT 1 FROM forecasts WHERE topic_id = :tid)
                    """), {"tid": topic_id}).scalar()

                    confidence = _determine_confidence(src_count, data_weeks, has_reviews, has_forecast)

                    # Write to signal_fusion_daily
                    session.execute(text("""
                        INSERT INTO signal_fusion_daily
                            (topic_id, date, udsi_score, google_component, reddit_component,
                             amazon_component, review_gap_component, forecast_component,
                             confidence, computed_at)
                        VALUES (:tid, :dt, :udsi, :google, :reddit, :amazon, :review_gap,
                                :forecast, :confidence, :now)
                        ON CONFLICT (topic_id, date)
                        DO UPDATE SET udsi_score = :udsi, google_component = :google,
                            reddit_component = :reddit, amazon_component = :amazon,
                            review_gap_component = :review_gap, forecast_component = :forecast,
                            confidence = :confidence, computed_at = :now
                    """), {
                        "tid": topic_id, "dt": today, "udsi": udsi,
                        "google": google, "reddit": reddit,
                        "amazon": amazon_gap, "review_gap": review_gap,
                        "forecast": forecast, "confidence": confidence,
                        "now": datetime.utcnow(),
                    })

                    # Update topic's udsi_score
                    session.execute(text("""
                        UPDATE topics SET udsi_score = :udsi, updated_at = :now WHERE id = :tid
                    """), {"udsi": udsi, "now": datetime.utcnow(), "tid": topic_id})

                    # Write UDSI as a score too
                    session.execute(text("""
                        INSERT INTO scores (id, topic_id, score_type, score_value, explanation_json, computed_at)
                        VALUES (:id, :tid, 'udsi', :val, :expl, :now)
                    """), {
                        "id": str(uuid.uuid4()), "tid": topic_id, "val": udsi,
                        "expl": json.dumps({
                            "udsi": udsi, "confidence": confidence,
                            "components": {
                                "google_trends": {"score": google, "weight": WEIGHTS["google"]},
                                "reddit_social": {"score": reddit, "weight": WEIGHTS["reddit"]},
                                "amazon_gap": {"score": amazon_gap, "weight": WEIGHTS["amazon_gap"]},
                                "review_gap": {"score": review_gap, "weight": WEIGHTS["review_gap"]},
                                "forecast": {"score": forecast, "weight": WEIGHTS["forecast"]},
                                "cross_source": {"score": cross_source, "weight": WEIGHTS["cross_source"]},
                            }
                        }),
                        "now": datetime.utcnow(),
                    })

                    total_computed += 1

            except Exception as e:
                total_errors += 1
                logger.error("udsi_fusion: topic error", topic=topic.name, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "udsi_fusion", type(e).__name__,
                              str(e), {"topic_id": topic_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("udsi_fusion: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "udsi_fusion", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_topics, total_computed, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "topics_processed": total_topics, "udsi_computed": total_computed,
        "errors": total_errors,
    }
    logger.info("udsi_fusion: complete", **result)
    return result
