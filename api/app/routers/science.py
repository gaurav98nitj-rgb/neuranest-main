"""
Science Radar API endpoints.

GET /science/clusters          - List all research clusters with velocity/novelty
GET /science/clusters/{id}     - Cluster detail with papers + opportunity cards
GET /science/opportunities     - All opportunity cards (proposed product ideas)
POST /science/opportunities/{id}/accept  - Accept an opportunity (link to topic)
GET /science/overview          - Summary stats
"""
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.models import User
from app.models.science import ScienceItem, ScienceCluster, ScienceClusterItem, ScienceOpportunityCard
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached

router = APIRouter(prefix="/science", tags=["science-radar"])


# ─── Schemas ───
class ClusterListItem(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    item_count: int = 0
    velocity_score: Optional[float] = None
    novelty_score: Optional[float] = None
    avg_recency_days: Optional[float] = None
    top_keywords: list = []
    opportunity_count: int = 0


class PaperItem(BaseModel):
    id: str
    source: str
    title: str
    abstract: Optional[str] = None
    authors: list = []
    published_date: Optional[str] = None
    url: Optional[str] = None
    citation_count: int = 0
    categories: list = []


class OpportunityItem(BaseModel):
    id: str
    cluster_id: str
    cluster_label: Optional[str] = None
    topic_id: Optional[str] = None
    title: str
    hypothesis: Optional[str] = None
    target_category: Optional[str] = None
    confidence: Optional[float] = None
    status: str = "proposed"
    created_at: Optional[str] = None


class ClusterDetail(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    item_count: int = 0
    velocity_score: Optional[float] = None
    novelty_score: Optional[float] = None
    avg_recency_days: Optional[float] = None
    top_keywords: list = []
    papers: list[PaperItem] = []
    opportunities: list[OpportunityItem] = []


class ScienceOverview(BaseModel):
    total_papers: int = 0
    total_clusters: int = 0
    total_opportunities: int = 0
    avg_velocity: float = 0
    avg_novelty: float = 0
    top_clusters: list = []
    recent_papers: list = []
    categories_covered: list = []


# ─── GET /science/clusters ───
@router.get("/clusters", response_model=list[ClusterListItem])
async def list_clusters(
    sort: str = Query("-velocity", description="Sort: -velocity, -novelty, -item_count"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all science clusters sorted by velocity or novelty."""
    redis = await get_redis()
    ck = cache_key("science_clusters", sort=sort)
    cached = await get_cached(ck, redis)
    if cached:
        return json.loads(cached)

    # Sort mapping
    sort_col = desc(ScienceCluster.velocity_score)
    if sort == "-novelty":
        sort_col = desc(ScienceCluster.novelty_score)
    elif sort == "-item_count":
        sort_col = desc(ScienceCluster.item_count)
    elif sort == "velocity":
        sort_col = ScienceCluster.velocity_score

    result = await db.execute(
        select(ScienceCluster).order_by(sort_col.nulls_last())
    )
    clusters = result.scalars().all()

    items = []
    for c in clusters:
        # Count opportunities
        opp_count = await db.execute(
            select(func.count(ScienceOpportunityCard.id))
            .where(ScienceOpportunityCard.cluster_id == c.id)
        )
        count = opp_count.scalar() or 0

        kw = c.top_keywords
        if isinstance(kw, str):
            kw = json.loads(kw)

        items.append(ClusterListItem(
            id=str(c.id),
            label=c.label,
            description=c.description,
            item_count=c.item_count or 0,
            velocity_score=float(c.velocity_score) if c.velocity_score else None,
            novelty_score=float(c.novelty_score) if c.novelty_score else None,
            avg_recency_days=float(c.avg_recency_days) if c.avg_recency_days else None,
            top_keywords=kw or [],
            opportunity_count=count,
        ))

    await set_cached(ck, json.dumps([i.model_dump() for i in items], default=str), 300, redis)
    return items


# ─── GET /science/clusters/{id} ───
@router.get("/clusters/{cluster_id}", response_model=ClusterDetail)
async def get_cluster_detail(
    cluster_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cluster detail with papers and opportunity cards."""
    result = await db.execute(
        select(ScienceCluster).where(ScienceCluster.id == cluster_id)
    )
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Get papers
    paper_result = await db.execute(
        select(ScienceItem)
        .join(ScienceClusterItem, ScienceClusterItem.item_id == ScienceItem.id)
        .where(ScienceClusterItem.cluster_id == cluster_id)
        .order_by(desc(ScienceItem.published_date))
    )
    papers = [
        PaperItem(
            id=str(p.id), source=p.source, title=p.title,
            abstract=(p.abstract[:300] + "..." if p.abstract and len(p.abstract) > 300 else p.abstract),
            authors=json.loads(p.authors) if isinstance(p.authors, str) else (p.authors or []),
            published_date=p.published_date.isoformat() if p.published_date else None,
            url=p.url, citation_count=p.citation_count or 0,
            categories=json.loads(p.categories) if isinstance(p.categories, str) else (p.categories or []),
        )
        for p in paper_result.scalars().all()
    ]

    # Get opportunities
    opp_result = await db.execute(
        select(ScienceOpportunityCard)
        .where(ScienceOpportunityCard.cluster_id == cluster_id)
        .order_by(desc(ScienceOpportunityCard.confidence))
    )
    opportunities = [
        OpportunityItem(
            id=str(o.id), cluster_id=str(o.cluster_id), title=o.title,
            hypothesis=o.hypothesis, target_category=o.target_category,
            confidence=float(o.confidence) if o.confidence else None,
            status=o.status,
            created_at=o.created_at.isoformat() if o.created_at else None,
        )
        for o in opp_result.scalars().all()
    ]

    kw = cluster.top_keywords
    if isinstance(kw, str):
        kw = json.loads(kw)

    return ClusterDetail(
        id=str(cluster.id), label=cluster.label, description=cluster.description,
        item_count=cluster.item_count or 0,
        velocity_score=float(cluster.velocity_score) if cluster.velocity_score else None,
        novelty_score=float(cluster.novelty_score) if cluster.novelty_score else None,
        avg_recency_days=float(cluster.avg_recency_days) if cluster.avg_recency_days else None,
        top_keywords=kw or [],
        papers=papers, opportunities=opportunities,
    )


# ─── GET /science/opportunities ───
@router.get("/opportunities", response_model=list[OpportunityItem])
async def list_opportunities(
    status: Optional[str] = Query(None, description="Filter: proposed, accepted, rejected"),
    category: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all science-derived product opportunity cards."""
    query = select(ScienceOpportunityCard, ScienceCluster.label.label("cluster_label")).join(
        ScienceCluster, ScienceCluster.id == ScienceOpportunityCard.cluster_id
    )
    if status:
        query = query.where(ScienceOpportunityCard.status == status)
    if category:
        query = query.where(ScienceOpportunityCard.target_category == category)

    query = query.order_by(desc(ScienceOpportunityCard.confidence))

    result = await db.execute(query)
    rows = result.all()

    return [
        OpportunityItem(
            id=str(o.id), cluster_id=str(o.cluster_id),
            cluster_label=cl,
            topic_id=str(o.topic_id) if o.topic_id else None,
            title=o.title, hypothesis=o.hypothesis,
            target_category=o.target_category,
            confidence=float(o.confidence) if o.confidence else None,
            status=o.status,
            created_at=o.created_at.isoformat() if o.created_at else None,
        )
        for o, cl in rows
    ]


# ─── POST /science/opportunities/{id}/accept ───
@router.post("/opportunities/{opp_id}/accept")
async def accept_opportunity(
    opp_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept a science opportunity card (mark as accepted)."""
    result = await db.execute(
        select(ScienceOpportunityCard).where(ScienceOpportunityCard.id == opp_id)
    )
    opp = result.scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opp.status = "accepted"
    await db.commit()
    return {"message": "Opportunity accepted", "id": str(opp_id)}


# ─── GET /science/overview ───
@router.get("/overview", response_model=ScienceOverview)
async def get_science_overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Science Radar overview stats."""
    redis = await get_redis()
    ck = cache_key("science_overview")
    cached = await get_cached(ck, redis)
    if cached:
        return ScienceOverview(**json.loads(cached))

    total_papers = (await db.execute(select(func.count(ScienceItem.id)))).scalar() or 0
    total_clusters = (await db.execute(select(func.count(ScienceCluster.id)))).scalar() or 0
    total_opps = (await db.execute(select(func.count(ScienceOpportunityCard.id)))).scalar() or 0

    avg_vel = (await db.execute(select(func.avg(ScienceCluster.velocity_score)))).scalar()
    avg_nov = (await db.execute(select(func.avg(ScienceCluster.novelty_score)))).scalar()

    # Top clusters
    top_result = await db.execute(
        select(ScienceCluster).order_by(desc(ScienceCluster.velocity_score)).limit(5)
    )
    top_clusters = [
        {"label": c.label, "velocity": float(c.velocity_score) if c.velocity_score else 0,
         "novelty": float(c.novelty_score) if c.novelty_score else 0, "papers": c.item_count}
        for c in top_result.scalars().all()
    ]

    # Recent papers
    recent_result = await db.execute(
        select(ScienceItem).order_by(desc(ScienceItem.published_date)).limit(5)
    )
    recent = [
        {"title": p.title, "source": p.source,
         "date": p.published_date.isoformat() if p.published_date else None}
        for p in recent_result.scalars().all()
    ]

    # Categories covered
    cat_result = await db.execute(
        select(ScienceOpportunityCard.target_category, func.count(ScienceOpportunityCard.id))
        .group_by(ScienceOpportunityCard.target_category)
        .order_by(desc(func.count(ScienceOpportunityCard.id)))
    )
    categories = [{"category": r[0], "count": r[1]} for r in cat_result.all() if r[0]]

    result = ScienceOverview(
        total_papers=total_papers, total_clusters=total_clusters,
        total_opportunities=total_opps,
        avg_velocity=round(float(avg_vel), 1) if avg_vel else 0,
        avg_novelty=round(float(avg_nov), 1) if avg_nov else 0,
        top_clusters=top_clusters, recent_papers=recent,
        categories_covered=categories,
    )

    await set_cached(ck, json.dumps(result.model_dump(), default=str), 300, redis)
    return result
