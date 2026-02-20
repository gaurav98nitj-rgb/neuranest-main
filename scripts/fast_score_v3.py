"""
NeuraNest Scorer v3 — Hybrid
==============================
- Preserves the 129 topics already scored by backfill (they have richer data)
- Re-scores the other 969 with better differentiation using competition + category
- Runs in <1 second

Usage: python fast_score_v3.py
"""

import psycopg2
import time

DB = {
    "host": "localhost", "port": 5433,
    "dbname": "neuranest", "user": "neuranest", "password": "neuranest_dev",
}

def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()

    print("\n══ NeuraNest Scorer v3 (Hybrid) ══\n")

    # Step 1: Restore the 129 backfilled scores from the scores table
    print("  Step 1: Restoring 129 backfilled scores...")
    cur.execute("""
        UPDATE topics t SET
            udsi_score = s.score_value,
            updated_at = NOW()
        FROM (
            SELECT DISTINCT ON (topic_id) topic_id, score_value
            FROM scores
            WHERE score_type = 'opportunity' AND score_value != 43.33 AND score_value IS NOT NULL
            ORDER BY topic_id, computed_at DESC
        ) s
        WHERE t.id = s.topic_id AND s.score_value IS NOT NULL;
    """)
    restored = cur.rowcount
    print(f"  ✅ Restored {restored} backfilled scores")

    # Step 2: Score remaining topics that DON'T have backfilled scores
    # Use source_timeseries + competition data with better calibration
    print("  Step 2: Scoring remaining topics with better calibration...")
    t0 = time.time()

    cur.execute("""
        WITH
        -- Topics that already have good scores (from backfill)
        already_scored AS (
            SELECT DISTINCT topic_id FROM scores
            WHERE score_type = 'opportunity' AND score_value != 43.33 AND score_value IS NOT NULL
        ),
        -- Google Trends
        gt AS (
            SELECT topic_id,
                AVG(CASE WHEN date >= NOW() - INTERVAL '3 months' THEN raw_value END) as recent,
                AVG(CASE WHEN date < NOW() - INTERVAL '9 months' THEN raw_value END) as old,
                MAX(raw_value) as peak,
                COUNT(*) as pts
            FROM source_timeseries WHERE source = 'google_trends'
            GROUP BY topic_id
        ),
        -- Reddit
        rd AS (
            SELECT topic_id,
                COUNT(*) as posts,
                AVG(raw_value) as avg_val,
                COUNT(CASE WHEN date >= NOW() - INTERVAL '6 months' THEN 1 END) as recent_posts
            FROM source_timeseries WHERE source = 'reddit'
            GROUP BY topic_id
        ),
        -- Amazon BA (from source_timeseries)
        ba AS (
            SELECT topic_id,
                MIN(raw_value) as best_rank,
                AVG(raw_value) as avg_rank,
                MIN(CASE WHEN date >= NOW() - INTERVAL '3 months' THEN raw_value END) as recent_rank,
                MIN(CASE WHEN date < NOW() - INTERVAL '9 months' THEN raw_value END) as old_rank,
                COUNT(*) as pts
            FROM source_timeseries WHERE source = 'amazon_ba'
            GROUP BY topic_id
        ),
        -- Competition
        comp AS (
            SELECT DISTINCT ON (topic_id)
                topic_id, listing_count, avg_rating, top3_brand_share, brand_hhi, median_price
            FROM amazon_competition_snapshot
            ORDER BY topic_id, date DESC
        ),
        -- Science
        sci AS (
            SELECT topic_id, COUNT(*) as papers
            FROM source_timeseries WHERE source = 'science'
            GROUP BY topic_id
        ),
        scored AS (
            SELECT t.id,
                -- Search Momentum (0-25): boost ranges
                LEAST(25, GREATEST(0,
                    CASE
                        WHEN g.recent IS NOT NULL AND g.old IS NOT NULL AND g.old > 0
                        THEN LEAST(20, ((g.recent - g.old) / NULLIF(g.old, 0)) * 50)
                        WHEN g.peak > 50 THEN 15
                        WHEN g.peak > 20 THEN 10
                        WHEN g.pts > 0 THEN 5
                        ELSE 0
                    END
                    + CASE WHEN g.peak > 70 THEN 5 ELSE CASE WHEN g.peak > 40 THEN 3 ELSE 0 END END
                )) as c1,

                -- Social Buzz (0-20)
                LEAST(20, GREATEST(0,
                    COALESCE(LEAST(8, r.recent_posts / 2.0), 0)
                    + COALESCE(LEAST(6, GREATEST(0, r.avg_val) * 4), 0)
                    + COALESCE(LEAST(6, r.posts / 5.0), 0)
                )) as c2,

                -- Demand Rank (0-20): use competition listing_count as proxy when no BA
                CASE
                    WHEN b.best_rank IS NOT NULL THEN
                        CASE
                            WHEN b.best_rank <= 50 THEN 20
                            WHEN b.best_rank <= 100 THEN 17
                            WHEN b.best_rank <= 300 THEN 14
                            WHEN b.best_rank <= 500 THEN 11
                            WHEN b.best_rank <= 1000 THEN 8
                            WHEN b.best_rank <= 5000 THEN 4
                            ELSE 1
                        END
                    WHEN cs.listing_count IS NOT NULL THEN
                        CASE
                            WHEN cs.listing_count > 500 THEN 12
                            WHEN cs.listing_count > 200 THEN 10
                            WHEN cs.listing_count > 50 THEN 7
                            ELSE 4
                        END
                    ELSE 5
                END
                + CASE
                    WHEN b.old_rank IS NOT NULL AND b.recent_rank IS NOT NULL AND b.old_rank > b.recent_rank AND b.old_rank > 0
                    THEN LEAST(5, ((b.old_rank - b.recent_rank) / NULLIF(b.old_rank, 0)) * 10)
                    ELSE 0
                END as c3,

                -- Competition Gap (0-15): more granular
                CASE
                    WHEN cs.top3_brand_share IS NULL AND cs.brand_hhi IS NULL THEN 8
                    WHEN cs.top3_brand_share < 0.2 THEN 15
                    WHEN cs.top3_brand_share < 0.35 THEN 13
                    WHEN cs.top3_brand_share < 0.5 THEN 10
                    WHEN cs.top3_brand_share < 0.65 THEN 7
                    WHEN cs.top3_brand_share < 0.8 THEN 5
                    ELSE 3
                END as c4,

                -- Review Gap (0-10): more granular
                CASE
                    WHEN cs.avg_rating IS NULL THEN 5
                    WHEN cs.avg_rating < 3.5 THEN 10
                    WHEN cs.avg_rating < 3.8 THEN 9
                    WHEN cs.avg_rating < 4.0 THEN 7
                    WHEN cs.avg_rating < 4.1 THEN 6
                    WHEN cs.avg_rating < 4.2 THEN 5
                    WHEN cs.avg_rating < 4.3 THEN 4
                    WHEN cs.avg_rating < 4.5 THEN 3
                    ELSE 2
                END as c5,

                -- Science Signal (0-5)
                CASE
                    WHEN sc.papers IS NULL OR sc.papers = 0 THEN 0
                    WHEN sc.papers >= 5 THEN 5
                    WHEN sc.papers >= 2 THEN 3
                    ELSE 1
                END as c6,

                -- Data Richness (0-5): reward having any data at all
                (CASE WHEN g.pts > 0 THEN 1.5 ELSE 0 END)
                + (CASE WHEN r.posts > 0 THEN 1.5 ELSE 0 END)
                + (CASE WHEN b.pts > 0 THEN 1.5 ELSE 0 END)
                + (CASE WHEN sc.papers > 0 THEN 0.5 ELSE 0 END) as c7

            FROM topics t
            LEFT JOIN gt g ON g.topic_id = t.id
            LEFT JOIN rd r ON r.topic_id = t.id
            LEFT JOIN ba b ON b.topic_id = t.id
            LEFT JOIN comp cs ON cs.topic_id = t.id
            LEFT JOIN sci sc ON sc.topic_id = t.id
            WHERE t.is_active = true
              AND t.id NOT IN (SELECT topic_id FROM already_scored)
        )
        UPDATE topics SET
            udsi_score = ROUND((s.c1 + s.c2 + s.c3 + s.c4 + s.c5 + s.c6 + s.c7)::numeric, 2),
            stage = CASE
                WHEN (s.c1 + s.c2 + s.c3 + s.c4 + s.c5 + s.c6 + s.c7) >= 60 THEN 'exploding'
                WHEN (s.c1 + s.c2 + s.c3 + s.c4 + s.c5 + s.c6 + s.c7) >= 42 THEN 'emerging'
                WHEN (s.c1 + s.c2 + s.c3 + s.c4 + s.c5 + s.c6 + s.c7) >= 28 THEN 'peaking'
                ELSE 'declining'
            END,
            updated_at = NOW()
        FROM scored s
        WHERE topics.id = s.id;
    """)

    updated = cur.rowcount
    print(f"  ✅ Scored {updated} remaining topics in {time.time()-t0:.1f}s")

    # Step 3: Results
    cur.execute("""
        SELECT stage, COUNT(*), ROUND(AVG(udsi_score)::numeric,1),
               ROUND(MIN(udsi_score)::numeric,1), ROUND(MAX(udsi_score)::numeric,1)
        FROM topics WHERE is_active = true AND udsi_score IS NOT NULL
        GROUP BY stage ORDER BY AVG(udsi_score) DESC
    """)
    print(f"\n  Stage Distribution:")
    print(f"  {'Stage':12s} {'Count':>6s} {'Avg':>6s} {'Min':>6s} {'Max':>6s}")
    print(f"  {'─'*42}")
    for row in cur.fetchall():
        print(f"  {row[0]:12s} {row[1]:6d} {row[2]:6.1f} {row[3]:6.1f} {row[4]:6.1f}")

    cur.execute("""
        SELECT
            COUNT(CASE WHEN udsi_score >= 60 THEN 1 END),
            COUNT(CASE WHEN udsi_score >= 40 AND udsi_score < 60 THEN 1 END),
            COUNT(CASE WHEN udsi_score >= 28 AND udsi_score < 40 THEN 1 END),
            COUNT(CASE WHEN udsi_score < 28 THEN 1 END),
            COUNT(CASE WHEN udsi_score = 43.33 THEN 1 END)
        FROM topics WHERE is_active = true
    """)
    d = cur.fetchone()
    print(f"\n  Score Buckets:")
    print(f"    Exploding (≥60): {d[0]}")
    print(f"    Emerging (40-59): {d[1]}")
    print(f"    Peaking (28-39): {d[2]}")
    print(f"    Declining (<28): {d[3]}")
    print(f"    Still 43.33: {d[4]}")

    cur.execute("""
        SELECT name, primary_category, udsi_score, stage
        FROM topics WHERE is_active = true ORDER BY udsi_score DESC LIMIT 20
    """)
    print(f"\n  Top 20:")
    for i, row in enumerate(cur.fetchall(), 1):
        print(f"    {i:2d}. {row[2]:5.1f} [{row[3]:9s}] {row[0]} ({row[1]})")

    conn.commit()
    print(f"\n  ✅ Committed!")
    cur.close()
    conn.close()

    try:
        import redis
        redis.Redis(host='localhost', port=6379).flushall()
        print("  ✅ Redis cache cleared")
    except:
        print("  ⚠️  Run: docker exec neuranest-redis redis-cli FLUSHALL")

    print("\n══ Done! ══\n")

if __name__ == "__main__":
    main()
