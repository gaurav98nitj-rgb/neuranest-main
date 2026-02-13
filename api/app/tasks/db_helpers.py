"""
Shared database utilities for Celery tasks.
Tasks use SYNC sessions since Celery workers are synchronous.
"""
import uuid
from datetime import datetime, date
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from app.config import get_settings

settings = get_settings()

_sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_size=5,
    max_overflow=3,
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)


@contextmanager
def get_sync_db() -> Session:
    """Context manager for sync DB sessions in Celery tasks."""
    session = SyncSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def log_ingestion_run(session: Session, dag_id: str, run_date: date,
                       status: str, records_fetched: int = 0,
                       records_inserted: int = 0, records_skipped: int = 0,
                       error_count: int = 0, started_at: datetime = None,
                       completed_at: datetime = None) -> str:
    """Insert a row into ingestion_runs and return the run ID."""
    run_id = str(uuid.uuid4())
    session.execute(text("""
        INSERT INTO ingestion_runs (id, dag_id, run_date, status,
            records_fetched, records_inserted, records_skipped,
            error_count, started_at, completed_at)
        VALUES (:id, :dag_id, :run_date, :status,
            :fetched, :inserted, :skipped, :errors, :started, :completed)
    """), {
        "id": run_id, "dag_id": dag_id, "run_date": run_date,
        "status": status, "fetched": records_fetched,
        "inserted": records_inserted, "skipped": records_skipped,
        "errors": error_count, "started": started_at, "completed": completed_at,
    })
    return run_id


def update_ingestion_run(session: Session, run_id: str, status: str,
                          records_fetched: int = 0, records_inserted: int = 0,
                          records_skipped: int = 0, error_count: int = 0):
    """Update an existing ingestion run."""
    session.execute(text("""
        UPDATE ingestion_runs
        SET status = :status, records_fetched = :fetched,
            records_inserted = :inserted, records_skipped = :skipped,
            error_count = :errors, completed_at = :completed
        WHERE id = :id
    """), {
        "id": run_id, "status": status, "fetched": records_fetched,
        "inserted": records_inserted, "skipped": records_skipped,
        "errors": error_count, "completed": datetime.utcnow(),
    })


def log_error(session: Session, source: str, error_type: str,
              message: str, context: dict = None):
    """Insert a row into error_logs."""
    import json as _json
    session.execute(text("""
        INSERT INTO error_logs (source, error_type, message, context_json, created_at)
        VALUES (:source, :error_type, :message, CAST(:context AS jsonb), :now)
    """), {
        "source": source, "error_type": error_type,
        "message": message[:2000],
        "context": _json.dumps(context) if context else None,
        "now": datetime.utcnow(),
    })
