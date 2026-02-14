"""
NeuraNest — ML Pipeline API Router
====================================
FastAPI endpoints for the ML prediction engine.
Add to your existing routers in app/routers/

Usage:
    # In app/main.py, add:
    from app.routers import ml_pipeline
    app.include_router(ml_pipeline.router)
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["ML Pipeline"])


# ---------------------------------------------------------------------------
# SCHEMAS
# ---------------------------------------------------------------------------

class PipelineRunRequest(BaseModel):
    country: str = 'US'
    optuna_trials: int = 100
    n_case_studies: int = 10


class PredictionRequest(BaseModel):
    topic_ids: list[int]
    country: str = 'US'


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

@router.get("/prerequisites")
async def check_prerequisites(country: str = Query('US')):
    """Check if all prerequisites for ML pipeline are met."""
    from app.tasks.ml_pipeline_orchestrator import check_prerequisites
    return check_prerequisites(country=country)


@router.post("/pipeline/run")
async def run_pipeline(req: PipelineRunRequest, background_tasks: BackgroundTasks):
    """
    Trigger the full ML pipeline (async).
    Runs: Feature Store → Labels → XGBoost → Backtesting
    """
    try:
        from app.tasks.ml_pipeline_orchestrator import run_full_pipeline_task
        task = run_full_pipeline_task.delay(
            country=req.country,
            optuna_trials=req.optuna_trials,
        )
        return {'status': 'started', 'task_id': task.id}
    except Exception:
        # Fallback: run synchronously if Celery not available
        background_tasks.add_task(
            _run_pipeline_sync, req.country, req.optuna_trials
        )
        return {'status': 'started_sync', 'message': 'Running in background'}


@router.post("/feature-store/build")
async def build_feature_store(country: str = Query('US')):
    """Build the temporal feature store (200+ features per topic per month)."""
    from app.tasks.temporal_feature_store import build_feature_store
    result = build_feature_store(country=country, save_to_db=True, return_df=False)
    return result


@router.post("/labels/create")
async def create_labels(country: str = Query('US')):
    """Create training labels from Amazon BA rank trajectories."""
    from app.tasks.label_creation import create_labels
    result = create_labels(country=country, save_to_db=True)
    return {k: v for k, v in result.items() if k != 'aligned_df'}


@router.post("/train")
async def train_model(
    country: str = Query('US'),
    n_trials: int = Query(100, ge=10, le=500),
    background_tasks: BackgroundTasks = None,
):
    """Train the XGBoost success predictor."""
    from app.tasks.xgboost_trainer import train_success_predictor
    result = train_success_predictor(country=country, n_trials=n_trials)
    return {k: v for k, v in result.items() if k != 'top_20_features'}


@router.post("/predict")
async def predict(req: PredictionRequest):
    """
    Predict success probability for given topics.
    Uses the active trained model + latest features.
    """
    from app.tasks.xgboost_trainer import predict_success
    try:
        result_df = predict_success(topic_ids=req.topic_ids, country=req.country)
        if result_df.empty:
            raise HTTPException(404, "No features found for these topics")
        return result_df.to_dict('records')
    except FileNotFoundError:
        raise HTTPException(400, "No trained model found. Run /api/ml/train first.")


@router.post("/backtest")
async def run_backtest(
    country: str = Query('US'),
    mode: str = Query('rolling'),
    prediction_month: Optional[str] = Query(None),
    n_case_studies: int = Query(10),
):
    """Run backtesting framework to validate predictions."""
    from app.tasks.backtesting import run_backtest
    result = run_backtest(
        country=country,
        mode=mode,
        prediction_month=prediction_month,
        n_case_studies=n_case_studies,
    )
    return result


@router.get("/model/active")
async def get_active_model():
    """Get info about the currently active model."""
    from sqlalchemy import text
    from app.database import sync_engine

    with sync_engine.connect() as conn:
        row = conn.execute(text("""
            SELECT version, model_type, metrics, udsi_v2_weights,
                   training_samples, created_at
            FROM ml_models
            WHERE is_active = TRUE
            ORDER BY created_at DESC LIMIT 1
        """)).fetchone()

    if not row:
        raise HTTPException(404, "No active model found")

    return {
        'version': row[0],
        'model_type': row[1],
        'metrics': row[2],
        'udsi_v2_weights': row[3],
        'training_samples': row[4],
        'created_at': str(row[5]),
    }


@router.get("/feature-store/stats")
async def feature_store_stats(country: str = Query('US')):
    """Get statistics about the temporal feature store."""
    from sqlalchemy import text
    from app.database import sync_engine

    with sync_engine.connect() as conn:
        stats = conn.execute(text("""
            SELECT
                COUNT(*) as total_rows,
                COUNT(DISTINCT topic_id) as topics,
                MIN(month) as min_month,
                MAX(month) as max_month
            FROM temporal_features
            WHERE country = :country
        """), {'country': country}).fetchone()

    return {
        'total_rows': stats[0],
        'topics': stats[1],
        'min_month': str(stats[2]) if stats[2] else None,
        'max_month': str(stats[3]) if stats[3] else None,
    }


@router.get("/labels/stats")
async def label_stats(country: str = Query('US')):
    """Get statistics about training labels."""
    from sqlalchemy import text
    from app.database import sync_engine

    with sync_engine.connect() as conn:
        stats = conn.execute(text("""
            SELECT
                split,
                COUNT(*) as count,
                SUM(label_binary) as successes,
                AVG(rank_improvement_ratio) as avg_improvement
            FROM ml_training_labels
            WHERE country = :country
            GROUP BY split
            ORDER BY split
        """), {'country': country}).fetchall()

    return [
        {
            'split': row[0],
            'count': row[1],
            'successes': row[2],
            'success_rate': round(row[2] / row[1] * 100, 1) if row[1] > 0 else 0,
            'avg_improvement': round(row[3], 4) if row[3] else 0,
        }
        for row in stats
    ]


@router.get("/backtest/reports")
async def backtest_reports(limit: int = Query(5)):
    """Get recent backtest reports."""
    from sqlalchemy import text
    from app.database import sync_engine

    with sync_engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, verdict, avg_precision, avg_f1, months_tested, created_at, report
            FROM backtest_reports
            ORDER BY created_at DESC
            LIMIT :limit
        """), {'limit': limit}).fetchall()

    return [
        {
            'id': row[0],
            'verdict': row[1],
            'avg_precision': row[2],
            'avg_f1': row[3],
            'months_tested': row[4],
            'created_at': str(row[5]),
            'summary': row[6].get('summary', {}) if row[6] else {},
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# HELPER
# ---------------------------------------------------------------------------

async def _run_pipeline_sync(country: str, optuna_trials: int):
    """Fallback synchronous pipeline runner."""
    from app.tasks.ml_pipeline_orchestrator import run_full_pipeline
    run_full_pipeline(country=country, optuna_trials=optuna_trials)
