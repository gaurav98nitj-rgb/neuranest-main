"""Science Radar models: papers, clusters, opportunity cards."""
from app.models.base import *


class ScienceItem(Base):
    __tablename__ = "science_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String, nullable=False)  # arxiv, biorxiv, patentsview
    source_id = Column(String, unique=True, nullable=False)
    title = Column(Text, nullable=False)
    abstract = Column(Text, nullable=True)
    authors = Column(JSONB, nullable=True)
    categories = Column(JSONB, nullable=True)  # subject areas from source
    published_date = Column(Date, nullable=True)
    url = Column(Text, nullable=True)
    citation_count = Column(Integer, default=0)
    embedding = Column(Vector(384), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_science_source", "source", "published_date"),
        Index("idx_science_date", "published_date"),
        CheckConstraint(
            "source IN ('arxiv', 'biorxiv', 'patentsview')",
            name="ck_science_source"
        ),
    )


class ScienceCluster(Base):
    __tablename__ = "science_clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    item_count = Column(Integer, default=0)
    avg_recency_days = Column(Numeric, nullable=True)
    velocity_score = Column(Numeric(6, 2), nullable=True)  # papers per month
    novelty_score = Column(Numeric(6, 2), nullable=True)  # how new/unique
    centroid_embedding = Column(Vector(384), nullable=True)
    top_keywords = Column(JSONB, nullable=True)
    computed_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    items = relationship("ScienceClusterItem", back_populates="cluster")
    opportunity_cards = relationship("ScienceOpportunityCard", back_populates="cluster")


class ScienceClusterItem(Base):
    __tablename__ = "science_cluster_items"

    cluster_id = Column(UUID(as_uuid=True), ForeignKey("science_clusters.id", ondelete="CASCADE"), primary_key=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("science_items.id", ondelete="CASCADE"), primary_key=True)
    distance_to_centroid = Column(Numeric, nullable=True)

    cluster = relationship("ScienceCluster", back_populates="items")
    item = relationship("ScienceItem")


class ScienceOpportunityCard(Base):
    __tablename__ = "science_opportunity_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("science_clusters.id"), nullable=False)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)  # set when converted
    title = Column(String, nullable=False)
    hypothesis = Column(Text, nullable=True)
    target_category = Column(String, nullable=True)
    confidence = Column(Numeric(5, 4), nullable=True)
    status = Column(String, default="proposed")  # proposed, accepted, rejected
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    cluster = relationship("ScienceCluster", back_populates="opportunity_cards")

    __table_args__ = (
        CheckConstraint(
            "status IN ('proposed', 'accepted', 'rejected')",
            name="ck_sci_opp_status"
        ),
    )
