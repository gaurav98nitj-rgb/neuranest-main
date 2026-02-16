"""
Overnight Reddit Runner.

More resilient version that handles all errors and keeps going.
Runs until all 500 terms are done.

Usage:
  python /app/overnight_reddit.py
"""
import time
import random
import sys
from datetime import datetime

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def run():
    from app.tasks.reddit_backfill import (
        _ensure_table, _get_top_terms_from_ba, _get_already_fetched_terms,
        _search_reddit, _store_reddit_posts
    )
    from app.tasks.db_helpers import get_sync_db

    TOP_N = 500
    BATCH_SIZE = 25

    with get_sync_db() as session:
        _ensure_table(session)
    with get_sync_db() as session:
        all_terms = _get_top_terms_from_ba(session, TOP_N)
    log(f"Total BA terms: {len(all_terms)}")

    total_posts = 0
    batch_num = 0

    while True:
        with get_sync_db() as session:
            already_done = _get_already_fetched_terms(session)
        remaining = [t for t in all_terms if t not in already_done]

        if not remaining:
            log(f"ALL DONE! {len(already_done)} terms searched, {total_posts} posts collected.")
            break

        batch_num += 1
        batch = remaining[:BATCH_SIZE]
        log(f"Batch {batch_num}: {len(remaining)} remaining, processing {len(batch)} terms")

        batch_posts = 0
        for i, term in enumerate(batch):
            try:
                posts = _search_reddit(term, limit=25)
                if posts:
                    with get_sync_db() as session:
                        stored = _store_reddit_posts(session, term, posts)
                        batch_posts += stored
                        total_posts += stored
                else:
                    # Store a marker so we don't retry
                    with get_sync_db() as session:
                        from sqlalchemy import text
                        session.execute(text("""
                            INSERT INTO reddit_backfill
                                (search_term, subreddit, post_id, title, body, score,
                                 num_comments, author, created_utc, post_type,
                                 sentiment_score, sentiment_label, url, fetched_at)
                            VALUES
                                (:term, 'none', :pid, 'no results', '', 0,
                                 0, '', NOW(), 'marker',
                                 0, 'neutral', '', NOW())
                            ON CONFLICT ON CONSTRAINT uq_reddit_post DO NOTHING
                        """), {"term": term, "pid": f"marker_{hash(term) % 999999}"})
                        session.commit()

                log(f"  [{i+1}/{len(batch)}] {term[:40]} -> {len(posts) if posts else 0} posts")

            except Exception as e:
                log(f"  [{i+1}/{len(batch)}] {term[:40]} -> ERROR: {str(e)[:80]}")
                time.sleep(5)

            # Rate limit
            wait = random.uniform(2, 5)
            time.sleep(wait)

        log(f"Batch {batch_num} done: {batch_posts} posts. Total: {total_posts}")

        # Short pause between batches
        time.sleep(random.uniform(10, 30))

    log(f"FINISHED. Total batches: {batch_num}, Total posts: {total_posts}")

if __name__ == "__main__":
    run()
