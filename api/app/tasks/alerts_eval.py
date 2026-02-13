"""
Alert evaluation task.

Checks all active alerts against current scores and lifecycle stage.
Creates alert_events when conditions are met.
"""
import uuid
import json
from datetime import datetime, date

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()


@celery_app.task(name="app.tasks.alerts_eval.evaluate_alerts",
                 bind=True, max_retries=1, default_retry_delay=120)
def evaluate_alerts(self):
    """
    Evaluate all active alerts and fire events when conditions are met.
    Alert types: score_threshold, stage_change, new_competitor, price_drop.
    """
    started = datetime.utcnow()
    today = date.today()
    total_alerts = 0
    total_fired = 0
    total_errors = 0

    logger.info("alert_evaluation: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="alert_evaluation_daily",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        with get_sync_db() as session:
            alerts = session.execute(text("""
                SELECT a.id, a.user_id, a.topic_id, a.alert_type, a.config_json,
                       t.name as topic_name, t.stage as topic_stage
                FROM alerts a
                LEFT JOIN topics t ON t.id = a.topic_id
                WHERE a.is_active = true
            """)).fetchall()

        for alert in alerts:
            total_alerts += 1
            alert_id = str(alert.id)
            topic_id = str(alert.topic_id) if alert.topic_id else None
            config = alert.config_json if isinstance(alert.config_json, dict) else json.loads(alert.config_json or "{}")

            try:
                should_fire = False
                message = ""
                payload = {}

                if alert.alert_type == "score_threshold" and topic_id:
                    # Check if opportunity score exceeds threshold
                    threshold = config.get("threshold", 80)
                    metric = config.get("metric", "opportunity")

                    with get_sync_db() as session:
                        row = session.execute(text("""
                            SELECT score_value FROM scores
                            WHERE topic_id = :tid AND score_type = :stype
                            ORDER BY computed_at DESC LIMIT 1
                        """), {"tid": topic_id, "stype": metric}).fetchone()

                    if row and float(row.score_value) >= threshold:
                        should_fire = True
                        message = f"{alert.topic_name}: {metric} score reached {float(row.score_value):.1f} (threshold: {threshold})"
                        payload = {"score": float(row.score_value), "threshold": threshold}

                elif alert.alert_type == "stage_change" and topic_id:
                    # Check if stage changed from what was last seen
                    expected_stage = config.get("from_stage")
                    current_stage = alert.topic_stage

                    if expected_stage and current_stage != expected_stage:
                        # Check if we already fired for this stage change today
                        with get_sync_db() as session:
                            existing = session.execute(text("""
                                SELECT 1 FROM alert_events
                                WHERE alert_id = :aid AND triggered_at::date = :today
                                LIMIT 1
                            """), {"aid": alert_id, "today": today}).fetchone()

                        if not existing:
                            should_fire = True
                            message = f"{alert.topic_name}: stage changed from {expected_stage} to {current_stage}"
                            payload = {"from": expected_stage, "to": current_stage}

                elif alert.alert_type == "new_competitor" and topic_id:
                    # Check if listing count increased significantly
                    with get_sync_db() as session:
                        rows = session.execute(text("""
                            SELECT listing_count, date FROM amazon_competition_snapshot
                            WHERE topic_id = :tid
                            ORDER BY date DESC LIMIT 2
                        """), {"tid": topic_id}).fetchall()

                    if len(rows) >= 2:
                        current = rows[0].listing_count or 0
                        previous = rows[1].listing_count or 0
                        growth = (current - previous) / max(previous, 1) * 100
                        min_growth = config.get("min_growth_pct", 20)
                        if growth >= min_growth:
                            should_fire = True
                            message = f"{alert.topic_name}: {int(growth)}% more listings ({previous} → {current})"
                            payload = {"previous": previous, "current": current, "growth_pct": round(growth, 1)}

                elif alert.alert_type == "price_drop" and topic_id:
                    # Check if median price dropped
                    with get_sync_db() as session:
                        rows = session.execute(text("""
                            SELECT median_price, date FROM amazon_competition_snapshot
                            WHERE topic_id = :tid
                            ORDER BY date DESC LIMIT 2
                        """), {"tid": topic_id}).fetchall()

                    if len(rows) >= 2 and rows[0].median_price and rows[1].median_price:
                        current = float(rows[0].median_price)
                        previous = float(rows[1].median_price)
                        drop_pct = (previous - current) / max(previous, 1) * 100
                        min_drop = config.get("min_drop_pct", 10)
                        if drop_pct >= min_drop:
                            should_fire = True
                            message = f"{alert.topic_name}: median price dropped {drop_pct:.0f}% (${previous:.2f} → ${current:.2f})"
                            payload = {"previous": previous, "current": current, "drop_pct": round(drop_pct, 1)}

                # Fire the alert event
                if should_fire:
                    with get_sync_db() as session:
                        session.execute(text("""
                            INSERT INTO alert_events (id, alert_id, triggered_at, payload_json, delivered, delivered_at)
                            VALUES (:id, :aid, :now, :payload, false, NULL)
                        """), {
                            "id": str(uuid.uuid4()),
                            "aid": alert_id,
                            "now": datetime.utcnow(),
                            "payload": json.dumps({"message": message, **payload}),
                        })
                    total_fired += 1
                    logger.info("alert_evaluation: alert fired",
                                 alert_type=alert.alert_type, topic=alert.topic_name)

            except Exception as e:
                total_errors += 1
                logger.error("alert_evaluation: alert error",
                              alert_id=alert_id, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "alert_evaluation", type(e).__name__,
                              str(e), {"alert_id": alert_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("alert_evaluation: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "alert_evaluation", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_alerts, total_fired, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "alerts_evaluated": total_alerts, "alerts_fired": total_fired,
        "errors": total_errors,
    }
    logger.info("alert_evaluation: complete", **result)
    return result
