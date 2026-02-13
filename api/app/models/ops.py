"""Operational tracking models: ingestion runs, data quality, error logs."""
from app.models.base import *


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dag_id = Column(String, nullable=False)
    run_date = Column(Date, nullable=False)
    status = Column(String, nullable=True)
    records_fetched = Column(Integer, default=0)
    records_inserted = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    dq_metrics = relationship("DQMetric", back_populates="run")

    __table_args__ = (
        CheckConstraint("status IN ('running', 'success', 'failed', 'partial')", name="ck_runs_status"),
    )


class DQMetric(Base):
    __tablename__ = "dq_metrics"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    run_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_runs.id"), nullable=True)
    metric_name = Column(String, nullable=False)
    metric_value = Column(Numeric, nullable=True)
    threshold = Column(Numeric, nullable=True)
    passed = Column(Boolean, nullable=True)

    run = relationship("IngestionRun", back_populates="dq_metrics")


class ErrorLog(Base):
    __tablename__ = "error_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False)
    error_type = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    stack_trace = Column(Text, nullable=True)
    context_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
