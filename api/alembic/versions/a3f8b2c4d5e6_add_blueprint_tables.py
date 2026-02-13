"""add categories, social, platforms, science, signals tables

Revision ID: a3f8b2c4d5e6
Revises: 21db927b19fb
Create Date: 2026-02-13 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision: str = 'a3f8b2c4d5e6'
down_revision: Union[str, None] = '21db927b19fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ═══════════════════════════════════════
    #  CATEGORIES
    # ═══════════════════════════════════════
    op.create_table('categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('topic_count', sa.Integer(), server_default='0'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['parent_id'], ['categories.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('idx_categories_parent', 'categories', ['parent_id'])
    op.create_index('idx_categories_level', 'categories', ['level'])

    op.create_table('category_metrics',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('topic_count', sa.Integer(), server_default='0'),
        sa.Column('avg_opportunity_score', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('avg_competition_index', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('growth_rate_4w', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('emerging_count', sa.Integer(), server_default='0'),
        sa.Column('exploding_count', sa.Integer(), server_default='0'),
        sa.Column('peaking_count', sa.Integer(), server_default='0'),
        sa.Column('declining_count', sa.Integer(), server_default='0'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category_id', 'date', name='uq_catmetrics_unique'),
    )
    op.create_index('idx_catmetrics_date', 'category_metrics', ['category_id', 'date'])

    # Add category_id FK to topics (nullable, coexists with primary_category string)
    op.add_column('topics', sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_topics_category', 'topics', 'categories', ['category_id'], ['id'])
    op.create_index('idx_topics_category_id', 'topics', ['category_id'])

    # Add udsi_score to topics for quick access
    op.add_column('topics', sa.Column('udsi_score', sa.Numeric(precision=6, scale=2), nullable=True))

    # ═══════════════════════════════════════
    #  BRANDS & SOCIAL LISTENING
    # ═══════════════════════════════════════
    op.create_table('brands',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('amazon_brand_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('idx_brands_category', 'brands', ['category_id'])
    op.create_index('idx_brands_amazon', 'brands', ['amazon_brand_name'])

    op.create_table('brand_mentions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('source_id', sa.String(), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('sentiment', sa.String(), nullable=True),
        sa.Column('sentiment_score', sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column('engagement', sa.Integer(), server_default='0'),
        sa.Column('mention_date', sa.Date(), nullable=False),
        sa.Column('embedding', Vector(384), nullable=True),
        sa.Column('metadata_json', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source', 'source_id', name='uq_brand_mention_source'),
        sa.CheckConstraint("sentiment IN ('positive', 'negative', 'neutral')", name='ck_brand_mention_sentiment'),
    )
    op.create_index('idx_brand_mentions_brand_date', 'brand_mentions', ['brand_id', 'mention_date'])
    op.create_index('idx_brand_mentions_source', 'brand_mentions', ['source', 'mention_date'])

    op.create_table('brand_sentiment_daily',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('mention_count', sa.Integer(), server_default='0'),
        sa.Column('positive_count', sa.Integer(), server_default='0'),
        sa.Column('negative_count', sa.Integer(), server_default='0'),
        sa.Column('neutral_count', sa.Integer(), server_default='0'),
        sa.Column('avg_sentiment', sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column('avg_engagement', sa.Numeric(), nullable=True),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('brand_id', 'date', 'source', name='uq_brand_sentiment_daily'),
    )
    op.create_index('idx_brand_sentiment_date', 'brand_sentiment_daily', ['brand_id', 'date'])

    op.create_table('share_of_voice_daily',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('mention_count', sa.Integer(), server_default='0'),
        sa.Column('share_pct', sa.Numeric(precision=5, scale=4), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category_id', 'brand_id', 'date', name='uq_sov_daily'),
    )
    op.create_index('idx_sov_date', 'share_of_voice_daily', ['category_id', 'date'])

    # ═══════════════════════════════════════
    #  META / TIKTOK PLATFORMS
    # ═══════════════════════════════════════
    op.create_table('instagram_mentions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('post_id', sa.String(), nullable=False),
        sa.Column('post_type', sa.String(), nullable=True),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('likes', sa.Integer(), server_default='0'),
        sa.Column('comments', sa.Integer(), server_default='0'),
        sa.Column('shares', sa.Integer(), server_default='0'),
        sa.Column('hashtags', postgresql.JSONB(), nullable=True),
        sa.Column('sentiment', sa.String(), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('collected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id'),
    )
    op.create_index('idx_ig_topic_date', 'instagram_mentions', ['topic_id', 'posted_at'])
    op.create_index('idx_ig_brand', 'instagram_mentions', ['brand_id'])

    op.create_table('facebook_mentions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('post_id', sa.String(), nullable=False),
        sa.Column('page_name', sa.String(), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('reactions', sa.Integer(), server_default='0'),
        sa.Column('comments', sa.Integer(), server_default='0'),
        sa.Column('shares', sa.Integer(), server_default='0'),
        sa.Column('sentiment', sa.String(), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('collected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id'),
    )
    op.create_index('idx_fb_topic_date', 'facebook_mentions', ['topic_id', 'posted_at'])
    op.create_index('idx_fb_brand', 'facebook_mentions', ['brand_id'])

    op.create_table('tiktok_trends',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('hashtag', sa.String(), nullable=False),
        sa.Column('view_count', sa.BigInteger(), server_default='0'),
        sa.Column('video_count', sa.BigInteger(), server_default='0'),
        sa.Column('growth_rate', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('region', sa.String(), server_default='US'),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('collected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hashtag', 'region', 'date', name='uq_tiktok_trend'),
    )
    op.create_index('idx_tiktok_trend_date', 'tiktok_trends', ['date'])
    op.create_index('idx_tiktok_trend_topic', 'tiktok_trends', ['topic_id'])

    op.create_table('tiktok_mentions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('video_id', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('likes', sa.BigInteger(), server_default='0'),
        sa.Column('comments', sa.Integer(), server_default='0'),
        sa.Column('shares', sa.Integer(), server_default='0'),
        sa.Column('views', sa.BigInteger(), server_default='0'),
        sa.Column('hashtags', postgresql.JSONB(), nullable=True),
        sa.Column('sentiment', sa.String(), nullable=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('collected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('video_id'),
    )
    op.create_index('idx_tiktok_mention_topic', 'tiktok_mentions', ['topic_id', 'posted_at'])
    op.create_index('idx_tiktok_mention_brand', 'tiktok_mentions', ['brand_id'])

    op.create_table('ad_creatives',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('platform', sa.String(), nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('creative_id', sa.String(), nullable=True),
        sa.Column('ad_text', sa.Text(), nullable=True),
        sa.Column('media_type', sa.String(), nullable=True),
        sa.Column('spend_estimate', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('impressions_estimate', sa.BigInteger(), nullable=True),
        sa.Column('active_days', sa.Integer(), nullable=True),
        sa.Column('landing_url', sa.Text(), nullable=True),
        sa.Column('first_seen', sa.Date(), nullable=True),
        sa.Column('last_seen', sa.Date(), nullable=True),
        sa.Column('collected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform', 'creative_id', name='uq_ad_creative'),
        sa.CheckConstraint("platform IN ('meta', 'tiktok')", name='ck_ad_platform'),
    )
    op.create_index('idx_ad_platform_topic', 'ad_creatives', ['platform', 'topic_id'])
    op.create_index('idx_ad_dates', 'ad_creatives', ['first_seen', 'last_seen'])

    # ═══════════════════════════════════════
    #  SCIENCE RADAR
    # ═══════════════════════════════════════
    op.create_table('science_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('source_id', sa.String(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('authors', postgresql.JSONB(), nullable=True),
        sa.Column('categories', postgresql.JSONB(), nullable=True),
        sa.Column('published_date', sa.Date(), nullable=True),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('citation_count', sa.Integer(), server_default='0'),
        sa.Column('embedding', Vector(384), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_id'),
        sa.CheckConstraint("source IN ('arxiv', 'biorxiv', 'patentsview')", name='ck_science_source'),
    )
    op.create_index('idx_science_source', 'science_items', ['source', 'published_date'])
    op.create_index('idx_science_date', 'science_items', ['published_date'])

    op.create_table('science_clusters',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('item_count', sa.Integer(), server_default='0'),
        sa.Column('avg_recency_days', sa.Numeric(), nullable=True),
        sa.Column('velocity_score', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('novelty_score', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('centroid_embedding', Vector(384), nullable=True),
        sa.Column('top_keywords', postgresql.JSONB(), nullable=True),
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('science_cluster_items',
        sa.Column('cluster_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('distance_to_centroid', sa.Numeric(), nullable=True),
        sa.ForeignKeyConstraint(['cluster_id'], ['science_clusters.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['science_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('cluster_id', 'item_id'),
    )

    op.create_table('science_opportunity_cards',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('cluster_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('hypothesis', sa.Text(), nullable=True),
        sa.Column('target_category', sa.String(), nullable=True),
        sa.Column('confidence', sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column('status', sa.String(), server_default='proposed'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['cluster_id'], ['science_clusters.id']),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("status IN ('proposed', 'accepted', 'rejected')", name='ck_sci_opp_status'),
    )

    # ═══════════════════════════════════════
    #  SIGNAL FUSION (UDSI)
    # ═══════════════════════════════════════
    op.create_table('signal_fusion_daily',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('topic_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('udsi_score', sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column('google_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('amazon_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('reddit_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('tiktok_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('instagram_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('review_gap_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('science_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('forecast_component', sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column('confidence', sa.String(), nullable=True),
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('topic_id', 'date', name='uq_signal_fusion_daily'),
        sa.CheckConstraint("confidence IN ('low', 'medium', 'high')", name='ck_udsi_confidence'),
    )
    op.create_index('idx_udsi_topic_date', 'signal_fusion_daily', ['topic_id', 'date'])
    op.create_index('idx_udsi_date_score', 'signal_fusion_daily', ['date', 'udsi_score'])

    # ═══════════════════════════════════════
    #  ENHANCE EXISTING TABLES
    # ═══════════════════════════════════════
    # Add embedding + cluster columns to review_aspects
    op.add_column('review_aspects', sa.Column('embedding', Vector(384), nullable=True))
    op.add_column('review_aspects', sa.Column('cluster_id', sa.Integer(), nullable=True))
    op.add_column('review_aspects', sa.Column('is_feature_request', sa.Boolean(), server_default='false'))
    op.create_index('idx_aspects_cluster', 'review_aspects', ['cluster_id'])

    # Widen scores constraint to include 'udsi' type
    op.drop_constraint('ck_scores_type', 'scores', type_='check')
    op.create_check_constraint(
        'ck_scores_type', 'scores',
        "score_type IN ('opportunity', 'competition', 'demand', 'review_gap', 'udsi')"
    )

    # Widen keywords source constraint to include 'discovery'
    op.drop_constraint('ck_keywords_source', 'keywords', type_='check')
    op.create_check_constraint(
        'ck_keywords_source', 'keywords',
        "source IN ('keywordtool', 'junglescout', 'gtrends', 'reddit', 'discovery')"
    )


def downgrade() -> None:
    # Reverse constraint changes
    op.drop_constraint('ck_keywords_source', 'keywords', type_='check')
    op.create_check_constraint(
        'ck_keywords_source', 'keywords',
        "source IN ('keywordtool', 'junglescout', 'gtrends', 'reddit')"
    )
    op.drop_constraint('ck_scores_type', 'scores', type_='check')
    op.create_check_constraint(
        'ck_scores_type', 'scores',
        "score_type IN ('opportunity', 'competition', 'demand', 'review_gap')"
    )

    # Drop review_aspects enhancements
    op.drop_index('idx_aspects_cluster', 'review_aspects')
    op.drop_column('review_aspects', 'is_feature_request')
    op.drop_column('review_aspects', 'cluster_id')
    op.drop_column('review_aspects', 'embedding')

    # Drop signal fusion
    op.drop_table('signal_fusion_daily')

    # Drop science
    op.drop_table('science_opportunity_cards')
    op.drop_table('science_cluster_items')
    op.drop_table('science_clusters')
    op.drop_table('science_items')

    # Drop platforms
    op.drop_table('ad_creatives')
    op.drop_table('tiktok_mentions')
    op.drop_table('tiktok_trends')
    op.drop_table('facebook_mentions')
    op.drop_table('instagram_mentions')

    # Drop social
    op.drop_table('share_of_voice_daily')
    op.drop_table('brand_sentiment_daily')
    op.drop_table('brand_mentions')
    op.drop_table('brands')

    # Drop topics columns
    op.drop_column('topics', 'udsi_score')
    op.drop_constraint('fk_topics_category', 'topics', type_='foreignkey')
    op.drop_index('idx_topics_category_id', 'topics')
    op.drop_column('topics', 'category_id')

    # Drop categories
    op.drop_table('category_metrics')
    op.drop_table('categories')
