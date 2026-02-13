"""
NeuraNest Celery Task Definitions & Beat Schedule.

Tasks:
  - ingest_google_trends    (daily 6AM UTC)
  - ingest_reddit_mentions  (daily 7AM UTC)
  - generate_features       (daily 9AM UTC)
  - compute_scores          (daily 10AM UTC)
  - generate_forecasts      (weekly Tue 3AM UTC)
  - evaluate_alerts         (daily 11AM UTC)
  - run_data_quality_checks (daily 12PM UTC)
"""
from celery import Celery
from celery.schedules import crontab
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "neuranest",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Import task modules
    include=[
        "app.tasks.ingestion",
        "app.tasks.features",
        "app.tasks.scoring_task",
        "app.tasks.forecasting",
        "app.tasks.alerts_eval",
        "app.tasks.discovery",
        "app.tasks.category_metrics",
        "app.tasks.nlp_pipeline",
        "app.tasks.meta_tiktok_ingestion",
        "app.tasks.science_radar",
    ],
)

# ─── Celery Beat Schedule ───
celery_app.conf.beat_schedule = {
    # Data ingestion
    "google-trends-daily": {
        "task": "app.tasks.ingestion.ingest_google_trends",
        "schedule": crontab(hour=6, minute=0),  # 6AM UTC daily
    },
    "reddit-mentions-daily": {
        "task": "app.tasks.ingestion.ingest_reddit_mentions",
        "schedule": crontab(hour=7, minute=0),  # 7AM UTC daily
    },
    # Feature engineering (after ingestion)
    "features-daily": {
        "task": "app.tasks.features.generate_features",
        "schedule": crontab(hour=9, minute=0),  # 9AM UTC daily
    },
    # Scoring (after features)
    "scoring-daily": {
        "task": "app.tasks.scoring_task.compute_all_scores",
        "schedule": crontab(hour=10, minute=0),  # 10AM UTC daily
    },
    # Forecasting (weekly)
    "forecasting-weekly": {
        "task": "app.tasks.forecasting.generate_forecasts",
        "schedule": crontab(hour=3, minute=0, day_of_week=2),  # Tue 3AM UTC
    },
    # Alert evaluation (after scoring)
    "alerts-daily": {
        "task": "app.tasks.alerts_eval.evaluate_alerts",
        "schedule": crontab(hour=12, minute=0),  # 12PM UTC daily
    },
    # Topic discovery (weekly Monday 2AM)
    "topic-discovery-weekly": {
        "task": "app.tasks.discovery.discover_topics",
        "schedule": crontab(hour=2, minute=0, day_of_week=1),
    },
    # Category metrics rollup (daily after scoring)
    "category-metrics-daily": {
        "task": "app.tasks.category_metrics.compute_category_metrics_daily",
        "schedule": crontab(hour=10, minute=30),
    },
    # NLP Pipeline - sentiment + clustering (daily after ingestion, before scoring)
    "nlp-pipeline-daily": {
        "task": "app.tasks.nlp_pipeline.run_social_listening_nlp_daily",
        "schedule": crontab(hour=9, minute=30),
    },
}


# ─── Existing placeholder tasks (keep for backward compat) ───
@celery_app.task(name="generate_csv_export")
def generate_csv_export(user_id: str, filters: dict):
    """Background task for large CSV exports."""
    pass


@celery_app.task(name="regenerate_gen_next_spec")
def regenerate_gen_next_spec(topic_id: str):
    """Background task to regenerate Gen-Next spec for a topic."""
    pass


@celery_app.task(name="send_alert_email")
def send_alert_email(user_email: str, alert_data: dict):
    """Send alert notification email."""
    pass
