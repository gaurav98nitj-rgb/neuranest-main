"""Core topic and related models (existing schema - unchanged)."""
from app.models.base import *


# ─── Topics (Canonical Opportunity Entity) ───
class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    stage = Column(String, default="unknown")
    primary_category = Column(String, nullable=True, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    embedding = Column(Vector(384), nullable=True)
    forecast_direction = Column(String, nullable=True)
    udsi_score = Column(Numeric(6, 2), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    keywords = relationship("Keyword", back_populates="topic")
    categories = relationship("TopicCategoryMap", back_populates="topic")
    timeseries = relationship("SourceTimeseries", back_populates="topic")
    competition_snapshots = relationship("AmazonCompetitionSnapshot", back_populates="topic")
    top_asins = relationship("TopicTopAsin", back_populates="topic")
    derived_features = relationship("DerivedFeature", back_populates="topic")
    forecasts = relationship("Forecast", back_populates="topic")
    scores = relationship("Score", back_populates="topic")
    gen_next_specs = relationship("GenNextSpec", back_populates="topic")

    __table_args__ = (
        CheckConstraint(
            "stage IN ('emerging', 'exploding', 'peaking', 'declining', 'unknown')",
            name="ck_topics_stage"
        ),
        Index("idx_topics_category_id", "category_id"),
    )


# ─── Keywords ───
class Keyword(Base):
    __tablename__ = "keywords"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), nullable=True)
    keyword = Column(String, nullable=False)
    source = Column(String, nullable=False)
    geo = Column(String, default="US")
    language = Column(String, default="en")
    latest_volume = Column(BigInteger, nullable=True)
    latest_cpc = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="keywords")

    __table_args__ = (
        UniqueConstraint("keyword", "source", "geo", name="uq_keywords_unique"),
        CheckConstraint(
            "source IN ('keywordtool', 'junglescout', 'gtrends', 'reddit', 'discovery')",
            name="ck_keywords_source"
        ),
        Index("idx_keywords_topic", "topic_id"),
    )


# ─── Topic Category Map ───
class TopicCategoryMap(Base):
    __tablename__ = "topic_category_map"

    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    category = Column(String, nullable=False, primary_key=True)
    confidence = Column(Numeric(5, 4), nullable=True)

    topic = relationship("Topic", back_populates="categories")


# ─── Source Timeseries ───
class SourceTimeseries(Base):
    __tablename__ = "source_timeseries"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    geo = Column(String, default="US")
    raw_value = Column(Numeric, nullable=True)
    normalized_value = Column(Numeric, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="timeseries")

    __table_args__ = (
        UniqueConstraint("topic_id", "source", "date", "geo", name="uq_ts_unique"),
        Index("idx_ts_topic_date", "topic_id", "date"),
    )


# ─── Amazon Competition Snapshot ───
class AmazonCompetitionSnapshot(Base):
    __tablename__ = "amazon_competition_snapshot"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    date = Column(Date, nullable=False)
    marketplace = Column(String, default="US")
    listing_count = Column(Integer, nullable=True)
    median_price = Column(Numeric(10, 2), nullable=True)
    avg_price = Column(Numeric(10, 2), nullable=True)
    price_std = Column(Numeric(10, 2), nullable=True)
    median_reviews = Column(Integer, nullable=True)
    avg_rating = Column(Numeric(3, 2), nullable=True)
    brand_count = Column(Integer, nullable=True)
    brand_hhi = Column(Numeric(10, 6), nullable=True)
    top3_brand_share = Column(Numeric(5, 4), nullable=True)
    rating_distribution_json = Column(JSONB, nullable=True)
    price_range_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="competition_snapshots")

    __table_args__ = (
        UniqueConstraint("topic_id", "date", "marketplace", name="uq_competition_unique"),
    )


# ─── ASINs ───
class Asin(Base):
    __tablename__ = "asins"

    asin = Column(String, primary_key=True)
    title = Column(Text, nullable=True)
    brand = Column(String, nullable=True, index=True)
    category_path = Column(String, nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    rating = Column(Numeric(3, 2), nullable=True)
    review_count = Column(Integer, nullable=True)
    bsr_rank = Column(Integer, nullable=True)
    image_url = Column(Text, nullable=True)
    bullet_points = Column(JSONB, nullable=True)
    date_first_available = Column(Date, nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    reviews = relationship("Review", back_populates="asin_obj")
    topic_links = relationship("TopicTopAsin", back_populates="asin_obj")


# ─── Topic Top ASINs ───
class TopicTopAsin(Base):
    __tablename__ = "topic_top_asins"

    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), primary_key=True)
    asin = Column(String, ForeignKey("asins.asin"), primary_key=True)
    rank = Column(Integer, nullable=True)
    relevance_score = Column(Numeric(5, 4), nullable=True)
    collected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="top_asins")
    asin_obj = relationship("Asin", back_populates="topic_links")


# ─── Reviews ───
class Review(Base):
    __tablename__ = "reviews"

    review_id = Column(String, primary_key=True)
    asin = Column(String, ForeignKey("asins.asin"), nullable=False, index=True)
    stars = Column(Integer, nullable=True)
    title = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    review_date = Column(Date, nullable=True)
    verified_purchase = Column(Boolean, default=False)
    helpful_votes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    asin_obj = relationship("Asin", back_populates="reviews")
    aspects = relationship("ReviewAspect", back_populates="review")

    __table_args__ = (
        CheckConstraint("stars BETWEEN 1 AND 5", name="ck_reviews_stars"),
        Index("idx_reviews_date", "review_date"),
    )


# ─── Review Aspects ───
class ReviewAspect(Base):
    __tablename__ = "review_aspects"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=False, index=True)
    aspect = Column(String, nullable=False)
    sentiment = Column(String, nullable=False)
    confidence = Column(Numeric(5, 4), nullable=True)
    evidence_snippet = Column(Text, nullable=True)
    embedding = Column(Vector(384), nullable=True)
    cluster_id = Column(Integer, nullable=True)
    is_feature_request = Column(Boolean, default=False)

    review = relationship("Review", back_populates="aspects")

    __table_args__ = (
        CheckConstraint("sentiment IN ('positive', 'negative', 'neutral')", name="ck_aspects_sentiment"),
        Index("idx_aspects_aspect", "aspect", "sentiment"),
        Index("idx_aspects_cluster", "cluster_id"),
    )


# ─── Derived Features ───
class DerivedFeature(Base):
    __tablename__ = "derived_features"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    date = Column(Date, nullable=False)
    feature_name = Column(String, nullable=False)
    feature_value = Column(Numeric, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="derived_features")

    __table_args__ = (
        UniqueConstraint("topic_id", "date", "feature_name", name="uq_features_unique"),
    )


# ─── Forecasts ───
class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    horizon_months = Column(Integer, nullable=False)
    forecast_date = Column(Date, nullable=False)
    yhat = Column(Numeric, nullable=True)
    yhat_lower = Column(Numeric, nullable=True)
    yhat_upper = Column(Numeric, nullable=True)
    model_version = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="forecasts")

    __table_args__ = (
        CheckConstraint("horizon_months IN (3, 6)", name="ck_forecasts_horizon"),
        Index("idx_forecasts_topic", "topic_id", "generated_at"),
    )


# ─── Scores ───
class Score(Base):
    __tablename__ = "scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    score_type = Column(String, nullable=False)
    score_value = Column(Numeric(6, 2), nullable=True)
    explanation_json = Column(JSONB, nullable=True)
    computed_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="scores")

    __table_args__ = (
        CheckConstraint(
            "score_type IN ('opportunity', 'competition', 'demand', 'review_gap', 'udsi')",
            name="ck_scores_type"
        ),
        Index("idx_scores_latest", "topic_id", "score_type", "computed_at"),
    )


# ─── Gen-Next Specs ───
class GenNextSpec(Base):
    __tablename__ = "gen_next_specs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    must_fix_json = Column(JSONB, nullable=True)
    must_add_json = Column(JSONB, nullable=True)
    differentiators_json = Column(JSONB, nullable=True)
    positioning_json = Column(JSONB, nullable=True)
    model_used = Column(String, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    topic = relationship("Topic", back_populates="gen_next_specs")

    __table_args__ = (
        Index("idx_gennext_topic", "topic_id", "generated_at"),
    )


# ─── Watchlists ───
class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    added_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="watchlists")
    topic = relationship("Topic")

    __table_args__ = (
        UniqueConstraint("user_id", "topic_id", name="uq_watchlist_user_topic"),
    )


# ─── Alerts ───
class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)
    alert_type = Column(String, nullable=False)
    config_json = Column(JSONB, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="alerts")
    topic = relationship("Topic")
    events = relationship("AlertEvent", back_populates="alert")

    __table_args__ = (
        CheckConstraint(
            "alert_type IN ('stage_change', 'score_threshold', 'new_competitor', 'price_drop')",
            name="ck_alerts_type"
        ),
    )


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=False)
    triggered_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    payload_json = Column(JSONB, nullable=True)
    delivered = Column(Boolean, default=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    alert = relationship("Alert", back_populates="events")
