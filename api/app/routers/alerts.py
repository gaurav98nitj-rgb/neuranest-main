from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Alert, AlertEvent
from app.schemas import AlertCreateRequest, AlertResponse, AlertEventResponse
from app.dependencies import require_pro

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    req: AlertCreateRequest,
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    alert = Alert(
        user_id=user.id,
        topic_id=req.topic_id,
        alert_type=req.alert_type,
        config_json=req.config_json,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert)
        .where(Alert.user_id == user.id)
        .order_by(desc(Alert.created_at))
    )
    return result.scalars().all()


@router.get("/{alert_id}/events", response_model=list[AlertEventResponse])
async def list_alert_events(
    alert_id: UUID,
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    alert = await db.execute(
        select(Alert).where(and_(Alert.id == alert_id, Alert.user_id == user.id))
    )
    if not alert.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Alert not found")

    result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.alert_id == alert_id)
        .order_by(desc(AlertEvent.triggered_at))
        .limit(50)
    )
    return result.scalars().all()


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: UUID,
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Alert).where(and_(Alert.id == alert_id, Alert.user_id == user.id))
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    await db.delete(alert)
    await db.commit()
