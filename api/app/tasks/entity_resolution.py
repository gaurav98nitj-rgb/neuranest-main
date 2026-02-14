"""
Entity Resolution Engine — matches Amazon BA search terms to NeuraNest Topics.

This is the CRITICAL bridge between data sources:
  Amazon search term "hydrogen water tablets" → Topic "Hydrogen Water"
  Amazon search term "hydrogen water bottle"  → Topic "Hydrogen Water"
  Reddit post about "hydrogen water benefits" → Topic "Hydrogen Water"

Three matching strategies (layered):
  1. Exact match: search_term == topic.name or topic.keyword (instant)
  2. Fuzzy match: Levenshtein similarity > 0.85 (fast)
  3. Embedding match: cosine similarity > 0.75 (semantic, catches variations)

Also creates NEW topics when high-rank Amazon terms don't match anything existing.

Usage:
  python -c "from app.tasks.entity_resolution import run_entity_resolution; run_entity_resolution()"
"""
import os
import uuid
import time
import json
import re
from datetime import datetime, date
from collections import defaultdict

import numpy as np
import structlog
from sqlalchemy import text

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# ─── Config ───
EXACT_MATCH_WEIGHT = 1.0
FUZZY_THRESHOLD = 0.85
EMBEDDING_THRESHOLD = 0.72
TOP_N_TERMS = 10000  # Process top 10K Amazon search terms by rank
NEW_TOPIC_RANK_THRESHOLD = 500  # Create new topics for terms ranked ≤500 with no match
BATCH_SIZE = 200

# ─── Table for resolution results ───
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS entity_resolution (
    id BIGSERIAL PRIMARY KEY,
    search_term TEXT NOT NULL,
    topic_id UUID REFERENCES topics(id),
    match_type VARCHAR(20) NOT NULL,
    confidence NUMERIC(5,4) NOT NULL,
    matched_to TEXT,
    country VARCHAR(5) DEFAULT 'US',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_er_term_country UNIQUE (search_term, country)
);
CREATE INDEX IF NOT EXISTS idx_er_topic ON entity_resolution(topic_id);
CREATE INDEX IF NOT EXISTS idx_er_term ON entity_resolution(search_term);
CREATE INDEX IF NOT EXISTS idx_er_match ON entity_resolution(match_type);
CREATE INDEX IF NOT EXISTS idx_er_confidence ON entity_resolution(confidence DESC);
"""


def _ensure_tables(session):
    """Create entity_resolution table if needed."""
    for stmt in CREATE_TABLE_SQL.strip().split(';'):
        stmt = stmt.strip()
        if stmt:
            session.execute(text(stmt))
    session.commit()


def _normalize(s):
    """Normalize a search term for matching."""
    s = s.lower().strip()
    # Remove common noise words
    s = re.sub(r'\b(for|the|and|with|in|on|of|to|a|an)\b', ' ', s)
    # Remove special chars
    s = re.sub(r'[^a-z0-9\s]', '', s)
    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _get_top_amazon_terms(session, top_n=TOP_N_TERMS, country="US"):
    """Get top search terms from Amazon BA by best rank."""
    result = session.execute(text("""
        SELECT search_term, MIN(search_frequency_rank) as best_rank,
               MAX(category_1) as top_category
        FROM amazon_brand_analytics
        WHERE country = :country AND search_term IS NOT NULL
          AND LENGTH(search_term) >= 3
        GROUP BY search_term
        ORDER BY best_rank ASC
        LIMIT :limit
    """), {"country": country, "limit": top_n})
    return [(row[0], row[1], row[2]) for row in result.fetchall()]


def _get_existing_topics(session):
    """Get all topics with their names, keywords, and embeddings."""
    topics = []

    # Get topics
    result = session.execute(text("""
        SELECT t.id, t.name, t.slug, t.primary_category, t.embedding
        FROM topics t WHERE t.is_active = true
    """))
    topic_rows = result.fetchall()

    # Get keywords for each topic
    keywords_result = session.execute(text("""
        SELECT topic_id, keyword FROM keywords WHERE topic_id IS NOT NULL
    """))
    topic_keywords = defaultdict(list)
    for row in keywords_result:
        topic_keywords[str(row[0])].append(row[1].lower())

    for row in topic_rows:
        tid = str(row[0])
        topics.append({
            "id": row[0],
            "name": row[1],
            "slug": row[2],
            "category": row[3],
            "embedding": np.array(row[4]) if row[4] is not None else None,
            "keywords": topic_keywords.get(tid, []),
            "name_normalized": _normalize(row[1]),
        })

    return topics


def _get_already_resolved(session, country="US"):
    """Get terms already resolved."""
    result = session.execute(text("""
        SELECT search_term FROM entity_resolution WHERE country = :country
    """), {"country": country})
    return {row[0] for row in result.fetchall()}


def _fuzzy_similarity(a, b):
    """Simple character-level similarity (Jaccard on character trigrams)."""
    if not a or not b:
        return 0.0
    a_tri = set(a[i:i+3] for i in range(len(a) - 2)) if len(a) >= 3 else {a}
    b_tri = set(b[i:i+3] for i in range(len(b) - 2)) if len(b) >= 3 else {b}
    if not a_tri or not b_tri:
        return 0.0
    intersection = len(a_tri & b_tri)
    union = len(a_tri | b_tri)
    return intersection / union if union > 0 else 0.0


def _cosine_similarity(a, b):
    """Cosine similarity between two vectors."""
    if a is None or b is None:
        return 0.0
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def _get_embedding_model():
    """Load sentence-transformer model."""
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
        return model
    except ImportError:
        logger.warning("entity_resolution: sentence-transformers not available, using fuzzy only")
        return None


def _embed_terms(model, terms, batch_size=128):
    """Batch-encode search terms into embeddings."""
    if model is None:
        return {}
    embeddings = {}
    for i in range(0, len(terms), batch_size):
        batch = terms[i:i+batch_size]
        vecs = model.encode(batch, show_progress_bar=False, normalize_embeddings=True)
        for term, vec in zip(batch, vecs):
            embeddings[term] = vec
    return embeddings


def _match_term(term, term_normalized, term_embedding, topics):
    """
    Match a single search term to the best topic.
    Returns: (topic_id, match_type, confidence, matched_to) or None
    """
    best_match = None
    best_score = 0.0

    for topic in topics:
        # Strategy 1: Exact match on name
        if term.lower() == topic["name"].lower():
            return (topic["id"], "exact_name", 1.0, topic["name"])

        # Strategy 2: Exact match on keyword
        if term.lower() in topic["keywords"]:
            return (topic["id"], "exact_keyword", 0.98, topic["name"])

        # Strategy 3: Term contains topic name or vice versa
        if topic["name_normalized"] in term_normalized and len(topic["name_normalized"]) > 4:
            score = len(topic["name_normalized"]) / max(len(term_normalized), 1)
            if score > 0.4:
                contains_conf = min(0.95, 0.7 + score * 0.3)
                if contains_conf > best_score:
                    best_match = (topic["id"], "contains", round(contains_conf, 4), topic["name"])
                    best_score = contains_conf

        if term_normalized in topic["name_normalized"] and len(term_normalized) > 4:
            score = len(term_normalized) / max(len(topic["name_normalized"]), 1)
            if score > 0.4:
                contains_conf = min(0.93, 0.65 + score * 0.3)
                if contains_conf > best_score:
                    best_match = (topic["id"], "contains", round(contains_conf, 4), topic["name"])
                    best_score = contains_conf

        # Strategy 4: Fuzzy match on normalized name
        fuzzy_score = _fuzzy_similarity(term_normalized, topic["name_normalized"])
        if fuzzy_score >= FUZZY_THRESHOLD and fuzzy_score > best_score:
            best_match = (topic["id"], "fuzzy", round(fuzzy_score, 4), topic["name"])
            best_score = fuzzy_score

        # Strategy 5: Fuzzy on keywords
        for kw in topic["keywords"]:
            kw_score = _fuzzy_similarity(term_normalized, _normalize(kw))
            if kw_score >= FUZZY_THRESHOLD and kw_score > best_score:
                best_match = (topic["id"], "fuzzy_kw", round(kw_score, 4), topic["name"])
                best_score = kw_score

        # Strategy 6: Embedding similarity
        if term_embedding is not None and topic["embedding"] is not None:
            emb_score = _cosine_similarity(term_embedding, topic["embedding"])
            if emb_score >= EMBEDDING_THRESHOLD and emb_score > best_score:
                best_match = (topic["id"], "embedding", round(emb_score, 4), topic["name"])
                best_score = emb_score

    return best_match


def _create_new_topic(session, search_term, category, embedding):
    """Create a new Topic from an unmatched high-rank Amazon search term."""
    # Clean up the term for a topic name
    name = search_term.strip().title()
    slug = re.sub(r'[^a-z0-9]+', '-', search_term.lower().strip()).strip('-')

    # Check slug doesn't exist
    existing = session.execute(text("SELECT id FROM topics WHERE slug = :slug"), {"slug": slug})
    if existing.fetchone():
        return None  # Already exists

    topic_id = uuid.uuid4()
    emb_list = embedding.tolist() if embedding is not None else None

    session.execute(text("""
        INSERT INTO topics (id, name, slug, primary_category, stage, embedding, is_active, created_at)
        VALUES (:id, :name, :slug, :cat, 'emerging', :emb, true, NOW())
    """), {
        "id": str(topic_id), "name": name, "slug": slug,
        "cat": category, "emb": str(emb_list) if emb_list else None,
    })

    # Also add the search term as a keyword
    session.execute(text("""
        INSERT INTO keywords (id, topic_id, keyword, source, geo)
        VALUES (:id, :tid, :kw, 'discovery', 'US')
        ON CONFLICT ON CONSTRAINT uq_keywords_unique DO NOTHING
    """), {
        "id": str(uuid.uuid4()), "tid": str(topic_id),
        "kw": search_term.lower(),
    })

    session.commit()
    return topic_id


def _store_resolution(session, term, topic_id, match_type, confidence, matched_to, country="US"):
    """Store a resolution result."""
    session.execute(text("""
        INSERT INTO entity_resolution (search_term, topic_id, match_type, confidence, matched_to, country)
        VALUES (:term, :tid, :mtype, :conf, :matched, :country)
        ON CONFLICT ON CONSTRAINT uq_er_term_country DO UPDATE SET
            topic_id = EXCLUDED.topic_id,
            match_type = EXCLUDED.match_type,
            confidence = EXCLUDED.confidence,
            matched_to = EXCLUDED.matched_to,
            created_at = NOW()
    """), {
        "term": term, "tid": str(topic_id) if topic_id else None,
        "mtype": match_type, "conf": confidence,
        "matched": matched_to, "country": country,
    })


def _update_ba_topic_links(session, country="US"):
    """Update amazon_brand_analytics.topic_id from entity_resolution results."""
    result = session.execute(text("""
        UPDATE amazon_brand_analytics ba
        SET topic_id = er.topic_id
        FROM entity_resolution er
        WHERE LOWER(ba.search_term) = LOWER(er.search_term)
          AND ba.country = er.country
          AND er.topic_id IS NOT NULL
          AND ba.topic_id IS NULL
          AND ba.country = :country
    """), {"country": country})
    session.commit()
    return result.rowcount


def run_entity_resolution(top_n=TOP_N_TERMS, country="US"):
    """
    Main entity resolution pipeline.

    1. Load existing topics + their embeddings/keywords
    2. Get top Amazon BA search terms
    3. Match each term to best topic (exact → fuzzy → embedding)
    4. Create new topics for high-rank unmatched terms
    5. Update amazon_brand_analytics.topic_id links
    """
    logger.info("entity_resolution: starting", top_n=top_n, country=country)

    # Setup
    with get_sync_db() as session:
        _ensure_tables(session)

    # Load topics
    with get_sync_db() as session:
        topics = _get_existing_topics(session)
    logger.info("entity_resolution: loaded topics", count=len(topics))

    # Load Amazon BA terms
    with get_sync_db() as session:
        amazon_terms = _get_top_amazon_terms(session, top_n, country)
    logger.info("entity_resolution: loaded BA terms", count=len(amazon_terms))

    # Check already resolved
    with get_sync_db() as session:
        already_done = _get_already_resolved(session, country)
    remaining = [(t, r, c) for t, r, c in amazon_terms if t not in already_done]
    logger.info("entity_resolution: to resolve", remaining=len(remaining), done=len(already_done))

    # Load embedding model
    logger.info("entity_resolution: loading embedding model...")
    model = _get_embedding_model()

    # Embed search terms in batches
    if model and remaining:
        logger.info("entity_resolution: encoding search terms...")
        term_texts = [t for t, _, _ in remaining]
        term_embeddings = _embed_terms(model, term_texts)
    else:
        term_embeddings = {}

    # Match each term
    matched = 0
    unmatched = 0
    new_topics_created = 0
    match_type_counts = defaultdict(int)

    for i, (term, rank, category) in enumerate(remaining):
        term_norm = _normalize(term)
        term_emb = term_embeddings.get(term)

        result = _match_term(term, term_norm, term_emb, topics)

        if result:
            topic_id, match_type, confidence, matched_to = result
            with get_sync_db() as session:
                _store_resolution(session, term, topic_id, match_type, confidence, matched_to, country)
                session.commit()
            matched += 1
            match_type_counts[match_type] += 1
        else:
            # No match — create new topic if high-rank
            if rank <= NEW_TOPIC_RANK_THRESHOLD:
                with get_sync_db() as session:
                    new_topic_id = _create_new_topic(session, term, category, term_emb)
                if new_topic_id:
                    with get_sync_db() as session:
                        _store_resolution(session, term, new_topic_id, "new_topic", 1.0, term.title(), country)
                        session.commit()
                    # Add to topics list so future terms can match against it
                    topics.append({
                        "id": new_topic_id,
                        "name": term.title(),
                        "slug": re.sub(r'[^a-z0-9]+', '-', term.lower()),
                        "category": category,
                        "embedding": term_emb,
                        "keywords": [term.lower()],
                        "name_normalized": term_norm,
                    })
                    new_topics_created += 1
                    matched += 1
                    match_type_counts["new_topic"] += 1
                else:
                    with get_sync_db() as session:
                        _store_resolution(session, term, None, "unmatched", 0.0, None, country)
                        session.commit()
                    unmatched += 1
            else:
                with get_sync_db() as session:
                    _store_resolution(session, term, None, "unmatched", 0.0, None, country)
                    session.commit()
                unmatched += 1

        if (i + 1) % 500 == 0:
            logger.info("entity_resolution: progress",
                        done=i+1, total=len(remaining),
                        matched=matched, unmatched=unmatched,
                        new_topics=new_topics_created)

    # Update BA table topic_id links
    logger.info("entity_resolution: linking BA rows to topics...")
    with get_sync_db() as session:
        linked = _update_ba_topic_links(session, country)
    logger.info("entity_resolution: linked BA rows", count=linked)

    result = {
        "status": "completed",
        "terms_processed": len(remaining),
        "matched": matched,
        "unmatched": unmatched,
        "new_topics_created": new_topics_created,
        "ba_rows_linked": linked,
        "match_types": dict(match_type_counts),
    }
    logger.info("entity_resolution: COMPLETE", **result)
    return result


@celery_app.task(name="app.tasks.entity_resolution.resolve_entities",
                 bind=True, max_retries=0, time_limit=7200)
def resolve_entities(self, top_n=TOP_N_TERMS, country="US"):
    """Celery task wrapper."""
    return run_entity_resolution(top_n, country)
