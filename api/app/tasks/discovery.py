"""
Topic Discovery Pipeline

Uses Google Trends related queries + seed keyword expansion to
automatically discover new e-commerce product niches.

Flow:
1. For each existing active topic, fetch related_queries from Google Trends
2. For each discovered keyword, fuzzy-match against existing topics (rapidfuzz)
3. If match score >= 85 → link as keyword to existing topic
4. If no match → create new candidate topic + auto-categorize
5. Newly created topics get picked up by the next ingestion cycle

Schedule: Weekly (Monday 2AM UTC)
"""
import uuid
import time
import random
import re
from datetime import datetime, date
from typing import Optional

from sqlalchemy import text
import structlog

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db, log_ingestion_run, update_ingestion_run, log_error

logger = structlog.get_logger()

# ── Category classification rules ──
# Maps keyword patterns to category slugs
CATEGORY_RULES = [
    # Beauty & Skincare
    ("beauty", [
        r"serum|moisturiz|cleanser|toner|retinol|sunscreen|spf|skincare|skin care",
        r"mascara|lipstick|foundation|concealer|eyeshadow|blush|makeup|cosmetic",
        r"hair oil|shampoo|conditioner|hair mask|curling|straighten|hair growth",
        r"nail|lash|brow|beauty|derma|acne|wrinkle|anti.aging|glow|peel|exfoli",
        r"face mask|jade roller|gua sha|microneedle|led mask|collagen.*face",
    ]),
    # Health & Wellness
    ("health", [
        r"supplement|vitamin|probiotic|collagen|ashwagandha|magnesium|zinc|omega",
        r"cbd|melatonin|elderberry|turmeric|mushroom.*coffee|adaptogen|nootropic",
        r"blood pressure|glucose|oximeter|thermometer|nebulizer|tens.*unit",
        r"massage.*gun|theragun|foam roller|acupressure|red light.*therap",
        r"sleep.*aid|weighted.*blanket|white noise|cpap|humidifier|diffuser",
    ]),
    # Electronics & Gadgets
    ("electronics", [
        r"wireless|bluetooth|earbuds|headphone|speaker|charger|power bank",
        r"smart.*watch|fitness.*tracker|gps.*tracker|dash.*cam|drone|camera",
        r"robot.*vacuum|smart.*plug|smart.*light|smart.*lock|smart.*thermostat",
        r"projector|monitor|keyboard|mouse|webcam|microphone|ring.*light",
        r"phone.*case|screen.*protector|tablet|kindle|e.reader|vr.*headset",
    ]),
    # Kitchen & Home
    ("kitchen", [
        r"air.*fryer|instant.*pot|blender|juicer|coffee.*maker|espresso|grinder",
        r"knife.*set|cutting.*board|cast.*iron|dutch.*oven|wok|rice.*cooker",
        r"sous.*vide|food.*processor|stand.*mixer|toaster|waffle|ice.*cream.*maker",
        r"water.*filter|water.*bottle|lunch.*box|meal.*prep|food.*storage",
        r"matcha|tea.*set|cocktail|wine.*opener|spice|seasoning|sauce|ramen.*kit",
    ]),
    # Fitness & Outdoor
    ("fitness", [
        r"yoga.*mat|resistance.*band|dumbbell|kettlebell|pull.*up.*bar|bench",
        r"treadmill|exercise.*bike|rowing.*machine|elliptical|home.*gym",
        r"running.*shoe|hiking.*boot|backpack|tent|camping|sleeping.*bag",
        r"protein.*powder|pre.*workout|creatine|bcaa|mass.*gainer|whey",
        r"cold.*plunge|ice.*bath|sauna|recovery|compression|foam.*roll",
    ]),
    # Pets & Baby
    ("pets", [
        r"dog.*bed|cat.*tree|pet.*carrier|dog.*toy|cat.*toy|pet.*food|treat",
        r"dog.*harness|leash|collar|pet.*camera|gps.*pet|automatic.*feeder",
        r"aquarium|fish.*tank|reptile|bird.*feeder|hamster|guinea.*pig",
        r"pet.*grooming|deshedding|nail.*clipper.*pet|pet.*shampoo|flea",
        r"dna.*test.*dog|cat.*litter|pet.*stroller|dog.*backpack",
    ]),
    ("baby", [
        r"baby.*monitor|baby.*carrier|stroller|car.*seat|diaper|wipe",
        r"bottle.*warmer|breast.*pump|baby.*food|high.*chair|crib|bassinet",
        r"teething|pacifier|swaddle|baby.*gate|playpen|baby.*swing",
        r"toddler|nursery|baby.*clothes|onesie|baby.*blanket",
    ]),
    # Fashion & Accessories
    ("fashion", [
        r"sneaker|boot|sandal|heel|loafer|slipper|shoe",
        r"handbag|purse|wallet|backpack|tote|crossbody|clutch",
        r"sunglasses|watch|bracelet|necklace|earring|ring|jewelry",
        r"jacket|hoodie|sweater|dress|legging|jogger|athleisure",
        r"hat|scarf|glove|belt|tie|sock|underwear|bra|shapewear",
    ]),
    # Home & Garden
    ("home", [
        r"candle|diffuser|throw.*pillow|blanket|curtain|rug|tapestry",
        r"organizer|storage.*bin|shelf|rack|hook|hanger|closet",
        r"desk.*lamp|floor.*lamp|string.*light|led.*strip|smart.*bulb",
        r"plant.*pot|garden.*tool|raised.*bed|compost|lawn|sprinkler",
        r"power.*tool|drill|saw|sander|paint|wallpaper|tile",
    ]),
    # Outdoors
    ("outdoors", [
        r"kayak|paddleboard|surfboard|wetsuit|snorkel|diving",
        r"binocular|telescope|compass|gps|walkie.*talkie",
        r"grill|bbq|smoker|pizza.*oven.*outdoor|fire.*pit|patio",
        r"solar.*panel|solar.*light|portable.*power|generator",
        r"cooler|thermos|hydration|camelback|insulated",
    ]),
]

# ── Seed keywords for discovery (organized by category) ──
SEED_DISCOVERY_KEYWORDS = {
    "beauty": [
        "retinol serum", "vitamin C serum", "hyaluronic acid", "snail mucin",
        "LED face mask", "jade roller", "gua sha tool", "lash serum",
        "hair growth oil", "silk pillowcase", "microneedling pen", "lip plumper",
        "scalp massager", "dermaplaning tool", "pore vacuum", "ice roller face",
        "peptide moisturizer", "bakuchiol serum", "niacinamide serum", "slugging skincare",
    ],
    "health": [
        "mushroom coffee", "ashwagandha gummies", "magnesium glycinate", "sea moss gel",
        "collagen peptides", "probiotic supplement", "lion's mane supplement", "berberine",
        "shilajit supplement", "electrolyte powder", "greens powder", "turmeric supplement",
        "NAD supplement", "spirulina tablets", "black seed oil", "tongkat ali",
        "apigenin sleep", "L-theanine supplement", "digestive enzyme", "fiber supplement",
    ],
    "electronics": [
        "portable projector", "bone conduction headphones", "smart ring", "mini PC",
        "wireless earbuds", "drone camera", "action camera", "dash cam",
        "smart glasses", "e-ink tablet", "portable monitor", "mechanical keyboard",
        "stream deck", "smart doorbell", "robot vacuum", "air quality monitor",
        "sleep tracker ring", "smart water bottle", "UV sanitizer", "wireless charger pad",
    ],
    "kitchen": [
        "portable blender", "air fryer accessories", "matcha whisk set", "cold brew maker",
        "ramen kit subscription", "sous vide machine", "pizza stone", "cast iron skillet",
        "electric kettle gooseneck", "manual coffee grinder", "ice cream maker",
        "bread maker machine", "electric lunch box", "vegetable chopper", "mandoline slicer",
        "milk frother", "herb garden indoor", "kombucha brewing kit", "sourdough starter kit",
        "smokeless indoor grill",
    ],
    "fitness": [
        "walking pad treadmill", "adjustable dumbbell set", "resistance band set",
        "ice barrel cold plunge", "sauna blanket", "massage gun", "pull up bar doorway",
        "yoga wheel", "ab roller", "jump rope weighted", "balance board trainer",
        "gymnastic rings", "battle ropes", "slam ball", "ankle weights",
        "posture corrector", "compression boots", "foam roller vibrating",
        "grip strength trainer", "suspension trainer TRX",
    ],
    "pets": [
        "dog DNA test", "automatic cat feeder", "pet camera treat dispenser",
        "cat GPS tracker", "dog backpack carrier", "calming dog bed",
        "slow feeder bowl", "pet water fountain", "deshedding glove",
        "interactive dog toy", "catnip toys", "fish tank LED light",
        "reptile heating pad", "bird cage accessories", "rabbit hay feeder",
        "dog cooling vest", "pet stroller", "puppy training pads",
        "cat scratching post tower", "dog puzzle toy",
    ],
    "baby": [
        "baby monitor AI", "white noise machine baby", "baby carrier wrap",
        "diaper caddy organizer", "baby food maker", "silicone bibs",
        "teething toys", "baby nail trimmer electric", "nursery sound machine",
        "portable bottle warmer", "baby play gym", "toddler tower kitchen",
        "baby sleep sack", "stroller organizer", "pacifier holder clip",
    ],
    "fashion": [
        "cloud slides", "chunky sneakers", "claw clips hair", "tote bag canvas",
        "crossbody phone bag", "minimalist wallet", "blue light glasses",
        "silk scrunchies", "gold hoop earrings", "layered necklace set",
        "biker shorts", "matching sets women", "linen pants", "platform sandals",
        "bucket hat", "belt bag", "shapewear bodysuit", "bamboo socks",
        "waterproof hiking boots", "oversized sunglasses",
    ],
    "home": [
        "smart garden", "mushroom lamp", "sunset lamp projector", "cloud couch dupe",
        "peel and stick wallpaper", "LED strip lights", "electric spin scrubber",
        "cordless vacuum", "steam mop", "air purifier", "dehumidifier",
        "weighted sleep mask", "white noise machine", "aromatherapy diffuser",
        "blackout curtains", "floating shelf", "pegboard organizer",
        "desk pad leather", "monitor light bar", "under desk cable management",
    ],
    "outdoors": [
        "outdoor pizza oven", "portable power station", "solar power bank",
        "inflatable kayak", "portable hammock", "camping stove",
        "fire pit smokeless", "patio heater", "outdoor projector screen",
        "portable water filter", "insulated water jug", "beach tent popup",
        "electric cooler", "portable grill", "stargazing telescope",
    ],
}


def classify_category(keyword: str) -> str:
    """Classify a keyword into a category using regex rules."""
    kw_lower = keyword.lower()
    for category_slug, patterns in CATEGORY_RULES:
        for pattern in patterns:
            if re.search(pattern, kw_lower):
                return category_slug
    return "general"


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")[:255]


def fuzzy_match_topic(keyword: str, existing_topics: list) -> Optional[dict]:
    """
    Fuzzy match a keyword against existing topic names.
    Returns {'topic_id': ..., 'score': ...} if match >= 85, else None.
    """
    try:
        from rapidfuzz import fuzz, process
    except ImportError:
        # Fallback to simple substring matching
        kw_lower = keyword.lower()
        for t in existing_topics:
            name_lower = t["name"].lower()
            if kw_lower == name_lower or kw_lower in name_lower or name_lower in kw_lower:
                return {"topic_id": t["id"], "score": 0.90}
        return None

    if not existing_topics:
        return None

    choices = {t["id"]: t["name"] for t in existing_topics}
    match = process.extractOne(keyword, choices, scorer=fuzz.token_sort_ratio)

    if match and match[1] >= 85:
        return {"topic_id": match[2], "score": match[1] / 100}
    return None


@celery_app.task(name="app.tasks.discovery.discover_topics",
                 bind=True, max_retries=1, default_retry_delay=600)
def discover_topics(self):
    """
    Weekly topic discovery pipeline.

    1. Expand existing topics via Google Trends related queries
    2. Process seed keywords for uncovered categories
    3. Fuzzy-match new keywords to existing topics
    4. Create new topics for unmatched keywords
    """
    started = datetime.utcnow()
    today = date.today()
    total_discovered = 0
    total_new_topics = 0
    total_linked = 0
    total_errors = 0

    logger.info("topic_discovery: starting")

    with get_sync_db() as session:
        run_id = log_ingestion_run(
            session, dag_id="topic_discovery_weekly",
            run_date=today, status="running", started_at=started
        )
        session.commit()

    try:
        # ── Step 1: Load existing topics ──
        with get_sync_db() as session:
            rows = session.execute(text(
                "SELECT id, name, slug, primary_category FROM topics WHERE is_active = true"
            )).fetchall()
            existing_topics = [{"id": str(r.id), "name": r.name, "slug": r.slug,
                                "category": r.primary_category} for r in rows]

        existing_names = {t["name"].lower() for t in existing_topics}
        existing_slugs = {t["slug"] for t in existing_topics}

        logger.info("topic_discovery: loaded existing topics", count=len(existing_topics))

        # ── Step 2: Fetch related queries from Google Trends for existing topics ──
        related_keywords = set()
        try:
            from pytrends.request import TrendReq
            pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 30))

            # Sample up to 30 topics to avoid rate limits
            sample_topics = random.sample(existing_topics, min(30, len(existing_topics)))

            for i, topic in enumerate(sample_topics):
                try:
                    pytrends.build_payload([topic["name"]], timeframe="today 3-m", geo="US")
                    related = pytrends.related_queries()

                    if topic["name"] in related:
                        for qtype in ["top", "rising"]:
                            df = related[topic["name"]].get(qtype)
                            if df is not None and not df.empty:
                                for _, row in df.iterrows():
                                    kw = str(row.get("query", "")).strip()
                                    if kw and len(kw) > 3 and len(kw) < 80:
                                        related_keywords.add(kw)

                    # Rate limit
                    delay = random.uniform(3, 6)
                    time.sleep(delay)

                except Exception as e:
                    if "429" in str(e):
                        logger.warning("topic_discovery: rate limited, waiting 65s")
                        time.sleep(65)
                    else:
                        logger.debug("topic_discovery: related query error",
                                     topic=topic["name"], error=str(e)[:100])
                    total_errors += 1

            logger.info("topic_discovery: related queries fetched",
                        keywords_found=len(related_keywords))

        except ImportError:
            logger.warning("topic_discovery: pytrends not available, using seed keywords only")

        # ── Step 3: Add seed keywords for all categories ──
        seed_keywords = set()
        for category, keywords in SEED_DISCOVERY_KEYWORDS.items():
            for kw in keywords:
                seed_keywords.add(kw)

        all_candidates = related_keywords | seed_keywords
        logger.info("topic_discovery: total candidates", count=len(all_candidates))

        # ── Step 4: Process each candidate keyword ──
        new_topics_batch = []

        for keyword in all_candidates:
            total_discovered += 1
            kw_slug = slugify(keyword)

            # Skip if already exists
            if keyword.lower() in existing_names or kw_slug in existing_slugs:
                continue

            # Fuzzy match against existing topics
            match = fuzzy_match_topic(keyword, existing_topics)

            if match:
                # Link as keyword to existing topic
                total_linked += 1
                with get_sync_db() as session:
                    try:
                        session.execute(text("""
                            INSERT INTO keywords (id, keyword, topic_id, source, match_score, created_at)
                            VALUES (:id, :kw, :tid, 'discovery', :score, :now)
                            ON CONFLICT (keyword, source) DO NOTHING
                        """), {
                            "id": str(uuid.uuid4()), "kw": keyword,
                            "tid": match["topic_id"], "score": match["score"],
                            "now": datetime.utcnow()
                        })
                    except Exception:
                        pass  # keywords table may not exist yet
            else:
                # Create new topic
                category = classify_category(keyword)
                topic_name = keyword.title()
                topic_slug = kw_slug

                # Ensure slug uniqueness
                if topic_slug in existing_slugs:
                    topic_slug = f"{topic_slug}-{str(uuid.uuid4())[:4]}"

                new_topics_batch.append({
                    "id": str(uuid.uuid4()),
                    "name": topic_name,
                    "slug": topic_slug,
                    "category": category,
                    "description": f"Auto-discovered product niche: {keyword}",
                })
                existing_slugs.add(topic_slug)
                existing_names.add(keyword.lower())

        # ── Step 5: Bulk insert new topics ──
        if new_topics_batch:
            with get_sync_db() as session:
                for topic in new_topics_batch:
                    try:
                        session.execute(text("""
                            INSERT INTO topics (id, name, slug, primary_category, description,
                                                stage, is_active, meta_json, created_at, updated_at)
                            VALUES (:id, :name, :slug, :cat, :desc,
                                    'unknown', true, :meta, :now, :now)
                            ON CONFLICT (slug) DO NOTHING
                        """), {
                            "id": topic["id"],
                            "name": topic["name"],
                            "slug": topic["slug"],
                            "cat": topic["category"],
                            "desc": topic["description"],
                            "meta": '{"source": "auto_discovery", "version": "v1"}',
                            "now": datetime.utcnow(),
                        })
                        total_new_topics += 1
                    except Exception as e:
                        logger.debug("topic_discovery: insert error",
                                     topic=topic["name"], error=str(e)[:100])
                        total_errors += 1

        status = "success" if total_errors < 5 else "partial"

    except Exception as e:
        logger.error("topic_discovery: fatal error", error=str(e))
        status = "failed"
        total_errors += 1
        with get_sync_db() as session:
            log_error(session, "topic_discovery_weekly", type(e).__name__, str(e))

    # Update run record
    with get_sync_db() as session:
        update_ingestion_run(session, run_id, status,
                             total_discovered, total_new_topics, total_linked, total_errors)

    result = {
        "run_id": run_id, "status": status,
        "candidates_evaluated": total_discovered,
        "new_topics_created": total_new_topics,
        "linked_to_existing": total_linked,
        "errors": total_errors,
    }
    logger.info("topic_discovery: complete", **result)
    return result
