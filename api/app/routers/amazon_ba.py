"""
Amazon Brand Analytics API.

POST /amazon-ba/upload         - Upload XLSX/CSV file for import
GET  /amazon-ba/jobs           - List import jobs with status
GET  /amazon-ba/jobs/{id}      - Single job status + progress
GET  /amazon-ba/stats          - Overall import statistics
GET  /amazon-ba/search         - Search across imported data
GET  /amazon-ba/trending       - Top trending search terms (rank improvement)
GET  /amazon-ba/brands         - Brand analysis (concentration, movement)
GET  /amazon-ba/terms/{term}   - Time series for a specific search term
"""
import os
import json
import uuid
import shutil
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, func, desc, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.dependencies import get_current_user, get_redis, cache_key, get_cached, set_cached

router = APIRouter(prefix="/amazon-ba", tags=["amazon-brand-analytics"])

UPLOAD_DIR = "/tmp/ba_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Schemas ───
class ImportJobResponse(BaseModel):
    id: str
    filename: str
    country: str
    report_month: Optional[str] = None
    status: str
    total_rows: int = 0
    rows_imported: int = 0
    rows_skipped: int = 0
    rows_error: int = 0
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class BAStats(BaseModel):
    total_rows: int = 0
    countries: list = []
    months: list = []
    total_unique_terms: int = 0
    total_imports: int = 0
    latest_month: Optional[str] = None


# ─── POST /amazon-ba/upload ───
@router.post("/upload")
async def upload_ba_file(
    file: UploadFile = File(...),
    country: str = Form("US"),
    report_month: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an Amazon Brand Analytics XLSX or CSV file for import."""
    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.xlsx', '.xls', '.csv', '.tsv'):
        raise HTTPException(400, "Only .xlsx, .csv, .tsv files are supported")

    # Validate country
    valid_countries = ["US", "UK", "DE", "JP", "IN", "AU", "CA", "MX", "FR", "IT", "ES", "BR"]
    if country.upper() not in valid_countries:
        raise HTTPException(400, f"Invalid country. Use one of: {valid_countries}")

    # Save file
    job_id = str(uuid.uuid4())
    filepath = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_size = os.path.getsize(filepath)
    logger_msg = f"Uploaded {file.filename} ({file_size / 1024 / 1024:.1f} MB) for {country}"

    # Create job record
    await db.execute(sa_text("""
        INSERT INTO amazon_ba_import_jobs (id, filename, country, report_month, status, created_at)
        VALUES (:id, :fname, :country, :month, 'pending', NOW())
    """), {
        "id": job_id, "fname": file.filename,
        "country": country.upper(),
        "month": report_month if report_month else None,
    })
    await db.commit()

    # Trigger async import
    from app.tasks.amazon_ba_import import import_amazon_ba_file
    import_amazon_ba_file.delay(filepath, country.upper(), report_month, job_id)

    return {
        "message": logger_msg,
        "job_id": job_id,
        "status": "queued",
        "file_size_mb": round(file_size / 1024 / 1024, 1),
    }


# ─── GET /amazon-ba/jobs ───
@router.get("/jobs", response_model=list[ImportJobResponse])
async def list_import_jobs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all import jobs."""
    result = await db.execute(sa_text("""
        SELECT id, filename, country, report_month, status, total_rows,
               rows_imported, rows_skipped, rows_error, error_message,
               created_at, completed_at
        FROM amazon_ba_import_jobs
        ORDER BY created_at DESC LIMIT 50
    """))
    return [
        ImportJobResponse(
            id=str(r.id), filename=r.filename, country=r.country,
            report_month=r.report_month.isoformat() if r.report_month else None,
            status=r.status, total_rows=r.total_rows or 0,
            rows_imported=r.rows_imported or 0, rows_skipped=r.rows_skipped or 0,
            rows_error=r.rows_error or 0, error_message=r.error_message,
            created_at=r.created_at.isoformat() if r.created_at else None,
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
        )
        for r in result.fetchall()
    ]


# ─── GET /amazon-ba/jobs/{id} ───
@router.get("/jobs/{job_id}", response_model=ImportJobResponse)
async def get_import_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single import job status."""
    result = await db.execute(sa_text("""
        SELECT * FROM amazon_ba_import_jobs WHERE id = :id
    """), {"id": job_id})
    r = result.fetchone()
    if not r:
        raise HTTPException(404, "Job not found")
    return ImportJobResponse(
        id=str(r.id), filename=r.filename, country=r.country,
        report_month=r.report_month.isoformat() if r.report_month else None,
        status=r.status, total_rows=r.total_rows or 0,
        rows_imported=r.rows_imported or 0, rows_skipped=r.rows_skipped or 0,
        rows_error=r.rows_error or 0, error_message=r.error_message,
        created_at=r.created_at.isoformat() if r.created_at else None,
        completed_at=r.completed_at.isoformat() if r.completed_at else None,
    )


# ─── GET /amazon-ba/stats ───
@router.get("/stats", response_model=BAStats)
async def get_ba_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Overall Amazon BA import statistics."""
    redis = await get_redis()
    ck = cache_key("ba_stats")
    cached = await get_cached(ck, redis)
    if cached:
        return BAStats(**json.loads(cached))

    total = await db.execute(sa_text("SELECT COUNT(*) FROM amazon_brand_analytics"))
    total_rows = total.scalar() or 0

    countries = await db.execute(sa_text(
        "SELECT DISTINCT country FROM amazon_brand_analytics ORDER BY country"))
    country_list = [r[0] for r in countries.fetchall()]

    months = await db.execute(sa_text(
        "SELECT DISTINCT report_month FROM amazon_brand_analytics ORDER BY report_month"))
    month_list = [r[0].isoformat() for r in months.fetchall()]

    unique_terms = await db.execute(sa_text(
        "SELECT COUNT(DISTINCT search_term) FROM amazon_brand_analytics"))
    unique = unique_terms.scalar() or 0

    imports = await db.execute(sa_text(
        "SELECT COUNT(*) FROM amazon_ba_import_jobs WHERE status = 'completed'"))
    import_count = imports.scalar() or 0

    result = BAStats(
        total_rows=total_rows,
        countries=country_list,
        months=month_list,
        total_unique_terms=unique,
        total_imports=import_count,
        latest_month=month_list[-1] if month_list else None,
    )
    await set_cached(ck, json.dumps(result.model_dump(), default=str), 120, redis)
    return result


# ─── GET /amazon-ba/search ───
@router.get("/search")
async def search_ba(
    q: str = Query(..., min_length=2, description="Search term to find"),
    country: str = Query("US"),
    month: Optional[str] = Query(None, description="YYYY-MM-DD filter"),
    limit: int = Query(50, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search imported Amazon BA data by search term."""
    params = {"q": f"%{q.lower()}%", "country": country, "limit": limit}
    month_filter = ""
    if month:
        month_filter = "AND report_month = :month"
        params["month"] = month

    result = await db.execute(sa_text(f"""
        SELECT search_frequency_rank, search_term, brand_1, brand_2, brand_3,
               category_1, asin_1, title_1, click_share_1, conversion_share_1,
               asin_2, click_share_2, conversion_share_2,
               asin_3, click_share_3, conversion_share_3,
               report_month, country
        FROM amazon_brand_analytics
        WHERE LOWER(search_term) LIKE :q AND country = :country {month_filter}
        ORDER BY search_frequency_rank ASC
        LIMIT :limit
    """), params)

    return [dict(r._mapping) for r in result.fetchall()]


# ─── GET /amazon-ba/trending ───
@router.get("/trending")
async def get_trending_terms(
    country: str = Query("US"),
    months_back: int = Query(3, ge=2, le=24),
    min_rank_improvement: int = Query(100, ge=10),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Find search terms with biggest rank improvement (rising trends).
    Compares latest month vs N months ago.
    """
    redis = await get_redis()
    ck = cache_key("ba_trending", country=country, months=months_back, limit=limit)
    cached = await get_cached(ck, redis)
    if cached:
        return json.loads(cached)

    result = await db.execute(sa_text("""
        WITH latest AS (
            SELECT report_month FROM amazon_brand_analytics
            WHERE country = :country
            GROUP BY report_month ORDER BY report_month DESC LIMIT 1
        ),
        earlier AS (
            SELECT report_month FROM amazon_brand_analytics
            WHERE country = :country
            GROUP BY report_month ORDER BY report_month DESC
            LIMIT 1 OFFSET :offset
        ),
        current_data AS (
            SELECT search_term, search_frequency_rank as current_rank,
                   brand_1, category_1, click_share_1, conversion_share_1
            FROM amazon_brand_analytics
            WHERE country = :country AND report_month = (SELECT report_month FROM latest)
        ),
        past_data AS (
            SELECT search_term, search_frequency_rank as past_rank
            FROM amazon_brand_analytics
            WHERE country = :country AND report_month = (SELECT report_month FROM earlier)
        )
        SELECT c.search_term, c.current_rank, p.past_rank,
               (p.past_rank - c.current_rank) as rank_improvement,
               c.brand_1, c.category_1, c.click_share_1, c.conversion_share_1
        FROM current_data c
        JOIN past_data p ON c.search_term = p.search_term
        WHERE (p.past_rank - c.current_rank) >= :min_improvement
        ORDER BY rank_improvement DESC
        LIMIT :limit
    """), {
        "country": country, "offset": months_back,
        "min_improvement": min_rank_improvement, "limit": limit,
    })

    rows = [dict(r._mapping) for r in result.fetchall()]
    await set_cached(ck, json.dumps(rows, default=str), 300, redis)
    return rows


# ─── GET /amazon-ba/brands ───
@router.get("/brands")
async def get_brand_analysis(
    country: str = Query("US"),
    category: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Brand concentration analysis — which brands dominate which search terms."""
    cat_filter = ""
    params = {"country": country, "limit": limit}
    if category:
        cat_filter = "AND category_1 = :cat"
        params["cat"] = category

    result = await db.execute(sa_text(f"""
        SELECT brand_1 as brand, category_1 as category,
               COUNT(*) as term_count,
               AVG(click_share_1) as avg_click_share,
               AVG(conversion_share_1) as avg_conversion_share,
               MIN(search_frequency_rank) as best_rank,
               AVG(search_frequency_rank) as avg_rank
        FROM amazon_brand_analytics
        WHERE country = :country AND brand_1 IS NOT NULL
          AND report_month = (
            SELECT MAX(report_month) FROM amazon_brand_analytics WHERE country = :country
          )
          {cat_filter}
        GROUP BY brand_1, category_1
        ORDER BY term_count DESC
        LIMIT :limit
    """), params)

    return [dict(r._mapping) for r in result.fetchall()]


# ─── GET /amazon-ba/terms/{term} ───
@router.get("/terms/{search_term}")
async def get_term_timeseries(
    search_term: str,
    country: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get time series data for a specific search term across all imported months."""
    result = await db.execute(sa_text("""
        SELECT report_month, search_frequency_rank,
               brand_1, brand_2, brand_3,
               category_1,
               asin_1, title_1, click_share_1, conversion_share_1,
               asin_2, title_2, click_share_2, conversion_share_2,
               asin_3, title_3, click_share_3, conversion_share_3
        FROM amazon_brand_analytics
        WHERE LOWER(search_term) = LOWER(:term) AND country = :country
        ORDER BY report_month ASC
    """), {"term": search_term, "country": country})

    rows = [dict(r._mapping) for r in result.fetchall()]
    if not rows:
        raise HTTPException(404, f"Search term '{search_term}' not found for {country}")

    return {
        "search_term": search_term,
        "country": country,
        "data_points": len(rows),
        "timeseries": rows,
    }
