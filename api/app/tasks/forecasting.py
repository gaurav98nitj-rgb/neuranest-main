"""
Forecasting task.

Runs forecasting on active topics with >= 26 weekly datapoints.
Uses Prophet if available and working, otherwise falls back to
linear trend + seasonal decomposition.
"""
import uuid
import math
from datetime import datetime, date, timedelta

import pandas as pd
import numpy as np
from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()

MIN_DATAPOINTS = 26  # ~6 months of weekly data
MODEL_VERSION = "linear_seasonal_v1"


def _linear_seasonal_forecast(df: pd.DataFrame, periods: int = 26) -> pd.DataFrame:
    """
    Simple but effective forecast: linear trend + seasonal pattern.
    Works without Prophet/cmdstanpy dependencies.

    Returns DataFrame with columns: ds, yhat, yhat_lower, yhat_upper
    """
    df = df.copy().sort_values("ds").reset_index(drop=True)
    n = len(df)

    # Encode time as numeric (weeks from start)
    df["t"] = np.arange(n, dtype=float)
    y = df["y"].values.astype(float)
    t = df["t"].values

    # ── Linear trend via least squares ──
    t_mean = t.mean()
    y_mean = y.mean()
    slope = np.sum((t - t_mean) * (y - y_mean)) / max(np.sum((t - t_mean) ** 2), 1e-10)
    intercept = y_mean - slope * t_mean

    trend = intercept + slope * t

    # ── Seasonal component (52-week period) ──
    residuals = y - trend
    seasonal_period = min(52, n // 2)  # Use 52 weeks or half the data
    seasonal = np.zeros(seasonal_period)
    counts = np.zeros(seasonal_period)

    for i in range(n):
        idx = i % seasonal_period
        seasonal[idx] += residuals[i]
        counts[idx] += 1

    seasonal = seasonal / np.maximum(counts, 1)
    # Center the seasonal component
    seasonal -= seasonal.mean()

    # ── Residual std for confidence intervals ──
    fitted = trend + np.array([seasonal[i % seasonal_period] for i in range(n)])
    residual_std = np.std(y - fitted)

    # ── Generate future predictions ──
    future_t = np.arange(n, n + periods, dtype=float)
    future_trend = intercept + slope * future_t
    future_seasonal = np.array([seasonal[int(i) % seasonal_period] for i in future_t])
    future_yhat = future_trend + future_seasonal

    # Clamp to reasonable range [0, 200]
    future_yhat = np.clip(future_yhat, 0, 200)

    # Confidence intervals widen over time
    ci_widths = residual_std * np.sqrt(1 + (np.arange(periods) / periods))
    future_lower = np.clip(future_yhat - 1.28 * ci_widths, 0, 200)  # 80% CI
    future_upper = np.clip(future_yhat + 1.28 * ci_widths, 0, 200)

    # Build future dates
    last_date = df["ds"].max()
    future_dates = [last_date + timedelta(weeks=i + 1) for i in range(periods)]

    return pd.DataFrame({
        "ds": future_dates,
        "yhat": future_yhat,
        "yhat_lower": future_lower,
        "yhat_upper": future_upper,
    })


def _try_prophet_forecast(df: pd.DataFrame, periods: int = 26) -> pd.DataFrame | None:
    """Try Prophet first; return None if it fails."""
    try:
        import logging
        logging.getLogger("prophet").setLevel(logging.WARNING)
        logging.getLogger("cmdstanpy").setLevel(logging.WARNING)

        from prophet import Prophet

        m = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            changepoint_prior_scale=0.1,
            interval_width=0.80,
        )
        m.fit(df)

        future = m.make_future_dataframe(periods=periods, freq="W")
        forecast = future_forecast = m.predict(future)

        last_date = df["ds"].max()
        future_only = forecast[forecast["ds"] > last_date][["ds", "yhat", "yhat_lower", "yhat_upper"]]
        return future_only

    except Exception as e:
        logger.debug("prophet_fallback: Prophet failed, using linear_seasonal", error=str(e)[:100])
        return None


@celery_app.task(name="app.tasks.forecasting.generate_forecasts",
                 bind=True, max_retries=1, default_retry_delay=300)
def generate_forecasts(self):
    """
    Weekly forecasting for active topics with sufficient data.
    Tries Prophet first, falls back to linear+seasonal if Prophet fails.
    """
    started = datetime.utcnow()
    today = date.today()
    total_topics = 0
    total_forecasts = 0
    total_skipped = 0
    total_errors = 0

    logger.info("forecasting: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="forecasting_weekly",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        with get_sync_db() as session:
            topics = session.execute(text("""
                SELECT t.id, t.name, COUNT(ts.id) as datapoints
                FROM topics t
                JOIN source_timeseries ts ON ts.topic_id = t.id
                    AND ts.source = 'google_trends' AND ts.geo = 'US'
                WHERE t.is_active = true
                GROUP BY t.id, t.name
                HAVING COUNT(ts.id) >= :min_pts
            """), {"min_pts": MIN_DATAPOINTS}).fetchall()

        logger.info("forecasting: eligible topics", count=len(topics))

        for topic in topics:
            topic_id = str(topic.id)
            total_topics += 1

            try:
                with get_sync_db() as session:
                    rows = session.execute(text("""
                        SELECT date as ds, normalized_value as y
                        FROM source_timeseries
                        WHERE topic_id = :tid AND source = 'google_trends' AND geo = 'US'
                            AND normalized_value IS NOT NULL
                        ORDER BY date ASC
                    """), {"tid": topic_id}).fetchall()

                if len(rows) < MIN_DATAPOINTS:
                    total_skipped += 1
                    continue

                df = pd.DataFrame([{"ds": r.ds, "y": float(r.y)} for r in rows])
                df["ds"] = pd.to_datetime(df["ds"])
                df = df.sort_values("ds").drop_duplicates(subset=["ds"]).dropna(subset=["y"])

                if len(df) < MIN_DATAPOINTS:
                    total_skipped += 1
                    continue

                # Try Prophet first, fall back to linear+seasonal
                forecast_df = _try_prophet_forecast(df, periods=26)
                model_used = "prophet_v1"

                if forecast_df is None or forecast_df.empty:
                    forecast_df = _linear_seasonal_forecast(df, periods=26)
                    model_used = MODEL_VERSION

                # Delete old forecasts for this topic
                with get_sync_db() as session:
                    session.execute(text("DELETE FROM forecasts WHERE topic_id = :tid"), {"tid": topic_id})

                    last_date = df["ds"].max()
                    for _, row in forecast_df.iterrows():
                        weeks_ahead = max(1, (row["ds"] - last_date).days // 7)
                        horizon = 3 if weeks_ahead <= 13 else 6

                        session.execute(text("""
                            INSERT INTO forecasts
                                (id, topic_id, horizon_months, forecast_date, yhat, yhat_lower, yhat_upper, model_version, generated_at)
                            VALUES (:id, :tid, :horizon, :fdate, :yhat, :lower, :upper, :model, :now)
                        """), {
                            "id": str(uuid.uuid4()),
                            "tid": topic_id,
                            "horizon": horizon,
                            "fdate": row["ds"].date() if hasattr(row["ds"], "date") else row["ds"],
                            "yhat": round(float(row["yhat"]), 2),
                            "lower": round(float(row["yhat_lower"]), 2),
                            "upper": round(float(row["yhat_upper"]), 2),
                            "model": model_used,
                            "now": datetime.utcnow(),
                        })
                        total_forecasts += 1

                logger.debug("forecasting: topic complete", topic=topic.name,
                              model=model_used, points=len(forecast_df))

            except Exception as e:
                total_errors += 1
                logger.error("forecasting: topic error", topic=topic.name, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "forecasting_weekly", type(e).__name__,
                              str(e), {"topic_id": topic_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("forecasting: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "forecasting_weekly", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_topics, total_forecasts, total_skipped, total_errors)

    result = {
        "run_id": run_id, "status": status, "model": MODEL_VERSION,
        "topics_processed": total_topics, "forecasts_generated": total_forecasts,
        "skipped": total_skipped, "errors": total_errors,
    }
    logger.info("forecasting: complete", **result)
    return result
