"""
Platform Signals API — Meta (Instagram + Facebook) + TikTok data endpoints.

GET /platforms/topics/{id}/signals     - Aggregated platform signals for a topic
GET /platforms/topics/{id}/tiktok      - TikTok trends + mentions for a topic
GET /platforms/topics/{id}/instagram   - Instagram mentions for a topic
GET /platforms/topics/{id}/facebook    - Facebook mentions for a topic
GET /platforms/topics/{id}/ads         - Ad creatives targeting this topic
GET /platforms/overview                - Platform-wide signal summary
"""
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime, timedelta

from app.database import get_db
from app.models import User
from app.models.platforms import (
    InstagramMention, FacebookMention, TikTokTrend, TikTokMention, AdCreative,
)
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached

router = APIRouter(prefix="/platforms", tags=["platforms"])


# ─── Response Schemas ───
class PlatformSignalSummary(BaseModel):
    topic_id: str
    topic_name: Optional[str] = None
    instagram: dict = {}
    facebook: dict = {}
    tiktok: dict = {}
    ads: dict = {}
    total_engagement: int = 0
    dominant_platform: Optional[str] = None
    virality_score: float = 0.0  # 0-100


class TikTokTrendItem(BaseModel):
    hashtag: str
    date: str
    view_count: int
    video_count: int
    growth_rate: Optional[float] = None


class MentionItem(BaseModel):
    id: int
    post_id: Optional[str] = None
    video_id: Optional[str] = None
    text: Optional[str] = None
    likes: int = 0
    comments: int = 0
    shares: int = 0
    views: Optional[int] = None
    sentiment: Optional[str] = None
    posted_at: Optional[str] = None
    post_type: Optional[str] = None
    page_name: Optional[str] = None


class AdItem(BaseModel):
    id: int
    platform: str
    ad_text: Optional[str] = None
    media_type: Optional[str] = None
    spend_estimate: Optional[float] = None
    impressions_estimate: Optional[int] = None
    active_days: Optional[int] = None
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None


class PlatformOverview(BaseModel):
    total_instagram_mentions: int = 0
    total_facebook_mentions: int = 0
    total_tiktok_trends: int = 0
    total_tiktok_mentions: int = 0
    total_ad_creatives: int = 0
    top_tiktok_topics: list = []
    top_instagram_topics: list = []
    most_advertised_topics: list = []
    data_mode: str = "simulated"


# ─── GET /platforms/topics/{id}/signals ───
@router.get("/topics/{topic_id}/signals", response_model=PlatformSignalSummary)
async def get_topic_platform_signals(
    topic_id: UUID,
    days: int = Query(7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated platform signals for a single topic."""
    since = date.today() - timedelta(days=days)

    # Instagram aggregates
    ig_result = await db.execute(
        select(
            func.count(InstagramMention.id),
            func.coalesce(func.sum(InstagramMention.likes), 0),
            func.coalesce(func.sum(InstagramMention.comments), 0),
            func.coalesce(func.sum(InstagramMention.shares), 0),
        ).where(and_(
            InstagramMention.topic_id == topic_id,
            InstagramMention.posted_at >= since,
        ))
    )
    ig = ig_result.one()
    ig_data = {
        "posts": ig[0], "likes": int(ig[1]), "comments": int(ig[2]),
        "shares": int(ig[3]), "engagement": int(ig[1]) + int(ig[2]) + int(ig[3]),
    }

    # Facebook aggregates
    fb_result = await db.execute(
        select(
            func.count(FacebookMention.id),
            func.coalesce(func.sum(FacebookMention.reactions), 0),
            func.coalesce(func.sum(FacebookMention.comments), 0),
            func.coalesce(func.sum(FacebookMention.shares), 0),
        ).where(and_(
            FacebookMention.topic_id == topic_id,
            FacebookMention.posted_at >= since,
        ))
    )
    fb = fb_result.one()
    fb_data = {
        "posts": fb[0], "reactions": int(fb[1]), "comments": int(fb[2]),
        "shares": int(fb[3]), "engagement": int(fb[1]) + int(fb[2]) + int(fb[3]),
    }

    # TikTok aggregates
    tt_trend_result = await db.execute(
        select(
            func.coalesce(func.sum(TikTokTrend.view_count), 0),
            func.coalesce(func.sum(TikTokTrend.video_count), 0),
            func.coalesce(func.avg(TikTokTrend.growth_rate), 0),
        ).where(and_(
            TikTokTrend.topic_id == topic_id,
            TikTokTrend.date >= since,
        ))
    )
    tt_trend = tt_trend_result.one()

    tt_mention_result = await db.execute(
        select(
            func.count(TikTokMention.id),
            func.coalesce(func.sum(TikTokMention.likes), 0),
            func.coalesce(func.sum(TikTokMention.views), 0),
        ).where(and_(
            TikTokMention.topic_id == topic_id,
            TikTokMention.posted_at >= since,
        ))
    )
    tt_m = tt_mention_result.one()
    tt_data = {
        "total_views": int(tt_trend[0]),
        "total_videos": int(tt_trend[1]),
        "avg_growth": round(float(tt_trend[2]) * 100, 1),
        "mention_count": tt_m[0],
        "mention_likes": int(tt_m[1]),
        "mention_views": int(tt_m[2]),
        "engagement": int(tt_m[1]) + int(tt_trend[1]),
    }

    # Ads
    ads_result = await db.execute(
        select(
            func.count(AdCreative.id),
            func.coalesce(func.sum(AdCreative.spend_estimate), 0),
            func.coalesce(func.sum(AdCreative.impressions_estimate), 0),
        ).where(AdCreative.topic_id == topic_id)
    )
    ads = ads_result.one()
    ads_data = {
        "count": ads[0],
        "total_spend": round(float(ads[1]), 2),
        "total_impressions": int(ads[2]),
    }

    # Compute totals
    total_engagement = ig_data["engagement"] + fb_data["engagement"] + tt_data["engagement"]

    # Dominant platform
    platform_eng = {"instagram": ig_data["engagement"], "facebook": fb_data["engagement"], "tiktok": tt_data["engagement"]}
    dominant = max(platform_eng, key=platform_eng.get) if total_engagement > 0 else None

    # Virality score (0-100)
    virality = min(100, (
        (tt_data["total_views"] / 1_000_000) * 20 +
        (ig_data["likes"] / 1000) * 15 +
        (tt_data["avg_growth"]) * 2 +
        (ads_data["count"]) * 5
    ))

    return PlatformSignalSummary(
        topic_id=str(topic_id),
        instagram=ig_data,
        facebook=fb_data,
        tiktok=tt_data,
        ads=ads_data,
        total_engagement=total_engagement,
        dominant_platform=dominant,
        virality_score=round(virality, 1),
    )


# ─── GET /platforms/topics/{id}/tiktok ───
@router.get("/topics/{topic_id}/tiktok")
async def get_topic_tiktok(
    topic_id: UUID,
    days: int = Query(7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """TikTok trends + mentions for a topic."""
    since = date.today() - timedelta(days=days)

    trends_result = await db.execute(
        select(TikTokTrend)
        .where(and_(TikTokTrend.topic_id == topic_id, TikTokTrend.date >= since))
        .order_by(desc(TikTokTrend.date))
    )
    trends = [
        {"hashtag": t.hashtag, "date": t.date.isoformat(), "view_count": t.view_count,
         "video_count": t.video_count, "growth_rate": float(t.growth_rate) if t.growth_rate else None}
        for t in trends_result.scalars().all()
    ]

    mentions_result = await db.execute(
        select(TikTokMention)
        .where(and_(TikTokMention.topic_id == topic_id, TikTokMention.posted_at >= since))
        .order_by(desc(TikTokMention.views))
        .limit(20)
    )
    mentions = [
        {"id": m.id, "video_id": m.video_id, "text": m.description, "likes": m.likes,
         "comments": m.comments, "shares": m.shares, "views": m.views,
         "sentiment": m.sentiment, "posted_at": m.posted_at.isoformat() if m.posted_at else None}
        for m in mentions_result.scalars().all()
    ]

    return {"trends": trends, "mentions": mentions}


# ─── GET /platforms/topics/{id}/instagram ───
@router.get("/topics/{topic_id}/instagram")
async def get_topic_instagram(
    topic_id: UUID,
    days: int = Query(7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Instagram mentions for a topic."""
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(InstagramMention)
        .where(and_(InstagramMention.topic_id == topic_id, InstagramMention.posted_at >= since))
        .order_by(desc(InstagramMention.likes))
        .limit(20)
    )
    mentions = [
        {"id": m.id, "post_id": m.post_id, "post_type": m.post_type, "text": m.caption,
         "likes": m.likes, "comments": m.comments, "shares": m.shares,
         "sentiment": m.sentiment, "posted_at": m.posted_at.isoformat() if m.posted_at else None}
        for m in result.scalars().all()
    ]
    return {"mentions": mentions}


# ─── GET /platforms/topics/{id}/facebook ───
@router.get("/topics/{topic_id}/facebook")
async def get_topic_facebook(
    topic_id: UUID,
    days: int = Query(7, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Facebook mentions for a topic."""
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(FacebookMention)
        .where(and_(FacebookMention.topic_id == topic_id, FacebookMention.posted_at >= since))
        .order_by(desc(FacebookMention.reactions))
        .limit(20)
    )
    mentions = [
        {"id": m.id, "post_id": m.post_id, "page_name": m.page_name, "text": m.text,
         "likes": m.reactions, "comments": m.comments, "shares": m.shares,
         "sentiment": m.sentiment, "posted_at": m.posted_at.isoformat() if m.posted_at else None}
        for m in result.scalars().all()
    ]
    return {"mentions": mentions}


# ─── GET /platforms/topics/{id}/ads ───
@router.get("/topics/{topic_id}/ads")
async def get_topic_ads(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ad creatives targeting this topic."""
    result = await db.execute(
        select(AdCreative)
        .where(AdCreative.topic_id == topic_id)
        .order_by(desc(AdCreative.spend_estimate))
        .limit(20)
    )
    ads = [
        {"id": a.id, "platform": a.platform, "ad_text": a.ad_text, "media_type": a.media_type,
         "spend_estimate": float(a.spend_estimate) if a.spend_estimate else None,
         "impressions_estimate": a.impressions_estimate, "active_days": a.active_days,
         "first_seen": a.first_seen.isoformat() if a.first_seen else None,
         "last_seen": a.last_seen.isoformat() if a.last_seen else None}
        for a in result.scalars().all()
    ]
    return {"ads": ads}


# ─── GET /platforms/overview ───
@router.get("/overview", response_model=PlatformOverview)
async def get_platform_overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide summary stats."""
    redis = await get_redis()
    ck = cache_key("platform_overview")
    cached = await get_cached(ck, redis)
    if cached:
        return PlatformOverview(**json.loads(cached))

    ig_count = (await db.execute(select(func.count(InstagramMention.id)))).scalar()
    fb_count = (await db.execute(select(func.count(FacebookMention.id)))).scalar()
    tt_trends = (await db.execute(select(func.count(TikTokTrend.id)))).scalar()
    tt_mentions = (await db.execute(select(func.count(TikTokMention.id)))).scalar()
    ads_count = (await db.execute(select(func.count(AdCreative.id)))).scalar()

    # Top TikTok topics by views
    from app.models.topics import Topic
    tt_top = await db.execute(
        select(Topic.name, func.sum(TikTokTrend.view_count).label("views"))
        .join(TikTokTrend, TikTokTrend.topic_id == Topic.id)
        .group_by(Topic.name)
        .order_by(desc("views"))
        .limit(5)
    )
    top_tiktok = [{"name": r[0], "views": int(r[1])} for r in tt_top.all()]

    # Top Instagram topics by likes
    ig_top = await db.execute(
        select(Topic.name, func.sum(InstagramMention.likes).label("likes"))
        .join(InstagramMention, InstagramMention.topic_id == Topic.id)
        .group_by(Topic.name)
        .order_by(desc("likes"))
        .limit(5)
    )
    top_ig = [{"name": r[0], "likes": int(r[1])} for r in ig_top.all()]

    # Most advertised
    ad_top = await db.execute(
        select(Topic.name, func.sum(AdCreative.spend_estimate).label("spend"))
        .join(AdCreative, AdCreative.topic_id == Topic.id)
        .group_by(Topic.name)
        .order_by(desc("spend"))
        .limit(5)
    )
    top_ads = [{"name": r[0], "spend": round(float(r[1]), 2)} for r in ad_top.all()]

    from app.config import get_settings
    s = get_settings()
    mode = "live" if (s.META_ACCESS_TOKEN or s.TIKTOK_API_KEY) else "simulated"

    result = PlatformOverview(
        total_instagram_mentions=ig_count or 0,
        total_facebook_mentions=fb_count or 0,
        total_tiktok_trends=tt_trends or 0,
        total_tiktok_mentions=tt_mentions or 0,
        total_ad_creatives=ads_count or 0,
        top_tiktok_topics=top_tiktok,
        top_instagram_topics=top_ig,
        most_advertised_topics=top_ads,
        data_mode=mode,
    )

    await set_cached(ck, json.dumps(result.model_dump(mode="json"), default=str), 300, redis)
    return result
