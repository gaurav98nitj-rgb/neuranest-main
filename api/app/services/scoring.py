"""ML Scoring Service - opportunity scores, competition index, trend stage detection."""
from typing import Dict, Any, List
import math


def compute_competition_index(listing_count, median_reviews, brand_hhi, price_std, avg_price, top3_brand_share):
    """Competition Index (0-100, higher = more competitive)."""
    ls = min(listing_count / 500, 1.0) * 100
    rb = min(median_reviews / 1000, 1.0) * 100
    bc = (1 - brand_hhi) * 100 if brand_hhi > 0 else 50
    pc = (1 - (price_std / avg_price)) * 100 if avg_price > 0 else 50
    td = min(top3_brand_share * 100, 100)
    return round(max(0, min(100, 0.25*ls + 0.25*rb + 0.20*bc + 0.15*pc + 0.15*td)), 2)


def compute_opportunity_score(demand_growth_rate, acceleration, cross_source_positive, total_sources,
                               competition_index, review_gap_severity, geo_count,
                               forecast_pct_change_3m, data_months=12):
    """Opportunity Score (0-100) with full explanation JSON."""
    dg = min(max(demand_growth_rate * 2, 0), 100)
    ac = min(max((acceleration + 10) * 5, 0), 100)
    cs = (cross_source_positive / max(total_sources, 1)) * 100
    lc = 100 - competition_index
    ge = min(geo_count * 33.3, 100)
    fu = min(max(forecast_pct_change_3m * 2, 0), 100)
    dampener = 0.7 if data_months < 3 else (0.85 if data_months < 6 else 1.0)
    overall = round(max(0, min(100, dampener * (0.20*dg + 0.15*ac + 0.15*cs + 0.20*lc + 0.15*review_gap_severity + 0.10*ge + 0.05*fu))), 2)
    confidence = "high" if total_sources >= 3 and data_months >= 6 else ("medium" if total_sources >= 2 and data_months >= 3 else "low")
    return {
        "overall_score": overall,
        "components": {
            "demand_growth": {"raw": round(demand_growth_rate, 2), "normalized": round(dg, 1), "weight": 0.20, "contribution": round(0.20 * dg * dampener, 2)},
            "acceleration": {"raw": round(acceleration, 2), "normalized": round(ac, 1), "weight": 0.15, "contribution": round(0.15 * ac * dampener, 2)},
            "cross_source": {"sources_positive": cross_source_positive, "total_sources": total_sources, "normalized": round(cs, 1), "weight": 0.15, "contribution": round(0.15 * cs * dampener, 2)},
            "low_competition": {"competition_index": competition_index, "normalized": round(lc, 1), "weight": 0.20, "contribution": round(0.20 * lc * dampener, 2)},
            "review_gap": {"severity": review_gap_severity, "weight": 0.15, "contribution": round(0.15 * review_gap_severity * dampener, 2)},
            "geo_expansion": {"geos_count": geo_count, "normalized": round(ge, 1), "weight": 0.10, "contribution": round(0.10 * ge * dampener, 2)},
            "forecast_uplift": {"pct_change_3m": round(forecast_pct_change_3m, 1), "normalized": round(fu, 1), "weight": 0.05, "contribution": round(0.05 * fu * dampener, 2)},
        },
        "confidence": confidence,
        "dampener_applied": dampener < 1.0,
    }


def detect_trend_stage(mom_growth_rates: List[float], volume_percentile: float, cross_source_count: int):
    """Rule-based trend stage detection. mom_growth_rates: last 3+ months of MoM growth %."""
    if len(mom_growth_rates) < 2:
        return "unknown"
    recent = mom_growth_rates[-2:]
    avg_growth = sum(recent) / len(recent)
    accel = recent[-1] - recent[0] if len(recent) >= 2 else 0

    # Exploding: strong growth + accelerating (relaxed source requirement for MVP)
    if avg_growth > 25 and accel > 0 and volume_percentile > 15 and cross_source_count >= 1:
        return "exploding"
    elif volume_percentile < 25 and avg_growth > 15 and cross_source_count >= 1:
        return "emerging"
    elif volume_percentile > 75 and 0 <= avg_growth <= 15 and accel < 0:
        return "peaking"
    elif avg_growth < -5 and all(g < -5 for g in recent):
        return "declining"
    elif avg_growth > 10:
        return "emerging"
    elif avg_growth < 0:
        return "declining"
    return "unknown"
