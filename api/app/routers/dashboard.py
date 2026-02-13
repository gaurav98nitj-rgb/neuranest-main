from fastapi import APIRouter, Depends
from sqlalchemy import select, func, desc, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Topic, Score, SourceTimeseries, Forecast, AmazonCompetitionSnapshot, User
from app.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Total topics by stage
    stage_counts = await db.execute(
        select(Topic.stage, func.count().label("count"))
        .where(Topic.is_active == True)
        .group_by(Topic.stage)
    )
    stages = {row.stage: row.count for row in stage_counts.all()}

    # 2. Total topics by category
    cat_counts = await db.execute(
        select(Topic.primary_category, func.count().label("count"))
        .where(Topic.is_active == True)
        .group_by(Topic.primary_category)
        .order_by(desc("count"))
    )
    categories = [{"category": row.primary_category, "count": row.count} for row in cat_counts.all()]

    # 3. Top 5 movers (highest opportunity score)
    top_movers_q = await db.execute(
        select(Topic.id, Topic.name, Topic.slug, Topic.stage, Topic.primary_category, Score.score_value)
        .join(Score, and_(Score.topic_id == Topic.id, Score.score_type == "opportunity"))
        .where(Topic.is_active == True)
        .order_by(desc(Score.score_value))
        .limit(5)
    )
    top_movers = [
        {
            "id": str(row.id), "name": row.name, "slug": row.slug,
            "stage": row.stage, "category": row.primary_category,
            "score": float(row.score_value) if row.score_value else 0,
        }
        for row in top_movers_q.all()
    ]

    # 4. Low competition opportunities (high opp score + low comp score)
    opp_sub = (
        select(Score.topic_id, Score.score_value.label("opp"))
        .where(Score.score_type == "opportunity")
        .distinct(Score.topic_id)
        .order_by(Score.topic_id, desc(Score.computed_at))
        .subquery()
    )
    comp_sub = (
        select(Score.topic_id, Score.score_value.label("comp"))
        .where(Score.score_type == "competition")
        .distinct(Score.topic_id)
        .order_by(Score.topic_id, desc(Score.computed_at))
        .subquery()
    )
    low_comp_q = await db.execute(
        select(Topic.id, Topic.name, Topic.stage, opp_sub.c.opp, comp_sub.c.comp)
        .join(opp_sub, Topic.id == opp_sub.c.topic_id)
        .join(comp_sub, Topic.id == comp_sub.c.topic_id)
        .where(and_(Topic.is_active == True, comp_sub.c.comp < 50))
        .order_by(desc(opp_sub.c.opp))
        .limit(5)
    )
    low_comp = [
        {"id": str(r.id), "name": r.name, "stage": r.stage,
         "opportunity": float(r.opp), "competition": float(r.comp)}
        for r in low_comp_q.all()
    ]

    # 5. Summary stats
    total_topics = sum(stages.values())
    avg_score_q = await db.execute(
        select(func.avg(Score.score_value)).where(Score.score_type == "opportunity")
    )
    avg_score = float(avg_score_q.scalar() or 0)

    total_ts = await db.execute(select(func.count()).select_from(SourceTimeseries))
    data_points = total_ts.scalar()

    return {
        "summary": {
            "total_topics": total_topics,
            "avg_opportunity_score": round(avg_score, 1),
            "data_points_tracked": data_points,
            "stages": stages,
        },
        "categories": categories,
        "top_movers": top_movers,
        "low_competition_opportunities": low_comp,
    }
