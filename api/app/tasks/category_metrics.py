"""
Category Metrics Computation Task.

Runs daily after scoring to compute aggregate metrics per category:
- topic count, avg opportunity score, avg competition index
- stage distribution, growth rate
- Also populates the categories table from distinct primary_category values.
"""
import uuid
from datetime import datetime, date

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()

# Category icons (emoji) mapping
CATEGORY_ICONS = {
    "beauty": "💄",
    "health": "💊",
    "electronics": "🔌",
    "kitchen": "🍳",
    "fitness": "💪",
    "pets": "🐾",
    "baby": "👶",
    "fashion": "👗",
    "home": "🏠",
    "outdoors": "⛺",
    "general": "📦",
}


def _ensure_categories_exist(session):
    """Create Category rows from distinct primary_category values in topics table."""
    rows = session.execute(text("""
        SELECT DISTINCT primary_category
        FROM topics
        WHERE primary_category IS NOT NULL AND is_active = true
    """)).fetchall()

    created = 0
    for row in rows:
        cat_name = row.primary_category
        if not cat_name:
            continue

        slug = cat_name.lower().strip().replace(" ", "-").replace("&", "and")
        icon = CATEGORY_ICONS.get(slug, "📦")

        existing = session.execute(text(
            "SELECT id FROM categories WHERE slug = :slug"
        ), {"slug": slug}).fetchone()

        if not existing:
            session.execute(text("""
                INSERT INTO categories (id, name, slug, level, icon, is_active, created_at, updated_at)
                VALUES (:id, :name, :slug, 0, :icon, true, :now, :now)
            """), {
                "id": str(uuid.uuid4()),
                "name": cat_name,
                "slug": slug,
                "icon": icon,
                "now": datetime.utcnow(),
            })
            created += 1

    # Link topics to categories via category_id where not already linked
    session.execute(text("""
        UPDATE topics t
        SET category_id = c.id
        FROM categories c
        WHERE LOWER(TRIM(t.primary_category)) = c.slug
          AND t.category_id IS NULL
          AND t.primary_category IS NOT NULL
    """))

    return created


@celery_app.task(
    name="app.tasks.category_metrics.compute_category_metrics_daily",
    bind=True, max_retries=1, default_retry_delay=120
)
def compute_category_metrics_daily(self):
    """
    Daily category metrics computation.
    1. Ensure all categories exist from topic primary_category values
    2. Compute aggregate metrics per category
    3. Upsert into category_metrics table
    """
    started = datetime.utcnow()
    today = date.today()
    total_categories = 0
    total_errors = 0

    logger.info("category_metrics: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="category_metrics_daily",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        # Step 1: Ensure categories exist
        with get_sync_db() as session:
            created = _ensure_categories_exist(session)
            if created:
                logger.info("category_metrics: created new categories", count=created)

        # Step 2: Compute metrics per category
        with get_sync_db() as session:
            categories = session.execute(text(
                "SELECT id, slug FROM categories WHERE is_active = true"
            )).fetchall()

        for cat in categories:
            cat_id = str(cat.id)
            total_categories += 1

            try:
                with get_sync_db() as session:
                    # Count topics and stage distribution
                    stats = session.execute(text("""
                        SELECT
                            COUNT(*) as topic_count,
                            COUNT(*) FILTER (WHERE stage = 'emerging') as emerging,
                            COUNT(*) FILTER (WHERE stage = 'exploding') as exploding,
                            COUNT(*) FILTER (WHERE stage = 'peaking') as peaking,
                            COUNT(*) FILTER (WHERE stage = 'declining') as declining
                        FROM topics
                        WHERE category_id = :cid AND is_active = true
                    """), {"cid": cat_id}).fetchone()

                    # Average scores (latest per topic)
                    score_stats = session.execute(text("""
                        SELECT
                            AVG(opp.score_value) as avg_opp,
                            AVG(comp.score_value) as avg_comp
                        FROM topics t
                        LEFT JOIN LATERAL (
                            SELECT score_value FROM scores
                            WHERE topic_id = t.id AND score_type = 'opportunity'
                            ORDER BY computed_at DESC LIMIT 1
                        ) opp ON true
                        LEFT JOIN LATERAL (
                            SELECT score_value FROM scores
                            WHERE topic_id = t.id AND score_type = 'competition'
                            ORDER BY computed_at DESC LIMIT 1
                        ) comp ON true
                        WHERE t.category_id = :cid AND t.is_active = true
                    """), {"cid": cat_id}).fetchone()

                    # Average 4-week growth from derived features
                    growth_stat = session.execute(text("""
                        SELECT AVG(df.feature_value) as avg_growth
                        FROM derived_features df
                        JOIN topics t ON df.topic_id = t.id
                        WHERE t.category_id = :cid
                          AND df.feature_name = 'growth_4w'
                          AND df.date = (SELECT MAX(date) FROM derived_features WHERE feature_name = 'growth_4w')
                    """), {"cid": cat_id}).fetchone()

                    # Update category topic_count
                    session.execute(text("""
                        UPDATE categories SET topic_count = :cnt, updated_at = :now
                        WHERE id = :cid
                    """), {"cnt": stats.topic_count or 0, "now": datetime.utcnow(), "cid": cat_id})

                    # Upsert category metrics
                    session.execute(text("""
                        INSERT INTO category_metrics
                            (category_id, date, topic_count,
                             avg_opportunity_score, avg_competition_index,
                             growth_rate_4w,
                             emerging_count, exploding_count, peaking_count, declining_count)
                        VALUES (:cid, :dt, :tc, :opp, :comp, :growth,
                                :emerging, :exploding, :peaking, :declining)
                        ON CONFLICT (category_id, date)
                        DO UPDATE SET
                            topic_count = :tc,
                            avg_opportunity_score = :opp,
                            avg_competition_index = :comp,
                            growth_rate_4w = :growth,
                            emerging_count = :emerging,
                            exploding_count = :exploding,
                            peaking_count = :peaking,
                            declining_count = :declining
                    """), {
                        "cid": cat_id, "dt": today,
                        "tc": stats.topic_count or 0,
                        "opp": round(float(score_stats.avg_opp), 2) if score_stats.avg_opp else None,
                        "comp": round(float(score_stats.avg_comp), 2) if score_stats.avg_comp else None,
                        "growth": round(float(growth_stat.avg_growth), 4) if growth_stat and growth_stat.avg_growth else None,
                        "emerging": stats.emerging or 0,
                        "exploding": stats.exploding or 0,
                        "peaking": stats.peaking or 0,
                        "declining": stats.declining or 0,
                    })

            except Exception as e:
                total_errors += 1
                logger.error("category_metrics: category error", slug=cat.slug, error=str(e))
                with get_sync_db() as session:
                    log_error(session, "category_metrics", type(e).__name__,
                              str(e), {"category_id": cat_id})

        status = "success" if total_errors == 0 else "partial"

    except Exception as e:
        logger.error("category_metrics: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "category_metrics", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                              total_categories, total_categories, 0, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "categories_processed": total_categories, "errors": total_errors,
    }
    logger.info("category_metrics: complete", **result)
    return result
