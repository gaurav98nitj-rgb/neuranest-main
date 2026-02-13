import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, asc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Topic, Score, SourceTimeseries, Forecast, AmazonCompetitionSnapshot,
    TopicTopAsin, Asin, ReviewAspect, Review, GenNextSpec, User,
)
from app.schemas import (
    TopicListItem, TopicDetail, TopicFilters, PaginatedResponse, PaginationMeta,
    TimeseriesPoint, TimeseriesResponse,
    ForecastPoint, ForecastResponse,
    CompetitionResponse, AsinSummary,
    ReviewsSummaryResponse, AspectSummary, PainPoint, MissingFeature,
    GenNextSpecResponse, MustFix, MustAdd, Differentiator, Positioning,
    ForecastDirection,
)
from app.dependencies import get_current_user, require_pro, get_redis, cache_key, get_cached, set_cached

router = APIRouter(prefix="/topics", tags=["topics"])


# ─── GET /topics ───
@router.get("", response_model=PaginatedResponse)
async def list_topics(
    category: Optional[str] = None,
    stage: Optional[str] = None,
    geo: Optional[str] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    search: Optional[str] = None,
    sort: str = "-opportunity_score",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check cache
    redis = await get_redis()
    ck = cache_key("topics_list", category=category, stage=stage, geo=geo,
                   min_score=min_score, max_score=max_score, search=search,
                   sort=sort, page=page, page_size=page_size)
    cached = await get_cached(ck, redis)
    if cached:
        return json.loads(cached)

    # Build query
    query = select(Topic).where(Topic.is_active == True)

    if category:
        query = query.where(Topic.primary_category == category)
    if stage:
        query = query.where(Topic.stage == stage)
    if search:
        query = query.where(Topic.name.ilike(f"%{search}%"))

    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar()

    # Sorting
    sort_field = sort.lstrip("-")
    sort_desc = sort.startswith("-")

    if sort_field == "opportunity_score":
        # Join with scores to sort
        score_subq = (
            select(Score.topic_id, Score.score_value)
            .where(Score.score_type == "opportunity")
            .distinct(Score.topic_id)
            .order_by(Score.topic_id, desc(Score.computed_at))
            .subquery()
        )
        query = query.outerjoin(score_subq, Topic.id == score_subq.c.topic_id)

        if min_score is not None:
            query = query.where(score_subq.c.score_value >= min_score)
        if max_score is not None:
            query = query.where(score_subq.c.score_value <= max_score)

        if sort_desc:
            query = query.order_by(desc(score_subq.c.score_value).nulls_last())
        else:
            query = query.order_by(asc(score_subq.c.score_value).nulls_last())
    else:
        col = getattr(Topic, sort_field, Topic.name)
        query = query.order_by(desc(col) if sort_desc else asc(col))

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    topics = result.scalars().all()

    # Build response items with scores
    items = []
    for topic in topics:
        # Get latest opportunity score
        score_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        score = score_result.scalar_one_or_none()

        # Get latest competition score
        comp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "competition"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        comp_score = comp_result.scalar_one_or_none()

        # Get sparkline (last 12 months normalized values)
        ts_result = await db.execute(
            select(SourceTimeseries.normalized_value)
            .where(SourceTimeseries.topic_id == topic.id)
            .order_by(desc(SourceTimeseries.date))
            .limit(12)
        )
        sparkline_raw = [float(r) if r else 0 for r in ts_result.scalars().all()]
        sparkline = list(reversed(sparkline_raw))

        # Get active sources
        src_result = await db.execute(
            select(SourceTimeseries.source)
            .where(SourceTimeseries.topic_id == topic.id)
            .distinct()
        )
        sources = [r for r in src_result.scalars().all()]

        items.append(TopicListItem(
            id=topic.id,
            name=topic.name,
            slug=topic.slug,
            stage=topic.stage,
            primary_category=topic.primary_category,
            opportunity_score=float(score.score_value) if score else None,
            competition_index=float(comp_score.score_value) if comp_score else None,
            forecast_direction=getattr(topic, "forecast_direction", None),
            sparkline=sparkline if sparkline else None,
            sources_active=sources if sources else None,
        ))

    # Free tier limit
    from app.models import Org
    if user.org_id:
        org_result = await db.execute(select(Org).where(Org.id == user.org_id))
        org = org_result.scalar_one_or_none()
        if org and org.plan == "free":
            items = items[:25]

    total_pages = (total + page_size - 1) // page_size
    response = PaginatedResponse(
        data=items,
        pagination=PaginationMeta(
            page=page, page_size=page_size, total=total, total_pages=total_pages
        ),
    )

    # Cache for 5 minutes
    await set_cached(ck, json.dumps(response.model_dump(), default=str), 300, redis)
    return response


# ─── GET /topics/{id} ───
@router.get("/{topic_id}", response_model=TopicDetail)
async def get_topic(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Get latest scores
    scores_result = await db.execute(
        select(Score)
        .where(Score.topic_id == topic_id)
        .order_by(desc(Score.computed_at))
    )
    scores = scores_result.scalars().all()
    latest_scores = {}
    seen_types = set()
    for s in scores:
        if s.score_type not in seen_types:
            latest_scores[s.score_type] = {
                "value": float(s.score_value) if s.score_value else None,
                "explanation": s.explanation_json,
                "computed_at": s.computed_at.isoformat() if s.computed_at else None,
            }
            seen_types.add(s.score_type)

    return TopicDetail(
        id=topic.id,
        name=topic.name,
        slug=topic.slug,
        description=topic.description,
        stage=topic.stage,
        primary_category=topic.primary_category,
        is_active=topic.is_active,
        latest_scores=latest_scores,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
    )


# ─── GET /topics/{id}/timeseries ───
@router.get("/{topic_id}/timeseries", response_model=TimeseriesResponse)
async def get_timeseries(
    topic_id: UUID,
    geo: str = "US",
    source: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(SourceTimeseries)
        .where(and_(SourceTimeseries.topic_id == topic_id, SourceTimeseries.geo == geo))
        .order_by(SourceTimeseries.date)
    )
    if source:
        query = query.where(SourceTimeseries.source == source)

    result = await db.execute(query)
    rows = result.scalars().all()

    data = [
        TimeseriesPoint(
            date=r.date,
            source=r.source,
            raw_value=float(r.raw_value) if r.raw_value else None,
            normalized_value=float(r.normalized_value) if r.normalized_value else None,
        )
        for r in rows
    ]

    return TimeseriesResponse(topic_id=topic_id, geo=geo, data=data)


# ─── GET /topics/{id}/forecast ───
@router.get("/{topic_id}/forecast", response_model=ForecastResponse)
async def get_forecast(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get latest forecasts
    result = await db.execute(
        select(Forecast)
        .where(Forecast.topic_id == topic_id)
        .order_by(desc(Forecast.generated_at))
        .limit(20)  # max 6 months * 2 horizons + buffer
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No forecasts available for this topic")

    latest_version = rows[0].model_version
    latest_time = rows[0].generated_at
    forecasts = [
        ForecastPoint(
            forecast_date=r.forecast_date,
            horizon_months=r.horizon_months,
            yhat=float(r.yhat),
            yhat_lower=float(r.yhat_lower),
            yhat_upper=float(r.yhat_upper),
        )
        for r in rows if r.model_version == latest_version
    ]

    return ForecastResponse(
        topic_id=topic_id,
        model_version=latest_version,
        generated_at=latest_time,
        forecasts=forecasts,
    )


# ─── GET /topics/{id}/competition ───
@router.get("/{topic_id}/competition", response_model=CompetitionResponse)
async def get_competition(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Latest snapshot
    snap_result = await db.execute(
        select(AmazonCompetitionSnapshot)
        .where(AmazonCompetitionSnapshot.topic_id == topic_id)
        .order_by(desc(AmazonCompetitionSnapshot.date))
        .limit(1)
    )
    snap = snap_result.scalar_one_or_none()
    if not snap:
        raise HTTPException(status_code=404, detail="No competition data available")

    # Get competition score
    score_result = await db.execute(
        select(Score)
        .where(and_(Score.topic_id == topic_id, Score.score_type == "competition"))
        .order_by(desc(Score.computed_at))
        .limit(1)
    )
    score = score_result.scalar_one_or_none()

    # Top ASINs
    asins_result = await db.execute(
        select(TopicTopAsin, Asin)
        .join(Asin, TopicTopAsin.asin == Asin.asin)
        .where(TopicTopAsin.topic_id == topic_id)
        .order_by(TopicTopAsin.rank)
        .limit(10)
    )
    top_asins = [
        AsinSummary(
            asin=asin.asin,
            title=asin.title,
            brand=asin.brand,
            price=float(asin.price) if asin.price else None,
            rating=float(asin.rating) if asin.rating else None,
            review_count=asin.review_count,
            rank=link.rank,
        )
        for link, asin in asins_result.all()
    ]

    return CompetitionResponse(
        topic_id=topic_id,
        date=snap.date,
        marketplace=snap.marketplace,
        listing_count=snap.listing_count,
        median_price=float(snap.median_price) if snap.median_price else None,
        avg_price=float(snap.avg_price) if snap.avg_price else None,
        median_reviews=snap.median_reviews,
        avg_rating=float(snap.avg_rating) if snap.avg_rating else None,
        brand_count=snap.brand_count,
        brand_hhi=float(snap.brand_hhi) if snap.brand_hhi else None,
        top3_brand_share=float(snap.top3_brand_share) if snap.top3_brand_share else None,
        competition_index=float(score.score_value) if score else None,
        rating_distribution=snap.rating_distribution_json,
        price_range=snap.price_range_json,
        top_asins=top_asins,
    )


# ─── GET /topics/{id}/reviews/summary ───
@router.get("/{topic_id}/reviews/summary", response_model=ReviewsSummaryResponse)
async def get_reviews_summary(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all ASINs for this topic
    asins_result = await db.execute(
        select(TopicTopAsin.asin).where(TopicTopAsin.topic_id == topic_id)
    )
    asin_ids = [r for r in asins_result.scalars().all()]

    if not asin_ids:
        raise HTTPException(status_code=404, detail="No review data available")

    # Count reviews
    review_count = await db.execute(
        select(func.count()).select_from(Review).where(Review.asin.in_(asin_ids))
    )
    total_reviews = review_count.scalar()

    # Get all aspects for these ASINs' reviews
    aspects_result = await db.execute(
        select(
            ReviewAspect.aspect,
            ReviewAspect.sentiment,
            func.count().label("cnt"),
            func.min(ReviewAspect.evidence_snippet).label("sample"),
        )
        .join(Review, ReviewAspect.review_id == Review.review_id)
        .where(Review.asin.in_(asin_ids))
        .group_by(ReviewAspect.aspect, ReviewAspect.sentiment)
        .order_by(desc("cnt"))
    )
    aspects_data = aspects_result.all()

    # Aggregate pros and cons
    aspect_totals = {}
    for aspect, sentiment, cnt, sample in aspects_data:
        if aspect not in aspect_totals:
            aspect_totals[aspect] = {"positive": 0, "negative": 0, "neutral": 0, "total": 0, "sample": {}}
        aspect_totals[aspect][sentiment] = cnt
        aspect_totals[aspect]["total"] += cnt
        aspect_totals[aspect]["sample"][sentiment] = sample

    pros = sorted(
        [
            AspectSummary(
                aspect=a,
                mention_count=d["positive"],
                sentiment_pct=d["positive"] / d["total"] if d["total"] > 0 else 0,
                sample=d["sample"].get("positive"),
            )
            for a, d in aspect_totals.items() if d["positive"] > 0
        ],
        key=lambda x: x.mention_count, reverse=True
    )[:5]

    cons = sorted(
        [
            AspectSummary(
                aspect=a,
                mention_count=d["negative"],
                sentiment_pct=d["negative"] / d["total"] if d["total"] > 0 else 0,
                sample=d["sample"].get("negative"),
            )
            for a, d in aspect_totals.items() if d["negative"] > 0
        ],
        key=lambda x: x.mention_count, reverse=True
    )[:5]

    pain_points = [
        PainPoint(
            aspect=c.aspect,
            severity=min(c.mention_count / max(total_reviews, 1) * 500, 100),
            evidence=f"{c.mention_count} of {total_reviews} reviews mention this issue",
        )
        for c in cons[:5]
    ]

    # Missing features: aspects with high neutral + negative and low positive
    missing = [
        MissingFeature(
            feature=a,
            demand_signal=f"{d['negative'] + d['neutral']} reviews reference this without satisfaction",
        )
        for a, d in aspect_totals.items()
        if d["negative"] > d["positive"] and d["total"] >= 5
    ][:5]

    return ReviewsSummaryResponse(
        topic_id=topic_id,
        total_reviews_analyzed=total_reviews,
        asins_covered=len(asin_ids),
        pros=pros,
        cons=cons,
        top_pain_points=pain_points,
        missing_features=missing,
    )


# ─── GET /topics/{id}/gen-next ───
@router.get("/{topic_id}/gen-next", response_model=GenNextSpecResponse)
async def get_gen_next_spec(
    topic_id: UUID,
    user: User = Depends(require_pro()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GenNextSpec)
        .where(GenNextSpec.topic_id == topic_id)
        .order_by(desc(GenNextSpec.generated_at))
        .limit(1)
    )
    spec = result.scalar_one_or_none()
    if not spec:
        raise HTTPException(status_code=404, detail="No Gen-Next spec available")

    return GenNextSpecResponse(
        topic_id=topic_id,
        version=spec.version,
        generated_at=spec.generated_at,
        model_used=spec.model_used,
        must_fix=[MustFix(**item) for item in (spec.must_fix_json or [])],
        must_add=[MustAdd(**item) for item in (spec.must_add_json or [])],
        differentiators=[Differentiator(**item) for item in (spec.differentiators_json or [])],
        positioning=Positioning(**(spec.positioning_json or {})),
    )
