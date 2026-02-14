"""
Product Intelligence API Router
================================
Handles the 4-stage product discovery journey:
1. Seed → Trending Ideas (OpenAI GPT-4o)
2. Selected Ideas → Amazon Competitor Analysis (OpenAI GPT-4o)
3. Competitors → Gen-Next Product Suggestions (OpenAI GPT-4o)

All OpenAI API calls happen server-side to keep keys secure.
"""

import json
import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product-intelligence", tags=["product-intelligence"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-4o"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------
class SeedSearchRequest(BaseModel):
    seed: str
    geo: str = "US"


class TrendingIdea(BaseModel):
    idea: str
    description: str
    searchGrowth: int
    redditBuzz: int
    tiktokMentions: str
    stage: str  # Emerging, Rising, Peak, Declining
    category: str
    competition: str  # Low, Medium, High


class CompetitorRequest(BaseModel):
    niches: List[str]
    geo: str = "US"


class Competitor(BaseModel):
    product: str
    brand: str
    price: str
    rating: float
    reviews: int
    monthlySales: str
    bsr: int
    mainFeatures: List[str]
    weakness: str


class GenNextRequest(BaseModel):
    niches: List[str]
    competitors: dict  # niche -> list of competitor data
    geo: str = "US"


class GenNextProduct(BaseModel):
    productName: str
    tagline: str
    category: str
    targetPrice: str
    estimatedMonthlySales: str
    salesPotential: int
    whiteSpace: str
    keyFeatures: List[str]
    ingredients_or_specs: List[str]
    targetAudience: str
    differentiator: str
    launchDifficulty: str  # Easy, Medium, Hard
    confidenceScore: int


# ---------------------------------------------------------------------------
# Claude API Helper
# ---------------------------------------------------------------------------
async def _call_claude(user_prompt: str, system_prompt: str) -> str:
    """Call OpenAI API and return the text response."""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY not configured. Add it to your .env file."
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            OPENAI_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            },
            json={
                "model": OPENAI_MODEL,
                "max_tokens": 4000,
                "temperature": 0.7,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )

    if response.status_code != 200:
        logger.error(f"OpenAI API error: {response.status_code} {response.text}")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    data = response.json()
    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _parse_json(raw: str):
    """Safely parse JSON from OpenAI's response."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        match = re.search(r'[\[{].*[\]}]', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        raise HTTPException(status_code=502, detail="Failed to parse AI response")


# ---------------------------------------------------------------------------
# Stage 1: Seed → Trending Ideas
# ---------------------------------------------------------------------------
@router.post("/search", response_model=List[TrendingIdea])
async def search_trending_ideas(req: SeedSearchRequest):
    """
    Stage 1: Take a seed keyword and return trending product/niche ideas.
    """
    system = (
        "You are a trend intelligence engine with access to Google Trends, Reddit, "
        "TikTok, and Amazon search data. Return ONLY a valid JSON array with exactly "
        "12 objects. Each object must have these exact keys: "
        '"idea" (string, short product/niche name), '
        '"description" (string, 1 sentence), '
        '"searchGrowth" (integer 10-95, percent YoY growth), '
        '"redditBuzz" (integer 1-100, relative activity score), '
        '"tiktokMentions" (string like "2.3M" or "450K"), '
        '"stage" (one of "Emerging","Rising","Peak","Declining"), '
        '"category" (string, short category), '
        '"competition" (one of "Low","Medium","High"). '
        "Make the data realistic and varied. No markdown, no explanation, just JSON."
    )
    prompt = (
        f'Seed keyword: "{req.seed}"\n'
        f"Market: {req.geo}\n\n"
        "Generate 12 trending product/niche ideas related to this seed keyword. "
        "Include a mix of emerging, rising, and peak trends. Make growth numbers "
        "and competition levels realistic."
    )

    raw = await _call_claude(prompt, system)
    parsed = _parse_json(raw)
    return parsed


# ---------------------------------------------------------------------------
# Stage 2: Selected Ideas → Amazon Competitor Analysis
# ---------------------------------------------------------------------------
@router.post("/competitors")
async def analyze_competitors(req: CompetitorRequest):
    """
    Stage 2: For selected niches, analyze top Amazon competitors.
    Returns dict of niche -> list of competitors.
    """
    system = (
        "You are an Amazon marketplace analyst specializing in competitive intelligence. "
        "Return ONLY a valid JSON object where each key is a niche name and each value "
        "is an array of exactly 4 competitor objects. Each competitor must have: "
        '"product" (string, product title), '
        '"brand" (string), '
        '"price" (string like "$29.99"), '
        '"rating" (float like 4.5), '
        '"reviews" (integer like 12345), '
        '"monthlySales" (string like "$85K"), '
        '"bsr" (integer), '
        '"mainFeatures" (array of 3 strings), '
        '"weakness" (string, one key weakness or gap). '
        "Make the data realistic for Amazon US. No markdown, just JSON."
    )
    prompt = (
        f"Product niches to analyze on Amazon {req.geo}: {json.dumps(req.niches)}\n\n"
        "For each niche, identify the top 4 current Amazon competitors. Include "
        "realistic pricing, ratings, review counts, and sales estimates. "
        "Most importantly, identify each product's key weakness or gap that "
        "a new entrant could exploit."
    )

    raw = await _call_claude(prompt, system)
    parsed = _parse_json(raw)
    return parsed


# ---------------------------------------------------------------------------
# Stage 3: Competitors → Gen-Next Product Suggestions
# ---------------------------------------------------------------------------
@router.post("/gen-next", response_model=List[GenNextProduct])
async def generate_gen_next(req: GenNextRequest):
    """
    Stage 3: Analyze white spaces in competitor landscape and suggest
    5 next-generation products.
    """
    system = (
        "You are a product innovation strategist specializing in Amazon product "
        "launches. You analyze competitor landscapes to identify white spaces "
        "(unmet needs, feature gaps, underserved segments, price gaps). "
        "Return ONLY a valid JSON array of exactly 5 product concepts. Each must have: "
        '"productName" (string, creative memorable name), '
        '"tagline" (string, catchy 1-liner), '
        '"category" (string, which niche this serves), '
        '"targetPrice" (string like "$34.99"), '
        '"estimatedMonthlySales" (string like "$45K-$75K"), '
        '"salesPotential" (integer 1-100), '
        '"whiteSpace" (string, what gap this fills), '
        '"keyFeatures" (array of 5 strings), '
        '"ingredients_or_specs" (array of 3-5 strings), '
        '"targetAudience" (string, who buys this), '
        '"differentiator" (string, why this wins vs incumbents), '
        '"launchDifficulty" (one of "Easy","Medium","Hard"), '
        '"confidenceScore" (integer 60-95). '
        "Be specific and actionable. No markdown, just JSON."
    )
    prompt = (
        f"Selected niches: {json.dumps(req.niches)}\n"
        f"Amazon competitor data:\n{json.dumps(req.competitors, indent=2)}\n\n"
        "Analyze the competitor landscape above. Identify white spaces: "
        "What are customers complaining about in reviews? What features are missing? "
        "What price points are underserved? What audience segments are ignored? "
        "Then suggest 5 next-generation products that exploit these gaps. "
        "Each product should be something a seller could realistically launch on Amazon."
    )

    raw = await _call_claude(prompt, system)
    parsed = _parse_json(raw)
    return parsed


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@router.get("/health")
async def health():
    return {
        "status": "ok",
        "api_key_configured": bool(OPENAI_API_KEY),
    }
