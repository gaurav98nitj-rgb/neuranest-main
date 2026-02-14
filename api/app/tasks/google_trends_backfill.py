"""
Google Trends 2-Year Backfill Pipeline.

Pulls monthly interest data for top Amazon Brand Analytics search terms.
Aligns perfectly with your 24-month Amazon BA dataset.

Features:
  - Extracts top search terms from Amazon BA data already in DB
  - Pulls Google Trends monthly data (Feb 2024 - Jan 2026)
  - Stores in google_trends_backfill table
  - Rate-limited to avoid Google blocking (3s between requests)
  - Resumable: skips terms already fetched

Usage:
  # Run from container
  python -c "from app.tasks.google_trends_backfill import run_backfill; run_backfill()"

  # Or via Celery
  from app.tasks.google_trends_backfill import backfill_google_trends
  backfill_google_trends.delay(top_n=2000)
"""
import time
import uuid
import json
import random
from datetime import date, datetime
from decimal import Decimal

import structlog
from sqlalchemy import text

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# Table creation SQL
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS google_trends_backfill (
    id BIGSERIAL PRIMARY KEY,
    search_term TEXT NOT NULL,
    date DATE NOT NULL,
    interest_index INTEGER,  -- 0-100 Google Trends index
    is_partial BOOLEAN DEFAULT FALSE,
    geo VARCHAR(5) DEFAULT 'US',
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_gt_term_date_geo UNIQUE (search_term, date, geo)
);
CREATE INDEX IF NOT EXISTS idx_gt_term ON google_trends_backfill(search_term);
CREATE INDEX IF NOT EXISTS idx_gt_date ON google_trends_backfill(date);
CREATE INDEX IF NOT EXISTS idx_gt_geo ON google_trends_backfill(geo);
"""


def _ensure_table(session):
    """Create the backfill table if it doesn't exist."""
    for stmt in CREATE_TABLE_SQL.strip().split(';'):
        stmt = stmt.strip()
        if stmt:
            session.execute(text(stmt))
    session.commit()


def _get_top_terms_from_ba(session, top_n=2000, country="US"):
    """Get top search terms from Amazon BA data (by best rank achieved)."""
    result = session.execute(text("""
        SELECT search_term, MIN(search_frequency_rank) as best_rank
        FROM amazon_brand_analytics
        WHERE country = :country
        GROUP BY search_term
        ORDER BY best_rank ASC
        LIMIT :limit
    """), {"country": country, "limit": top_n})
    return [row[0] for row in result.fetchall()]


def _get_already_fetched(session, geo="US"):
    """Get terms already in the backfill table."""
    result = session.execute(text("""
        SELECT DISTINCT search_term FROM google_trends_backfill WHERE geo = :geo
    """), {"geo": geo})
    return {row[0] for row in result.fetchall()}


def _fetch_trends_for_term(term, geo="US", retries=3):
    """Fetch Google Trends monthly data for a single term over 2 years."""
    from pytrends.request import TrendReq

    for attempt in range(retries):
        try:
            pytrends = TrendReq(hl='en-US', tz=360, timeout=(10, 25))
            pytrends.build_payload(
                [term],
                cat=0,
                timeframe='2024-02-01 2026-01-31',
                geo=geo,
            )
            df = pytrends.interest_over_time()

            if df.empty:
                return []

            results = []
            for idx, row in df.iterrows():
                results.append({
                    "date": idx.date(),
                    "interest": int(row[term]),
                    "is_partial": bool(row.get("isPartial", False)),
                })
            return results

        except Exception as e:
            if attempt < retries - 1:
                # Long wait on 429: Google needs minutes, not seconds
                wait = (attempt + 1) * 60 + random.randint(30, 90)
                logger.warning("gt_backfill: retry", term=term[:50], attempt=attempt+1, wait=wait, error=str(e)[:100])
                time.sleep(wait)
            else:
                logger.warning("gt_backfill: failed", term=term[:50], error=str(e)[:100])
                return None

    return None


def _store_trends(session, term, data_points, geo="US"):
    """Store trend data points."""
    stored = 0
    for dp in data_points:
        session.execute(text("""
            INSERT INTO google_trends_backfill (search_term, date, interest_index, is_partial, geo, fetched_at)
            VALUES (:term, :date, :interest, :partial, :geo, NOW())
            ON CONFLICT ON CONSTRAINT uq_gt_term_date_geo DO UPDATE SET
                interest_index = EXCLUDED.interest_index,
                is_partial = EXCLUDED.is_partial,
                fetched_at = NOW()
        """), {
            "term": term, "date": dp["date"],
            "interest": dp["interest"], "partial": dp["is_partial"],
            "geo": geo,
        })
        stored += 1
    session.commit()
    return stored


def run_backfill(top_n=2000, geo="US"):
    """
    Main backfill function. Call directly for synchronous execution.
    Pulls Google Trends data for top N Amazon BA search terms.
    """
    logger.info("gt_backfill: starting", top_n=top_n, geo=geo)

    # Ensure table exists
    with get_sync_db() as session:
        _ensure_table(session)

    # Get top terms from Amazon BA
    with get_sync_db() as session:
        terms = _get_top_terms_from_ba(session, top_n, country=geo)
    logger.info("gt_backfill: found BA terms", count=len(terms))

    if not terms:
        logger.warning("gt_backfill: no Amazon BA data found. Import BA data first.")
        return {"status": "no_data", "message": "Import Amazon BA data first"}

    # Get already fetched (for resume capability)
    with get_sync_db() as session:
        already_done = _get_already_fetched(session, geo)
    remaining = [t for t in terms if t not in already_done]
    logger.info("gt_backfill: terms to fetch", total=len(terms), already_done=len(already_done), remaining=len(remaining))

    total_stored = 0
    total_failed = 0
    total_skipped = len(already_done)
    consecutive_fails = 0

    for i, term in enumerate(remaining):
        logger.info("gt_backfill: fetching", term=term[:50], progress=f"{i+1}/{len(remaining)}")

        data = _fetch_trends_for_term(term, geo)

        if data is None:
            total_failed += 1
            consecutive_fails += 1
            # If 3 consecutive failures, Google is blocking us — long pause
            if consecutive_fails >= 3:
                pause = random.uniform(300, 600)  # 5-10 minutes
                logger.warning("gt_backfill: rate limited, pausing", pause_seconds=int(pause))
                time.sleep(pause)
                consecutive_fails = 0
            continue

        if not data:
            # Term has no Google Trends data (too niche)
            total_skipped += 1
            consecutive_fails = 0
            continue

        consecutive_fails = 0  # Reset on success

        with get_sync_db() as session:
            stored = _store_trends(session, term, data, geo)
            total_stored += stored

        # Rate limit: Google needs 15-25 seconds minimum between requests
        wait = random.uniform(15, 25)
        time.sleep(wait)

        # Progress update every 25 terms
        if (i + 1) % 25 == 0:
            logger.info("gt_backfill: progress",
                        done=i+1, remaining=len(remaining)-i-1,
                        stored=total_stored, failed=total_failed)
            # Extra cooldown every 25 terms to avoid rate limiting
            cooldown = random.uniform(60, 120)
            logger.info("gt_backfill: cooldown", seconds=int(cooldown))
            time.sleep(cooldown)

    logger.info("gt_backfill: COMPLETE",
                terms_processed=len(remaining),
                data_points_stored=total_stored,
                failed=total_failed, skipped=total_skipped)

    return {
        "status": "completed",
        "terms_processed": len(remaining),
        "data_points_stored": total_stored,
        "failed": total_failed,
        "skipped": total_skipped,
    }


@celery_app.task(name="app.tasks.google_trends_backfill.backfill_google_trends",
                 bind=True, max_retries=0, time_limit=86400)
def backfill_google_trends(self, top_n=2000, geo="US"):
    """Celery task wrapper for the backfill."""
    return run_backfill(top_n, geo)
