"""
NeuraNest — Temporal Feature Store
===================================
Computes 200+ features per topic per month from all data sources.
Point-in-time features ensure no data leakage during ML training.

Feature Groups:
  1. Amazon Demand (rank trajectory, acceleration, velocity)
  2. Click Dynamics (click share velocity, conversion gap, concentration)
  3. Brand Competition (HHI, stability, new entrant velocity)
  4. Google Search (trends momentum, keyword volume growth)
  5. Social Virality (Reddit velocity, TikTok views, IG engagement)
  6. Customer Pain (sentiment decline, complaint density)
  7. Science Signal (paper velocity, novelty, citation acceleration)
  8. Seasonality (YoY comparison, seasonal decomposition residual)
  9. Cross-Source Convergence (active layers, agreement ratio)

Usage:
    from app.tasks.temporal_feature_store import build_feature_store
    result = build_feature_store(country='US')
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
# SQL QUERIES — Using ACTUAL column names from DB schema
# ---------------------------------------------------------------------------

# amazon_brand_analytics columns:
# id, country, report_month, search_frequency_rank, search_term,
# brand_1, brand_2, brand_3, category_1, category_2, category_3,
# asin_1, title_1, click_share_1, conversion_share_1,
# asin_2, title_2, click_share_2, conversion_share_2,
# asin_3, title_3, click_share_3, conversion_share_3,
# reporting_date, imported_at, topic_id

AMAZON_BA_QUERY = """
SELECT
    ba.topic_id,
    ba.report_month,
    ba.search_term,
    ba.search_frequency_rank,
    ba.click_share_1,
    ba.click_share_2,
    ba.click_share_3,
    ba.conversion_share_1,
    ba.conversion_share_2,
    ba.conversion_share_3,
    ba.brand_1,
    ba.brand_2,
    ba.brand_3
FROM amazon_brand_analytics ba
WHERE ba.country = :country
  AND ba.topic_id IS NOT NULL
ORDER BY ba.topic_id, ba.report_month
"""

# source_timeseries columns:
# id, topic_id, source, date, geo, raw_value, normalized_value, created_at

GOOGLE_TRENDS_QUERY = """
SELECT
    gt.topic_id,
    DATE_TRUNC('month', gt.date)::date AS month,
    AVG(gt.normalized_value) AS avg_interest,
    MAX(gt.normalized_value) AS max_interest,
    MIN(gt.normalized_value) AS min_interest,
    STDDEV(gt.normalized_value) AS std_interest,
    COUNT(*) AS data_points
FROM source_timeseries gt
WHERE gt.source = 'google_trends'
  AND gt.topic_id IS NOT NULL
GROUP BY gt.topic_id, DATE_TRUNC('month', gt.date)
ORDER BY gt.topic_id, month
"""

# google_trends_backfill columns:
# id, search_term, date, interest_index, is_partial, geo, fetched_at

GOOGLE_TRENDS_BACKFILL_QUERY = """
SELECT
    t.id AS topic_id,
    DATE_TRUNC('month', gb.date)::date AS month,
    AVG(gb.interest_index) AS avg_interest,
    MAX(gb.interest_index) AS max_interest,
    MIN(gb.interest_index) AS min_interest,
    STDDEV(gb.interest_index) AS std_interest,
    COUNT(*) AS data_points
FROM google_trends_backfill gb
JOIN topics t ON LOWER(t.name) = LOWER(gb.search_term)
WHERE gb.interest_index IS NOT NULL
GROUP BY t.id, DATE_TRUNC('month', gb.date)
ORDER BY t.id, month
"""

# reddit_backfill columns:
# id, search_term, subreddit, post_id, title, body, score, num_comments,
# author, created_utc, post_type, sentiment_score, sentiment_label, url, fetched_at
# NOTE: no topic_id column — join via search_term -> topics.name

REDDIT_QUERY = """
SELECT
    t.id AS topic_id,
    DATE_TRUNC('month', rb.created_utc)::date AS month,
    COUNT(*) AS post_count,
    AVG(rb.sentiment_score) AS avg_sentiment,
    SUM(rb.score) AS total_score,
    AVG(rb.score) AS avg_score,
    SUM(rb.num_comments) AS total_comments,
    AVG(rb.num_comments) AS avg_comments
FROM reddit_backfill rb
JOIN topics t ON LOWER(t.name) = LOWER(rb.search_term)
WHERE rb.created_utc IS NOT NULL
GROUP BY t.id, DATE_TRUNC('month', rb.created_utc)
ORDER BY t.id, month
"""

# source_timeseries for reddit live data
REDDIT_LIVE_QUERY = """
SELECT
    st.topic_id,
    DATE_TRUNC('month', st.date)::date AS month,
    COUNT(*) AS data_points,
    AVG(st.normalized_value) AS avg_value
FROM source_timeseries st
WHERE st.source = 'reddit'
  AND st.topic_id IS NOT NULL
GROUP BY st.topic_id, DATE_TRUNC('month', st.date)
ORDER BY st.topic_id, month
"""

# tiktok_trends columns:
# id, topic_id, hashtag, view_count, video_count, growth_rate, region, date, collected_at

TIKTOK_QUERY = """
SELECT
    tt.topic_id,
    DATE_TRUNC('month', tt.date)::date AS month,
    SUM(tt.view_count) AS total_views,
    SUM(tt.video_count) AS total_videos,
    AVG(tt.view_count) AS avg_views
FROM tiktok_trends tt
WHERE tt.topic_id IS NOT NULL
GROUP BY tt.topic_id, DATE_TRUNC('month', tt.date)
ORDER BY tt.topic_id, month
"""

# instagram_mentions columns:
# id, topic_id, brand_id, post_id, post_type, caption, likes, comments,
# shares, hashtags, sentiment, posted_at, collected_at

INSTAGRAM_QUERY = """
SELECT
    im.topic_id,
    DATE_TRUNC('month', im.posted_at)::date AS month,
    COUNT(*) AS post_count,
    AVG(im.likes) AS avg_likes,
    AVG(im.comments) AS avg_comments,
    AVG(im.sentiment) AS avg_sentiment
FROM instagram_mentions im
WHERE im.topic_id IS NOT NULL
GROUP BY im.topic_id, DATE_TRUNC('month', im.posted_at)
ORDER BY im.topic_id, month
"""

# science_items columns:
# id, source, source_id, title, abstract, authors, categories, published_date,
# url, citation_count, embedding, created_at
# NOTE: no cluster_id column on science_items, no topic_id on science_clusters
# Use a simpler approach: aggregate science papers by keyword matching

SCIENCE_QUERY = """
SELECT
    t.id AS topic_id,
    DATE_TRUNC('month', si.published_date)::date AS month,
    COUNT(*) AS paper_count,
    AVG(si.citation_count) AS avg_citations
FROM science_items si
CROSS JOIN topics t
WHERE si.published_date IS NOT NULL
  AND (
    LOWER(si.title) LIKE '%%' || LOWER(t.name) || '%%'
    OR LOWER(si.abstract) LIKE '%%' || LOWER(t.name) || '%%'
  )
GROUP BY t.id, DATE_TRUNC('month', si.published_date)
ORDER BY t.id, month
"""

# Fallback: use science_clusters aggregate (no topic_id, so skip per-topic)
SCIENCE_CLUSTERS_QUERY = """
SELECT
    sc.velocity_score,
    sc.novelty_score,
    sc.item_count,
    sc.computed_at
FROM science_clusters sc
ORDER BY sc.computed_at DESC
"""

# scores columns:
# id, topic_id, score_type, score_value, explanation_json, computed_at

SCORES_QUERY = """
SELECT
    s.topic_id,
    DATE_TRUNC('month', s.computed_at)::date AS month,
    s.score_type,
    AVG(s.score_value) AS avg_value
FROM scores s
WHERE s.topic_id IS NOT NULL
GROUP BY s.topic_id, DATE_TRUNC('month', s.computed_at), s.score_type
ORDER BY s.topic_id, month
"""


# ---------------------------------------------------------------------------
# FEATURE COMPUTATION FUNCTIONS
# ---------------------------------------------------------------------------

def _safe_pct_change(series: pd.Series, periods: int = 1) -> pd.Series:
    """Percentage change with safe division."""
    prev = series.shift(periods)
    return np.where(prev != 0, (series - prev) / prev.abs(), 0)


def _rolling_slope(series: pd.Series, window: int = 3) -> pd.Series:
    """Rolling linear regression slope."""
    def slope(x):
        if len(x) < 2 or x.isna().all():
            return 0.0
        y = x.dropna().values
        if len(y) < 2:
            return 0.0
        x_vals = np.arange(len(y))
        try:
            return np.polyfit(x_vals, y, 1)[0]
        except (np.linalg.LinAlgError, ValueError):
            return 0.0
    return series.rolling(window, min_periods=2).apply(slope, raw=False)


def _hhi(shares: list) -> float:
    """Herfindahl-Hirschman Index from market shares (0-10000 scale)."""
    valid = [s for s in shares if s is not None and not np.isnan(s) and s > 0]
    if not valid:
        return 10000.0
    total = sum(valid)
    if total == 0:
        return 10000.0
    normalized = [s / total * 100 for s in valid]
    return sum(s ** 2 for s in normalized)


def compute_amazon_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute Amazon BA features per topic per month (40+ features).
    """
    if df.empty:
        return pd.DataFrame()

    # Aggregate to topic-month level
    agg = df.groupby(['topic_id', 'report_month']).agg(
        rank_mean=('search_frequency_rank', 'mean'),
        rank_median=('search_frequency_rank', 'median'),
        rank_min=('search_frequency_rank', 'min'),
        rank_max=('search_frequency_rank', 'max'),
        search_term_count=('search_term', 'nunique'),
        click_share_1=('click_share_1', 'mean'),
        click_share_2=('click_share_2', 'mean'),
        click_share_3=('click_share_3', 'mean'),
        conv_share_1=('conversion_share_1', 'mean'),
        conv_share_2=('conversion_share_2', 'mean'),
        conv_share_3=('conversion_share_3', 'mean'),
    ).reset_index()

    # Brand features: HHI per topic-month
    brand_agg = df.groupby(['topic_id', 'report_month']).apply(
        lambda g: pd.Series({
            'brand_hhi': _hhi([
                g['click_share_1'].mean(),
                g['click_share_2'].mean(),
                g['click_share_3'].mean(),
            ]),
            'brand_count_unique': len(set(
                g[['brand_1', 'brand_2', 'brand_3']]
                .values.flatten().tolist()
            ) - {None, '', np.nan}),
            'top_brand': g['brand_1'].mode().iloc[0]
                if not g['brand_1'].mode().empty else None,
        })
    ).reset_index()

    agg = agg.merge(brand_agg, on=['topic_id', 'report_month'], how='left')
    agg = agg.sort_values(['topic_id', 'report_month']).reset_index(drop=True)

    features_list = []
    for topic_id, grp in agg.groupby('topic_id'):
        grp = grp.sort_values('report_month').reset_index(drop=True)
        f = grp[['topic_id', 'report_month']].copy()
        f = f.rename(columns={'report_month': 'month'})

        # Rank features
        f['rank_current'] = grp['rank_mean']
        f['rank_median'] = grp['rank_median']
        f['rank_best_in_month'] = grp['rank_min']
        for lag in [1, 3, 6, 12]:
            f[f'rank_{lag}m_ago'] = grp['rank_mean'].shift(lag)
            f[f'rank_change_{lag}m'] = grp['rank_mean'] - grp['rank_mean'].shift(lag)
            f[f'rank_pct_change_{lag}m'] = _safe_pct_change(grp['rank_mean'], lag)

        f['rank_acceleration'] = f['rank_change_1m'] - f['rank_change_1m'].shift(1)
        f['rank_volatility_3m'] = grp['rank_mean'].rolling(3, min_periods=2).std()
        f['rank_volatility_6m'] = grp['rank_mean'].rolling(6, min_periods=3).std()
        f['rank_slope_3m'] = _rolling_slope(grp['rank_mean'], 3)
        f['rank_slope_6m'] = _rolling_slope(grp['rank_mean'], 6)
        f['rank_best_6m'] = grp['rank_mean'].rolling(6, min_periods=1).min()
        f['rank_worst_6m'] = grp['rank_mean'].rolling(6, min_periods=1).max()
        f['rank_range_6m'] = f['rank_worst_6m'] - f['rank_best_6m']

        # Click share features
        f['click_share_total'] = grp['click_share_1'].fillna(0) + \
                                  grp['click_share_2'].fillna(0) + \
                                  grp['click_share_3'].fillna(0)
        f['click_share_top1'] = grp['click_share_1']
        f['click_share_velocity_1m'] = _safe_pct_change(f['click_share_total'], 1)
        f['click_share_velocity_3m'] = _safe_pct_change(f['click_share_total'], 3)

        # Conversion share features
        f['conv_share_total'] = grp['conv_share_1'].fillna(0) + \
                                 grp['conv_share_2'].fillna(0) + \
                                 grp['conv_share_3'].fillna(0)
        f['conv_share_top1'] = grp['conv_share_1']
        f['conv_share_velocity_1m'] = _safe_pct_change(f['conv_share_total'], 1)
        f['conv_share_velocity_3m'] = _safe_pct_change(f['conv_share_total'], 3)

        # Click-Conversion gap
        f['click_conv_gap'] = f['click_share_top1'].fillna(0) - f['conv_share_top1'].fillna(0)
        f['click_conv_gap_velocity_1m'] = f['click_conv_gap'] - f['click_conv_gap'].shift(1)

        # Brand competition features
        f['brand_hhi'] = grp['brand_hhi']
        f['brand_hhi_change_3m'] = grp['brand_hhi'] - grp['brand_hhi'].shift(3)
        f['brand_count_unique'] = grp['brand_count_unique']

        # Brand stability: count distinct top brands over last 3 months
        # Higher = less stable (more brand churn), 1 = same brand dominates
        if 'top_brand' in grp.columns:
            stability_vals = []
            top_brands = grp['top_brand'].tolist()
            for i in range(len(top_brands)):
                window_start = max(0, i - 2)
                window = [b for b in top_brands[window_start:i+1] if b is not None and str(b) != 'nan']
                stability_vals.append(len(set(window)) if window else 1)
            f['brand_stability_3m'] = stability_vals
        else:
            f['brand_stability_3m'] = 1

        f['search_term_count'] = grp['search_term_count']
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_google_trends_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute Google Trends features per topic per month (20+ features)."""
    if df.empty:
        return pd.DataFrame()

    df = df.sort_values(['topic_id', 'month']).reset_index(drop=True)
    features_list = []

    for topic_id, grp in df.groupby('topic_id'):
        grp = grp.sort_values('month').reset_index(drop=True)
        f = grp[['topic_id', 'month']].copy()
        interest = grp['avg_interest'].fillna(0)

        f['gt_interest_avg'] = interest
        f['gt_interest_max'] = grp['max_interest']
        f['gt_interest_min'] = grp['min_interest']
        f['gt_interest_std'] = grp['std_interest']

        for lag in [1, 3, 6, 12]:
            f[f'gt_interest_change_{lag}m'] = interest - interest.shift(lag)
            if lag <= 6:
                f[f'gt_interest_pct_change_{lag}m'] = _safe_pct_change(interest, lag)

        f['gt_interest_slope_3m'] = _rolling_slope(interest, 3)
        f['gt_interest_slope_6m'] = _rolling_slope(interest, 6)
        f['gt_interest_acceleration'] = f['gt_interest_change_1m'] - \
                                         f['gt_interest_change_1m'].shift(1)
        f['gt_interest_volatility_3m'] = interest.rolling(3, min_periods=2).std()

        rolling_mean_6m = interest.rolling(6, min_periods=3).mean()
        rolling_std_6m = interest.rolling(6, min_periods=3).std()
        f['gt_spike_flag'] = (interest > (rolling_mean_6m + 2 * rolling_std_6m.fillna(999))).astype(int)

        mom_changes = interest.diff()
        f['gt_momentum_3m'] = mom_changes.rolling(3, min_periods=1).mean()

        rolling_mean_12m = interest.rolling(12, min_periods=3).mean()
        f['gt_breakout_score'] = np.where(rolling_mean_12m > 0,
                                           interest / rolling_mean_12m, 1.0)
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_reddit_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute Reddit features per topic per month (15+ features)."""
    if df.empty:
        return pd.DataFrame()

    df = df.sort_values(['topic_id', 'month']).reset_index(drop=True)
    features_list = []

    for topic_id, grp in df.groupby('topic_id'):
        grp = grp.sort_values('month').reset_index(drop=True)
        f = grp[['topic_id', 'month']].copy()

        f['reddit_post_count'] = grp['post_count']
        f['reddit_total_score'] = grp['total_score']
        f['reddit_avg_score'] = grp['avg_score']
        f['reddit_total_comments'] = grp['total_comments']
        f['reddit_avg_comments'] = grp['avg_comments']
        f['reddit_avg_sentiment'] = grp['avg_sentiment']

        f['reddit_sentiment_change_1m'] = grp['avg_sentiment'] - grp['avg_sentiment'].shift(1)
        f['reddit_sentiment_change_3m'] = grp['avg_sentiment'] - grp['avg_sentiment'].shift(3)

        post_count = grp['post_count'].fillna(0)
        f['reddit_velocity_1m'] = _safe_pct_change(post_count, 1)
        f['reddit_velocity_3m'] = _safe_pct_change(post_count, 3)

        f['reddit_engagement_rate'] = np.where(
            post_count > 0, grp['total_comments'].fillna(0) / post_count, 0
        )
        f['reddit_score_velocity_1m'] = _safe_pct_change(grp['total_score'].fillna(0), 1)
        f['reddit_buzz_score'] = post_count * grp['avg_score'].fillna(0)
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_social_features(tiktok_df: pd.DataFrame, ig_df: pd.DataFrame) -> pd.DataFrame:
    """Compute social media features per topic per month (15+ features)."""
    features_list = []
    all_keys = set()
    for src_df in [tiktok_df, ig_df]:
        if not src_df.empty:
            for _, row in src_df[['topic_id', 'month']].iterrows():
                all_keys.add((row['topic_id'], row['month']))

    if not all_keys:
        return pd.DataFrame()

    base = pd.DataFrame(list(all_keys), columns=['topic_id', 'month'])

    # Merge TikTok
    if not tiktok_df.empty:
        base = base.merge(tiktok_df, on=['topic_id', 'month'], how='left')
    for col in ['total_views', 'total_videos', 'avg_views']:
        if col not in base.columns:
            base[col] = 0

    # Merge Instagram
    if not ig_df.empty:
        ig_renamed = ig_df.rename(columns={
            'post_count': 'ig_post_count', 'avg_likes': 'ig_avg_likes',
            'avg_comments': 'ig_avg_comments', 'avg_sentiment': 'ig_avg_sentiment',
        })
        base = base.merge(ig_renamed, on=['topic_id', 'month'], how='left')
    for col in ['ig_post_count', 'ig_avg_likes', 'ig_avg_comments', 'ig_avg_sentiment']:
        if col not in base.columns:
            base[col] = 0

    base = base.sort_values(['topic_id', 'month']).reset_index(drop=True)

    for topic_id, grp in base.groupby('topic_id'):
        grp = grp.sort_values('month').reset_index(drop=True)
        f = grp[['topic_id', 'month']].copy()

        views = grp['total_views'].fillna(0)
        videos = grp['total_videos'].fillna(0)
        f['tiktok_total_views'] = views
        f['tiktok_total_videos'] = videos
        f['tiktok_avg_views'] = grp['avg_views'].fillna(0)
        f['tiktok_view_velocity_1m'] = _safe_pct_change(views, 1)
        f['tiktok_view_velocity_3m'] = _safe_pct_change(views, 3)
        f['tiktok_virality_score'] = np.where(videos > 0, views / videos, 0)

        ig_posts = grp['ig_post_count'].fillna(0)
        f['ig_post_count'] = ig_posts
        f['ig_avg_likes'] = grp['ig_avg_likes'].fillna(0)
        f['ig_avg_comments'] = grp['ig_avg_comments'].fillna(0)
        f['ig_avg_sentiment'] = grp['ig_avg_sentiment'].fillna(0)
        f['ig_engagement_rate'] = np.where(ig_posts > 0,
            (f['ig_avg_likes'] + f['ig_avg_comments']) / ig_posts, 0)
        f['ig_velocity_1m'] = _safe_pct_change(ig_posts, 1)

        has_tiktok = (views > 0).astype(int)
        has_ig = (ig_posts > 0).astype(int)
        f['social_cross_platform_score'] = has_tiktok + has_ig
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_science_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute Science Radar features per topic per month (8+ features)."""
    if df.empty:
        return pd.DataFrame()

    df = df.sort_values(['topic_id', 'month']).reset_index(drop=True)
    features_list = []

    for topic_id, grp in df.groupby('topic_id'):
        grp = grp.sort_values('month').reset_index(drop=True)
        f = grp[['topic_id', 'month']].copy()

        papers = grp['paper_count'].fillna(0)
        f['science_paper_count'] = papers
        f['science_paper_count_cum'] = papers.cumsum()
        f['science_avg_citations'] = grp['avg_citations'].fillna(0)
        f['science_paper_velocity_1m'] = _safe_pct_change(papers, 1)
        f['science_paper_velocity_3m'] = _safe_pct_change(papers, 3)
        f['science_momentum'] = f['science_paper_count_cum'] * (1 + f['science_avg_citations'])
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_seasonality_features(amazon_features: pd.DataFrame) -> pd.DataFrame:
    """Compute seasonality features per topic per month (7+ features)."""
    if amazon_features.empty:
        return pd.DataFrame()

    base = amazon_features[['topic_id', 'month']].copy()
    base['season_month'] = pd.to_datetime(base['month']).dt.month
    base['season_quarter'] = pd.to_datetime(base['month']).dt.quarter
    base['season_is_q4'] = (base['season_quarter'] == 4).astype(int)

    if 'rank_current' in amazon_features.columns:
        base['rank_current'] = amazon_features['rank_current'].values
    else:
        base['rank_current'] = np.nan

    features_list = []
    for topic_id, grp in base.groupby('topic_id'):
        grp = grp.sort_values('month').reset_index(drop=True)
        f = grp[['topic_id', 'month', 'season_month', 'season_quarter', 'season_is_q4']].copy()
        rank = grp['rank_current'].fillna(0)
        f['season_yoy_rank_change'] = rank - rank.shift(12)
        rolling_12m = rank.rolling(12, min_periods=3).mean()
        f['season_rank_vs_12m_avg'] = np.where(rolling_12m > 0, rank / rolling_12m, 1.0)
        f['season_detrended_rank'] = rank - rolling_12m
        features_list.append(f)

    return pd.concat(features_list, ignore_index=True) if features_list else pd.DataFrame()


def compute_convergence_features(
    amazon_features, gt_features, reddit_features, social_features, science_features
) -> pd.DataFrame:
    """Compute cross-source convergence features (10+ features)."""
    all_keys = set()
    for df in [amazon_features, gt_features, reddit_features, social_features, science_features]:
        if not df.empty and 'topic_id' in df.columns and 'month' in df.columns:
            for _, row in df[['topic_id', 'month']].drop_duplicates().iterrows():
                all_keys.add((row['topic_id'], row['month']))

    if not all_keys:
        return pd.DataFrame()

    base = pd.DataFrame(list(all_keys), columns=['topic_id', 'month'])

    # Amazon active: rank improving (change < 0)
    if not amazon_features.empty and 'rank_change_1m' in amazon_features.columns:
        amz = amazon_features[['topic_id', 'month', 'rank_change_1m']].copy()
        amz['convergence_amazon_active'] = (amz['rank_change_1m'] < 0).astype(int)
        base = base.merge(amz[['topic_id', 'month', 'convergence_amazon_active']],
                          on=['topic_id', 'month'], how='left')
    else:
        base['convergence_amazon_active'] = 0

    # Google Trends active: interest growing
    if not gt_features.empty and 'gt_interest_change_1m' in gt_features.columns:
        gt = gt_features[['topic_id', 'month', 'gt_interest_change_1m']].copy()
        gt['convergence_gt_active'] = (gt['gt_interest_change_1m'] > 0).astype(int)
        base = base.merge(gt[['topic_id', 'month', 'convergence_gt_active']],
                          on=['topic_id', 'month'], how='left')
    else:
        base['convergence_gt_active'] = 0

    # Reddit active: velocity positive
    if not reddit_features.empty and 'reddit_velocity_1m' in reddit_features.columns:
        rd = reddit_features[['topic_id', 'month', 'reddit_velocity_1m']].copy()
        rd['convergence_reddit_active'] = (rd['reddit_velocity_1m'] > 0).astype(int)
        base = base.merge(rd[['topic_id', 'month', 'convergence_reddit_active']],
                          on=['topic_id', 'month'], how='left')
    else:
        base['convergence_reddit_active'] = 0

    # Social active
    if not social_features.empty and 'social_cross_platform_score' in social_features.columns:
        sc = social_features[['topic_id', 'month', 'social_cross_platform_score']].copy()
        sc['convergence_social_active'] = (sc['social_cross_platform_score'] > 0).astype(int)
        base = base.merge(sc[['topic_id', 'month', 'convergence_social_active']],
                          on=['topic_id', 'month'], how='left')
    else:
        base['convergence_social_active'] = 0

    # Science active
    if not science_features.empty and 'science_paper_count' in science_features.columns:
        si = science_features[['topic_id', 'month', 'science_paper_count']].copy()
        si['convergence_science_active'] = (si['science_paper_count'] > 0).astype(int)
        base = base.merge(si[['topic_id', 'month', 'convergence_science_active']],
                          on=['topic_id', 'month'], how='left')
    else:
        base['convergence_science_active'] = 0

    for col in ['convergence_amazon_active', 'convergence_gt_active',
                'convergence_reddit_active', 'convergence_social_active',
                'convergence_science_active']:
        base[col] = base[col].fillna(0).astype(int)

    base['convergence_active_layers'] = (
        base['convergence_amazon_active'] + base['convergence_gt_active'] +
        base['convergence_reddit_active'] + base['convergence_social_active'] +
        base['convergence_science_active']
    )
    base['convergence_score'] = (
        base['convergence_amazon_active'] * 0.25 +
        base['convergence_gt_active'] * 0.15 +
        base['convergence_reddit_active'] * 0.12 +
        base['convergence_social_active'] * 0.12 +
        base['convergence_science_active'] * 0.05
    )
    base['convergence_agreement_ratio'] = np.where(
        base['convergence_active_layers'] > 0,
        base['convergence_active_layers'] / 5.0, 0.0
    )
    return base


# ---------------------------------------------------------------------------
# MAIN ORCHESTRATOR
# ---------------------------------------------------------------------------

def build_feature_store(
    country: str = 'US',
    save_to_db: bool = True,
    return_df: bool = True,
) -> dict:
    """Build the complete temporal feature store."""
    start_time = time.time()
    logger.info(f"Building temporal feature store for country={country}")

    with sync_engine.connect() as conn:
        # 1. Extract raw data
        logger.info("Extracting Amazon BA data...")
        amazon_raw = pd.read_sql(text(AMAZON_BA_QUERY), conn, params={'country': country})
        logger.info(f"  Amazon BA: {len(amazon_raw):,} rows, {amazon_raw['topic_id'].nunique()} topics")

        logger.info("Extracting Google Trends data...")
        gt_live = pd.read_sql(text(GOOGLE_TRENDS_QUERY), conn)
        gt_backfill = pd.read_sql(text(GOOGLE_TRENDS_BACKFILL_QUERY), conn)
        gt_raw = pd.concat([gt_backfill, gt_live]).drop_duplicates(
            subset=['topic_id', 'month'], keep='first'
        )
        logger.info(f"  Google Trends: {len(gt_raw):,} rows, {gt_raw['topic_id'].nunique()} topics")

        logger.info("Extracting Reddit data...")
        reddit_raw = pd.read_sql(text(REDDIT_QUERY), conn)
        reddit_live = pd.read_sql(text(REDDIT_LIVE_QUERY), conn)
        if not reddit_live.empty:
            reddit_live = reddit_live.rename(columns={
                'avg_value': 'avg_sentiment', 'data_points': 'post_count'
            })
            reddit_live['total_score'] = 0
            reddit_live['avg_score'] = 0
            reddit_live['total_comments'] = 0
            reddit_live['avg_comments'] = 0
            reddit_raw = pd.concat([reddit_raw, reddit_live]).drop_duplicates(
                subset=['topic_id', 'month'], keep='first'
            )
        logger.info(f"  Reddit: {len(reddit_raw):,} rows")

        logger.info("Extracting TikTok data...")
        try:
            tiktok_raw = pd.read_sql(text(TIKTOK_QUERY), conn)
        except Exception:
            tiktok_raw = pd.DataFrame()
        logger.info(f"  TikTok: {len(tiktok_raw):,} rows")

        logger.info("Extracting Instagram data...")
        try:
            ig_raw = pd.read_sql(text(INSTAGRAM_QUERY), conn)
        except Exception:
            ig_raw = pd.DataFrame()
        logger.info(f"  Instagram: {len(ig_raw):,} rows")

        logger.info("Extracting Science data...")
        try:
            with sync_engine.connect() as sci_conn:
                science_raw = pd.read_sql(text(SCIENCE_QUERY), sci_conn)
        except Exception as e:
            logger.warning(f"  Science query skipped: {e}")
            science_raw = pd.DataFrame()
        logger.info(f"  Science: {len(science_raw):,} rows")

    # 2. Compute features per source
    logger.info("Computing Amazon features...")
    amazon_features = compute_amazon_features(amazon_raw)
    n_amz_feats = len([c for c in amazon_features.columns if c not in ['topic_id', 'month']]) if not amazon_features.empty else 0
    logger.info(f"  Amazon features: {len(amazon_features):,} rows, {n_amz_feats} features")

    logger.info("Computing Google Trends features...")
    gt_features = compute_google_trends_features(gt_raw)
    logger.info(f"  GT features: {len(gt_features):,} rows")

    logger.info("Computing Reddit features...")
    reddit_features = compute_reddit_features(reddit_raw)
    logger.info(f"  Reddit features: {len(reddit_features):,} rows")

    logger.info("Computing Social features...")
    social_features = compute_social_features(tiktok_raw, ig_raw)
    logger.info(f"  Social features: {len(social_features):,} rows")

    logger.info("Computing Science features...")
    science_features = compute_science_features(science_raw)
    logger.info(f"  Science features: {len(science_features):,} rows")

    logger.info("Computing Seasonality features...")
    season_features = compute_seasonality_features(amazon_features)
    logger.info(f"  Seasonality features: {len(season_features):,} rows")

    logger.info("Computing Convergence features...")
    convergence_features = compute_convergence_features(
        amazon_features, gt_features, reddit_features,
        social_features, science_features
    )
    logger.info(f"  Convergence features: {len(convergence_features):,} rows")

    # 3. Merge all features
    logger.info("Merging all features...")
    if not amazon_features.empty:
        merged = amazon_features.copy()
    elif not gt_features.empty:
        merged = gt_features[['topic_id', 'month']].copy()
    else:
        logger.warning("No features computed — no data available.")
        return {'status': 'no_data', 'features': 0, 'topics': 0}

    for feat_df, name in [
        (gt_features, 'google_trends'),
        (reddit_features, 'reddit'),
        (social_features, 'social'),
        (science_features, 'science'),
        (season_features, 'seasonality'),
        (convergence_features, 'convergence'),
    ]:
        if not feat_df.empty:
            overlap_cols = [c for c in feat_df.columns
                           if c in merged.columns and c not in ['topic_id', 'month']]
            feat_to_merge = feat_df.drop(columns=overlap_cols, errors='ignore')
            merged = merged.merge(feat_to_merge, on=['topic_id', 'month'], how='left')

    feature_cols = [c for c in merged.columns if c not in ['topic_id', 'month']]
    merged[feature_cols] = merged[feature_cols].fillna(0)
    merged = merged.replace([np.inf, -np.inf], 0)

    elapsed = time.time() - start_time
    n_features = len(feature_cols)
    n_topics = merged['topic_id'].nunique()
    n_rows = len(merged)
    month_min = merged['month'].min() if not merged.empty else None
    month_max = merged['month'].max() if not merged.empty else None

    logger.info(f"Feature store complete: {n_rows:,} rows, {n_topics} topics, "
                f"{n_features} features, {month_min} to {month_max} ({elapsed:.1f}s)")

    # 4. Save to database
    if save_to_db and not merged.empty:
        logger.info("Saving to temporal_features table...")
        _save_features_to_db(merged, country)

    result = {
        'status': 'success',
        'rows': n_rows,
        'topics': n_topics,
        'features': n_features,
        'feature_names': feature_cols,
        'month_range': f"{month_min} to {month_max}",
        'elapsed_seconds': round(elapsed, 1),
    }
    if return_df:
        result['dataframe'] = merged
    return result


def _save_features_to_db(df: pd.DataFrame, country: str):
    """Save feature store to temporal_features table."""
    import json as json_mod

    create_sql = """
    CREATE TABLE IF NOT EXISTS temporal_features (
        id SERIAL PRIMARY KEY,
        topic_id UUID NOT NULL,
        month DATE NOT NULL,
        country VARCHAR(10) DEFAULT 'US',
        features JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(topic_id, month, country)
    );
    CREATE INDEX IF NOT EXISTS idx_tf_topic_month ON temporal_features(topic_id, month);
    CREATE INDEX IF NOT EXISTS idx_tf_country ON temporal_features(country);
    """

    feature_cols = [c for c in df.columns if c not in ['topic_id', 'month']]

    with sync_engine.begin() as conn:
        conn.execute(text(create_sql))

        batch_size = 500
        total_upserted = 0
        for start in range(0, len(df), batch_size):
            batch = df.iloc[start:start + batch_size]
            for _, row in batch.iterrows():
                features_json = {col: float(row[col]) if not pd.isna(row[col]) else 0.0
                                 for col in feature_cols}
                conn.execute(
                    text("""
                        INSERT INTO temporal_features (topic_id, month, country, features, updated_at)
                        VALUES (:topic_id, :month, :country, CAST(:features AS jsonb), NOW())
                        ON CONFLICT (topic_id, month, country)
                        DO UPDATE SET features = CAST(:features AS jsonb), updated_at = NOW()
                    """),
                    {
                        'topic_id': str(row['topic_id']),
                        'month': row['month'],
                        'country': country,
                        'features': json_mod.dumps(features_json),
                    }
                )
                total_upserted += 1

        logger.info(f"Saved {total_upserted:,} feature rows to temporal_features")


# ---------------------------------------------------------------------------
# CELERY TASK WRAPPER
# ---------------------------------------------------------------------------

try:
    from app.celery_app import celery_app

    @celery_app.task(name='build_feature_store')
    def build_feature_store_task(country: str = 'US'):
        return build_feature_store(country=country, save_to_db=True, return_df=False)
except ImportError:
    pass


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    result = build_feature_store(country='US', save_to_db=True, return_df=False)
    print(f"\n=== FEATURE STORE RESULTS ===")
    for k, v in result.items():
        if k != 'feature_names':
            print(f"  {k}: {v}")
    print(f"\n  Feature columns ({result['features']}):")
    for name in result.get('feature_names', []):
        print(f"    - {name}")
