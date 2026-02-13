"""
Feature generation task.

Computes derived features from source_timeseries for each active topic:
  - growth_1w, growth_4w, growth_12w
  - acceleration
  - sma_4w, sma_12w
  - volatility_4w
  - reddit_velocity
  - cross_source_correlation
"""
import uuid
from datetime import datetime, date, timedelta

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()


def _compute_growth(values: list[float], weeks_back: int) -> float | None:
    """Compute growth rate: (current - past) / max(past, 1)."""
    if len(values) < weeks_back + 1:
        return None
    current_sma = (values[-1] + values[-2]) / 2 if len(values) >= 2 else values[-1]
    past_sma = (values[-(weeks_back + 1)] + values[-(weeks_back + 2)]) / 2 if len(values) >= weeks_back + 2 else values[-(weeks_back + 1)]
    return (current_sma - past_sma) / max(past_sma, 1.0)


def _compute_volatility(values: list[float], window: int) -> float | None:
    """Standard deviation of last N values."""
    if len(values) < window:
        return None
    recent = values[-window:]
    mean = sum(recent) / len(recent)
    variance = sum((v - mean) ** 2 for v in recent) / len(recent)
    return variance ** 0.5


def _compute_sma(values: list[float], window: int) -> float | None:
    """Simple moving average of last N values."""
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


@celery_app.task(name="app.tasks.features.generate_features",
                 bind=True, max_retries=1, default_retry_delay=120)
def generate_features(self):
    """
    Compute derived features for all active topics from source_timeseries.
    Runs daily after ingestion tasks complete.
    """
    started = datetime.utcnow()
    today = date.today()
    total_topics = 0
    total_features = 0
    total_errors = 0

    logger.info("feature_generation: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="feature_generation_daily",
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
                    # Get Google Trends timeseries (weekly, sorted by date)
                    gt_rows = session.execute(text("""
                        SELECT date, normalized_value
                        FROM source_timeseries
                        WHERE topic_id = :tid AND source = 'google_trends' AND geo = 'US'
                        ORDER BY date ASC
                    """), {"tid": topic_id}).fetchall()

                    gt_values = [float(r.normalized_value) for r in gt_rows if r.normalized_value is not None]

                    # Get Reddit timeseries
                    reddit_rows = session.execute(text("""
                        SELECT date, raw_value
                        FROM source_timeseries
                        WHERE topic_id = :tid AND source = 'reddit' AND geo = 'US'
                        ORDER BY date ASC
                    """), {"tid": topic_id}).fetchall()

                    reddit_values = [float(r.raw_value) for r in reddit_rows if r.raw_value is not None]

                    # Count distinct sources
                    src_count = session.execute(text("""
                        SELECT COUNT(DISTINCT source) FROM source_timeseries
                        WHERE topic_id = :tid
                    """), {"tid": topic_id}).scalar()

                # Compute features from Google Trends
                features = {}

                if len(gt_values) >= 2:
                    features["value_latest"] = gt_values[-1]

                if len(gt_values) >= 4:
                    features["growth_1w"] = _compute_growth(gt_values, 1)
                    features["sma_4w"] = _compute_sma(gt_values, 4)
                    features["volatility_4w"] = _compute_volatility(gt_values, 4)

                if len(gt_values) >= 6:
                    features["growth_4w"] = _compute_growth(gt_values, 4)

                    # Acceleration: growth_1w[t] - growth_1w[t-1]
                    g1w_current = _compute_growth(gt_values, 1)
                    g1w_prev = _compute_growth(gt_values[:-1], 1) if len(gt_values) > 2 else None
                    if g1w_current is not None and g1w_prev is not None:
                        features["acceleration"] = g1w_current - g1w_prev

                if len(gt_values) >= 14:
                    features["growth_12w"] = _compute_growth(gt_values, 12)
                    features["sma_12w"] = _compute_sma(gt_values, 12)

                # Volume percentile (compared to all-time high)
                if gt_values:
                    ath = max(gt_values)
                    features["volume_percentile"] = (gt_values[-1] / max(ath, 1)) * 100

                # Reddit velocity
                if len(reddit_values) >= 2:
                    r_current = reddit_values[-1]
                    r_prev = reddit_values[-2] if len(reddit_values) >= 2 else 0
                    features["reddit_velocity"] = (r_current - r_prev) / max(r_prev, 1)

                # Cross-source info
                features["source_count"] = src_count or 0

                # Cross-source correlation (Google vs Reddit)
                if len(gt_values) >= 12 and len(reddit_values) >= 12:
                    # Simple Pearson correlation on last 12 points
                    n = min(12, len(gt_values), len(reddit_values))
                    g = gt_values[-n:]
                    r = reddit_values[-n:]
                    g_mean = sum(g) / n
                    r_mean = sum(r) / n
                    num = sum((gi - g_mean) * (ri - r_mean) for gi, ri in zip(g, r))
                    den_g = sum((gi - g_mean) ** 2 for gi in g) ** 0.5
                    den_r = sum((ri - r_mean) ** 2 for ri in r) ** 0.5
                    if den_g > 0 and den_r > 0:
                        features["cross_source_correlation"] = num / (den_g * den_r)

                # Upsert features into derived_features
                with get_sync_db() as session:
                    for feature_name, feature_value in features.items():
                        if feature_value is None:
                            continue
                        session.execute(text("""
                            INSERT INTO derived_features (topic_id, date, feature_name, feature_value, created_at)
                            VALUES (:tid, :dt, :fname, :fval, :now)
                            ON CONFLICT (topic_id, date, feature_name)
                            DO UPDATE SET feature_value = :fval, created_at = :now
                        """), {
                            "tid": topic_id, "dt": today,
                            "fname": feature_name, "fval": round(float(feature_value), 4),
                            "now": datetime.utcnow(),
                        })
                        total_features += 1

            except Exception as e:
                total_errors += 1
                logger.error("feature_generation: topic error",
                              topic=topic.name, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "feature_generation", type(e).__name__,
                              str(e), {"topic_id": topic_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("feature_generation: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "feature_generation", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_topics, total_features, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "topics_processed": total_topics, "features_computed": total_features,
        "errors": total_errors,
    }
    logger.info("feature_generation: complete", **result)
    return result
