"""
Brands & Social Listening API endpoints.

GET /brands                         - List brands with filters
GET /brands/{id}/overview           - Brand detail with sentiment + top complaints
GET /brands/{id}/mentions           - Paginated brand mentions
GET /categories/{cat_id}/voice      - Category voice: pain points + feature requests
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
    Brand, BrandMention, BrandSentimentDaily, ShareOfVoiceDaily,
    Category, Topic, ReviewAspect, Review, TopicTopAsin, User,
)
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached
from app.schemas import PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/brands", tags=["brands"])


# ─── Schemas ───
class BrandListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    category_name: Optional[str] = None
    logo_url: Optional[str] = None
    total_mentions: int = 0
    avg_sentiment: Optional[float] = None


class BrandOverview(BaseModel):
    id: UUID
    name: str
    slug: str
    category_name: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    total_mentions: int = 0
    avg_sentiment: Optional[float] = None
    sentiment_trend: list = []
    share_of_voice: Optional[float] = None
    top_complaints: list = []
    recent_mentions: list = []


class MentionItem(BaseModel):
    id: int
    source: str
    text: Optional[str] = None
    sentiment: Optional[str] = None
    engagement: int = 0
    mention_date: date


class CategoryVoice(BaseModel):
    category_id: UUID
    category_name: str
    pain_points: list = []
    feature_requests: list = []
    total_reviews_analyzed: int = 0


# ─── GET /brands ───
@router.get("", response_model=list[BrandListItem])
async def list_brands(
    category_id: Optional[UUID] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List brands with optional category and search filters."""
    query = select(Brand).where(Brand.is_active == True)

    if category_id:
        query = query.where(Brand.category_id == category_id)
    if search:
        query = query.where(Brand.name.ilike(f"%{search}%"))

    query = query.order_by(Brand.name).limit(limit)
    result = await db.execute(query)
    brands = result.scalars().all()

    items = []
    for brand in brands:
        # Get total mentions
        mention_count = await db.execute(
            select(func.count()).select_from(BrandMention)
            .where(BrandMention.brand_id == brand.id)
        )
        total = mention_count.scalar() or 0

        # Get avg sentiment from latest daily
        sentiment_result = await db.execute(
            select(func.avg(BrandSentimentDaily.avg_sentiment))
            .where(BrandSentimentDaily.brand_id == brand.id)
        )
        avg_sent = sentiment_result.scalar()

        # Get category name
        cat_name = None
        if brand.category_id:
            cat_result = await db.execute(
                select(Category.name).where(Category.id == brand.category_id)
            )
            cat_name = cat_result.scalar()

        items.append(BrandListItem(
            id=brand.id,
            name=brand.name,
            slug=brand.slug,
            category_name=cat_name,
            logo_url=brand.logo_url,
            total_mentions=total,
            avg_sentiment=round(float(avg_sent), 4) if avg_sent else None,
        ))

    return items


# ─── GET /brands/{id}/overview ───
@router.get("/{brand_id}/overview", response_model=BrandOverview)
async def get_brand_overview(
    brand_id: UUID,
    days: int = Query(30, ge=7, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Brand overview with sentiment trend, share of voice, top complaints."""
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    cat_name = None
    if brand.category_id:
        cat_result = await db.execute(
            select(Category.name).where(Category.id == brand.category_id)
        )
        cat_name = cat_result.scalar()

    # Total mentions
    mention_count_result = await db.execute(
        select(func.count()).select_from(BrandMention)
        .where(BrandMention.brand_id == brand.id)
    )
    total_mentions = mention_count_result.scalar() or 0

    # Sentiment trend (daily)
    from datetime import timedelta
    cutoff = date.today() - timedelta(days=days)
    sentiment_result = await db.execute(
        select(BrandSentimentDaily)
        .where(and_(
            BrandSentimentDaily.brand_id == brand.id,
            BrandSentimentDaily.date >= cutoff,
            BrandSentimentDaily.source == "all",
        ))
        .order_by(BrandSentimentDaily.date)
    )
    sentiment_trend = [
        {
            "date": s.date.isoformat(),
            "mention_count": s.mention_count,
            "avg_sentiment": float(s.avg_sentiment) if s.avg_sentiment else None,
            "positive": s.positive_count,
            "negative": s.negative_count,
        }
        for s in sentiment_result.scalars().all()
    ]

    # Average sentiment
    avg_sent_result = await db.execute(
        select(func.avg(BrandSentimentDaily.avg_sentiment))
        .where(and_(
            BrandSentimentDaily.brand_id == brand.id,
            BrandSentimentDaily.date >= cutoff,
        ))
    )
    avg_sentiment = avg_sent_result.scalar()

    # Top complaints (negative mentions, grouped)
    complaints_result = await db.execute(
        select(
            BrandMention.text,
            BrandMention.sentiment_score,
            BrandMention.source,
            BrandMention.mention_date,
        )
        .where(and_(
            BrandMention.brand_id == brand.id,
            BrandMention.sentiment == "negative",
        ))
        .order_by(desc(BrandMention.engagement))
        .limit(10)
    )
    top_complaints = [
        {
            "text": r.text[:200] if r.text else "",
            "source": r.source,
            "date": r.mention_date.isoformat(),
            "severity": abs(float(r.sentiment_score)) if r.sentiment_score else 0.5,
        }
        for r in complaints_result.all()
    ]

    # Recent mentions
    recent_result = await db.execute(
        select(BrandMention)
        .where(BrandMention.brand_id == brand.id)
        .order_by(desc(BrandMention.mention_date))
        .limit(5)
    )
    recent_mentions = [
        {
            "text": m.text[:200] if m.text else "",
            "source": m.source,
            "sentiment": m.sentiment,
            "engagement": m.engagement,
            "date": m.mention_date.isoformat(),
        }
        for m in recent_result.scalars().all()
    ]

    # Share of voice
    sov = None
    if brand.category_id:
        sov_result = await db.execute(
            select(ShareOfVoiceDaily.share_pct)
            .where(and_(
                ShareOfVoiceDaily.brand_id == brand.id,
                ShareOfVoiceDaily.category_id == brand.category_id,
            ))
            .order_by(desc(ShareOfVoiceDaily.date))
            .limit(1)
        )
        sov_row = sov_result.scalar()
        if sov_row:
            sov = float(sov_row)

    return BrandOverview(
        id=brand.id,
        name=brand.name,
        slug=brand.slug,
        category_name=cat_name,
        logo_url=brand.logo_url,
        website=brand.website,
        total_mentions=total_mentions,
        avg_sentiment=round(float(avg_sentiment), 4) if avg_sentiment else None,
        sentiment_trend=sentiment_trend,
        share_of_voice=sov,
        top_complaints=top_complaints,
        recent_mentions=recent_mentions,
    )


# ─── GET /brands/{id}/mentions ───
@router.get("/{brand_id}/mentions", response_model=PaginatedResponse)
async def list_brand_mentions(
    brand_id: UUID,
    source: Optional[str] = None,
    sentiment: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated brand mentions with source and sentiment filters."""
    # Verify brand exists
    brand = await db.execute(select(Brand).where(Brand.id == brand_id))
    if not brand.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Brand not found")

    query = select(BrandMention).where(BrandMention.brand_id == brand_id)

    if source:
        query = query.where(BrandMention.source == source)
    if sentiment:
        query = query.where(BrandMention.sentiment == sentiment)

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    # Fetch page
    query = query.order_by(desc(BrandMention.mention_date))
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    mentions = result.scalars().all()

    items = [
        MentionItem(
            id=m.id,
            source=m.source,
            text=m.text[:300] if m.text else None,
            sentiment=m.sentiment,
            engagement=m.engagement,
            mention_date=m.mention_date,
        )
        for m in mentions
    ]

    total_pages = (total + page_size - 1) // page_size
    return PaginatedResponse(
        data=items,
        pagination=PaginationMeta(
            page=page, page_size=page_size, total=total, total_pages=total_pages,
        ),
    )
