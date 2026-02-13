"""
Clustering Service — Complaint & Feature Request Clustering.

Groups similar review aspects into clusters using:
1. Sentence-transformer embeddings (384-dim)
2. HDBSCAN density-based clustering (no need to specify k)
3. TF-IDF top terms for auto-labeling clusters

Designed for:
- Complaint clustering: group negative aspects into themes
- Feature request clustering: group wishes into product opportunities
"""
import re
from typing import Optional
from dataclasses import dataclass, field
from collections import Counter

import numpy as np
import structlog

logger = structlog.get_logger()


@dataclass
class ClusterResult:
    cluster_id: int
    label: str
    size: int
    representative_texts: list[str] = field(default_factory=list)
    top_keywords: list[str] = field(default_factory=list)
    avg_sentiment: Optional[float] = None


@dataclass
class ClusteringOutput:
    clusters: list[ClusterResult]
    noise_count: int              # texts that didn't fit any cluster
    total_processed: int
    labels: list[int]             # cluster label per input text (-1 = noise)


def _extract_top_keywords(texts: list[str], top_n: int = 5) -> list[str]:
    """Extract top keywords from a list of texts using simple word frequency."""
    # Stopwords
    stopwords = {
        "the", "a", "an", "is", "it", "its", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "to", "of", "in",
        "for", "on", "with", "at", "by", "from", "as", "into", "about",
        "that", "this", "these", "those", "i", "my", "me", "we", "our",
        "you", "your", "he", "she", "they", "them", "their", "and", "or",
        "but", "not", "no", "so", "if", "very", "just", "also", "too",
        "more", "much", "than", "then", "when", "what", "how", "all",
        "each", "every", "both", "some", "any", "other", "after", "before",
        "one", "two", "first", "get", "got", "like", "even", "only",
        "really", "still", "well", "back", "up", "out", "use", "used",
        "product", "item", "thing", "bought", "purchase", "amazon",
    }

    word_counts = Counter()
    for text in texts:
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        word_counts.update(w for w in words if w not in stopwords)

    return [word for word, _ in word_counts.most_common(top_n)]


def _auto_label_cluster(texts: list[str], keywords: list[str]) -> str:
    """Generate a human-readable label for a cluster from its keywords."""
    if not keywords:
        return "Miscellaneous"

    # Capitalize and join top 2-3 keywords
    label_words = keywords[:3]
    return " / ".join(w.capitalize() for w in label_words)


def cluster_texts(
    texts: list[str],
    embeddings: list[list[float]],
    min_cluster_size: int = 3,
    min_samples: int = 2,
    max_representatives: int = 3,
    sentiment_scores: Optional[list[float]] = None,
) -> ClusteringOutput:
    """
    Cluster texts using HDBSCAN on pre-computed embeddings.

    Args:
        texts: List of text strings to cluster
        embeddings: Pre-computed embeddings (384-dim each)
        min_cluster_size: Minimum texts to form a cluster (HDBSCAN param)
        min_samples: Core point threshold (HDBSCAN param)
        max_representatives: Max representative texts per cluster
        sentiment_scores: Optional sentiment scores per text

    Returns:
        ClusteringOutput with clusters, noise count, and per-text labels
    """
    if not texts or not embeddings:
        return ClusteringOutput(clusters=[], noise_count=0, total_processed=0, labels=[])

    # Filter out empty embeddings
    valid_indices = [i for i, emb in enumerate(embeddings) if len(emb) > 0]
    if len(valid_indices) < min_cluster_size:
        logger.warning("clustering: not enough valid embeddings",
                       valid=len(valid_indices), required=min_cluster_size)
        return ClusteringOutput(
            clusters=[], noise_count=len(texts),
            total_processed=len(texts), labels=[-1] * len(texts)
        )

    valid_texts = [texts[i] for i in valid_indices]
    valid_embeddings = np.array([embeddings[i] for i in valid_indices])
    valid_sentiments = [sentiment_scores[i] for i in valid_indices] if sentiment_scores else None

    try:
        import hdbscan

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric="euclidean",
            cluster_selection_method="eom",
        )
        cluster_labels = clusterer.fit_predict(valid_embeddings)

    except ImportError:
        logger.error("clustering: hdbscan not installed")
        return ClusteringOutput(
            clusters=[], noise_count=len(texts),
            total_processed=len(texts), labels=[-1] * len(texts)
        )
    except Exception as e:
        logger.error("clustering: HDBSCAN failed", error=str(e))
        return ClusteringOutput(
            clusters=[], noise_count=len(texts),
            total_processed=len(texts), labels=[-1] * len(texts)
        )

    # Build full labels array (map valid indices back to all texts)
    full_labels = [-1] * len(texts)
    for idx, valid_idx in enumerate(valid_indices):
        full_labels[valid_idx] = int(cluster_labels[idx])

    # Aggregate clusters
    unique_labels = set(cluster_labels)
    unique_labels.discard(-1)
    noise_count = int(np.sum(cluster_labels == -1))

    clusters = []
    for cid in sorted(unique_labels):
        mask = cluster_labels == cid
        cluster_texts_list = [valid_texts[i] for i in range(len(valid_texts)) if mask[i]]
        cluster_embeddings = valid_embeddings[mask]

        # Top keywords
        keywords = _extract_top_keywords(cluster_texts_list)

        # Auto-label
        label = _auto_label_cluster(cluster_texts_list, keywords)

        # Representative texts (closest to centroid)
        centroid = cluster_embeddings.mean(axis=0)
        distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
        top_indices = np.argsort(distances)[:max_representatives]
        representatives = [cluster_texts_list[i] for i in top_indices]

        # Average sentiment
        avg_sent = None
        if valid_sentiments:
            cluster_sentiments = [valid_sentiments[i] for i in range(len(valid_texts)) if mask[i]]
            cluster_sentiments = [s for s in cluster_sentiments if s is not None]
            if cluster_sentiments:
                avg_sent = round(sum(cluster_sentiments) / len(cluster_sentiments), 4)

        clusters.append(ClusterResult(
            cluster_id=int(cid),
            label=label,
            size=len(cluster_texts_list),
            representative_texts=representatives,
            top_keywords=keywords,
            avg_sentiment=avg_sent,
        ))

    # Sort by size descending
    clusters.sort(key=lambda c: c.size, reverse=True)

    logger.info("clustering: complete",
                total=len(texts), clusters=len(clusters), noise=noise_count)

    return ClusteringOutput(
        clusters=clusters,
        noise_count=noise_count,
        total_processed=len(texts),
        labels=full_labels,
    )
