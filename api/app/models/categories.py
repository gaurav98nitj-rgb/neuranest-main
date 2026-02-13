"""Category hierarchy and metrics models."""
from app.models.base import *


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    level = Column(Integer, nullable=False, default=0)  # 0=root, 1=subcategory, 2=niche
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)  # emoji or icon class
    sort_order = Column(Integer, default=0)
    topic_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("Category", remote_side="Category.id", backref="children")
    metrics = relationship("CategoryMetric", back_populates="category")

    __table_args__ = (
        Index("idx_categories_parent", "parent_id"),
        Index("idx_categories_level", "level"),
    )


class CategoryMetric(Base):
    __tablename__ = "category_metrics"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    date = Column(Date, nullable=False)
    topic_count = Column(Integer, default=0)
    avg_opportunity_score = Column(Numeric(6, 2), nullable=True)
    avg_competition_index = Column(Numeric(6, 2), nullable=True)
    growth_rate_4w = Column(Numeric(8, 4), nullable=True)
    emerging_count = Column(Integer, default=0)
    exploding_count = Column(Integer, default=0)
    peaking_count = Column(Integer, default=0)
    declining_count = Column(Integer, default=0)

    category = relationship("Category", back_populates="metrics")

    __table_args__ = (
        UniqueConstraint("category_id", "date", name="uq_catmetrics_unique"),
        Index("idx_catmetrics_date", "category_id", "date"),
    )
