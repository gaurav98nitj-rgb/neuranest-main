"""
Ingestion trigger endpoints for admin use.
Allows manual triggering of pipeline tasks.
"""
from fastapi import APIRouter, Depends, HTTPException
from app.models import User
from app.dependencies import require_role

router = APIRouter(prefix="/admin/pipeline", tags=["admin-pipeline"])


@router.post("/trigger/{task_name}")
async def trigger_pipeline_task(
    task_name: str,
    user: User = Depends(require_role("admin")),
):
    """Trigger a pipeline task manually. Admin only."""
    from app.tasks.ingestion import ingest_google_trends, ingest_reddit_mentions
    from app.tasks.features import generate_features
    from app.tasks.scoring_task import compute_all_scores
    from app.tasks.forecasting import generate_forecasts
    from app.tasks.alerts_eval import evaluate_alerts
    from app.tasks.nlp_pipeline import run_social_listening_nlp_daily
    from app.tasks.category_metrics import compute_category_metrics_daily

    task_map = {
        "google_trends": ingest_google_trends,
        "reddit": ingest_reddit_mentions,
        "features": generate_features,
        "scoring": compute_all_scores,
        "forecasting": generate_forecasts,
        "alerts": evaluate_alerts,
        "nlp_pipeline": run_social_listening_nlp_daily,
        "category_metrics": compute_category_metrics_daily,
    }

    task_fn = task_map.get(task_name)
    if not task_fn:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown task: {task_name}. Available: {list(task_map.keys())}"
        )

    result = task_fn.delay()
    return {
        "message": f"Task '{task_name}' queued successfully",
        "task_id": result.id,
        "status": "queued",
    }


@router.post("/run-full-pipeline")
async def run_full_pipeline(
    user: User = Depends(require_role("admin")),
):
    """Run the full pipeline in order: ingest → features → scoring."""
    from celery import chain
    from app.tasks.ingestion import ingest_google_trends, ingest_reddit_mentions
    from app.tasks.features import generate_features
    from app.tasks.scoring_task import compute_all_scores
    from app.tasks.nlp_pipeline import run_social_listening_nlp_daily

    # Chain tasks to run in sequence
    pipeline = chain(
        ingest_google_trends.s(),
        ingest_reddit_mentions.s(),
        generate_features.s(),
        compute_all_scores.s(),
        run_social_listening_nlp_daily.s(),
    )
    result = pipeline.apply_async()

    return {
        "message": "Full pipeline queued",
        "chain_id": result.id,
        "status": "queued",
        "sequence": ["google_trends", "reddit", "features", "scoring", "nlp_pipeline"],
    }
