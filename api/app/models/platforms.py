"""Meta (Instagram/Facebook) and TikTok platform models."""
from app.models.base import *


class InstagramMention(Base):
    __tablename__ = "instagram_mentions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=True)
    post_id = Column(String, unique=True, nullable=False)
    post_type = Column(String, nullable=True)  # reel, story, post, carousel
    caption = Column(Text, nullable=True)
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    hashtags = Column(JSONB, nullable=True)
    sentiment = Column(String, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_ig_topic_date", "topic_id", "posted_at"),
        Index("idx_ig_brand", "brand_id"),
    )


class FacebookMention(Base):
    __tablename__ = "facebook_mentions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=True)
    post_id = Column(String, unique=True, nullable=False)
    page_name = Column(String, nullable=True)
    text = Column(Text, nullable=True)
    reactions = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    sentiment = Column(String, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_fb_topic_date", "topic_id", "posted_at"),
        Index("idx_fb_brand", "brand_id"),
    )


class TikTokTrend(Base):
    __tablename__ = "tiktok_trends"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    hashtag = Column(String, nullable=False)
    view_count = Column(BigInteger, default=0)
    video_count = Column(BigInteger, default=0)
    growth_rate = Column(Numeric(8, 4), nullable=True)
    region = Column(String, default="US")
    date = Column(Date, nullable=False)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("hashtag", "region", "date", name="uq_tiktok_trend"),
        Index("idx_tiktok_trend_date", "date"),
        Index("idx_tiktok_trend_topic", "topic_id"),
    )


class TikTokMention(Base):
    __tablename__ = "tiktok_mentions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=True)
    video_id = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    likes = Column(BigInteger, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    views = Column(BigInteger, default=0)
    hashtags = Column(JSONB, nullable=True)
    sentiment = Column(String, nullable=True)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_tiktok_mention_topic", "topic_id", "posted_at"),
        Index("idx_tiktok_mention_brand", "brand_id"),
    )


class AdCreative(Base):
    __tablename__ = "ad_creatives"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    platform = Column(String, nullable=False)  # meta, tiktok
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=True)
    creative_id = Column(String, nullable=True)
    ad_text = Column(Text, nullable=True)
    media_type = Column(String, nullable=True)  # image, video, carousel
    spend_estimate = Column(Numeric(12, 2), nullable=True)
    impressions_estimate = Column(BigInteger, nullable=True)
    active_days = Column(Integer, nullable=True)
    landing_url = Column(Text, nullable=True)
    first_seen = Column(Date, nullable=True)
    last_seen = Column(Date, nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("platform", "creative_id", name="uq_ad_creative"),
        Index("idx_ad_platform_topic", "platform", "topic_id"),
        Index("idx_ad_dates", "first_seen", "last_seen"),
        CheckConstraint("platform IN ('meta', 'tiktok')", name="ck_ad_platform"),
    )
