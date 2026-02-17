from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, desc, case, and_, text
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

    # ─── NEW: Daily Intelligence Panel ───
    daily_intelligence = await _compute_daily_intelligence(db)

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
        "daily_intelligence": daily_intelligence,
    }


async def _compute_daily_intelligence(db: AsyncSession) -> dict:
    """Compute daily intelligence signals: score jumps, new exploding topics,
    declining alerts, and category shifts."""

    # Score jumps: topics whose opportunity score increased most vs previous score
    # Compare latest two scores per topic
    score_jumps_q = await db.execute(text("""
        WITH ranked_scores AS (
            SELECT
                s.topic_id,
                s.score_value,
                s.computed_at,
                t.name,
                t.stage,
                t.primary_category,
                ROW_NUMBER() OVER (PARTITION BY s.topic_id ORDER BY s.computed_at DESC) as rn
            FROM scores s
            JOIN topics t ON t.id = s.topic_id
            WHERE s.score_type = 'opportunity' AND t.is_active = true
        ),
        deltas AS (
            SELECT
                r1.topic_id,
                r1.name,
                r1.stage,
                r1.primary_category as category,
                r1.score_value as current_score,
                r2.score_value as prev_score,
                (r1.score_value - r2.score_value) as delta
            FROM ranked_scores r1
            JOIN ranked_scores r2 ON r1.topic_id = r2.topic_id AND r2.rn = 2
            WHERE r1.rn = 1 AND r2.score_value > 0
        )
        SELECT topic_id, name, stage, category, current_score, prev_score, delta
        FROM deltas
        WHERE ABS(delta) > 3
        ORDER BY delta DESC
        LIMIT 10
    """))
    score_jumps_rows = score_jumps_q.fetchall()

    rising = []
    falling = []
    for r in score_jumps_rows:
        item = {
            "id": str(r.topic_id), "name": r.name, "stage": r.stage,
            "category": r.category,
            "current_score": round(float(r.current_score), 1),
            "prev_score": round(float(r.prev_score), 1),
            "delta": round(float(r.delta), 1),
        }
        if r.delta > 0:
            rising.append(item)
        else:
            falling.append(item)

    # Exploding topics (stage = exploding, ordered by opportunity score)
    exploding_q = await db.execute(
        select(Topic.id, Topic.name, Topic.primary_category, Score.score_value)
        .join(Score, and_(Score.topic_id == Topic.id, Score.score_type == "opportunity"))
        .where(and_(Topic.is_active == True, Topic.stage == "exploding"))
        .order_by(desc(Score.score_value))
        .limit(5)
    )
    exploding = [
        {"id": str(r.id), "name": r.name, "category": r.primary_category,
         "score": round(float(r.score_value), 1) if r.score_value else 0}
        for r in exploding_q.all()
    ]

    # Category momentum: average score by category
    cat_momentum_q = await db.execute(text("""
        WITH latest_scores AS (
            SELECT DISTINCT ON (s.topic_id)
                s.topic_id, s.score_value, t.primary_category
            FROM scores s
            JOIN topics t ON t.id = s.topic_id
            WHERE s.score_type = 'opportunity' AND t.is_active = true
            ORDER BY s.topic_id, s.computed_at DESC
        )
        SELECT primary_category as category,
               ROUND(AVG(score_value)::numeric, 1) as avg_score,
               COUNT(*) as topic_count
        FROM latest_scores
        WHERE primary_category IS NOT NULL
        GROUP BY primary_category
        ORDER BY avg_score DESC
        LIMIT 8
    """))
    category_momentum = [
        {"category": r.category, "avg_score": float(r.avg_score), "topic_count": r.topic_count}
        for r in cat_momentum_q.fetchall()
    ]

    # Opportunity funnel: count by stage
    funnel = {
        "signal": stages_count(await db.execute(
            select(func.count()).where(and_(Topic.is_active == True, Topic.stage == "unknown"))
        )),
        "emerging": stages_count(await db.execute(
            select(func.count()).where(and_(Topic.is_active == True, Topic.stage == "emerging"))
        )),
        "exploding": stages_count(await db.execute(
            select(func.count()).where(and_(Topic.is_active == True, Topic.stage == "exploding"))
        )),
        "peaking": stages_count(await db.execute(
            select(func.count()).where(and_(Topic.is_active == True, Topic.stage == "peaking"))
        )),
    }

    return {
        "rising": rising[:5],
        "falling": sorted(falling, key=lambda x: x["delta"])[:5],
        "exploding_topics": exploding,
        "category_momentum": category_momentum,
        "funnel": funnel,
    }


def stages_count(result) -> int:
    return result.scalar() or 0
