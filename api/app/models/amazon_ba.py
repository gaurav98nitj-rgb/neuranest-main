"""
Amazon Brand Analytics model — stores search term report data.

Designed for scale:
  - 100K+ search terms per monthly file
  - 24 months × multiple countries = 24M+ rows
  - Partitioned by (country, report_month) for fast queries
  - GIN index on search_term for full-text search
"""
from app.models.base import *


class AmazonBrandAnalytics(Base):
    __tablename__ = "amazon_brand_analytics"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # ─── Identifiers ───
    country = Column(String(5), nullable=False, default="US")  # US, UK, DE, JP, IN, etc.
    report_month = Column(Date, nullable=False)  # First day of the month (e.g., 2026-01-01)

    # ─── Search Term Data ───
    search_frequency_rank = Column(Integer, nullable=False)
    search_term = Column(Text, nullable=False)

    # ─── Top Clicked Brands (1-3) ───
    brand_1 = Column(String(200), nullable=True)
    brand_2 = Column(String(200), nullable=True)
    brand_3 = Column(String(200), nullable=True)

    # ─── Top Clicked Categories (1-3) ───
    category_1 = Column(String(200), nullable=True)
    category_2 = Column(String(200), nullable=True)
    category_3 = Column(String(200), nullable=True)

    # ─── Top Clicked Product #1 ───
    asin_1 = Column(String(20), nullable=True)
    title_1 = Column(Text, nullable=True)
    click_share_1 = Column(Numeric(8, 4), nullable=True)
    conversion_share_1 = Column(Numeric(8, 4), nullable=True)

    # ─── Top Clicked Product #2 ───
    asin_2 = Column(String(20), nullable=True)
    title_2 = Column(Text, nullable=True)
    click_share_2 = Column(Numeric(8, 4), nullable=True)
    conversion_share_2 = Column(Numeric(8, 4), nullable=True)

    # ─── Top Clicked Product #3 ───
    asin_3 = Column(String(20), nullable=True)
    title_3 = Column(Text, nullable=True)
    click_share_3 = Column(Numeric(8, 4), nullable=True)
    conversion_share_3 = Column(Numeric(8, 4), nullable=True)

    # ─── Metadata ───
    reporting_date = Column(Date, nullable=True)  # Original reporting date from file
    imported_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # ─── Topic linking (set by entity resolution pipeline) ───
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id"), nullable=True)

    __table_args__ = (
        # Unique constraint: one row per search term per country per month
        UniqueConstraint("country", "report_month", "search_term",
                         name="uq_ba_country_month_term"),
        # Primary query patterns
        Index("idx_ba_country_month", "country", "report_month"),
        Index("idx_ba_rank", "country", "report_month", "search_frequency_rank"),
        Index("idx_ba_search_term", "search_term"),
        Index("idx_ba_topic", "topic_id"),
        # Brand analysis
        Index("idx_ba_brand1", "brand_1"),
        Index("idx_ba_asin1", "asin_1"),
    )


class AmazonBAImportJob(Base):
    """Tracks upload/import jobs for Amazon BA files."""
    __tablename__ = "amazon_ba_import_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(500), nullable=False)
    country = Column(String(5), nullable=False, default="US")
    report_month = Column(Date, nullable=True)  # Detected or user-specified
    status = Column(String(20), default="pending")  # pending, processing, completed, failed
    total_rows = Column(Integer, default=0)
    rows_imported = Column(Integer, default=0)
    rows_skipped = Column(Integer, default=0)
    rows_error = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("idx_ba_job_status", "status"),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_ba_job_status"
        ),
    )
