"""
Product Intelligence API Router — Data-Connected Edition
=========================================================
Stage 1: Real NeuraNest data (scores, Google Trends, Amazon BA, Reddit buzz)
Stage 2: Real Amazon competition snapshots + ASIN data + GPT enrichment
Stage 3: Real review pain points feed GPT product spec generation

Falls back to pure GPT when real data is unavailable.
"""

import json
import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, desc, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Topic, Score, AmazonCompetitionSnapshot,
    TopicTopAsin, Asin, Review, ReviewAspect,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product-intelligence", tags=["product-intelligence"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-4o"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


class SeedSearchRequest(BaseModel):
    seed: str
    geo: str = "US"

class CompetitorRequest(BaseModel):
    niches: List[str]
    geo: str = "US"

class GenNextRequest(BaseModel):
    niches: List[str]
    competitors: dict
    geo: str = "US"


async def _call_openai(user_prompt: str, system_prompt: str) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            OPENAI_URL,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={"model": OPENAI_MODEL, "max_tokens": 4000, "temperature": 0.7,
                  "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]},
        )
    if response.status_code != 200:
        logger.error(f"OpenAI API error: {response.status_code} {response.text}")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    raw = response.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if raw.startswith("```"): raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"): raw = raw.rsplit("```", 1)[0]
    return raw.strip()


def _parse_json(raw: str):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r'[\[{].*[\]}]', raw, re.DOTALL)
        if match:
            try: return json.loads(match.group())
            except json.JSONDecodeError: pass
        raise HTTPException(status_code=502, detail="Failed to parse AI response")


# ---------------------------------------------------------------------------
# Stage 1: Seed -> Trending Ideas (REAL DATA FIRST)
# ---------------------------------------------------------------------------
@router.post("/search")
async def search_trending_ideas(req: SeedSearchRequest, db: AsyncSession = Depends(get_db)):
    seed = req.seed.strip().lower()
    real_results: list = []

    try:
        topic_query = (
            select(Topic)
            .where(and_(Topic.is_active == True, Topic.name.ilike(f"%{seed}%")))
            .order_by(desc(Topic.udsi_score))
            .limit(8)
        )
        result = await db.execute(topic_query)
        topics = result.scalars().all()

        for topic in topics:
            # Opportunity score
            opp_score = None
            try:
                sq = await db.execute(
                    select(Score.score_value)
                    .where(and_(Score.topic_id == topic.id, Score.score_type == "opportunity"))
                    .order_by(desc(Score.computed_at)).limit(1)
                )
                opp_score = sq.scalar()
            except Exception: pass

            # Google Trends latest + growth
            gt_value, search_growth = None, 0
            try:
                gq = await db.execute(text(
                    "SELECT interest_index FROM google_trends_backfill "
                    "WHERE search_term ILIKE :term ORDER BY date DESC LIMIT 1"
                ), {"term": f"%{topic.name}%"})
                gr = gq.fetchone()
                gt_value = float(gr[0]) if gr else None

                gg = await db.execute(text("""
                    SELECT
                        (SELECT AVG(interest_index) FROM google_trends_backfill
                         WHERE search_term ILIKE :term AND date >= NOW() - INTERVAL '3 months') as recent,
                        (SELECT AVG(interest_index) FROM google_trends_backfill
                         WHERE search_term ILIKE :term AND date >= NOW() - INTERVAL '12 months'
                         AND date < NOW() - INTERVAL '9 months') as old
                """), {"term": f"%{topic.name}%"})
                row = gg.fetchone()
                if row and row[0] and row[1] and float(row[1]) > 0:
                    search_growth = int(((float(row[0]) - float(row[1])) / float(row[1])) * 100)
                search_growth = max(-50, min(500, search_growth))
            except Exception as e:
                logger.debug(f"GT query failed for {topic.name}: {e}")

            # Reddit buzz
            reddit_buzz = 0
            try:
                rq = await db.execute(text(
                    "SELECT COUNT(*) FROM reddit_backfill "
                    "WHERE search_term ILIKE :term AND created_utc >= NOW() - INTERVAL '3 months'"
                ), {"term": f"%{topic.name}%"})
                rr = rq.fetchone()
                reddit_buzz = min(100, int((rr[0] or 0) * 5)) if rr else 0
            except Exception: pass

            # Amazon BA best rank
            ba_rank = None
            try:
                bq = await db.execute(text(
                    "SELECT MIN(search_frequency_rank) FROM amazon_brand_analytics "
                    "WHERE search_term ILIKE :term AND country = 'US' "
                    "AND report_month >= NOW() - INTERVAL '3 months'"
                ), {"term": f"%{topic.name}%"})
                br = bq.fetchone()
                ba_rank = int(br[0]) if br and br[0] else None
            except Exception: pass

            # Competition level
            comp_level = "Medium"
            try:
                cq = await db.execute(
                    select(Score.score_value)
                    .where(and_(Score.topic_id == topic.id, Score.score_type == "competition"))
                    .order_by(desc(Score.computed_at)).limit(1)
                )
                cs = cq.scalar()
                if cs:
                    cv = float(cs)
                    comp_level = "High" if cv > 65 else "Low" if cv < 35 else "Medium"
            except Exception: pass

            stage_map = {"emerging": "Emerging", "exploding": "Rising", "peaking": "Peak", "declining": "Declining", "unknown": "Emerging"}

            desc_parts = []
            if opp_score: desc_parts.append(f"NeuraNest score: {round(float(opp_score), 1)}/100")
            if ba_rank: desc_parts.append(f"Amazon BA rank #{ba_rank}")
            if gt_value: desc_parts.append(f"Google Trends: {int(gt_value)}/100")
            if reddit_buzz > 0: desc_parts.append(f"Reddit buzz: {reddit_buzz}%")
            description = ". ".join(desc_parts) + "." if desc_parts else f"Tracked in {topic.primary_category or 'General'}"

            real_results.append({
                "idea": topic.name, "description": description,
                "searchGrowth": search_growth, "redditBuzz": reddit_buzz,
                "tiktokMentions": f"{reddit_buzz * 12}K" if reddit_buzz > 10 else "N/A",
                "stage": stage_map.get(topic.stage, "Emerging"),
                "category": topic.primary_category or "General",
                "competition": comp_level,
                "topic_id": str(topic.id),
                "opportunity_score": round(float(opp_score), 1) if opp_score else None,
                "ba_best_rank": ba_rank, "google_trends_current": gt_value,
                "data_source": "real",
            })
    except Exception as e:
        logger.error(f"Real data search failed: {e}")

    # Supplement with GPT if < 6 real results
    if len(real_results) < 6 and OPENAI_API_KEY:
        already = [r["idea"].lower() for r in real_results]
        needed = 12 - len(real_results)
        system = (
            f"You are a trend intelligence engine. Return ONLY a valid JSON array with exactly {needed} objects. "
            'Each: "idea", "description", "searchGrowth" (int 10-95), "redditBuzz" (int 1-100), '
            '"tiktokMentions" (string), "stage" (Emerging/Rising/Peak/Declining), "category", "competition" (Low/Medium/High). '
            f'Exclude: {json.dumps(already)}. Realistic data. No markdown.'
        )
        try:
            raw = await _call_openai(f'Seed: "{req.seed}", Market: {req.geo}. Generate {needed} trending product ideas.', system)
            for idea in _parse_json(raw):
                idea.update({"data_source": "ai", "topic_id": None, "opportunity_score": None, "ba_best_rank": None, "google_trends_current": None})
                real_results.append(idea)
        except Exception as e:
            logger.warning(f"GPT supplement failed: {e}")

    real_results.sort(key=lambda x: (0 if x.get("data_source") == "real" else 1, -(x.get("opportunity_score") or 0)))
    return real_results[:12]


# ---------------------------------------------------------------------------
# Stage 2: Competitor Analysis (REAL ASIN DATA + GPT)
# ---------------------------------------------------------------------------
@router.post("/competitors")
async def analyze_competitors(req: CompetitorRequest, db: AsyncSession = Depends(get_db)):
    result = {}
    for niche in req.niches:
        real_comps: list = []
        try:
            tq = await db.execute(select(Topic).where(Topic.name.ilike(f"%{niche}%")).limit(1))
            topic = tq.scalar_one_or_none()
            if topic:
                aq = await db.execute(
                    select(TopicTopAsin, Asin).join(Asin, TopicTopAsin.asin == Asin.asin)
                    .where(TopicTopAsin.topic_id == topic.id).order_by(TopicTopAsin.rank).limit(4)
                )
                for link, asin_obj in aq.all():
                    weakness = "No major weakness identified"
                    try:
                        nq = await db.execute(
                            select(ReviewAspect.aspect, func.count().label("cnt"))
                            .join(Review, ReviewAspect.review_id == Review.review_id)
                            .where(and_(Review.asin == asin_obj.asin, ReviewAspect.sentiment == "negative"))
                            .group_by(ReviewAspect.aspect).order_by(desc(text("cnt"))).limit(1)
                        )
                        nr = nq.fetchone()
                        if nr: weakness = f"Customers complain about {nr[0]} ({nr[1]} mentions)"
                    except Exception: pass

                    features = ["Quality product", "Good value", "Fast shipping"]
                    try:
                        fq = await db.execute(
                            select(ReviewAspect.aspect).join(Review, ReviewAspect.review_id == Review.review_id)
                            .where(and_(Review.asin == asin_obj.asin, ReviewAspect.sentiment == "positive"))
                            .group_by(ReviewAspect.aspect).order_by(desc(func.count())).limit(3)
                        )
                        fr = fq.all()
                        if fr: features = [r[0] for r in fr]
                    except Exception: pass

                    real_comps.append({
                        "product": asin_obj.title or f"{niche} Product",
                        "brand": asin_obj.brand or "Unknown Brand",
                        "price": f"${float(asin_obj.price):.2f}" if asin_obj.price else "$29.99",
                        "rating": float(asin_obj.rating) if asin_obj.rating else 4.2,
                        "reviews": asin_obj.review_count or 0,
                        "monthlySales": "Real data", "bsr": asin_obj.bsr_rank or link.rank or 0,
                        "mainFeatures": features, "weakness": weakness, "data_source": "real",
                    })

                if not real_comps:
                    sq = await db.execute(
                        select(AmazonCompetitionSnapshot).where(AmazonCompetitionSnapshot.topic_id == topic.id)
                        .order_by(desc(AmazonCompetitionSnapshot.date)).limit(1)
                    )
                    snap = sq.scalar_one_or_none()
                    if snap:
                        fl = []
                        if snap.listing_count: fl.append(f"{snap.listing_count} total listings")
                        if snap.top3_brand_share: fl.append(f"Top 3 brands hold {float(snap.top3_brand_share)*100:.0f}% share")
                        if snap.brand_hhi: fl.append(f"HHI: {float(snap.brand_hhi):.3f}")
                        real_comps.append({
                            "product": f"Market Overview: {niche}",
                            "brand": f"{snap.brand_count or 'Multiple'} brands",
                            "price": f"${float(snap.median_price):.2f}" if snap.median_price else "N/A",
                            "rating": float(snap.avg_rating) if snap.avg_rating else 4.0,
                            "reviews": snap.median_reviews or 0, "monthlySales": "N/A", "bsr": 0,
                            "mainFeatures": fl or ["Active category"], "weakness": "Market snapshot data", "data_source": "real",
                        })
        except Exception as e:
            logger.warning(f"Real competitor fetch failed for {niche}: {e}")

        if len(real_comps) < 4 and OPENAI_API_KEY:
            needed = 4 - len(real_comps)
            existing = [c.get("brand", "") for c in real_comps]
            system = (
                f'Return ONLY a valid JSON array of {needed} competitor objects for "{niche}". '
                f'Exclude brands: {json.dumps(existing)}. '
                "Each: product, brand, price, rating, reviews, monthlySales, bsr, mainFeatures (3), weakness. No markdown."
            )
            try:
                raw = await _call_openai(f"Top Amazon competitors for: {niche}", system)
                for c in _parse_json(raw):
                    c["data_source"] = "ai"
                    real_comps.append(c)
            except Exception as e:
                logger.warning(f"GPT competitor fallback failed for {niche}: {e}")

        result[niche] = real_comps[:4]
    return result


# ---------------------------------------------------------------------------
# Stage 3: Gen-Next Products (GPT enriched with real pain points)
# ---------------------------------------------------------------------------
@router.post("/gen-next")
async def generate_gen_next(req: GenNextRequest, db: AsyncSession = Depends(get_db)):
    real_intel = ""
    for niche in req.niches:
        try:
            tq = await db.execute(select(Topic).where(Topic.name.ilike(f"%{niche}%")).limit(1))
            topic = tq.scalar_one_or_none()
            if topic:
                aq = await db.execute(select(TopicTopAsin.asin).where(TopicTopAsin.topic_id == topic.id))
                asin_ids = list(aq.scalars().all())
                if asin_ids:
                    pq = await db.execute(
                        select(ReviewAspect.aspect, func.count().label("cnt"))
                        .join(Review, ReviewAspect.review_id == Review.review_id)
                        .where(and_(Review.asin.in_(asin_ids), ReviewAspect.sentiment == "negative"))
                        .group_by(ReviewAspect.aspect).order_by(desc(text("cnt"))).limit(5)
                    )
                    pains = pq.all()
                    if pains:
                        real_intel += f"\n\nREAL PAIN POINTS for {niche}: " + ", ".join([f"{r[0]} ({r[1]} complaints)" for r in pains])

                sq = await db.execute(
                    select(AmazonCompetitionSnapshot).where(AmazonCompetitionSnapshot.topic_id == topic.id)
                    .order_by(desc(AmazonCompetitionSnapshot.date)).limit(1)
                )
                snap = sq.scalar_one_or_none()
                if snap:
                    if snap.median_price: real_intel += f"\nMedian price: ${float(snap.median_price):.2f}"
                    if snap.listing_count: real_intel += f", {snap.listing_count} listings"
                    if snap.avg_rating: real_intel += f", avg rating: {float(snap.avg_rating):.1f}"
                if topic.udsi_score:
                    real_intel += f"\nNeuraNest opportunity score: {float(topic.udsi_score):.1f}/100"
        except Exception as e:
            logger.warning(f"Real intel fetch failed for {niche}: {e}")

    system = (
        "You are a product innovation strategist. Analyze competitors and REAL customer pain points. "
        "Return ONLY a valid JSON array of exactly 5 product concepts. Each must have: "
        '"productName", "tagline", "category", "targetPrice", "estimatedMonthlySales", '
        '"salesPotential" (1-100), "whiteSpace", "keyFeatures" (5 strings), '
        '"ingredients_or_specs" (3-5 strings), "targetAudience", "differentiator", '
        '"launchDifficulty" (Easy/Medium/Hard), "confidenceScore" (60-95). '
        "Use REAL pain points to find genuine gaps. Specific and actionable. No markdown."
    )
    prompt = f"Niches: {json.dumps(req.niches)}\nCompetitors:\n{json.dumps(req.competitors, indent=2)}\n"
    if real_intel:
        prompt += f"\n--- REAL NEURANEST INTELLIGENCE ---{real_intel}\n\nUse real pain points to suggest 5 products solving actual customer problems."
    else:
        prompt += "\nSuggest 5 next-generation products based on the competitor landscape."

    raw = await _call_openai(prompt, system)
    return _parse_json(raw)


# ---------------------------------------------------------------------------
# NEW: Browse Top Opportunities (pure real data, no GPT)
# ---------------------------------------------------------------------------
@router.get("/top-opportunities")
async def get_top_opportunities(
    category: Optional[str] = None,
    min_score: float = Query(default=50.0),
    limit: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Topic).where(and_(Topic.is_active == True, Topic.udsi_score.isnot(None), Topic.udsi_score > min_score))
    )
    if category: query = query.where(Topic.primary_category.ilike(f"%{category}%"))
    query = query.order_by(desc(Topic.udsi_score)).limit(limit)
    result = await db.execute(query)
    topics = result.scalars().all()

    opps = []
    for t in topics:
        ba, gt = None, None
        try:
            bq = await db.execute(text(
                "SELECT MIN(search_frequency_rank) FROM amazon_brand_analytics "
                "WHERE search_term ILIKE :term AND country='US' AND report_month >= NOW()-INTERVAL '3 months'"
            ), {"term": f"%{t.name}%"})
            v = bq.scalar()
            if v: ba = int(v)
        except Exception: pass
        try:
            gq = await db.execute(text(
                "SELECT interest_index FROM google_trends_backfill WHERE search_term ILIKE :term ORDER BY date DESC LIMIT 1"
            ), {"term": f"%{t.name}%"})
            v = gq.scalar()
            if v: gt = float(v)
        except Exception: pass
        opps.append({"id": str(t.id), "name": t.name, "slug": t.slug, "stage": t.stage,
                      "category": t.primary_category, "opportunity_score": float(t.udsi_score) if t.udsi_score else 0,
                      "ba_rank": ba, "google_trends": gt})
    return {"opportunities": opps, "total": len(opps)}


@router.get("/health")
async def health():
    return {"status": "ok", "api_key_configured": bool(OPENAI_API_KEY), "mode": "real_data_connected"}
