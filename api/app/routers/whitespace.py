"""
White-Space Detection API endpoint.

GET /whitespace  → Heatmap data: price range × competition level × customer dissatisfaction
GET /whitespace/cell  → Drill-down for a specific cell: topics + product concepts

White-space = areas where demand exists but supply is weak, quality is poor, or prices are misaligned.
"""
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_, case, literal_column, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

from app.database import get_db
from app.models import (
    Category, Topic, Score, AmazonCompetitionSnapshot, ReviewAspect,
    Review, Asin, DerivedFeature, User,
)
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached

router = APIRouter(prefix="/whitespace", tags=["whitespace"])


# ─── Response Schemas ───
class HeatmapCell(BaseModel):
    price_bucket: str  # e.g. "$0-25", "$25-50"
    price_min: float
    price_max: float
    competition_bucket: str  # e.g. "Low", "Medium", "High"
    competition_min: float
    competition_max: float
    topic_count: int = 0
    avg_dissatisfaction: float = 0.0  # 0-100, higher = more pain
    avg_opportunity_score: float = 0.0
    avg_competition_index: float = 0.0
    white_space_score: float = 0.0  # composite: high demand + low competition + high pain
    intensity: float = 0.0  # 0-1 for heatmap color


class HeatmapResponse(BaseModel):
    cells: list[HeatmapCell]
    price_buckets: list[str]
    competition_buckets: list[str]
    total_topics: int
    category_filter: Optional[str] = None


class CellTopic(BaseModel):
    id: str
    name: str
    slug: str
    stage: str
    primary_category: Optional[str] = None
    opportunity_score: Optional[float] = None
    competition_index: Optional[float] = None
    dissatisfaction_pct: Optional[float] = None
    median_price: Optional[float] = None
    feature_requests: list[str] = []
    top_complaints: list[str] = []


class ProductConcept(BaseModel):
    title: str
    description: str
    target_price: str
    key_differentiators: list[str]
    unmet_needs: list[str]


class CellDrillDown(BaseModel):
    price_bucket: str
    competition_bucket: str
    topics: list[CellTopic]
    product_concepts: list[ProductConcept]
    summary: str


# ─── Price and Competition Buckets ───
PRICE_BUCKETS = [
    ("$0-25", 0, 25),
    ("$25-50", 25, 50),
    ("$50-100", 50, 100),
    ("$100-200", 100, 200),
    ("$200+", 200, 99999),
]

COMPETITION_BUCKETS = [
    ("Low", 0, 33),
    ("Medium", 33, 66),
    ("High", 66, 100),
]


# ─── GET /whitespace ───
@router.get("", response_model=HeatmapResponse)
async def get_whitespace_heatmap(
    category: Optional[str] = Query(None, description="Filter by category name"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns white-space heatmap data.
    Each cell = (price_bucket × competition_bucket) with:
    - topic count
    - avg dissatisfaction (from negative review %)
    - avg opportunity score
    - white_space_score (composite)
    """
    # Check cache
    redis = await get_redis()
    ck = cache_key("whitespace_heatmap", category=category or "all")
    cached = await get_cached(ck, redis)
    if cached:
        data = json.loads(cached)
        return HeatmapResponse(**data)

    # Build topic query with all needed joins
    topic_q = select(Topic).where(Topic.is_active == True)
    if category:
        topic_q = topic_q.where(Topic.primary_category == category)

    topics_result = await db.execute(topic_q)
    topics = topics_result.scalars().all()

    if not topics:
        empty_cells = _build_empty_cells()
        return HeatmapResponse(
            cells=empty_cells,
            price_buckets=[b[0] for b in PRICE_BUCKETS],
            competition_buckets=[b[0] for b in COMPETITION_BUCKETS],
            total_topics=0,
            category_filter=category,
        )

    # Gather data for each topic
    topic_data = []
    for topic in topics:
        # Get latest competition snapshot
        comp_snap = await db.execute(
            select(AmazonCompetitionSnapshot)
            .where(AmazonCompetitionSnapshot.topic_id == topic.id)
            .order_by(desc(AmazonCompetitionSnapshot.date))
            .limit(1)
        )
        snap = comp_snap.scalar_one_or_none()

        # Get latest opportunity score
        opp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        opp_score = opp_result.scalar_one_or_none()

        # Get latest competition index
        comp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "competition"))
            .order_by(desc(Score.computed_at))
            .limit(1)
        )
        comp_score = comp_result.scalar_one_or_none()

        # Get dissatisfaction: % of negative review aspects for this topic's ASINs
        dissatisfaction = 0.0
        # Get ASINs linked to topic
        from app.models.topics import TopicTopAsin
        asin_result = await db.execute(
            select(TopicTopAsin.asin).where(TopicTopAsin.topic_id == topic.id)
        )
        asin_ids = [r[0] for r in asin_result.all()]

        if asin_ids:
            # Count total aspects and negative aspects
            total_aspects = await db.execute(
                select(func.count(ReviewAspect.id))
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(Review.asin.in_(asin_ids))
            )
            neg_aspects = await db.execute(
                select(func.count(ReviewAspect.id))
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(and_(
                    Review.asin.in_(asin_ids),
                    ReviewAspect.sentiment == "negative"
                ))
            )
            total_count = total_aspects.scalar() or 0
            neg_count = neg_aspects.scalar() or 0
            if total_count > 0:
                dissatisfaction = (neg_count / total_count) * 100

        median_price = float(snap.median_price) if snap and snap.median_price else None
        comp_index = float(comp_score.score_value) if comp_score else None
        opp_value = float(opp_score.score_value) if opp_score else None

        topic_data.append({
            "topic_id": str(topic.id),
            "name": topic.name,
            "stage": topic.stage,
            "category": topic.primary_category,
            "median_price": median_price,
            "competition_index": comp_index,
            "opportunity_score": opp_value,
            "dissatisfaction": dissatisfaction,
        })

    # Assign topics to cells
    cells = {}
    for pb_name, pb_min, pb_max in PRICE_BUCKETS:
        for cb_name, cb_min, cb_max in COMPETITION_BUCKETS:
            cell_key = f"{pb_name}|{cb_name}"
            cells[cell_key] = {
                "price_bucket": pb_name,
                "price_min": pb_min,
                "price_max": pb_max,
                "competition_bucket": cb_name,
                "competition_min": cb_min,
                "competition_max": cb_max,
                "topics": [],
            }

    for td in topic_data:
        price = td["median_price"]
        comp = td["competition_index"]
        if price is None or comp is None:
            continue

        # Find price bucket
        pb_match = None
        for pb_name, pb_min, pb_max in PRICE_BUCKETS:
            if pb_min <= price < pb_max:
                pb_match = pb_name
                break
        if not pb_match:
            pb_match = PRICE_BUCKETS[-1][0]  # $200+

        # Find competition bucket
        cb_match = None
        for cb_name, cb_min, cb_max in COMPETITION_BUCKETS:
            if cb_min <= comp < cb_max:
                cb_match = cb_name
                break
        if not cb_match:
            cb_match = COMPETITION_BUCKETS[-1][0]  # High

        cell_key = f"{pb_match}|{cb_match}"
        cells[cell_key]["topics"].append(td)

    # Compute cell metrics
    result_cells = []
    max_ws = 0

    for cell_key, cell in cells.items():
        topic_list = cell["topics"]
        count = len(topic_list)

        if count == 0:
            avg_dissatisfaction = 0
            avg_opp = 0
            avg_comp = 0
            ws_score = 0
        else:
            avg_dissatisfaction = sum(t["dissatisfaction"] for t in topic_list) / count
            avg_opp = sum(t["opportunity_score"] or 0 for t in topic_list) / count
            avg_comp = sum(t["competition_index"] or 0 for t in topic_list) / count

            # White-space score: HIGH opportunity + HIGH dissatisfaction + LOW competition = best
            # Normalize each 0-100, weight them
            inv_comp = max(0, 100 - avg_comp)  # invert: low competition = high score
            ws_score = (
                0.35 * avg_opp +          # demand signal
                0.35 * avg_dissatisfaction + # customer pain
                0.30 * inv_comp              # competition gap
            )

        if ws_score > max_ws:
            max_ws = ws_score

        result_cells.append(HeatmapCell(
            price_bucket=cell["price_bucket"],
            price_min=cell["price_min"],
            price_max=cell["price_max"],
            competition_bucket=cell["competition_bucket"],
            competition_min=cell["competition_min"],
            competition_max=cell["competition_max"],
            topic_count=count,
            avg_dissatisfaction=round(avg_dissatisfaction, 1),
            avg_opportunity_score=round(avg_opp, 1),
            avg_competition_index=round(avg_comp, 1),
            white_space_score=round(ws_score, 1),
            intensity=0,  # computed below
        ))

    # Normalize intensity 0-1
    if max_ws > 0:
        for cell in result_cells:
            cell.intensity = round(cell.white_space_score / max_ws, 3)

    response = HeatmapResponse(
        cells=result_cells,
        price_buckets=[b[0] for b in PRICE_BUCKETS],
        competition_buckets=[b[0] for b in COMPETITION_BUCKETS],
        total_topics=len(topic_data),
        category_filter=category,
    )

    # Cache 10 minutes
    await set_cached(ck, json.dumps(response.model_dump(mode="json"), default=str), 600, redis)
    return response


# ─── GET /whitespace/cell ───
@router.get("/cell", response_model=CellDrillDown)
async def get_whitespace_cell(
    price_bucket: str = Query(..., description="Price bucket label, e.g. '$25-50'"),
    competition_bucket: str = Query(..., description="Competition bucket label, e.g. 'Low'"),
    category: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Drill-down for a specific heatmap cell.
    Returns topics in that cell + AI-generated product concepts based on gaps.
    """
    # Find bucket ranges
    price_range = None
    for name, pmin, pmax in PRICE_BUCKETS:
        if name == price_bucket:
            price_range = (pmin, pmax)
            break
    if not price_range:
        raise HTTPException(status_code=400, detail=f"Invalid price bucket: {price_bucket}")

    comp_range = None
    for name, cmin, cmax in COMPETITION_BUCKETS:
        if name == competition_bucket:
            comp_range = (cmin, cmax)
            break
    if not comp_range:
        raise HTTPException(status_code=400, detail=f"Invalid competition bucket: {competition_bucket}")

    # Get all topics matching this cell
    topic_q = select(Topic).where(Topic.is_active == True)
    if category:
        topic_q = topic_q.where(Topic.primary_category == category)

    topics_result = await db.execute(topic_q)
    topics = topics_result.scalars().all()

    matching_topics = []
    for topic in topics:
        # Get competition snapshot
        snap_result = await db.execute(
            select(AmazonCompetitionSnapshot)
            .where(AmazonCompetitionSnapshot.topic_id == topic.id)
            .order_by(desc(AmazonCompetitionSnapshot.date))
            .limit(1)
        )
        snap = snap_result.scalar_one_or_none()

        # Get scores
        opp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
            .order_by(desc(Score.computed_at)).limit(1)
        )
        opp = opp_result.scalar_one_or_none()

        comp_result = await db.execute(
            select(Score)
            .where(and_(Score.topic_id == topic.id, Score.score_type == "competition"))
            .order_by(desc(Score.computed_at)).limit(1)
        )
        comp = comp_result.scalar_one_or_none()

        median_price = float(snap.median_price) if snap and snap.median_price else None
        comp_index = float(comp.score_value) if comp else None

        if median_price is None or comp_index is None:
            continue

        # Check if in this cell
        if not (price_range[0] <= median_price < price_range[1]):
            continue
        if not (comp_range[0] <= comp_index < comp_range[1]):
            continue

        # Get feature requests and complaints for this topic
        from app.models.topics import TopicTopAsin
        asin_result = await db.execute(
            select(TopicTopAsin.asin).where(TopicTopAsin.topic_id == topic.id)
        )
        asin_ids = [r[0] for r in asin_result.all()]

        feature_requests = []
        top_complaints = []
        dissatisfaction = 0.0

        if asin_ids:
            # Feature requests
            fr_result = await db.execute(
                select(ReviewAspect.aspect, ReviewAspect.evidence_snippet)
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(and_(
                    Review.asin.in_(asin_ids),
                    ReviewAspect.is_feature_request == True,
                ))
                .limit(5)
            )
            feature_requests = [r[0] for r in fr_result.all()]

            # Top complaints (negative aspects)
            neg_result = await db.execute(
                select(ReviewAspect.aspect, func.count(ReviewAspect.id).label("cnt"))
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(and_(
                    Review.asin.in_(asin_ids),
                    ReviewAspect.sentiment == "negative",
                ))
                .group_by(ReviewAspect.aspect)
                .order_by(desc("cnt"))
                .limit(5)
            )
            top_complaints = [r[0] for r in neg_result.all()]

            # Dissatisfaction %
            total_asp = await db.execute(
                select(func.count(ReviewAspect.id))
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(Review.asin.in_(asin_ids))
            )
            neg_asp = await db.execute(
                select(func.count(ReviewAspect.id))
                .join(Review, Review.review_id == ReviewAspect.review_id)
                .where(and_(Review.asin.in_(asin_ids), ReviewAspect.sentiment == "negative"))
            )
            t_count = total_asp.scalar() or 0
            n_count = neg_asp.scalar() or 0
            if t_count > 0:
                dissatisfaction = round((n_count / t_count) * 100, 1)

        matching_topics.append(CellTopic(
            id=str(topic.id),
            name=topic.name,
            slug=topic.slug,
            stage=topic.stage,
            primary_category=topic.primary_category,
            opportunity_score=float(opp.score_value) if opp else None,
            competition_index=comp_index,
            dissatisfaction_pct=dissatisfaction,
            median_price=median_price,
            feature_requests=feature_requests,
            top_complaints=top_complaints,
        ))

    # Sort by opportunity score desc
    matching_topics.sort(key=lambda t: t.opportunity_score or 0, reverse=True)

    # Generate product concepts from the gap analysis
    concepts = _generate_product_concepts(matching_topics, price_bucket, competition_bucket)

    # Summary
    count = len(matching_topics)
    if count == 0:
        summary = f"No topics found in {price_bucket} / {competition_bucket} competition zone."
    else:
        avg_opp = sum(t.opportunity_score or 0 for t in matching_topics) / count
        avg_dis = sum(t.dissatisfaction_pct or 0 for t in matching_topics) / count
        all_complaints = []
        for t in matching_topics:
            all_complaints.extend(t.top_complaints[:2])
        top_pain = list(set(all_complaints))[:3]

        if competition_bucket == "Low" and avg_dis > 20:
            summary = (
                f"Strong white-space zone: {count} topics at {price_bucket} with low competition "
                f"and {avg_dis:.0f}% dissatisfaction. Top pain points: {', '.join(top_pain) if top_pain else 'general quality'}. "
                f"Average opportunity score: {avg_opp:.0f}/100."
            )
        elif competition_bucket == "Low":
            summary = (
                f"Emerging opportunity: {count} topics at {price_bucket} with low competition. "
                f"Customer satisfaction is decent — differentiation needed on features, not just quality."
            )
        elif competition_bucket == "High" and avg_dis > 30:
            summary = (
                f"Disruption opportunity: {count} topics at {price_bucket} in a crowded market "
                f"but with {avg_dis:.0f}% dissatisfaction. Incumbents are underserving customers. "
                f"Key complaints: {', '.join(top_pain) if top_pain else 'general quality'}."
            )
        else:
            summary = (
                f"{count} topics in {price_bucket} / {competition_bucket} competition. "
                f"Average opportunity: {avg_opp:.0f}/100, dissatisfaction: {avg_dis:.0f}%."
            )

    return CellDrillDown(
        price_bucket=price_bucket,
        competition_bucket=competition_bucket,
        topics=matching_topics,
        product_concepts=concepts,
        summary=summary,
    )


def _generate_product_concepts(
    topics: list[CellTopic],
    price_bucket: str,
    competition_bucket: str,
) -> list[ProductConcept]:
    """Generate product concepts based on gaps in this cell."""
    if not topics:
        return []

    # Aggregate complaints and feature requests
    all_complaints = {}
    all_features = {}
    for t in topics:
        for c in t.top_complaints:
            all_complaints[c] = all_complaints.get(c, 0) + 1
        for f in t.feature_requests:
            all_features[f] = all_features.get(f, 0) + 1

    top_complaints = sorted(all_complaints.items(), key=lambda x: -x[1])[:5]
    top_features = sorted(all_features.items(), key=lambda x: -x[1])[:5]

    concepts = []

    # Concept 1: Quality-focused
    if top_complaints:
        pain_list = [c[0] for c in top_complaints[:3]]
        concepts.append(ProductConcept(
            title=f"Premium Quality {topics[0].primary_category or 'Product'}",
            description=f"A quality-first product addressing the top complaints in the {price_bucket} range: {', '.join(pain_list)}.",
            target_price=_suggest_price(price_bucket, "premium"),
            key_differentiators=[
                f"Solve '{c[0]}' complaints" for c in top_complaints[:3]
            ],
            unmet_needs=pain_list,
        ))

    # Concept 2: Feature-rich
    if top_features:
        feat_list = [f[0] for f in top_features[:3]]
        concepts.append(ProductConcept(
            title=f"Feature-Forward {topics[0].primary_category or 'Product'}",
            description=f"Product with requested features not available in current {price_bucket} offerings.",
            target_price=_suggest_price(price_bucket, "mid"),
            key_differentiators=[f"Add '{f[0]}'" for f in top_features[:3]],
            unmet_needs=feat_list,
        ))

    # Concept 3: Value disruptor (if high competition + high dissatisfaction)
    if competition_bucket in ("Medium", "High") and topics:
        avg_price = sum(t.median_price or 0 for t in topics if t.median_price) / max(1, len([t for t in topics if t.median_price]))
        concepts.append(ProductConcept(
            title=f"Value Disruptor in {topics[0].primary_category or 'Category'}",
            description=f"Undercut current {competition_bucket.lower()}-competition market at a lower price point while fixing core quality issues.",
            target_price=f"${avg_price * 0.7:.0f}-${avg_price * 0.85:.0f}",
            key_differentiators=[
                "20-30% lower price point",
                "Address top 2 quality complaints",
                "Direct-to-consumer model",
            ],
            unmet_needs=[c[0] for c in top_complaints[:2]] if top_complaints else ["better value"],
        ))

    return concepts[:3]


def _suggest_price(price_bucket: str, tier: str) -> str:
    """Suggest a target price based on bucket and tier."""
    ranges = {
        "$0-25": {"premium": "$18-25", "mid": "$12-18", "value": "$8-12"},
        "$25-50": {"premium": "$40-50", "mid": "$30-40", "value": "$25-32"},
        "$50-100": {"premium": "$80-100", "mid": "$60-80", "value": "$50-65"},
        "$100-200": {"premium": "$160-200", "mid": "$120-160", "value": "$100-130"},
        "$200+": {"premium": "$250-350", "mid": "$200-250", "value": "$180-220"},
    }
    return ranges.get(price_bucket, {}).get(tier, price_bucket)


def _build_empty_cells() -> list[HeatmapCell]:
    """Return empty cells grid."""
    cells = []
    for pb_name, pb_min, pb_max in PRICE_BUCKETS:
        for cb_name, cb_min, cb_max in COMPETITION_BUCKETS:
            cells.append(HeatmapCell(
                price_bucket=pb_name, price_min=pb_min, price_max=pb_max,
                competition_bucket=cb_name, competition_min=cb_min, competition_max=cb_max,
            ))
    return cells
