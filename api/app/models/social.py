"""Social listening models: brands, mentions, sentiment, share of voice."""
from app.models.base import *


class Brand(Base):
    __tablename__ = "brands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    logo_url = Column(Text, nullable=True)
    website = Column(String, nullable=True)
    amazon_brand_name = Column(String, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    mentions = relationship("BrandMention", back_populates="brand")
    sentiment_daily = relationship("BrandSentimentDaily", back_populates="brand")

    __table_args__ = (
        Index("idx_brands_category", "category_id"),
    )


class BrandMention(Base):
    __tablename__ = "brand_mentions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=False)
    source = Column(String, nullable=False)  # reddit, instagram, facebook, tiktok, review
    source_id = Column(String, nullable=True)  # external post/comment ID for dedup
    text = Column(Text, nullable=True)
    sentiment = Column(String, nullable=True)  # positive, negative, neutral
    sentiment_score = Column(Numeric(5, 4), nullable=True)  # -1.0 to 1.0
    engagement = Column(Integer, default=0)  # likes + comments + shares
    mention_date = Column(Date, nullable=False)
    embedding = Column(Vector(384), nullable=True)
    metadata_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    brand = relationship("Brand", back_populates="mentions")

    __table_args__ = (
        Index("idx_brand_mentions_brand_date", "brand_id", "mention_date"),
        Index("idx_brand_mentions_source", "source", "mention_date"),
        UniqueConstraint("source", "source_id", name="uq_brand_mention_source"),
        CheckConstraint(
            "sentiment IN ('positive', 'negative', 'neutral')",
            name="ck_brand_mention_sentiment"
        ),
    )


class BrandSentimentDaily(Base):
    __tablename__ = "brand_sentiment_daily"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=False)
    date = Column(Date, nullable=False)
    source = Column(String, nullable=False)  # reddit, instagram, facebook, tiktok, all
    mention_count = Column(Integer, default=0)
    positive_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    neutral_count = Column(Integer, default=0)
    avg_sentiment = Column(Numeric(5, 4), nullable=True)
    avg_engagement = Column(Numeric, nullable=True)

    brand = relationship("Brand", back_populates="sentiment_daily")

    __table_args__ = (
        UniqueConstraint("brand_id", "date", "source", name="uq_brand_sentiment_daily"),
        Index("idx_brand_sentiment_date", "brand_id", "date"),
    )


class ShareOfVoiceDaily(Base):
    __tablename__ = "share_of_voice_daily"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("brands.id"), nullable=False)
    date = Column(Date, nullable=False)
    mention_count = Column(Integer, default=0)
    share_pct = Column(Numeric(5, 4), nullable=True)  # 0.0 to 1.0

    __table_args__ = (
        UniqueConstraint("category_id", "brand_id", "date", name="uq_sov_daily"),
        Index("idx_sov_date", "category_id", "date"),
    )
