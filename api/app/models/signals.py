"""Signal Fusion (UDSI) daily output model."""
from app.models.base import *


class SignalFusionDaily(Base):
    __tablename__ = "signal_fusion_daily"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=False)
    date = Column(Date, nullable=False)
    udsi_score = Column(Numeric(6, 2), nullable=False)

    # Component breakdown
    google_component = Column(Numeric(6, 2), nullable=True)
    amazon_component = Column(Numeric(6, 2), nullable=True)
    reddit_component = Column(Numeric(6, 2), nullable=True)
    tiktok_component = Column(Numeric(6, 2), nullable=True)
    instagram_component = Column(Numeric(6, 2), nullable=True)
    review_gap_component = Column(Numeric(6, 2), nullable=True)
    science_component = Column(Numeric(6, 2), nullable=True)
    forecast_component = Column(Numeric(6, 2), nullable=True)

    confidence = Column(String, nullable=True)  # low, medium, high
    computed_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("topic_id", "date", name="uq_signal_fusion_daily"),
        Index("idx_udsi_topic_date", "topic_id", "date"),
        Index("idx_udsi_date_score", "date", "udsi_score"),
        CheckConstraint(
            "confidence IN ('low', 'medium', 'high')",
            name="ck_udsi_confidence"
        ),
    )
