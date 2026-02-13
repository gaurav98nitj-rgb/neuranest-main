from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, IngestionRun, DQMetric, ErrorLog
from app.dependencies import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ingestion-runs")
async def list_ingestion_runs(
    dag_id: str = None,
    status: str = None,
    limit: int = Query(50, le=200),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(IngestionRun).order_by(desc(IngestionRun.started_at))
    if dag_id:
        query = query.where(IngestionRun.dag_id == dag_id)
    if status:
        query = query.where(IngestionRun.status == status)
    query = query.limit(limit)

    result = await db.execute(query)
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "dag_id": r.dag_id,
            "run_date": r.run_date.isoformat() if r.run_date else None,
            "status": r.status,
            "records_fetched": r.records_fetched,
            "records_inserted": r.records_inserted,
            "error_count": r.error_count,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/dq-metrics")
async def list_dq_metrics(
    limit: int = Query(100, le=500),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DQMetric).order_by(desc(DQMetric.id)).limit(limit)
    )
    metrics = result.scalars().all()
    return [
        {
            "id": m.id,
            "run_id": str(m.run_id) if m.run_id else None,
            "metric_name": m.metric_name,
            "metric_value": float(m.metric_value) if m.metric_value else None,
            "threshold": float(m.threshold) if m.threshold else None,
            "passed": m.passed,
        }
        for m in metrics
    ]


@router.get("/error-logs")
async def list_error_logs(
    source: str = None,
    limit: int = Query(100, le=500),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(ErrorLog).order_by(desc(ErrorLog.created_at))
    if source:
        query = query.where(ErrorLog.source == source)
    query = query.limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "source": l.source,
            "error_type": l.error_type,
            "message": l.message,
            "context": l.context_json,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
