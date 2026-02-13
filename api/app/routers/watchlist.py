from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Watchlist, Topic, Score, Org
from app.schemas import WatchlistAddRequest, WatchlistItem
from app.dependencies import get_current_user

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(
    req: WatchlistAddRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check topic exists
    topic = await db.execute(select(Topic).where(Topic.id == req.topic_id))
    if not topic.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Topic not found")

    # Check existing
    existing = await db.execute(
        select(Watchlist).where(
            and_(Watchlist.user_id == user.id, Watchlist.topic_id == req.topic_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already in watchlist")

    # Check limit for free tier
    if user.org_id:
        org_result = await db.execute(select(Org).where(Org.id == user.org_id))
        org = org_result.scalar_one_or_none()
        if org and org.plan == "free":
            count_result = await db.execute(
                select(func.count()).select_from(Watchlist).where(Watchlist.user_id == user.id)
            )
            count = count_result.scalar()
            if count >= 5:
                raise HTTPException(status_code=403, detail="Free plan limited to 5 watchlist items. Upgrade to Pro.")

    item = Watchlist(user_id=user.id, topic_id=req.topic_id)
    db.add(item)
    await db.commit()
    return {"message": "Added to watchlist", "topic_id": str(req.topic_id)}


@router.get("", response_model=list[WatchlistItem])
async def get_watchlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Watchlist, Topic)
        .join(Topic, Watchlist.topic_id == Topic.id)
        .where(Watchlist.user_id == user.id)
        .order_by(desc(Watchlist.added_at))
    )
    rows = result.all()

    items = []
    for wl, topic in rows:
        # Get opportunity score
        score_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        score = score_result.scalar_one_or_none()

        items.append(WatchlistItem(
            id=wl.id,
            topic_id=topic.id,
            topic_name=topic.name,
            topic_stage=topic.stage,
            opportunity_score=float(score.score_value) if score else None,
            added_at=wl.added_at,
        ))

    return items


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Watchlist).where(
            and_(Watchlist.user_id == user.id, Watchlist.topic_id == topic_id)
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not in watchlist")

    await db.delete(item)
    await db.commit()
