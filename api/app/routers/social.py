"""
Social Listening API endpoints.

GET /topics/{id}/social-signals     - Social engagement signals for a topic
GET /topics/{id}/complaints         - Clustered complaint themes for a topic
GET /topics/{id}/feature-requests   - Feature requests extracted from reviews
GET /categories/{cat_id}/voice      - Category voice: pain points + feature requests across all topics
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models import (
    Topic, Review, ReviewAspect, Asin, TopicTopAsin,
    Category, InstagramMention, TikTokTrend, TikTokMention,
    BrandMention, User,
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/social", tags=["social-listening"])


# ─── Schemas ───
class ComplaintCluster(BaseModel):
    cluster_id: int
    label: str
    size: int
    severity: float  # avg confidence of negative aspects
    representative_texts: list[str] = []
    top_keywords: list[str] = []


class FeatureRequestItem(BaseModel):
    id: int
    aspect: str
    evidence: Optional[str] = None
    review_stars: Optional[int] = None
    asin: Optional[str] = None
    confidence: Optional[float] = None


class TopicSocialSignals(BaseModel):
    topic_id: UUID
    topic_name: str
    instagram_posts: int = 0
    instagram_engagement: int = 0
    tiktok_videos: int = 0
    tiktok_views: int = 0
    tiktok_engagement: int = 0
    reddit_mentions: int = 0
    total_brand_mentions: int = 0
    avg_mention_sentiment: Optional[float] = None


class CategoryVoice(BaseModel):
    category_id: UUID
    category_name: str
    total_reviews_analyzed: int = 0
    total_negative_aspects: int = 0
    total_feature_requests: int = 0
    complaint_clusters: list[ComplaintCluster] = []
    top_feature_requests: list[FeatureRequestItem] = []


# ─── GET /social/topics/{id}/signals ───
@router.get("/topics/{topic_id}/signals", response_model=TopicSocialSignals)
async def get_topic_social_signals(
    topic_id: UUID,
    days: int = Query(30, ge=7, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated social engagement signals for a topic across platforms."""
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    from datetime import timedelta, date
    cutoff = date.today() - timedelta(days=days)

    # Instagram
    ig_result = await db.execute(
        select(
            func.count().label("posts"),
            func.coalesce(func.sum(InstagramMention.likes + InstagramMention.comments + InstagramMention.shares), 0).label("engagement"),
        )
        .where(and_(InstagramMention.topic_id == topic_id, InstagramMention.posted_at >= cutoff))
    )
    ig = ig_result.one()

    # TikTok mentions
    tt_result = await db.execute(
        select(
            func.count().label("videos"),
            func.coalesce(func.sum(TikTokMention.views), 0).label("views"),
            func.coalesce(func.sum(TikTokMention.likes + TikTokMention.comments + TikTokMention.shares), 0).label("engagement"),
        )
        .where(and_(TikTokMention.topic_id == topic_id, TikTokMention.posted_at >= cutoff))
    )
    tt = tt_result.one()

    # Reddit (from source_timeseries)
    reddit_result = await db.execute(sa_text("""
        SELECT COUNT(*) as cnt FROM source_timeseries
        WHERE topic_id = :tid AND source = 'reddit' AND date >= :cutoff
    """), {"tid": str(topic_id), "cutoff": cutoff})
    reddit_count = reddit_result.scalar() or 0

    # Brand mentions
    brand_result = await db.execute(sa_text("""
        SELECT COUNT(*) as cnt, AVG(sentiment_score) as avg_sent
        FROM brand_mentions bm
        JOIN brands b ON bm.brand_id = b.id
        WHERE bm.mention_date >= :cutoff
    """), {"cutoff": cutoff})
    brand_row = brand_result.one()

    return TopicSocialSignals(
        topic_id=topic.id,
        topic_name=topic.name,
        instagram_posts=ig.posts or 0,
        instagram_engagement=int(ig.engagement or 0),
        tiktok_videos=tt.videos or 0,
        tiktok_views=int(tt.views or 0),
        tiktok_engagement=int(tt.engagement or 0),
        reddit_mentions=reddit_count,
        total_brand_mentions=brand_row.cnt or 0,
        avg_mention_sentiment=round(float(brand_row.avg_sent), 4) if brand_row.avg_sent else None,
    )


# ─── GET /social/topics/{id}/complaints ───
@router.get("/topics/{topic_id}/complaints", response_model=list[ComplaintCluster])
async def get_topic_complaints(
    topic_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get clustered complaint themes for a topic's products."""
    # Verify topic
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Topic not found")

    # Get complaint clusters from review aspects linked to this topic's ASINs
    rows = await db.execute(sa_text("""
        SELECT
            ra.cluster_id,
            COUNT(*) as size,
            AVG(ra.confidence) as avg_confidence,
            ARRAY_AGG(DISTINCT ra.aspect ORDER BY ra.aspect) as aspects,
            ARRAY_AGG(
                CASE WHEN ra.evidence_snippet IS NOT NULL
                THEN LEFT(ra.evidence_snippet, 200) END
                ORDER BY ra.confidence DESC NULLS LAST
            ) as snippets
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        JOIN topic_top_asins tta ON r.asin = tta.asin
        WHERE tta.topic_id = :tid
          AND ra.sentiment = 'negative'
          AND ra.cluster_id IS NOT NULL
        GROUP BY ra.cluster_id
        ORDER BY size DESC
        LIMIT 20
    """), {"tid": str(topic_id)})

    clusters = []
    for row in rows.fetchall():
        # Filter None from snippets
        snippets = [s for s in (row.snippets or []) if s][:3]
        aspects = [a for a in (row.aspects or []) if a][:5]

        clusters.append(ComplaintCluster(
            cluster_id=row.cluster_id,
            label=" / ".join(a.capitalize() for a in aspects[:3]) if aspects else f"Cluster {row.cluster_id}",
            size=row.size,
            severity=round(float(row.avg_confidence), 4) if row.avg_confidence else 0.5,
            representative_texts=snippets,
            top_keywords=aspects,
        ))

    return clusters


# ─── GET /social/topics/{id}/feature-requests ───
@router.get("/topics/{topic_id}/feature-requests", response_model=list[FeatureRequestItem])
async def get_topic_feature_requests(
    topic_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get feature requests extracted from reviews for a topic's products."""
    result = await db.execute(select(Topic).where(Topic.id == topic_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Topic not found")

    offset = (page - 1) * page_size

    rows = await db.execute(sa_text("""
        SELECT ra.id, ra.aspect, ra.evidence_snippet, ra.confidence,
               r.stars, r.asin
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        JOIN topic_top_asins tta ON r.asin = tta.asin
        WHERE tta.topic_id = :tid
          AND ra.is_feature_request = true
        ORDER BY ra.confidence DESC NULLS LAST
        LIMIT :lim OFFSET :off
    """), {"tid": str(topic_id), "lim": page_size, "off": offset})

    items = []
    for row in rows.fetchall():
        items.append(FeatureRequestItem(
            id=row.id,
            aspect=row.aspect,
            evidence=row.evidence_snippet[:300] if row.evidence_snippet else None,
            review_stars=row.stars,
            asin=row.asin,
            confidence=round(float(row.confidence), 4) if row.confidence else None,
        ))

    return items


# ─── GET /social/categories/{id}/voice ───
@router.get("/categories/{category_id}/voice", response_model=CategoryVoice)
async def get_category_voice(
    category_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Category Voice: aggregated pain points and feature requests
    across all topics in a category.
    """
    cat_result = await db.execute(select(Category).where(Category.id == category_id))
    cat = cat_result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Total reviews analyzed for this category's topics
    stats = await db.execute(sa_text("""
        SELECT
            COUNT(DISTINCT ra.id) as total_aspects,
            COUNT(DISTINCT ra.id) FILTER (WHERE ra.sentiment = 'negative') as negative,
            COUNT(DISTINCT ra.id) FILTER (WHERE ra.is_feature_request = true) as feature_requests
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        JOIN topic_top_asins tta ON r.asin = tta.asin
        JOIN topics t ON tta.topic_id = t.id
        WHERE t.category_id = :cid
    """), {"cid": str(category_id)})
    stat_row = stats.one()

    # Complaint clusters across category
    cluster_rows = await db.execute(sa_text("""
        SELECT
            ra.cluster_id,
            COUNT(*) as size,
            AVG(ra.confidence) as avg_conf,
            ARRAY_AGG(DISTINCT ra.aspect ORDER BY ra.aspect) as aspects,
            ARRAY_AGG(
                CASE WHEN ra.evidence_snippet IS NOT NULL
                THEN LEFT(ra.evidence_snippet, 200) END
                ORDER BY ra.confidence DESC NULLS LAST
            ) as snippets
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        JOIN topic_top_asins tta ON r.asin = tta.asin
        JOIN topics t ON tta.topic_id = t.id
        WHERE t.category_id = :cid
          AND ra.sentiment = 'negative'
          AND ra.cluster_id IS NOT NULL
        GROUP BY ra.cluster_id
        ORDER BY size DESC
        LIMIT 15
    """), {"cid": str(category_id)})

    clusters = []
    for row in cluster_rows.fetchall():
        snippets = [s for s in (row.snippets or []) if s][:3]
        aspects = [a for a in (row.aspects or []) if a][:5]
        clusters.append(ComplaintCluster(
            cluster_id=row.cluster_id,
            label=" / ".join(a.capitalize() for a in aspects[:3]) if aspects else f"Cluster {row.cluster_id}",
            size=row.size,
            severity=round(float(row.avg_conf), 4) if row.avg_conf else 0.5,
            representative_texts=snippets,
            top_keywords=aspects,
        ))

    # Top feature requests across category
    fr_rows = await db.execute(sa_text("""
        SELECT ra.id, ra.aspect, ra.evidence_snippet, ra.confidence,
               r.stars, r.asin
        FROM review_aspects ra
        JOIN reviews r ON ra.review_id = r.review_id
        JOIN topic_top_asins tta ON r.asin = tta.asin
        JOIN topics t ON tta.topic_id = t.id
        WHERE t.category_id = :cid
          AND ra.is_feature_request = true
        ORDER BY ra.confidence DESC NULLS LAST
        LIMIT 20
    """), {"cid": str(category_id)})

    feature_requests = [
        FeatureRequestItem(
            id=row.id,
            aspect=row.aspect,
            evidence=row.evidence_snippet[:300] if row.evidence_snippet else None,
            review_stars=row.stars,
            asin=row.asin,
            confidence=round(float(row.confidence), 4) if row.confidence else None,
        )
        for row in fr_rows.fetchall()
    ]

    return CategoryVoice(
        category_id=cat.id,
        category_name=cat.name,
        total_reviews_analyzed=stat_row.total_aspects or 0,
        total_negative_aspects=stat_row.negative or 0,
        total_feature_requests=stat_row.feature_requests or 0,
        complaint_clusters=clusters,
        top_feature_requests=feature_requests,
    )
