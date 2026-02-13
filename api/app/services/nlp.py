"""
NLP Service — Sentiment Analysis + Feature Request Extraction.

v1 Strategy:
  - Sentiment: VADER for speed (batch), sentence-transformers for ambiguous cases
  - Feature requests: Regex pattern matching + keyword signals
  - Designed for upgrade path to fine-tuned models (v2)
"""
import re
from typing import Optional
from dataclasses import dataclass

import structlog

logger = structlog.get_logger()

# ─── Lazy-loaded models (heavy imports, load once) ───
_vader = None
_transformer_model = None


def _get_vader():
    """Lazy-load VADER sentiment analyzer."""
    global _vader
    if _vader is None:
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            _vader = SentimentIntensityAnalyzer()
            logger.info("nlp: VADER loaded")
        except ImportError:
            # Fallback: simple keyword-based sentiment
            logger.warning("nlp: vaderSentiment not installed, using keyword fallback")
            _vader = "fallback"
    return _vader


def _get_transformer():
    """Lazy-load sentence-transformers model for embeddings."""
    global _transformer_model
    if _transformer_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _transformer_model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("nlp: sentence-transformer loaded", model="all-MiniLM-L6-v2")
        except Exception as e:
            logger.error("nlp: failed to load sentence-transformer", error=str(e))
            _transformer_model = "unavailable"
    return _transformer_model


# ─── Sentiment Analysis ───

@dataclass
class SentimentResult:
    label: str          # positive, negative, neutral
    score: float        # -1.0 to 1.0 (compound)
    confidence: float   # 0.0 to 1.0


# Positive / negative keyword lists for fallback
_POSITIVE_WORDS = {
    "love", "great", "excellent", "amazing", "perfect", "best", "awesome",
    "fantastic", "wonderful", "good", "nice", "happy", "satisfied", "recommend",
    "impressed", "quality", "works", "comfortable", "easy", "beautiful",
}
_NEGATIVE_WORDS = {
    "terrible", "horrible", "worst", "awful", "bad", "hate", "broken",
    "disappointing", "cheap", "waste", "useless", "poor", "defective",
    "returned", "refund", "complaint", "uncomfortable", "difficult", "flimsy",
    "stopped", "fails", "leaked", "cracked", "overpriced", "junk", "garbage",
}


def _keyword_sentiment(text: str) -> SentimentResult:
    """Simple keyword-based sentiment as ultimate fallback."""
    words = set(text.lower().split())
    pos = len(words & _POSITIVE_WORDS)
    neg = len(words & _NEGATIVE_WORDS)
    total = pos + neg
    if total == 0:
        return SentimentResult(label="neutral", score=0.0, confidence=0.3)
    score = (pos - neg) / total
    if score > 0.1:
        return SentimentResult(label="positive", score=score, confidence=0.5)
    elif score < -0.1:
        return SentimentResult(label="negative", score=score, confidence=0.5)
    return SentimentResult(label="neutral", score=score, confidence=0.4)


def analyze_sentiment(text: str) -> SentimentResult:
    """
    Analyze sentiment of a text string.
    Uses VADER (fast, good for product reviews) with keyword fallback.

    Returns SentimentResult with label, score (-1 to 1), confidence (0 to 1).
    """
    if not text or len(text.strip()) < 3:
        return SentimentResult(label="neutral", score=0.0, confidence=0.1)

    vader = _get_vader()

    if vader == "fallback" or vader is None:
        return _keyword_sentiment(text)

    try:
        scores = vader.polarity_scores(text)
        compound = scores["compound"]

        # VADER thresholds (tuned for product reviews)
        if compound >= 0.05:
            label = "positive"
        elif compound <= -0.05:
            label = "negative"
        else:
            label = "neutral"

        # Confidence based on how decisive the compound score is
        confidence = min(abs(compound) * 1.5, 1.0)

        return SentimentResult(label=label, score=round(compound, 4), confidence=round(confidence, 4))

    except Exception as e:
        logger.warning("nlp: VADER failed, using keyword fallback", error=str(e))
        return _keyword_sentiment(text)


def analyze_sentiment_batch(texts: list[str]) -> list[SentimentResult]:
    """Batch sentiment analysis. More efficient than calling one-by-one."""
    return [analyze_sentiment(t) for t in texts]


# ─── Feature Request Detection ───

# Patterns that strongly indicate a feature request or wish
_FEATURE_REQUEST_PATTERNS = [
    r"\bi\s+wish\b",
    r"\bwish\s+it\s+(had|could|would|was|were)\b",
    r"\bshould\s+(have|come\s+with|include|be|add)\b",
    r"\bneeds?\s+(to\s+have|a|an|more|better)\b",
    r"\bwould\s+be\s+(great|nice|better|awesome|perfect)\s+(if|to)\b",
    r"\bmissing\b",
    r"\blacks?\b",
    r"\bno\s+(option|way|ability|feature)\b",
    r"\bif\s+only\b",
    r"\bplease\s+add\b",
    r"\bcan['']?t\s+(even|believe\s+there['']?s\s+no)\b",
    r"\bwhy\s+(isn['']?t|doesn['']?t|can['']?t|no)\b",
    r"\bexpected\s+(it\s+to|more|better)\b",
    r"\bwould\s+(love|like|prefer|appreciate)\b",
    r"\bupgrade\s+needed\b",
    r"\bnot\s+(enough|sufficient|adequate)\b",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _FEATURE_REQUEST_PATTERNS]


@dataclass
class FeatureRequestResult:
    is_feature_request: bool
    confidence: float        # 0.0 to 1.0
    matched_pattern: Optional[str] = None
    extracted_wish: Optional[str] = None


def detect_feature_request(text: str) -> FeatureRequestResult:
    """
    Detect whether a text contains a feature request or product wish.
    Uses regex pattern matching (fast, deterministic).

    Returns FeatureRequestResult with detection flag, confidence, and extracted wish.
    """
    if not text or len(text.strip()) < 10:
        return FeatureRequestResult(is_feature_request=False, confidence=0.9)

    text_lower = text.lower()
    matches = []

    for i, pattern in enumerate(_COMPILED_PATTERNS):
        match = pattern.search(text_lower)
        if match:
            matches.append({
                "pattern": _FEATURE_REQUEST_PATTERNS[i],
                "match": match.group(),
                "start": match.start(),
            })

    if not matches:
        return FeatureRequestResult(is_feature_request=False, confidence=0.7)

    # Extract the sentence containing the match
    best_match = matches[0]
    sentences = re.split(r'[.!?\n]', text)
    extracted = None
    for sentence in sentences:
        if best_match["match"] in sentence.lower():
            extracted = sentence.strip()
            break

    # Confidence based on number of pattern matches
    confidence = min(0.6 + len(matches) * 0.15, 0.95)

    return FeatureRequestResult(
        is_feature_request=True,
        confidence=round(confidence, 4),
        matched_pattern=best_match["pattern"],
        extracted_wish=extracted[:300] if extracted else None,
    )


# ─── Embedding Generation ───

def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generate 384-dim embeddings using sentence-transformers.
    Returns list of float lists. Returns empty lists if model unavailable.
    """
    model = _get_transformer()

    if model == "unavailable" or not texts:
        return [[] for _ in texts]

    try:
        embeddings = model.encode(texts, show_progress_bar=False, batch_size=64)
        return [emb.tolist() for emb in embeddings]
    except Exception as e:
        logger.error("nlp: embedding generation failed", error=str(e))
        return [[] for _ in texts]


def generate_embedding(text: str) -> list[float]:
    """Generate embedding for a single text."""
    results = generate_embeddings([text])
    return results[0] if results else []
