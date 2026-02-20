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
# Product Brief Models
# ---------------------------------------------------------------------------
class MarketSizingData(BaseModel):
    tam: str
    sam: str
    som: str
    assumptions: List[str]
    growth_rate: str


class MarginStackData(BaseModel):
    cogs: str
    amazon_fees: str
    ppc_ads: str
    gross_margin: str
    net_margin: str
    break_even_units: str
    notes: List[str]


class GTMPhase(BaseModel):
    phase: str
    duration: str
    tactics: List[str]
    kpis: List[str]


class SupplyChainData(BaseModel):
    moq: str
    lead_time: str
    sourcing_notes: str
    certifications: List[str]
    packaging_format: str
    supplier_regions: List[str]


class BrandIdentityData(BaseModel):
    brand_name_suggestions: List[str]
    tone_of_voice: str
    key_claims: List[str]
    packaging_format: str
    brand_archetype: str
    color_palette_keywords: List[str]


class RiskItem(BaseModel):
    risk: str
    probability: str  # Low / Medium / High
    impact: str       # Low / Medium / High
    mitigation: str


class ChecklistItem(BaseModel):
    task: str
    owner: str   # Founder / Agency / Platform / Supplier
    priority: str  # P0 / P1 / P2
    notes: Optional[str] = None


class ProductBrief(BaseModel):
    product_name: str
    tagline: str
    executive_summary: str
    opportunity_statement: str
    market_sizing: MarketSizingData
    margin_stack: MarginStackData
    gtm_plan: List[GTMPhase]
    supply_chain: SupplyChainData
    brand_identity: BrandIdentityData
    risks: List[RiskItem]
    launch_checklist: List[ChecklistItem]


class ProductBriefRequest(BaseModel):
    product: GenNextProduct
    niches: List[str]
    competitors: dict = {}
    geo: str = "US"


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
# Stage 4: Gen-Next Product → Full Product Brief
# ---------------------------------------------------------------------------
@router.post("/brief", response_model=ProductBrief)
async def generate_product_brief(req: ProductBriefRequest):
    """
    Stage 4: Take a single Gen-Next product concept and generate a comprehensive
    8-section product brief: Executive Summary, Market Sizing, Margin Stack,
    Go-To-Market Plan, Supply Chain, Brand Identity, Risk Register, Launch Checklist.
    """
    p = req.product
    system = (
        "You are a world-class product strategist and Amazon launch expert. "
        "You produce detailed, investor-grade product briefs for physical product launches. "
        "Return ONLY a valid JSON object (no markdown, no explanation). "
        "The object must have exactly these keys: "
        '"product_name" (string), '
        '"tagline" (string), '
        '"executive_summary" (string, 3 compelling sentences), '
        '"opportunity_statement" (string, 1 punchy sentence on the market gap), '
        '"market_sizing" (object with keys tam, sam, som (all strings like "$2.4B"), assumptions (array of 3 strings), growth_rate (string like "18% CAGR")), '
        '"margin_stack" (object with keys cogs, amazon_fees, ppc_ads, gross_margin, net_margin, break_even_units (all strings), notes (array of 2 strings)), '
        '"gtm_plan" (array of 3 phase objects, each with keys phase (string), duration (string), tactics (array of 4 strings), kpis (array of 3 strings)), '
        '"supply_chain" (object with keys moq (string), lead_time (string), sourcing_notes (string), certifications (array of strings), packaging_format (string), supplier_regions (array of strings)), '
        '"brand_identity" (object with keys brand_name_suggestions (array of 3 strings), tone_of_voice (string), key_claims (array of 4 strings), packaging_format (string), brand_archetype (string), color_palette_keywords (array of 3 strings)), '
        '"risks" (array of 5 objects, each with keys risk (string), probability (one of "Low","Medium","High"), impact (one of "Low","Medium","High"), mitigation (string)), '
        '"launch_checklist" (array of 20 objects, each with keys task (string), owner (one of "Founder","Agency","Platform","Supplier"), priority (one of "P0","P1","P2"), notes (string or null)). '
        "Be specific, realistic, and actionable. Make all numbers credible for the given market."
    )

    competitor_summary = ""
    if req.competitors:
        for niche, comps in req.competitors.items():
            if comps:
                weaknesses = [c.get("weakness", "") for c in comps if isinstance(c, dict)]
                competitor_summary += f"\n- {niche}: key gaps are: {'; '.join(weaknesses[:3])}"

    prompt = (
        f"Product concept:\n"
        f"  Name: {p.productName}\n"
        f"  Tagline: {p.tagline}\n"
        f"  Category: {p.category}\n"
        f"  Target price: {p.targetPrice}\n"
        f"  Estimated monthly sales: {p.estimatedMonthlySales}\n"
        f"  White space: {p.whiteSpace}\n"
        f"  Key features: {', '.join(p.keyFeatures)}\n"
        f"  Differentiator: {p.differentiator}\n"
        f"  Target audience: {p.targetAudience}\n"
        f"  Ingredients/specs: {', '.join(p.ingredients_or_specs)}\n"
        f"  Launch difficulty: {p.launchDifficulty}\n"
        f"  Confidence score: {p.confidenceScore}/100\n\n"
        f"Market niches: {', '.join(req.niches)}\n"
        f"Geography: {req.geo}\n"
        f"Competitor weakness summary:{competitor_summary or ' No competitor data provided.'}\n\n"
        "Generate a comprehensive product brief for this concept. Be specific with numbers. "
        "The margin stack should be realistic for an Amazon FBA product at this price point. "
        "The GTM plan should have 3 phases: Pre-Launch (60 days), Launch Week, and 90-Day Growth. "
        "The launch checklist should cover: supplier vetting, product photography, listing copy, "
        "PPC setup, influencer seeding, review strategy, and inventory planning."
    )

    raw = await _call_claude(prompt, system)
    parsed = _parse_json(raw)
    return parsed


# ---------------------------------------------------------------------------
# Stage 4b: Export Product Brief as Markdown
# ---------------------------------------------------------------------------
@router.post("/brief/export")
async def export_product_brief(req: ProductBriefRequest):
    """
    Generate a Product Brief and return it as a formatted Markdown string
    suitable for download as a .md file.
    """
    # Reuse the brief endpoint logic
    brief_data = await generate_product_brief(req)
    brief = brief_data if isinstance(brief_data, dict) else brief_data.dict()

    lines = []
    lines.append(f"# Product Brief: {brief.get('product_name', 'Unknown')}")
    lines.append(f"_{brief.get('tagline', '')}_ | Market: {req.geo}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Executive Summary
    lines.append("## 🎯 Executive Summary")
    lines.append(brief.get('executive_summary', ''))
    lines.append("")
    lines.append(f"**Opportunity:** {brief.get('opportunity_statement', '')}")
    lines.append("")

    # Market Sizing
    ms = brief.get('market_sizing', {})
    lines.append("## 📊 Market Sizing")
    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| TAM (Total Addressable Market) | {ms.get('tam', 'N/A')} |")
    lines.append(f"| SAM (Serviceable Addressable Market) | {ms.get('sam', 'N/A')} |")
    lines.append(f"| SOM (Serviceable Obtainable Market) | {ms.get('som', 'N/A')} |")
    lines.append(f"| Growth Rate | {ms.get('growth_rate', 'N/A')} |")
    lines.append("")
    lines.append("**Key Assumptions:**")
    for a in ms.get('assumptions', []):
        lines.append(f"- {a}")
    lines.append("")

    # Margin Stack
    mg = brief.get('margin_stack', {})
    lines.append("## 💰 Margin Stack")
    lines.append(f"| Item | Value |")
    lines.append(f"|------|-------|")
    lines.append(f"| COGS | {mg.get('cogs', 'N/A')} |")
    lines.append(f"| Amazon Fees | {mg.get('amazon_fees', 'N/A')} |")
    lines.append(f"| PPC / Ads | {mg.get('ppc_ads', 'N/A')} |")
    lines.append(f"| Gross Margin | {mg.get('gross_margin', 'N/A')} |")
    lines.append(f"| Net Margin | {mg.get('net_margin', 'N/A')} |")
    lines.append(f"| Break-Even Units | {mg.get('break_even_units', 'N/A')} |")
    lines.append("")
    for n in mg.get('notes', []):
        lines.append(f"> {n}")
    lines.append("")

    # GTM Plan
    lines.append("## 🚀 Go-To-Market Plan")
    for phase in brief.get('gtm_plan', []):
        lines.append(f"### {phase.get('phase', 'Phase')} ({phase.get('duration', '')})") 
        lines.append("**Tactics:**")
        for t in phase.get('tactics', []):
            lines.append(f"- {t}")
        lines.append("**KPIs:**")
        for k in phase.get('kpis', []):
            lines.append(f"- {k}")
        lines.append("")

    # Supply Chain
    sc = brief.get('supply_chain', {})
    lines.append("## 🏭 Supply Chain")
    lines.append(f"- **MOQ:** {sc.get('moq', 'N/A')}")
    lines.append(f"- **Lead Time:** {sc.get('lead_time', 'N/A')}")
    lines.append(f"- **Packaging:** {sc.get('packaging_format', 'N/A')}")
    lines.append(f"- **Supplier Regions:** {', '.join(sc.get('supplier_regions', []))}")
    lines.append(f"- **Certifications Needed:** {', '.join(sc.get('certifications', []))}")
    lines.append(f"\n{sc.get('sourcing_notes', '')}")
    lines.append("")

    # Brand Identity
    bi = brief.get('brand_identity', {})
    lines.append("## 🎨 Brand Identity")
    lines.append(f"- **Brand Archetype:** {bi.get('brand_archetype', 'N/A')}")
    lines.append(f"- **Tone of Voice:** {bi.get('tone_of_voice', 'N/A')}")
    lines.append(f"- **Name Suggestions:** {', '.join(bi.get('brand_name_suggestions', []))}")
    lines.append(f"- **Packaging:** {bi.get('packaging_format', 'N/A')}")
    lines.append(f"- **Colour Keywords:** {', '.join(bi.get('color_palette_keywords', []))}")
    lines.append("\n**Key Claims:**")
    for c in bi.get('key_claims', []):
        lines.append(f"- {c}")
    lines.append("")

    # Risks
    lines.append("## ⚠️ Risk Register")
    lines.append("| Risk | Probability | Impact | Mitigation |")
    lines.append("|------|-------------|--------|------------|")
    for r in brief.get('risks', []):
        lines.append(f"| {r.get('risk','')} | {r.get('probability','')} | {r.get('impact','')} | {r.get('mitigation','')} |")
    lines.append("")

    # Launch Checklist
    lines.append("## ✅ Launch Checklist")
    lines.append("| # | Task | Owner | Priority | Notes |")
    lines.append("|---|------|-------|----------|-------|")
    for i, item in enumerate(brief.get('launch_checklist', []), 1):
        notes = item.get('notes') or ''
        lines.append(f"| {i} | {item.get('task','')} | {item.get('owner','')} | {item.get('priority','')} | {notes} |")
    lines.append("")
    lines.append("---")
    lines.append(f"_Generated by NeuraNest Intelligence — {req.geo} Market_")

    return {"markdown": "\n".join(lines), "filename": f"product-brief-{req.product.productName.lower().replace(' ', '-')}.md"}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@router.get("/health")
async def health():
    return {
        "status": "ok",
        "api_key_configured": bool(OPENAI_API_KEY),
    }
