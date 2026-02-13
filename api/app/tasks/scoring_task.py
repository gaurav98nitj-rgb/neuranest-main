"""
Scoring task.

Computes opportunity scores, competition index, and updates lifecycle stage
for all active topics using derived features and the scoring service.
"""
import uuid
import json
from datetime import datetime, date

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error
from app.services.scoring import compute_opportunity_score, compute_competition_index, detect_trend_stage

logger = structlog.get_logger()


def _get_latest_features(session, topic_id: str) -> dict:
    """Get latest derived features for a topic."""
    rows = session.execute(text("""
        SELECT DISTINCT ON (feature_name) feature_name, feature_value
        FROM derived_features
        WHERE topic_id = :tid
        ORDER BY feature_name, date DESC
    """), {"tid": topic_id}).fetchall()
    return {r.feature_name: float(r.feature_value) if r.feature_value else 0 for r in rows}


def _get_competition_data(session, topic_id: str) -> dict | None:
    """Get latest Amazon competition snapshot for a topic."""
    row = session.execute(text("""
        SELECT listing_count, median_reviews, brand_hhi, price_std, avg_price, top3_brand_share
        FROM amazon_competition_snapshot
        WHERE topic_id = :tid
        ORDER BY date DESC
        LIMIT 1
    """), {"tid": topic_id}).fetchone()
    if row:
        return {
            "listing_count": row.listing_count or 0,
            "median_reviews": row.median_reviews or 0,
            "brand_hhi": float(row.brand_hhi) if row.brand_hhi else 0.2,
            "price_std": float(row.price_std) if row.price_std else 20,
            "avg_price": float(row.avg_price) if row.avg_price else 50,
            "top3_brand_share": float(row.top3_brand_share) if row.top3_brand_share else 0.3,
        }
    return None


def _get_monthly_growth_rates(session, topic_id: str) -> list[float]:
    """Compute month-over-month growth rates from Google Trends timeseries."""
    rows = session.execute(text("""
        SELECT date, normalized_value
        FROM source_timeseries
        WHERE topic_id = :tid AND source = 'google_trends' AND geo = 'US'
        ORDER BY date ASC
    """), {"tid": topic_id}).fetchall()

    if len(rows) < 8:  # Need at least 2 months of weekly data
        return []

    # Group by month and compute averages
    monthly = {}
    for r in rows:
        month_key = r.date.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = []
        monthly[month_key].append(float(r.normalized_value) if r.normalized_value else 0)

    monthly_avgs = [(k, sum(v) / len(v)) for k, v in sorted(monthly.items())]

    # Compute MoM growth rates
    growth_rates = []
    for i in range(1, len(monthly_avgs)):
        prev = monthly_avgs[i - 1][1]
        curr = monthly_avgs[i][1]
        growth = ((curr - prev) / max(prev, 1)) * 100
        growth_rates.append(growth)

    return growth_rates


def _get_forecast_pct_change(session, topic_id: str) -> float:
    """Get 3-month forecast percentage change."""
    row = session.execute(text("""
        SELECT yhat FROM forecasts
        WHERE topic_id = :tid AND horizon_months = 3
        ORDER BY generated_at DESC
        LIMIT 1
    """), {"tid": topic_id}).fetchone()

    current_row = session.execute(text("""
        SELECT normalized_value FROM source_timeseries
        WHERE topic_id = :tid AND source = 'google_trends'
        ORDER BY date DESC
        LIMIT 1
    """), {"tid": topic_id}).fetchone()

    if row and current_row:
        current = float(current_row.normalized_value) if current_row.normalized_value else 1
        forecast = float(row.yhat) if row.yhat else current
        return ((forecast - current) / max(current, 1)) * 100
    return 0


@celery_app.task(name="app.tasks.scoring_task.compute_all_scores",
                 bind=True, max_retries=1, default_retry_delay=120)
def compute_all_scores(self):
    """
    Compute opportunity scores, competition index, and update lifecycle stage
    for all active topics.
    """
    started = datetime.utcnow()
    today = date.today()
    total_topics = 0
    total_scores = 0
    total_errors = 0

    logger.info("scoring: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="scoring_daily",
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
                    features = _get_latest_features(session, topic_id)
                    comp_data = _get_competition_data(session, topic_id)
                    mom_rates = _get_monthly_growth_rates(session, topic_id)
                    forecast_pct = _get_forecast_pct_change(session, topic_id)

                # ── Competition Index ──
                comp_index = 50.0  # default
                if comp_data:
                    comp_index = compute_competition_index(
                        listing_count=comp_data["listing_count"],
                        median_reviews=comp_data["median_reviews"],
                        brand_hhi=comp_data["brand_hhi"],
                        price_std=comp_data["price_std"],
                        avg_price=comp_data["avg_price"],
                        top3_brand_share=comp_data["top3_brand_share"],
                    )

                # ── Opportunity Score ──
                source_count = int(features.get("source_count", 1))
                cross_source_positive = source_count  # Simplified: assume all sources show growth
                if features.get("growth_4w", 0) < 0:
                    cross_source_positive = max(0, cross_source_positive - 1)

                # Determine data months from timeseries
                with get_sync_db() as session:
                    data_months_row = session.execute(text("""
                        SELECT (MAX(date) - MIN(date)) as day_span
                        FROM source_timeseries
                        WHERE topic_id = :tid AND source = 'google_trends'
                    """), {"tid": topic_id}).fetchone()
                    data_months = int(data_months_row.day_span / 30) if data_months_row and data_months_row.day_span else 6

                opp_result = compute_opportunity_score(
                    demand_growth_rate=features.get("growth_4w", 0) * 100,
                    acceleration=features.get("acceleration", 0) * 100,
                    cross_source_positive=cross_source_positive,
                    total_sources=source_count,
                    competition_index=comp_index,
                    review_gap_severity=50,  # Default until review analysis runs
                    geo_count=1,  # MVP: US only
                    forecast_pct_change_3m=forecast_pct,
                    data_months=data_months,
                )

                opp_score = opp_result["overall_score"]

                # ── Lifecycle Stage Detection ──
                volume_pct = features.get("volume_percentile", 50)
                new_stage = detect_trend_stage(mom_rates, volume_pct, source_count)

                # ── Persist Scores ──
                with get_sync_db() as session:
                    # Opportunity score
                    session.execute(text("""
                        INSERT INTO scores (id, topic_id, score_type, score_value, explanation_json, computed_at)
                        VALUES (:id, :tid, 'opportunity', :val, :expl, :now)
                    """), {
                        "id": str(uuid.uuid4()), "tid": topic_id,
                        "val": opp_score, "expl": json.dumps(opp_result),
                        "now": datetime.utcnow(),
                    })
                    total_scores += 1

                    # Competition score
                    session.execute(text("""
                        INSERT INTO scores (id, topic_id, score_type, score_value, explanation_json, computed_at)
                        VALUES (:id, :tid, 'competition', :val, :expl, :now)
                    """), {
                        "id": str(uuid.uuid4()), "tid": topic_id,
                        "val": comp_index,
                        "expl": json.dumps(comp_data) if comp_data else "{}",
                        "now": datetime.utcnow(),
                    })
                    total_scores += 1

                    # Demand score (derived from growth + social)
                    demand_score = min(100, max(0,
                        features.get("growth_4w", 0) * 50 +
                        features.get("reddit_velocity", 0) * 30 +
                        features.get("value_latest", 0) * 0.5
                    ))
                    session.execute(text("""
                        INSERT INTO scores (id, topic_id, score_type, score_value, explanation_json, computed_at)
                        VALUES (:id, :tid, 'demand', :val, :expl, :now)
                    """), {
                        "id": str(uuid.uuid4()), "tid": topic_id,
                        "val": round(demand_score, 2),
                        "expl": json.dumps({"growth_4w": features.get("growth_4w"), "reddit_velocity": features.get("reddit_velocity")}),
                        "now": datetime.utcnow(),
                    })
                    total_scores += 1

                    # Update lifecycle stage on topic
                    if new_stage != "unknown":
                        session.execute(text("""
                            UPDATE topics SET stage = :stage, updated_at = :now
                            WHERE id = :tid
                        """), {"stage": new_stage, "now": datetime.utcnow(), "tid": topic_id})

                logger.debug("scoring: topic scored", topic=topic.name,
                              opportunity=opp_score, competition=comp_index, stage=new_stage)

            except Exception as e:
                total_errors += 1
                logger.error("scoring: topic error", topic=topic.name, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "scoring_daily", type(e).__name__,
                              str(e), {"topic_id": topic_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("scoring: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "scoring_daily", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_topics, total_scores, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "topics_processed": total_topics, "scores_computed": total_scores,
        "errors": total_errors,
    }
    logger.info("scoring: complete", **result)
    return result
