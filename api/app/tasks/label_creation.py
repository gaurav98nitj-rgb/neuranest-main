"""
NeuraNest — Label Creation Pipeline
=====================================
Creates ML training labels from Amazon Brand Analytics rank trajectories.

Label Definition (from Blueprint v4.0):
  - SUCCESS (1): Search term improved rank by >70% over 6 months
  - FAILURE (0): Stable or declining rank over 6 months

Additional label variants for different model targets:
  - Binary: success/failure (primary)
  - Multi-class: breakout / growth / stable / decline / collapse
  - Regression: continuous rank improvement ratio
  - Top-100 entry: did the term enter top 100 from outside?

Training Strategy (from Blueprint):
  1. For each outcome at time T, compute features at T-6 and T-12 months
  2. Temporal split: Train on months 1-18, validate 19-21, test 22-24
  3. No data leakage: only use information available BEFORE the outcome

Usage:
    from app.tasks.label_creation import create_labels
    result = create_labels(country='US')
"""

import logging
import time
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database import sync_engine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# Primary label: >70% rank improvement over 6 months = success
RANK_IMPROVEMENT_THRESHOLD = 0.70  # 70% improvement

# Minimum rank to be considered (filter out ultra-long-tail terms)
MIN_STARTING_RANK = 50000  # Must start within top 50K to be considered
MAX_STARTING_RANK = 100     # If already in top 100, it's not a "breakout"

# Multi-class thresholds
BREAKOUT_THRESHOLD = 0.85   # >85% improvement = breakout
GROWTH_THRESHOLD = 0.30     # 30-70% improvement = growth
DECLINE_THRESHOLD = -0.20   # >20% rank worsening = decline
COLLAPSE_THRESHOLD = -0.50  # >50% rank worsening = collapse

# Lookback windows for features
FEATURE_LOOKBACK_MONTHS = [6, 12]

# Temporal split boundaries (month offsets from start of data)
# With 24 months of data (e.g., Feb 2024 - Jan 2026):
#   Train: months 1-18 (Feb 2024 - Jul 2025)
#   Validate: months 19-21 (Aug 2025 - Oct 2025)
#   Test: months 22-24 (Nov 2025 - Jan 2026)
TRAIN_MONTHS = 18
VALIDATE_MONTHS = 3
TEST_MONTHS = 3


# ---------------------------------------------------------------------------
# LABEL COMPUTATION
# ---------------------------------------------------------------------------

def _compute_rank_trajectory(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each topic at each month, compute forward-looking rank change.

    This is the OUTCOME we're predicting. For training, we look at what
    happened AFTER the feature observation date.

    Returns DataFrame with columns:
        topic_id, outcome_month, starting_rank, ending_rank,
        rank_change_abs, rank_improvement_ratio, rank_improved
    """
    # Aggregate to topic-month level (mean rank across all search terms)
    topic_monthly = df.groupby(['topic_id', 'report_month']).agg(
        mean_rank=('search_frequency_rank', 'mean'),
        min_rank=('search_frequency_rank', 'min'),
        median_rank=('search_frequency_rank', 'median'),
        term_count=('search_term', 'nunique'),
    ).reset_index()

    topic_monthly = topic_monthly.sort_values(['topic_id', 'report_month'])

    results = []
    for topic_id, grp in topic_monthly.groupby('topic_id'):
        grp = grp.sort_values('report_month').reset_index(drop=True)

        for i in range(len(grp)):
            # Look 6 months forward for the outcome
            future_idx = i + 6
            if future_idx >= len(grp):
                continue  # Not enough forward data

            starting_rank = grp.iloc[i]['mean_rank']
            ending_rank = grp.iloc[future_idx]['mean_rank']
            outcome_month = grp.iloc[future_idx]['report_month']
            feature_month = grp.iloc[i]['report_month']

            # Skip if starting rank is too extreme
            if starting_rank < MAX_STARTING_RANK:
                continue  # Already in top 100, not a prediction target
            if starting_rank > MIN_STARTING_RANK:
                continue  # Too far in long tail

            # Rank improvement: lower rank number = better
            # improvement_ratio = (start - end) / start
            # Positive = improved, Negative = worsened
            if starting_rank > 0:
                improvement_ratio = (starting_rank - ending_rank) / starting_rank
            else:
                improvement_ratio = 0.0

            results.append({
                'topic_id': topic_id,
                'feature_month': feature_month,
                'outcome_month': outcome_month,
                'starting_rank': starting_rank,
                'ending_rank': ending_rank,
                'rank_change_abs': starting_rank - ending_rank,
                'rank_improvement_ratio': improvement_ratio,
                'term_count_at_start': grp.iloc[i]['term_count'],
                'min_rank_at_start': grp.iloc[i]['min_rank'],
            })

    return pd.DataFrame(results)


def assign_binary_labels(trajectories: pd.DataFrame) -> pd.DataFrame:
    """
    Assign binary success/failure labels.
    SUCCESS (1): rank improved by >70% over 6 months
    FAILURE (0): everything else
    """
    df = trajectories.copy()
    df['label_binary'] = (df['rank_improvement_ratio'] >= RANK_IMPROVEMENT_THRESHOLD).astype(int)
    return df


def assign_multiclass_labels(trajectories: pd.DataFrame) -> pd.DataFrame:
    """
    Assign multi-class labels for finer-grained prediction.

    Classes:
        4 = BREAKOUT:  >85% rank improvement
        3 = GROWTH:    30-85% improvement
        2 = STABLE:    -20% to +30% change
        1 = DECLINE:   -20% to -50% worsening
        0 = COLLAPSE:  >50% worsening
    """
    df = trajectories.copy()
    conditions = [
        df['rank_improvement_ratio'] >= BREAKOUT_THRESHOLD,
        df['rank_improvement_ratio'] >= GROWTH_THRESHOLD,
        df['rank_improvement_ratio'] >= DECLINE_THRESHOLD,
        df['rank_improvement_ratio'] >= COLLAPSE_THRESHOLD,
    ]
    choices = [4, 3, 2, 1]
    df['label_multiclass'] = np.select(conditions, choices, default=0)
    df['label_class_name'] = np.select(
        conditions,
        ['BREAKOUT', 'GROWTH', 'STABLE', 'DECLINE'],
        default='COLLAPSE'
    )
    return df


def assign_top100_labels(trajectories: pd.DataFrame) -> pd.DataFrame:
    """
    Special label: did the topic enter the top 100?
    Particularly valuable for identifying breakout opportunities.
    """
    df = trajectories.copy()
    df['label_entered_top100'] = (
        (df['starting_rank'] > 100) & (df['ending_rank'] <= 100)
    ).astype(int)
    return df


def assign_temporal_splits(
    labeled_df: pd.DataFrame,
    train_end_offset: int = TRAIN_MONTHS,
    val_end_offset: int = TRAIN_MONTHS + VALIDATE_MONTHS,
) -> pd.DataFrame:
    """
    Assign train/validate/test splits based on temporal ordering.
    No data leakage: future data never appears in training.

    Split Logic:
        - Sort all outcome_months chronologically
        - First 18 months of outcomes → TRAIN
        - Next 3 months → VALIDATE
        - Last 3 months → TEST
    """
    df = labeled_df.copy()

    # Get sorted unique outcome months
    unique_months = sorted(df['outcome_month'].unique())
    n_months = len(unique_months)

    if n_months < 6:
        logger.warning(f"Only {n_months} outcome months available. "
                       f"Assigning all to train for now.")
        df['split'] = 'train'
        return df

    # Compute split boundaries
    # Use proportional splits if fewer than expected months
    train_end_idx = min(train_end_offset, int(n_months * 0.7))
    val_end_idx = min(val_end_offset, int(n_months * 0.85))

    train_months = set(unique_months[:train_end_idx])
    val_months = set(unique_months[train_end_idx:val_end_idx])
    test_months = set(unique_months[val_end_idx:])

    df['split'] = 'test'  # default
    df.loc[df['outcome_month'].isin(train_months), 'split'] = 'train'
    df.loc[df['outcome_month'].isin(val_months), 'split'] = 'validate'

    logger.info(f"Temporal splits: "
                f"train={len(train_months)} months ({len(df[df['split']=='train'])} samples), "
                f"validate={len(val_months)} months ({len(df[df['split']=='validate'])} samples), "
                f"test={len(test_months)} months ({len(df[df['split']=='test'])} samples)")

    return df


# ---------------------------------------------------------------------------
# FEATURE-LABEL ALIGNMENT
# ---------------------------------------------------------------------------

def align_features_with_labels(
    labels_df: pd.DataFrame,
    feature_store_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Align point-in-time features with labels.

    For each labeled outcome at time T, fetch features from time T-6
    (the feature_month). This ensures no data leakage: we only use
    information that was available BEFORE the outcome occurred.

    Returns a training-ready DataFrame with features + labels + split.
    """
    if labels_df.empty or feature_store_df.empty:
        logger.warning("Empty labels or features — cannot align.")
        return pd.DataFrame()

    # Merge features at the feature_month (T-6) with labels at outcome_month (T)
    merged = labels_df.merge(
        feature_store_df,
        left_on=['topic_id', 'feature_month'],
        right_on=['topic_id', 'month'],
        how='inner',
        suffixes=('', '_feat')
    )

    # Drop the redundant month column
    merged = merged.drop(columns=['month'], errors='ignore')

    feature_cols = [c for c in feature_store_df.columns
                    if c not in ['topic_id', 'month']]
    label_cols = ['label_binary', 'label_multiclass', 'label_class_name',
                  'label_entered_top100', 'rank_improvement_ratio']
    meta_cols = ['topic_id', 'feature_month', 'outcome_month', 'split',
                 'starting_rank', 'ending_rank', 'rank_change_abs',
                 'term_count_at_start']

    # Keep only relevant columns
    keep_cols = [c for c in meta_cols + label_cols + feature_cols if c in merged.columns]
    merged = merged[keep_cols]

    logger.info(f"Aligned dataset: {len(merged):,} samples, "
                f"{len(feature_cols)} features, "
                f"{merged['topic_id'].nunique()} topics")

    return merged


# ---------------------------------------------------------------------------
# MAIN ORCHESTRATOR
# ---------------------------------------------------------------------------

def create_labels(
    country: str = 'US',
    save_to_db: bool = True,
    feature_store_df: Optional[pd.DataFrame] = None,
) -> dict:
    """
    Create training labels from Amazon BA data.

    Pipeline:
    1. Extract Amazon BA data with topic links
    2. Compute 6-month forward rank trajectories
    3. Assign binary + multi-class + top-100 labels
    4. Assign temporal train/validate/test splits
    5. Optionally align with feature store
    6. Save to database

    Args:
        country: Country code for Amazon BA data
        save_to_db: Whether to persist labels to PostgreSQL
        feature_store_df: Pre-computed feature store (optional — if None,
                          loads from temporal_features table)

    Returns:
        dict with label statistics and optionally the aligned DataFrame
    """
    start_time = time.time()
    logger.info(f"Creating training labels for country={country}")

    # ---- 1. Extract Amazon BA data ----
    query = """
    SELECT
        ba.topic_id,
        ba.report_month,
        ba.search_term,
        ba.search_frequency_rank
    FROM amazon_brand_analytics ba
    WHERE ba.country = :country
      AND ba.topic_id IS NOT NULL
      AND ba.search_frequency_rank IS NOT NULL
    ORDER BY ba.topic_id, ba.report_month
    """
    with sync_engine.connect() as conn:
        raw = pd.read_sql(text(query), conn, params={'country': country})

    logger.info(f"Extracted {len(raw):,} BA rows for {raw['topic_id'].nunique()} topics")

    if raw.empty:
        return {'status': 'no_data', 'labels': 0}

    # ---- 2. Compute rank trajectories ----
    logger.info("Computing 6-month rank trajectories...")
    trajectories = _compute_rank_trajectory(raw)
    logger.info(f"Computed {len(trajectories):,} trajectory samples")

    if trajectories.empty:
        return {'status': 'insufficient_data',
                'message': 'Need 6+ months of data per topic for labels'}

    # ---- 3. Assign labels ----
    logger.info("Assigning labels...")
    labeled = assign_binary_labels(trajectories)
    labeled = assign_multiclass_labels(labeled)
    labeled = assign_top100_labels(labeled)

    # ---- 4. Temporal splits ----
    logger.info("Assigning temporal splits...")
    labeled = assign_temporal_splits(labeled)

    # ---- 5. Statistics ----
    n_success = labeled['label_binary'].sum()
    n_failure = len(labeled) - n_success
    n_top100 = labeled['label_entered_top100'].sum()

    class_dist = labeled['label_class_name'].value_counts().to_dict()
    split_dist = labeled['split'].value_counts().to_dict()

    logger.info(f"Label distribution:")
    logger.info(f"  Binary: {n_success} success ({n_success/len(labeled)*100:.1f}%), "
                f"{n_failure} failure ({n_failure/len(labeled)*100:.1f}%)")
    logger.info(f"  Multi-class: {class_dist}")
    logger.info(f"  Top-100 entries: {n_top100}")
    logger.info(f"  Splits: {split_dist}")

    # ---- 6. Align with features (if available) ----
    aligned_df = None
    if feature_store_df is not None:
        logger.info("Aligning with provided feature store...")
        aligned_df = align_features_with_labels(labeled, feature_store_df)
    else:
        # Try to load from temporal_features table
        try:
            with sync_engine.connect() as conn:
                check = conn.execute(text(
                    "SELECT COUNT(*) FROM temporal_features WHERE country = :country"
                ), {'country': country}).scalar()
                if check and check > 0:
                    logger.info(f"Loading {check:,} rows from temporal_features table...")
                    tf_df = pd.read_sql(text("""
                        SELECT topic_id, month, features
                        FROM temporal_features
                        WHERE country = :country
                    """), conn, params={'country': country})

                    # Expand JSONB features into columns
                    if not tf_df.empty:
                        features_expanded = pd.json_normalize(tf_df['features'])
                        tf_df = pd.concat([
                            tf_df[['topic_id', 'month']],
                            features_expanded
                        ], axis=1)
                        aligned_df = align_features_with_labels(labeled, tf_df)
        except Exception as e:
            logger.warning(f"Could not load temporal features: {e}")

    # ---- 7. Save to database ----
    if save_to_db:
        _save_labels_to_db(labeled, country)

    elapsed = time.time() - start_time

    result = {
        'status': 'success',
        'total_samples': len(labeled),
        'success_count': int(n_success),
        'failure_count': int(n_failure),
        'success_rate': round(n_success / len(labeled) * 100, 1),
        'top100_entries': int(n_top100),
        'class_distribution': class_dist,
        'split_distribution': split_dist,
        'topics': int(labeled['topic_id'].nunique()),
        'month_range': f"{labeled['feature_month'].min()} to {labeled['outcome_month'].max()}",
        'elapsed_seconds': round(elapsed, 1),
    }

    if aligned_df is not None and not aligned_df.empty:
        result['aligned_samples'] = len(aligned_df)
        result['aligned_features'] = len([c for c in aligned_df.columns
                                          if c not in ['topic_id', 'feature_month',
                                                       'outcome_month', 'split']])
        result['aligned_df'] = aligned_df

    return result


def _save_labels_to_db(df: pd.DataFrame, country: str):
    """Save labels to ml_training_labels table."""
    create_sql = """
    CREATE TABLE IF NOT EXISTS ml_training_labels (
        id SERIAL PRIMARY KEY,
        topic_id UUID NOT NULL,
        feature_month DATE NOT NULL,
        outcome_month DATE NOT NULL,
        country VARCHAR(10) DEFAULT 'US',
        starting_rank FLOAT,
        ending_rank FLOAT,
        rank_improvement_ratio FLOAT,
        label_binary INTEGER NOT NULL,
        label_multiclass INTEGER NOT NULL,
        label_class_name VARCHAR(20),
        label_entered_top100 INTEGER DEFAULT 0,
        split VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(topic_id, feature_month, outcome_month, country)
    );
    CREATE INDEX IF NOT EXISTS idx_mtl_split ON ml_training_labels(split);
    CREATE INDEX IF NOT EXISTS idx_mtl_topic ON ml_training_labels(topic_id);
    CREATE INDEX IF NOT EXISTS idx_mtl_label ON ml_training_labels(label_binary);
    """

    with sync_engine.begin() as conn:
        conn.execute(text(create_sql))

        batch_size = 1000
        total = 0
        for start in range(0, len(df), batch_size):
            batch = df.iloc[start:start + batch_size]
            for _, row in batch.iterrows():
                conn.execute(text("""
                    INSERT INTO ml_training_labels
                    (topic_id, feature_month, outcome_month, country,
                     starting_rank, ending_rank, rank_improvement_ratio,
                     label_binary, label_multiclass, label_class_name,
                     label_entered_top100, split)
                    VALUES (:topic_id, :feature_month, :outcome_month, :country,
                            :starting_rank, :ending_rank, :rank_improvement_ratio,
                            :label_binary, :label_multiclass, :label_class_name,
                            :label_entered_top100, :split)
                    ON CONFLICT (topic_id, feature_month, outcome_month, country)
                    DO UPDATE SET
                        starting_rank = :starting_rank,
                        ending_rank = :ending_rank,
                        rank_improvement_ratio = :rank_improvement_ratio,
                        label_binary = :label_binary,
                        label_multiclass = :label_multiclass,
                        label_class_name = :label_class_name,
                        label_entered_top100 = :label_entered_top100,
                        split = :split
                """), {
                    'topic_id': str(row['topic_id']),
                    'feature_month': row['feature_month'],
                    'outcome_month': row['outcome_month'],
                    'country': country,
                    'starting_rank': float(row['starting_rank']),
                    'ending_rank': float(row['ending_rank']),
                    'rank_improvement_ratio': float(row['rank_improvement_ratio']),
                    'label_binary': int(row['label_binary']),
                    'label_multiclass': int(row['label_multiclass']),
                    'label_class_name': row.get('label_class_name', 'UNKNOWN'),
                    'label_entered_top100': int(row.get('label_entered_top100', 0)),
                    'split': row['split'],
                })
                total += 1

        logger.info(f"Saved {total:,} labels to ml_training_labels")


# ---------------------------------------------------------------------------
# CELERY TASK WRAPPER
# ---------------------------------------------------------------------------

try:
    from app.celery_app import celery_app

    @celery_app.task(name='create_training_labels')
    def create_labels_task(country: str = 'US'):
        return create_labels(country=country, save_to_db=True)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# CLI ENTRYPOINT
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    result = create_labels(country='US', save_to_db=True)
    print(f"\n=== LABEL CREATION RESULTS ===")
    for k, v in result.items():
        if k not in ('aligned_df', 'feature_names'):
            print(f"  {k}: {v}")
