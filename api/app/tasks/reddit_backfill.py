"""
Reddit 2-Year Historical Backfill Pipeline.

Collects posts/comments from product-related subreddits matching
Amazon BA search terms over the last 24 months.

Features:
  - Searches Reddit for top Amazon BA terms
  - Collects from 30+ product subreddits
  - Sentiment analysis via VADER
  - Rate-limited (Reddit API: 60 req/min)
  - Resumable: skips terms already fetched

Usage:
  python -c "from app.tasks.reddit_backfill import run_reddit_backfill; run_reddit_backfill()"
"""
import time
import uuid
import json
import random
from datetime import date, datetime, timedelta

import structlog
from sqlalchemy import text

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# Product-related subreddits to search
PRODUCT_SUBREDDITS = [
    # Health & Supplements
    "Supplements", "Nootropics", "Biohackers", "Fitness", "nutrition",
    "SkincareAddiction", "30PlusSkinCare", "AsianBeauty",
    # Tech & Gadgets
    "gadgets", "BuyItForLife", "technews", "smarthome",
    # Home & Kitchen
    "HomeImprovement", "Cooking", "MealPrepSunday", "CleaningTips",
    # Amazon specific
    "AmazonBestOf", "deals", "frugalmalefashion",
    # Wellness
    "sleep", "Meditation", "yoga", "running",
    # Pet
    "dogs", "cats", "pets",
    # Baby
    "BabyBumps", "beyondthebump", "NewParents",
    # General consumer
    "ProductTesting", "shutupandtakemymoney",
]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS reddit_backfill (
    id BIGSERIAL PRIMARY KEY,
    search_term TEXT NOT NULL,
    subreddit VARCHAR(100),
    post_id VARCHAR(20),
    title TEXT,
    body TEXT,
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    author VARCHAR(100),
    created_utc TIMESTAMPTZ,
    post_type VARCHAR(20) DEFAULT 'post',
    sentiment_score NUMERIC(5,4),
    sentiment_label VARCHAR(10),
    url TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_reddit_post UNIQUE (post_id)
);
CREATE INDEX IF NOT EXISTS idx_rb_term ON reddit_backfill(search_term);
CREATE INDEX IF NOT EXISTS idx_rb_date ON reddit_backfill(created_utc);
CREATE INDEX IF NOT EXISTS idx_rb_sub ON reddit_backfill(subreddit);
CREATE INDEX IF NOT EXISTS idx_rb_sentiment ON reddit_backfill(sentiment_label);
"""


def _ensure_table(session):
    """Create the backfill table."""
    for stmt in CREATE_TABLE_SQL.strip().split(';'):
        stmt = stmt.strip()
        if stmt:
            session.execute(text(stmt))
    session.commit()


def _get_top_terms_from_ba(session, top_n=500):
    """Get top search terms from Amazon BA (commercial/product terms only)."""
    result = session.execute(text("""
        SELECT search_term, MIN(search_frequency_rank) as best_rank
        FROM amazon_brand_analytics
        WHERE country = 'US'
          AND search_term NOT LIKE '%xxx%'
          AND search_term NOT LIKE '%porn%'
          AND LENGTH(search_term) > 3
          AND search_term NOT SIMILAR TO '%(gift card|prime video|kindle|audible)%'
        GROUP BY search_term
        ORDER BY best_rank ASC
        LIMIT :limit
    """), {"limit": top_n})
    return [row[0] for row in result.fetchall()]


def _get_already_fetched_terms(session):
    """Get terms already searched."""
    result = session.execute(text(
        "SELECT DISTINCT search_term FROM reddit_backfill"))
    return {row[0] for row in result.fetchall()}


def _analyze_sentiment(text_content):
    """Simple VADER sentiment analysis."""
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
        scores = analyzer.polarity_scores(text_content[:1000])
        compound = scores['compound']
        if compound >= 0.05:
            label = "positive"
        elif compound <= -0.05:
            label = "negative"
        else:
            label = "neutral"
        return round(compound, 4), label
    except Exception:
        return 0.0, "neutral"


def _search_reddit(term, limit=25):
    """Search Reddit for a term using httpx (no auth needed for search)."""
    import httpx

    results = []
    headers = {
        "User-Agent": "NeuraNest/1.0 (Product Research Bot)"
    }

    try:
        # Reddit JSON search API (no auth needed)
        url = f"https://www.reddit.com/search.json"
        params = {
            "q": term,
            "sort": "relevance",
            "t": "year",  # last year (Reddit limits to 1 year for search)
            "limit": limit,
            "type": "link",
        }
        r = httpx.get(url, params=params, headers=headers, timeout=15, follow_redirects=True)
        if r.status_code == 200:
            data = r.json()
            posts = data.get("data", {}).get("children", [])
            for post in posts:
                p = post.get("data", {})
                results.append({
                    "post_id": p.get("id", ""),
                    "subreddit": p.get("subreddit", ""),
                    "title": p.get("title", ""),
                    "body": (p.get("selftext", "") or "")[:2000],
                    "score": p.get("score", 0),
                    "num_comments": p.get("num_comments", 0),
                    "author": p.get("author", ""),
                    "created_utc": datetime.utcfromtimestamp(p.get("created_utc", 0)),
                    "url": f"https://reddit.com{p.get('permalink', '')}",
                })
        elif r.status_code == 429:
            logger.warning("reddit_backfill: rate limited, waiting 60s")
            time.sleep(60)

    except Exception as e:
        logger.warning("reddit_backfill: search error", term=term[:50], error=str(e)[:100])

    # Also search specific subreddits
    for sub in random.sample(PRODUCT_SUBREDDITS, min(5, len(PRODUCT_SUBREDDITS))):
        try:
            url = f"https://www.reddit.com/r/{sub}/search.json"
            params = {
                "q": term,
                "sort": "relevance",
                "t": "all",
                "limit": 10,
                "restrict_sr": "true",
            }
            r = httpx.get(url, params=params, headers=headers, timeout=15, follow_redirects=True)
            if r.status_code == 200:
                data = r.json()
                posts = data.get("data", {}).get("children", [])
                for post in posts:
                    p = post.get("data", {})
                    if p.get("id"):
                        results.append({
                            "post_id": p.get("id", ""),
                            "subreddit": p.get("subreddit", sub),
                            "title": p.get("title", ""),
                            "body": (p.get("selftext", "") or "")[:2000],
                            "score": p.get("score", 0),
                            "num_comments": p.get("num_comments", 0),
                            "author": p.get("author", ""),
                            "created_utc": datetime.utcfromtimestamp(p.get("created_utc", 0)),
                            "url": f"https://reddit.com{p.get('permalink', '')}",
                        })
            time.sleep(1)  # Rate limit between subreddit searches
        except Exception:
            continue

    # Deduplicate by post_id
    seen = set()
    deduped = []
    for r in results:
        if r["post_id"] and r["post_id"] not in seen:
            seen.add(r["post_id"])
            deduped.append(r)

    return deduped


def _store_reddit_posts(session, term, posts):
    """Store Reddit posts with sentiment."""
    stored = 0
    for p in posts:
        content = f"{p['title']} {p['body']}".strip()
        sentiment_score, sentiment_label = _analyze_sentiment(content)

        try:
            session.execute(text("""
                INSERT INTO reddit_backfill
                    (search_term, subreddit, post_id, title, body, score,
                     num_comments, author, created_utc, post_type,
                     sentiment_score, sentiment_label, url, fetched_at)
                VALUES
                    (:term, :sub, :pid, :title, :body, :score,
                     :comments, :author, :created, 'post',
                     :sent_score, :sent_label, :url, NOW())
                ON CONFLICT ON CONSTRAINT uq_reddit_post DO NOTHING
            """), {
                "term": term, "sub": p["subreddit"],
                "pid": p["post_id"], "title": (p["title"] or "")[:500],
                "body": (p["body"] or "")[:2000],
                "score": p["score"], "comments": p["num_comments"],
                "author": (p["author"] or "")[:100],
                "created": p["created_utc"],
                "sent_score": sentiment_score, "sent_label": sentiment_label,
                "url": (p["url"] or "")[:500],
            })
            stored += 1
        except Exception as e:
            if stored == 0:
                logger.warning("reddit_store: error", error=str(e)[:100])

    session.commit()
    return stored


def run_reddit_backfill(top_n=500):
    """
    Main Reddit backfill function.
    Searches Reddit for top N Amazon BA search terms.
    """
    logger.info("reddit_backfill: starting", top_n=top_n)

    with get_sync_db() as session:
        _ensure_table(session)

    with get_sync_db() as session:
        terms = _get_top_terms_from_ba(session, top_n)
    logger.info("reddit_backfill: found BA terms", count=len(terms))

    if not terms:
        logger.warning("reddit_backfill: no Amazon BA data. Import BA first.")
        return {"status": "no_data"}

    with get_sync_db() as session:
        already_done = _get_already_fetched_terms(session)
    remaining = [t for t in terms if t not in already_done]
    logger.info("reddit_backfill: terms to fetch", remaining=len(remaining), done=len(already_done))

    total_posts = 0
    total_failed = 0

    for i, term in enumerate(remaining):
        posts = _search_reddit(term, limit=25)

        if posts:
            with get_sync_db() as session:
                stored = _store_reddit_posts(session, term, posts)
                total_posts += stored
        else:
            total_failed += 1

        # Rate limit: Reddit allows ~60 req/min
        wait = random.uniform(2, 4)
        time.sleep(wait)

        if (i + 1) % 25 == 0:
            logger.info("reddit_backfill: progress",
                        done=i+1, remaining=len(remaining)-i-1,
                        posts=total_posts, failed=total_failed)

    logger.info("reddit_backfill: COMPLETE",
                terms=len(remaining), posts=total_posts, failed=total_failed)

    return {
        "status": "completed",
        "terms_searched": len(remaining),
        "posts_collected": total_posts,
        "failed": total_failed,
    }


@celery_app.task(name="app.tasks.reddit_backfill.backfill_reddit",
                 bind=True, max_retries=0, time_limit=86400)
def backfill_reddit(self, top_n=500):
    """Celery task wrapper."""
    return run_reddit_backfill(top_n)
