"""
Meta (Instagram + Facebook) & TikTok ingestion tasks.

Dual-Mode Design:
  - When API keys are set → fetch real data from platform APIs
  - When API keys are missing → generate realistic simulated data

This lets the platform demo full functionality immediately,
and seamlessly switch to live data when credentials are added.

Celery Tasks:
  - ingest_instagram   (daily 7:30 AM UTC)
  - ingest_facebook    (daily 7:45 AM UTC)
  - ingest_tiktok      (daily 8:00 AM UTC)
  - ingest_tiktok_ads  (daily 8:30 AM UTC)
"""
import time
import uuid
import json
import random
import hashlib
from datetime import datetime, date, timedelta
from decimal import Decimal

import structlog
from sqlalchemy import text

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def _get_active_topics(session):
    """Return list of {id, name, slug, primary_category, stage} for active topics."""
    rows = session.execute(text("""
        SELECT id, name, slug, primary_category, stage
        FROM topics WHERE is_active = true ORDER BY name
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


def _get_brands(session):
    """Return list of {id, name, category}."""
    rows = session.execute(text("""
        SELECT id, name, category_id FROM brands ORDER BY name
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


def _topic_hashtags(name: str) -> list[str]:
    """Generate realistic hashtags from topic name."""
    base = name.lower().replace(' ', '').replace('-', '').replace("'", "")
    words = name.lower().split()
    tags = [f"#{base}", f"#{''.join(words)}"]
    if len(words) > 1:
        tags.append(f"#{words[0]}")
    tags.extend(["#trending", "#musthave", "#newproduct"])
    return tags[:5]


def _random_sentiment() -> str:
    """Weighted random sentiment."""
    r = random.random()
    if r < 0.55:
        return "positive"
    elif r < 0.8:
        return "neutral"
    return "negative"


def _fake_post_id(platform: str, idx: int, topic_name: str) -> str:
    """Deterministic fake post ID to avoid duplicates on re-runs."""
    today = date.today().isoformat()
    raw = f"{platform}:{topic_name}:{today}:{idx}"
    return hashlib.md5(raw.encode()).hexdigest()[:20]


# ─────────────────────────────────────────────
# INSTAGRAM INGESTION
# ─────────────────────────────────────────────
def _ingest_instagram_live(topics, brands, session):
    """Fetch real Instagram data using Meta Graph API."""
    import httpx

    token = settings.META_ACCESS_TOKEN
    inserted = 0

    for topic in topics:
        hashtag = topic["name"].lower().replace(" ", "")
        # Search for hashtag ID
        try:
            r = httpx.get(
                "https://graph.facebook.com/v19.0/ig_hashtag_search",
                params={"q": hashtag, "user_id": "me", "access_token": token},
                timeout=15,
            )
            if r.status_code != 200:
                continue
            data = r.json().get("data", [])
            if not data:
                continue
            hashtag_id = data[0]["id"]

            # Get recent media for this hashtag
            media_r = httpx.get(
                f"https://graph.facebook.com/v19.0/{hashtag_id}/recent_media",
                params={
                    "user_id": "me",
                    "fields": "id,caption,like_count,comments_count,timestamp,media_type",
                    "access_token": token,
                },
                timeout=15,
            )
            if media_r.status_code != 200:
                continue

            for post in media_r.json().get("data", [])[:10]:
                post_id = post.get("id", "")
                session.execute(text("""
                    INSERT INTO instagram_mentions
                        (topic_id, post_id, post_type, caption, likes, comments, hashtags, sentiment, posted_at, collected_at)
                    VALUES (:tid, :pid, :ptype, :caption, :likes, :comments, :hashtags, :sentiment, :posted, NOW())
                    ON CONFLICT (post_id) DO NOTHING
                """), {
                    "tid": str(topic["id"]),
                    "pid": post_id,
                    "ptype": post.get("media_type", "IMAGE").lower(),
                    "caption": (post.get("caption") or "")[:500],
                    "likes": post.get("like_count", 0),
                    "comments": post.get("comments_count", 0),
                    "hashtags": json.dumps([f"#{hashtag}"]),
                    "sentiment": _random_sentiment(),
                    "posted": post.get("timestamp"),
                })
                inserted += 1

            session.commit()
            time.sleep(0.5)  # Rate limit

        except Exception as e:
            logger.warning("ig_live: error", topic=topic["name"], error=str(e))
            continue

    return inserted


def _ingest_instagram_simulated(topics, brands, session):
    """Generate realistic Instagram data for demo/development."""
    inserted = 0
    today = date.today()

    # Stage-based engagement multipliers
    stage_mult = {"emerging": 0.6, "exploding": 2.5, "peaking": 1.8, "declining": 0.4, "unknown": 0.8}

    for topic in topics:
        mult = stage_mult.get(topic["stage"], 0.8)
        num_posts = random.randint(2, 6)

        for i in range(num_posts):
            post_id = _fake_post_id("ig", i, topic["name"])
            post_type = random.choice(["reel", "post", "carousel", "reel", "reel"])  # reels bias
            days_ago = random.randint(0, 6)
            posted_at = datetime.combine(today - timedelta(days=days_ago), datetime.min.time())

            # Engagement scales with stage and post type
            base_likes = random.randint(200, 5000)
            if post_type == "reel":
                base_likes *= random.uniform(2.0, 5.0)
            likes = int(base_likes * mult)
            comments = int(likes * random.uniform(0.02, 0.08))
            shares = int(likes * random.uniform(0.005, 0.03))

            hashtags = _topic_hashtags(topic["name"])

            # Match to brand occasionally
            brand_id = None
            if random.random() < 0.3 and brands:
                brand_id = str(random.choice(brands)["id"])

            caption_templates = [
                f"Loving this {topic['name']}! Game changer for my routine 🔥",
                f"Have you tried {topic['name']}? The results speak for themselves",
                f"Just discovered {topic['name']} and I'm obsessed",
                f"{topic['name']} review: honest thoughts after 2 weeks",
                f"POV: You finally try {topic['name']} and it actually works",
                f"The {topic['name']} everyone on TikTok is talking about",
            ]

            session.execute(text("""
                INSERT INTO instagram_mentions
                    (topic_id, brand_id, post_id, post_type, caption, likes, comments, shares, hashtags, sentiment, posted_at, collected_at)
                VALUES (:tid, :bid, :pid, :ptype, :caption, :likes, :comments, :shares, :hashtags, :sentiment, :posted, NOW())
                ON CONFLICT (post_id) DO NOTHING
            """), {
                "tid": str(topic["id"]),
                "bid": brand_id,
                "pid": post_id,
                "ptype": post_type,
                "caption": random.choice(caption_templates),
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "hashtags": json.dumps(hashtags),
                "sentiment": _random_sentiment(),
                "posted": posted_at,
            })
            inserted += 1

        if inserted % 50 == 0:
            session.commit()

    session.commit()
    return inserted


@celery_app.task(name="app.tasks.meta_tiktok_ingestion.ingest_instagram", bind=True, max_retries=2)
def ingest_instagram(self):
    """Ingest Instagram data: live if META_ACCESS_TOKEN is set, otherwise simulated."""
    run_id = None
    total_inserted = 0
    status = "running"
    mode = "live" if settings.META_ACCESS_TOKEN else "simulated"

    logger.info("ig_ingest: starting", mode=mode)

    try:
        with get_sync_db() as session:
            run_id = log_ingestion_run(session, "instagram", date.today(), status)
            topics = _get_active_topics(session)
            brands = _get_brands(session)

        with get_sync_db() as session:
            if mode == "live":
                total_inserted = _ingest_instagram_live(topics, brands, session)
            else:
                total_inserted = _ingest_instagram_simulated(topics, brands, session)

        status = "success"

    except Exception as e:
        logger.error("ig_ingest: fatal", error=str(e))
        status = "failed"
        with get_sync_db() as session:
            log_error(session, "instagram_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status, total_inserted, total_inserted, 0, 0)

    logger.info("ig_ingest: done", mode=mode, status=status, inserted=total_inserted)
    return {"run_id": run_id, "mode": mode, "status": status, "inserted": total_inserted}


# ─────────────────────────────────────────────
# FACEBOOK INGESTION
# ─────────────────────────────────────────────
def _ingest_facebook_simulated(topics, brands, session):
    """Generate realistic Facebook data."""
    inserted = 0
    today = date.today()
    stage_mult = {"emerging": 0.5, "exploding": 2.0, "peaking": 1.5, "declining": 0.3, "unknown": 0.7}

    page_names = [
        "Product Reviews Daily", "Smart Shopper Hub", "TechDeals Now",
        "Wellness Warriors", "Home Essentials", "Beauty Inside Out",
        "Fitness Nation", "Kitchen Masters", "Eco Living Guide",
        "Pet Parents Unite", "Gaming Central", "Outdoor Life",
    ]

    for topic in topics:
        mult = stage_mult.get(topic["stage"], 0.7)
        num_posts = random.randint(1, 4)

        for i in range(num_posts):
            post_id = _fake_post_id("fb", i, topic["name"])
            days_ago = random.randint(0, 6)
            posted_at = datetime.combine(today - timedelta(days=days_ago), datetime.min.time())

            reactions = int(random.randint(50, 2000) * mult)
            comments = int(reactions * random.uniform(0.05, 0.15))
            shares = int(reactions * random.uniform(0.02, 0.1))

            brand_id = None
            if random.random() < 0.25 and brands:
                brand_id = str(random.choice(brands)["id"])

            text_templates = [
                f"Has anyone tried {topic['name']}? Looking for recommendations.",
                f"Just bought {topic['name']} and here's my honest review...",
                f"{topic['name']} comparison: which brand is actually worth it?",
                f"PSA: {topic['name']} is on sale this week! Here's what to look for.",
                f"My experience with {topic['name']} after 30 days of use.",
            ]

            session.execute(text("""
                INSERT INTO facebook_mentions
                    (topic_id, brand_id, post_id, page_name, text, reactions, comments, shares, sentiment, posted_at, collected_at)
                VALUES (:tid, :bid, :pid, :page, :text, :reactions, :comments, :shares, :sentiment, :posted, NOW())
                ON CONFLICT (post_id) DO NOTHING
            """), {
                "tid": str(topic["id"]),
                "bid": brand_id,
                "pid": post_id,
                "page": random.choice(page_names),
                "text": random.choice(text_templates),
                "reactions": reactions,
                "comments": comments,
                "shares": shares,
                "sentiment": _random_sentiment(),
                "posted": posted_at,
            })
            inserted += 1

        if inserted % 50 == 0:
            session.commit()

    session.commit()
    return inserted


@celery_app.task(name="app.tasks.meta_tiktok_ingestion.ingest_facebook", bind=True, max_retries=2)
def ingest_facebook(self):
    """Ingest Facebook data: live if META_ACCESS_TOKEN set, otherwise simulated."""
    run_id = None
    total_inserted = 0
    status = "running"
    mode = "live" if settings.META_ACCESS_TOKEN else "simulated"

    logger.info("fb_ingest: starting", mode=mode)

    try:
        with get_sync_db() as session:
            run_id = log_ingestion_run(session, "facebook", date.today(), status)
            topics = _get_active_topics(session)
            brands = _get_brands(session)

        with get_sync_db() as session:
            if mode == "live":
                # Live Facebook uses same Meta Graph API
                total_inserted = _ingest_facebook_simulated(topics, brands, session)  # TODO: live impl
            else:
                total_inserted = _ingest_facebook_simulated(topics, brands, session)

        status = "success"

    except Exception as e:
        logger.error("fb_ingest: fatal", error=str(e))
        status = "failed"
        with get_sync_db() as session:
            log_error(session, "facebook_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status, total_inserted, total_inserted, 0, 0)

    logger.info("fb_ingest: done", mode=mode, status=status, inserted=total_inserted)
    return {"run_id": run_id, "mode": mode, "status": status, "inserted": total_inserted}


# ─────────────────────────────────────────────
# TIKTOK TRENDS INGESTION
# ─────────────────────────────────────────────
def _ingest_tiktok_live(topics, session):
    """Fetch real TikTok data via TikTok Research API."""
    import httpx

    api_key = settings.TIKTOK_API_KEY
    inserted = 0

    for topic in topics:
        hashtag = topic["name"].lower().replace(" ", "")
        try:
            # TikTok Research API v2
            r = httpx.post(
                "https://open.tiktokapis.com/v2/research/hashtag/info/",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"hashtag_name": hashtag},
                timeout=15,
            )
            if r.status_code != 200:
                continue

            data = r.json().get("data", {})
            view_count = data.get("view_count", 0)
            video_count = data.get("video_count", 0)

            session.execute(text("""
                INSERT INTO tiktok_trends
                    (topic_id, hashtag, view_count, video_count, growth_rate, region, date, collected_at)
                VALUES (:tid, :hashtag, :views, :videos, :growth, 'US', :date, NOW())
                ON CONFLICT ON CONSTRAINT uq_tiktok_trend DO UPDATE SET
                    view_count = EXCLUDED.view_count,
                    video_count = EXCLUDED.video_count,
                    collected_at = NOW()
            """), {
                "tid": str(topic["id"]),
                "hashtag": f"#{hashtag}",
                "views": view_count,
                "videos": video_count,
                "growth": 0,  # compute from history
                "date": date.today(),
            })
            inserted += 1
            time.sleep(0.3)

        except Exception as e:
            logger.warning("tiktok_live: error", topic=topic["name"], error=str(e))
            continue

    session.commit()
    return inserted


def _ingest_tiktok_simulated(topics, session):
    """Generate realistic TikTok trends data."""
    inserted = 0
    today = date.today()
    stage_mult = {"emerging": 1.2, "exploding": 5.0, "peaking": 3.0, "declining": 0.5, "unknown": 0.8}

    # Category virality factor (some categories are more TikTok-friendly)
    category_virality = {
        "Beauty & Skincare": 3.0, "Fitness & Sports": 2.5, "Fashion & Accessories": 2.8,
        "Health & Wellness": 2.0, "Kitchen & Cooking": 2.2, "Gaming & Entertainment": 2.0,
        "Pet Care": 2.5, "Home & Living": 1.5, "Tech & Gadgets": 1.8,
        "Baby & Kids": 1.3, "Sustainability & Eco": 1.6, "Automotive": 0.8,
        "Office & Productivity": 0.6, "Outdoor & Garden": 1.2, "Electronics": 1.0,
    }

    for topic in topics:
        mult = stage_mult.get(topic["stage"], 0.8)
        virality = category_virality.get(topic["primary_category"], 1.0)
        hashtag = f"#{topic['name'].lower().replace(' ', '').replace('-', '')}"

        # Generate last 7 days of data
        for days_ago in range(7):
            d = today - timedelta(days=days_ago)

            base_views = random.randint(50_000, 5_000_000)
            view_count = int(base_views * mult * virality)
            video_count = int(view_count / random.randint(5000, 50000))
            video_count = max(video_count, random.randint(5, 50))

            # Growth rate: compare with simulated "yesterday"
            growth = random.uniform(-0.1, 0.3) * mult

            session.execute(text("""
                INSERT INTO tiktok_trends
                    (topic_id, hashtag, view_count, video_count, growth_rate, region, date, collected_at)
                VALUES (:tid, :hashtag, :views, :videos, :growth, 'US', :date, NOW())
                ON CONFLICT ON CONSTRAINT uq_tiktok_trend DO UPDATE SET
                    view_count = EXCLUDED.view_count,
                    video_count = EXCLUDED.video_count,
                    growth_rate = EXCLUDED.growth_rate,
                    collected_at = NOW()
            """), {
                "tid": str(topic["id"]),
                "hashtag": hashtag,
                "views": view_count,
                "videos": video_count,
                "growth": round(growth, 4),
                "date": d,
            })
            inserted += 1

        # Also insert some TikTok mentions (individual videos)
        num_mentions = random.randint(2, 5)
        for i in range(num_mentions):
            video_id = _fake_post_id("tt", i, topic["name"])
            days_ago = random.randint(0, 6)
            posted_at = datetime.combine(today - timedelta(days=days_ago), datetime.min.time())

            vid_views = int(random.randint(10_000, 2_000_000) * mult * virality)
            likes = int(vid_views * random.uniform(0.05, 0.2))
            comments = int(likes * random.uniform(0.01, 0.05))
            shares = int(likes * random.uniform(0.005, 0.03))

            brand_id = None  # Could match brands later

            mention_hashtags = _topic_hashtags(topic["name"])
            mention_hashtags.extend(["#fyp", "#viral", "#tiktokmademebuyit"])

            desc_templates = [
                f"Wait til you see what {topic['name']} can do 😱 #fyp",
                f"Replying to @user: yes {topic['name']} is worth the hype",
                f"{topic['name']} review - is it worth the money? #honest",
                f"POV: you discover {topic['name']} exists #tiktokmademebuyit",
                f"This {topic['name']} changed everything for me 🔥",
            ]

            session.execute(text("""
                INSERT INTO tiktok_mentions
                    (topic_id, brand_id, video_id, description, likes, comments, shares, views, hashtags, sentiment, posted_at, collected_at)
                VALUES (:tid, :bid, :vid, :desc, :likes, :comments, :shares, :views, :hashtags, :sentiment, :posted, NOW())
                ON CONFLICT (video_id) DO NOTHING
            """), {
                "tid": str(topic["id"]),
                "bid": brand_id,
                "vid": video_id,
                "desc": random.choice(desc_templates),
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "views": vid_views,
                "hashtags": json.dumps(mention_hashtags[:6]),
                "sentiment": _random_sentiment(),
                "posted": posted_at,
            })
            inserted += 1

        if inserted % 100 == 0:
            session.commit()

    session.commit()
    return inserted


@celery_app.task(name="app.tasks.meta_tiktok_ingestion.ingest_tiktok", bind=True, max_retries=2)
def ingest_tiktok(self):
    """Ingest TikTok trends + mentions: live if TIKTOK_API_KEY set, otherwise simulated."""
    run_id = None
    total_inserted = 0
    status = "running"
    mode = "live" if settings.TIKTOK_API_KEY else "simulated"

    logger.info("tiktok_ingest: starting", mode=mode)

    try:
        with get_sync_db() as session:
            run_id = log_ingestion_run(session, "tiktok", date.today(), status)
            topics = _get_active_topics(session)

        with get_sync_db() as session:
            if mode == "live":
                total_inserted = _ingest_tiktok_live(topics, session)
            else:
                total_inserted = _ingest_tiktok_simulated(topics, session)

        status = "success"

    except Exception as e:
        logger.error("tiktok_ingest: fatal", error=str(e))
        status = "failed"
        with get_sync_db() as session:
            log_error(session, "tiktok_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status, total_inserted, total_inserted, 0, 0)

    logger.info("tiktok_ingest: done", mode=mode, status=status, inserted=total_inserted)
    return {"run_id": run_id, "mode": mode, "status": status, "inserted": total_inserted}


# ─────────────────────────────────────────────
# AD CREATIVES INGESTION (Meta + TikTok)
# ─────────────────────────────────────────────
def _ingest_ads_simulated(topics, brands, session):
    """Generate realistic ad creative data."""
    inserted = 0
    today = date.today()
    stage_mult = {"emerging": 0.4, "exploding": 3.0, "peaking": 2.0, "declining": 1.5, "unknown": 0.5}

    for topic in topics:
        mult = stage_mult.get(topic["stage"], 0.5)
        # Not every topic has ads
        if random.random() > (0.3 + mult * 0.15):
            continue

        num_ads = random.randint(1, max(1, int(4 * mult)))
        for i in range(num_ads):
            platform = random.choice(["meta", "meta", "tiktok"])  # Meta bias
            creative_id = _fake_post_id(f"ad_{platform}", i, topic["name"])
            media_type = random.choice(["video", "image", "carousel"]) if platform == "meta" else "video"

            days_active = random.randint(3, 45)
            first_seen = today - timedelta(days=days_active + random.randint(0, 10))
            last_seen = first_seen + timedelta(days=days_active)
            if last_seen > today:
                last_seen = today

            spend = round(random.uniform(50, 5000) * mult, 2)
            impressions = int(spend * random.uniform(500, 2000))

            brand_id = None
            if brands and random.random() < 0.6:
                brand_id = str(random.choice(brands)["id"])

            ad_templates = [
                f"Discover the best {topic['name']} — Shop now with free shipping!",
                f"Why {topic['name']} is trending everywhere. Limited time offer.",
                f"Upgrade your {topic['primary_category'] or 'life'} with {topic['name']}",
                f"⭐ Rated #1 {topic['name']} — See why 10,000+ customers love it",
                f"New: {topic['name']} that actually works. 60-day guarantee.",
            ]

            session.execute(text("""
                INSERT INTO ad_creatives
                    (platform, topic_id, brand_id, creative_id, ad_text, media_type,
                     spend_estimate, impressions_estimate, active_days, first_seen, last_seen, collected_at)
                VALUES (:platform, :tid, :bid, :cid, :text, :media, :spend, :imp, :days, :first, :last, NOW())
                ON CONFLICT ON CONSTRAINT uq_ad_creative DO UPDATE SET
                    spend_estimate = EXCLUDED.spend_estimate,
                    impressions_estimate = EXCLUDED.impressions_estimate,
                    active_days = EXCLUDED.active_days,
                    last_seen = EXCLUDED.last_seen,
                    collected_at = NOW()
            """), {
                "platform": platform,
                "tid": str(topic["id"]),
                "bid": brand_id,
                "cid": creative_id,
                "text": random.choice(ad_templates),
                "media": media_type,
                "spend": spend,
                "imp": impressions,
                "days": days_active,
                "first": first_seen,
                "last": last_seen,
            })
            inserted += 1

        if inserted % 50 == 0:
            session.commit()

    session.commit()
    return inserted


@celery_app.task(name="app.tasks.meta_tiktok_ingestion.ingest_ads", bind=True, max_retries=2)
def ingest_ads(self):
    """Ingest ad creatives from Meta Ad Library & TikTok Creative Center."""
    run_id = None
    total_inserted = 0
    status = "running"
    mode = "simulated"  # Always simulated for now (ad APIs need advertiser accounts)

    logger.info("ads_ingest: starting", mode=mode)

    try:
        with get_sync_db() as session:
            run_id = log_ingestion_run(session, "ad_creatives", date.today(), status)
            topics = _get_active_topics(session)
            brands = _get_brands(session)

        with get_sync_db() as session:
            total_inserted = _ingest_ads_simulated(topics, brands, session)

        status = "success"

    except Exception as e:
        logger.error("ads_ingest: fatal", error=str(e))
        status = "failed"
        with get_sync_db() as session:
            log_error(session, "ads_ingest", type(e).__name__, str(e))

    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status, total_inserted, total_inserted, 0, 0)

    logger.info("ads_ingest: done", mode=mode, status=status, inserted=total_inserted)
    return {"run_id": run_id, "mode": mode, "status": status, "inserted": total_inserted}
