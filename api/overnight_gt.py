"""
Overnight Google Trends Runner.

Runs in waves of 25 terms, then pauses 5 minutes.
On rate limit (429), pauses 10 minutes and retries.
Keeps going until all 500 terms are done.

Usage:
  python /app/overnight_gt.py
"""
import time
import random
import sys
import json
from datetime import datetime

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def run():
    from app.tasks.google_trends_backfill import (
        _ensure_table, _get_top_terms_from_ba, _get_already_fetched,
        _fetch_trends_for_term, _store_trends
    )
    from app.tasks.db_helpers import get_sync_db

    TOP_N = 500
    GEO = "US"
    WAVE_SIZE = 20  # terms per wave
    WAVE_PAUSE = 300  # 5 min between waves
    RATE_LIMIT_PAUSE = 600  # 10 min on 429

    # Setup
    with get_sync_db() as session:
        _ensure_table(session)
    with get_sync_db() as session:
        all_terms = _get_top_terms_from_ba(session, TOP_N, country=GEO)
    log(f"Total BA terms: {len(all_terms)}")

    total_stored = 0
    total_waves = 0

    while True:
        # Check what's already done
        with get_sync_db() as session:
            already_done = _get_already_fetched(session, GEO)
        remaining = [t for t in all_terms if t not in already_done]

        if not remaining:
            log(f"ALL DONE! {len(already_done)} terms fetched, {total_stored} data points stored.")
            break

        log(f"Wave {total_waves+1}: {len(remaining)} terms remaining, {len(already_done)} done")

        # Process one wave
        wave = remaining[:WAVE_SIZE]
        wave_success = 0
        wave_fail = 0
        consecutive_429 = 0

        for i, term in enumerate(wave):
            log(f"  [{i+1}/{len(wave)}] {term[:50]}")

            data = _fetch_trends_for_term(term, GEO, retries=2)

            if data is None:
                wave_fail += 1
                consecutive_429 += 1
                log(f"  FAILED (rate limited)")

                if consecutive_429 >= 2:
                    pause = RATE_LIMIT_PAUSE + random.randint(0, 120)
                    log(f"  Rate limited! Pausing {pause}s ({pause//60} min)...")
                    time.sleep(pause)
                    consecutive_429 = 0
                continue

            consecutive_429 = 0

            if not data:
                log(f"  No data (too niche)")
                # Store empty marker so we don't retry
                with get_sync_db() as session:
                    from sqlalchemy import text
                    session.execute(text("""
                        INSERT INTO google_trends_backfill (search_term, date, interest_index, geo, fetched_at)
                        VALUES (:term, '2024-02-01', 0, :geo, NOW())
                        ON CONFLICT ON CONSTRAINT uq_gt_term_date_geo DO NOTHING
                    """), {"term": term, "geo": GEO})
                    session.commit()
                continue

            with get_sync_db() as session:
                stored = _store_trends(session, term, data, GEO)
                total_stored += stored
                wave_success += 1

            # Delay between requests: 15-30 seconds
            wait = random.uniform(15, 30)
            time.sleep(wait)

        total_waves += 1
        log(f"Wave {total_waves} complete: {wave_success} success, {wave_fail} failed")

        # Pause between waves
        with get_sync_db() as session:
            done_count = len(_get_already_fetched(session, GEO))
        log(f"Progress: {done_count}/{TOP_N} terms. Pausing {WAVE_PAUSE}s ({WAVE_PAUSE//60} min)...")
        time.sleep(WAVE_PAUSE)

    log(f"FINISHED. Total waves: {total_waves}, Total data points: {total_stored}")

if __name__ == "__main__":
    run()
