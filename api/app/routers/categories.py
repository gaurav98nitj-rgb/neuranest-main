"""
Category Intelligence API endpoints.

GET /categories                     - List top-level categories with health KPIs
GET /categories/{id}/overview       - Category detail with metrics + stage distribution
GET /categories/{id}/subcategories  - Child categories with rollup metrics
GET /categories/{id}/opportunities  - Topics in this category sorted by opportunity score
"""
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

from app.database import get_db
from app.models import (
    Category, CategoryMetric, Topic, Score, User,
)
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached
from app.schemas import TopicListItem, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/categories", tags=["categories"])


# ─── Response Schemas ───
class CategoryListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    level: int
    icon: Optional[str] = None
    topic_count: int = 0
    avg_opportunity_score: Optional[float] = None
    avg_competition_index: Optional[float] = None
    growth_rate_4w: Optional[float] = None
    stage_distribution: Optional[dict] = None


class CategoryOverview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    level: int
    icon: Optional[str] = None
    description: Optional[str] = None
    topic_count: int = 0
    avg_opportunity_score: Optional[float] = None
    avg_competition_index: Optional[float] = None
    growth_rate_4w: Optional[float] = None
    stage_distribution: dict = {}
    top_opportunities: list = []
    subcategories: list = []
    metrics_history: list = []


# ─── GET /categories ───
@router.get("", response_model=list[CategoryListItem])
async def list_categories(
    level: int = Query(0, ge=0, le=2),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List categories at a given level with latest metrics."""
    # Check cache
    redis = await get_redis()
    ck = cache_key("categories_list", level=level)
    cached = await get_cached(ck, redis)
    if cached:
        return json.loads(cached)

    result = await db.execute(
        select(Category)
        .where(and_(Category.level == level, Category.is_active == True))
        .order_by(Category.sort_order, Category.name)
    )
    categories = result.scalars().all()

    items = []
    for cat in categories:
        # Get latest metrics
        metric_result = await db.execute(
            select(CategoryMetric)
            .where(CategoryMetric.category_id == cat.id)
            .order_by(desc(CategoryMetric.date))
            .limit(1)
        )
        metric = metric_result.scalar_one_or_none()

        stage_dist = {}
        if metric:
            stage_dist = {
                "emerging": metric.emerging_count or 0,
                "exploding": metric.exploding_count or 0,
                "peaking": metric.peaking_count or 0,
                "declining": metric.declining_count or 0,
            }

        items.append(CategoryListItem(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            level=cat.level,
            icon=cat.icon,
            topic_count=cat.topic_count or 0,
            avg_opportunity_score=float(metric.avg_opportunity_score) if metric and metric.avg_opportunity_score else None,
            avg_competition_index=float(metric.avg_competition_index) if metric and metric.avg_competition_index else None,
            growth_rate_4w=float(metric.growth_rate_4w) if metric and metric.growth_rate_4w else None,
            stage_distribution=stage_dist,
        ))

    # Cache 5 minutes
    await set_cached(ck, json.dumps([i.model_dump(mode="json") for i in items], default=str), 300, redis)
    return items


# ─── GET /categories/{id}/overview ───
@router.get("/{category_id}/overview", response_model=CategoryOverview)
async def get_category_overview(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed category overview with metrics, stage distribution, top opportunities."""
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Latest metric
    metric_result = await db.execute(
        select(CategoryMetric)
        .where(CategoryMetric.category_id == cat.id)
        .order_by(desc(CategoryMetric.date))
        .limit(1)
    )
    metric = metric_result.scalar_one_or_none()

    stage_dist = {}
    if metric:
        stage_dist = {
            "emerging": metric.emerging_count or 0,
            "exploding": metric.exploding_count or 0,
            "peaking": metric.peaking_count or 0,
            "declining": metric.declining_count or 0,
        }

    # Metrics history (last 30 days)
    history_result = await db.execute(
        select(CategoryMetric)
        .where(CategoryMetric.category_id == cat.id)
        .order_by(desc(CategoryMetric.date))
        .limit(30)
    )
    metrics_history = [
        {
            "date": m.date.isoformat(),
            "topic_count": m.topic_count,
            "avg_opportunity_score": float(m.avg_opportunity_score) if m.avg_opportunity_score else None,
            "growth_rate_4w": float(m.growth_rate_4w) if m.growth_rate_4w else None,
        }
        for m in history_result.scalars().all()
    ]

    # Top 5 opportunities (highest opportunity score in this category)
    top_opps_result = await db.execute(
        select(Topic, Score.score_value)
        .join(Score, and_(Score.topic_id == Topic.id, Score.score_type == "opportunity"))
        .where(and_(
            Topic.category_id == cat.id,
            Topic.is_active == True,
        ))
        .order_by(desc(Score.score_value))
        .limit(5)
    )
    top_opps = [
        {
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "stage": t.stage,
            "opportunity_score": float(sv) if sv else None,
        }
        for t, sv in top_opps_result.all()
    ]

    # Subcategories
    sub_result = await db.execute(
        select(Category)
        .where(and_(Category.parent_id == cat.id, Category.is_active == True))
        .order_by(Category.sort_order, Category.name)
    )
    subcategories = [
        {
            "id": str(s.id),
            "name": s.name,
            "slug": s.slug,
            "topic_count": s.topic_count or 0,
        }
        for s in sub_result.scalars().all()
    ]

    return CategoryOverview(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        level=cat.level,
        icon=cat.icon,
        description=cat.description,
        topic_count=cat.topic_count or 0,
        avg_opportunity_score=float(metric.avg_opportunity_score) if metric and metric.avg_opportunity_score else None,
        avg_competition_index=float(metric.avg_competition_index) if metric and metric.avg_competition_index else None,
        growth_rate_4w=float(metric.growth_rate_4w) if metric and metric.growth_rate_4w else None,
        stage_distribution=stage_dist,
        top_opportunities=top_opps,
        subcategories=subcategories,
        metrics_history=list(reversed(metrics_history)),
    )


# ─── GET /categories/{id}/subcategories ───
@router.get("/{category_id}/subcategories", response_model=list[CategoryListItem])
async def list_subcategories(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List child categories with their metrics."""
    # Verify parent exists
    parent = await db.execute(select(Category).where(Category.id == category_id))
    if not parent.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Category not found")

    result = await db.execute(
        select(Category)
        .where(and_(Category.parent_id == category_id, Category.is_active == True))
        .order_by(Category.sort_order, Category.name)
    )
    children = result.scalars().all()

    items = []
    for cat in children:
        metric_result = await db.execute(
            select(CategoryMetric)
            .where(CategoryMetric.category_id == cat.id)
            .order_by(desc(CategoryMetric.date))
            .limit(1)
        )
        metric = metric_result.scalar_one_or_none()

        stage_dist = {}
        if metric:
            stage_dist = {
                "emerging": metric.emerging_count or 0,
                "exploding": metric.exploding_count or 0,
                "peaking": metric.peaking_count or 0,
                "declining": metric.declining_count or 0,
            }

        items.append(CategoryListItem(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            level=cat.level,
            icon=cat.icon,
            topic_count=cat.topic_count or 0,
            avg_opportunity_score=float(metric.avg_opportunity_score) if metric and metric.avg_opportunity_score else None,
            avg_competition_index=float(metric.avg_competition_index) if metric and metric.avg_competition_index else None,
            growth_rate_4w=float(metric.growth_rate_4w) if metric and metric.growth_rate_4w else None,
            stage_distribution=stage_dist,
        ))

    return items


# ─── GET /categories/{id}/opportunities ───
@router.get("/{category_id}/opportunities", response_model=PaginatedResponse)
async def list_category_opportunities(
    category_id: UUID,
    stage: Optional[str] = None,
    min_score: Optional[float] = None,
    sort: str = "-opportunity_score",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List topics (opportunities) within a category, sorted by opportunity score."""
    # Verify category exists
    cat_result = await db.execute(select(Category).where(Category.id == category_id))
    cat = cat_result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Base query: topics in this category
    query = select(Topic).where(and_(
        Topic.category_id == category_id,
        Topic.is_active == True,
    ))

    if stage:
        query = query.where(Topic.stage == stage)

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    # Join with scores for sorting and filtering
    score_subq = (
        select(Score.topic_id, Score.score_value.label("opp_score"))
        .where(Score.score_type == "opportunity")
        .distinct(Score.topic_id)
        .order_by(Score.topic_id, desc(Score.computed_at))
        .subquery()
    )
    query = query.outerjoin(score_subq, Topic.id == score_subq.c.topic_id)

    if min_score is not None:
        query = query.where(score_subq.c.opp_score >= min_score)

    sort_desc = sort.startswith("-")
    if sort_desc:
        query = query.order_by(desc(score_subq.c.opp_score).nulls_last())
    else:
        query = query.order_by(score_subq.c.opp_score.nulls_last())

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    topics = result.scalars().all()

    # Build response items
    items = []
    for topic in topics:
        score_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        score = score_result.scalar_one_or_none()

        comp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "competition"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        comp_score = comp_result.scalar_one_or_none()

        items.append(TopicListItem(
            id=topic.id,
            name=topic.name,
            slug=topic.slug,
            stage=topic.stage,
            primary_category=topic.primary_category,
            opportunity_score=float(score.score_value) if score else None,
            competition_index=float(comp_score.score_value) if comp_score else None,
            forecast_direction=getattr(topic, "forecast_direction", None),
            sparkline=None,
            sources_active=None,
        ))

    total_pages = (total + page_size - 1) // page_size
    return PaginatedResponse(
        data=items,
        pagination=PaginationMeta(
            page=page, page_size=page_size, total=total, total_pages=total_pages,
        ),
    )
