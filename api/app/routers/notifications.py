"""Notifications router — aggregates recent alert events for the in-app bell."""
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Alert, AlertEvent
from app.dependencies import get_current_user, get_redis

router = APIRouter(prefix="/alerts", tags=["notifications"])

REDIS_READ_KEY = "nn:notif_read:{user_id}"


@router.get("/notifications")
async def get_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Return the last 20 alert-fire events across all of the user's alerts."""
    # Get all alert IDs belonging to this user
    alert_result = await db.execute(
        select(Alert.id).where(Alert.user_id == user.id)
    )
    alert_ids = [row[0] for row in alert_result.fetchall()]

    if not alert_ids:
        return {"events": [], "unread_count": 0}

    # Fetch recent events
    events_result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.alert_id.in_(alert_ids))
        .order_by(desc(AlertEvent.triggered_at))
        .limit(20)
    )
    events = events_result.scalars().all()

    # Determine "last read" timestamp from Redis
    read_key = REDIS_READ_KEY.format(user_id=str(user.id))
    last_read_str = await redis.get(read_key)
    last_read = datetime.fromisoformat(last_read_str) if last_read_str else None

    # Enrich with alert metadata (topic_id, alert_type)
    alert_map: dict = {}
    if alert_ids:
        alert_rows = await db.execute(
            select(Alert).where(Alert.id.in_(alert_ids))
        )
        for a in alert_rows.scalars().all():
            alert_map[str(a.id)] = a

    enriched = []
    unread = 0
    for ev in events:
        alert = alert_map.get(str(ev.alert_id))
        is_unread = last_read is None or (
            ev.triggered_at.replace(tzinfo=None) > last_read.replace(tzinfo=None)
        )
        if is_unread:
            unread += 1
        enriched.append({
            "id": str(ev.id),
            "alert_id": str(ev.alert_id),
            "alert_type": alert.alert_type if alert else "unknown",
            "topic_id": str(alert.topic_id) if alert and alert.topic_id else None,
            "triggered_at": ev.triggered_at.isoformat(),
            "payload": ev.payload or {},
            "is_unread": is_unread,
        })

    return {"events": enriched, "unread_count": unread}


@router.post("/notifications/read")
async def mark_notifications_read(
    user: User = Depends(get_current_user),
    redis=Depends(get_redis),
):
    """Mark all notifications as read by storing current timestamp in Redis."""
    read_key = REDIS_READ_KEY.format(user_id=str(user.id))
    await redis.set(read_key, datetime.utcnow().isoformat(), ex=60 * 60 * 24 * 30)
    return {"ok": True}
