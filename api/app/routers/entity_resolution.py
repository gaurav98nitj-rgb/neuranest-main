"""
Entity Resolution API.

POST /entity-resolution/run              - Trigger entity resolution
GET  /entity-resolution/stats            - Resolution statistics
GET  /entity-resolution/results          - Browse matched terms
GET  /entity-resolution/unmatched        - View unmatched terms
GET  /entity-resolution/topic/{topic_id} - All terms matched to a topic
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.dependencies import get_current_user

router = APIRouter(prefix="/entity-resolution", tags=["entity-resolution"])


@router.post("/run")
async def trigger_resolution(
    top_n: int = Query(10000, ge=100, le=100000),
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger entity resolution (async via Celery)."""
    from app.tasks.entity_resolution import resolve_entities
    task = resolve_entities.delay(top_n, country)
    return {"message": f"Entity resolution started for top {top_n} terms", "task_id": str(task.id)}


@router.post("/run-sync")
async def trigger_resolution_sync(
    top_n: int = Query(5000, ge=100, le=50000),
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger entity resolution synchronously (for testing)."""
    from app.tasks.entity_resolution import run_entity_resolution
    result = run_entity_resolution(top_n, country)
    return result


@router.get("/stats")
async def get_resolution_stats(
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get entity resolution statistics."""
    result = await db.execute(sa_text("""
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE match_type != 'unmatched') as matched,
            COUNT(*) FILTER (WHERE match_type = 'unmatched') as unmatched,
            COUNT(*) FILTER (WHERE match_type = 'exact_name') as exact_name,
            COUNT(*) FILTER (WHERE match_type = 'exact_keyword') as exact_keyword,
            COUNT(*) FILTER (WHERE match_type = 'contains') as contains,
            COUNT(*) FILTER (WHERE match_type = 'fuzzy') as fuzzy,
            COUNT(*) FILTER (WHERE match_type = 'fuzzy_kw') as fuzzy_kw,
            COUNT(*) FILTER (WHERE match_type = 'embedding') as embedding,
            COUNT(*) FILTER (WHERE match_type = 'new_topic') as new_topic,
            AVG(confidence) FILTER (WHERE match_type != 'unmatched') as avg_confidence,
            COUNT(DISTINCT topic_id) as unique_topics_matched
        FROM entity_resolution
        WHERE country = :country
    """), {"country": country})
    row = result.fetchone()
    if not row:
        return {"total": 0}

    # Count linked BA rows
    linked = await db.execute(sa_text("""
        SELECT COUNT(*) FROM amazon_brand_analytics WHERE topic_id IS NOT NULL AND country = :country
    """), {"country": country})

    return {
        "total_terms": row[0],
        "matched": row[1],
        "unmatched": row[2],
        "match_rate": round(row[1] / max(row[0], 1) * 100, 1),
        "by_type": {
            "exact_name": row[3],
            "exact_keyword": row[4],
            "contains": row[5],
            "fuzzy": row[6],
            "fuzzy_keyword": row[7],
            "embedding": row[8],
            "new_topic": row[9],
        },
        "avg_confidence": round(float(row[10] or 0), 3),
        "unique_topics": row[11],
        "ba_rows_linked": linked.scalar() or 0,
    }


@router.get("/results")
async def get_resolution_results(
    match_type: Optional[str] = Query(None),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(100, ge=1, le=1000),
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse resolved terms."""
    type_filter = ""
    params = {"country": country, "conf": min_confidence, "limit": limit}
    if match_type:
        type_filter = "AND er.match_type = :mtype"
        params["mtype"] = match_type

    result = await db.execute(sa_text(f"""
        SELECT er.search_term, er.match_type, er.confidence, er.matched_to,
               t.name as topic_name, t.primary_category
        FROM entity_resolution er
        LEFT JOIN topics t ON er.topic_id = t.id
        WHERE er.country = :country AND er.confidence >= :conf {type_filter}
        ORDER BY er.confidence DESC
        LIMIT :limit
    """), params)

    return [dict(r._mapping) for r in result.fetchall()]


@router.get("/unmatched")
async def get_unmatched_terms(
    limit: int = Query(100, ge=1, le=1000),
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """View high-rank unmatched terms (candidates for new topics)."""
    result = await db.execute(sa_text("""
        SELECT er.search_term, ba.best_rank, ba.top_category
        FROM entity_resolution er
        JOIN (
            SELECT search_term, MIN(search_frequency_rank) as best_rank,
                   MAX(category_1) as top_category
            FROM amazon_brand_analytics WHERE country = :country
            GROUP BY search_term
        ) ba ON er.search_term = ba.search_term
        WHERE er.match_type = 'unmatched' AND er.country = :country
        ORDER BY ba.best_rank ASC
        LIMIT :limit
    """), {"country": country, "limit": limit})

    return [dict(r._mapping) for r in result.fetchall()]


@router.get("/topic/{topic_id}")
async def get_topic_terms(
    topic_id: str,
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all Amazon BA terms matched to a specific topic."""
    result = await db.execute(sa_text("""
        SELECT er.search_term, er.match_type, er.confidence,
               ba.best_rank, ba.top_category
        FROM entity_resolution er
        JOIN (
            SELECT search_term, MIN(search_frequency_rank) as best_rank,
                   MAX(category_1) as top_category
            FROM amazon_brand_analytics WHERE country = :country
            GROUP BY search_term
        ) ba ON er.search_term = ba.search_term
        WHERE er.topic_id = :tid AND er.country = :country
        ORDER BY ba.best_rank ASC
    """), {"tid": topic_id, "country": country})

    return [dict(r._mapping) for r in result.fetchall()]
