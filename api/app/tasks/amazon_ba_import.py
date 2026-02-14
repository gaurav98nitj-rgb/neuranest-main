"""
Amazon Brand Analytics Import Pipeline.

Handles large XLSX/CSV files (700-900 MB, 100K+ rows):
  - Chunked reading (10K rows at a time)
  - Batch INSERT with ON CONFLICT (upsert)
  - Progress tracking via import_jobs table
  - Auto-detects report_month from Reporting Date column
  - Supports multi-country import

Usage:
  # Direct call (for testing)
  from app.tasks.amazon_ba_import import import_amazon_ba_file
  import_amazon_ba_file("/path/to/file.xlsx", country="US")

  # Via Celery (for production)
  import_amazon_ba_file.delay("/path/to/file.xlsx", country="US")
"""
import os
import uuid
import json
import traceback
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

import structlog
from sqlalchemy import text

from app.tasks import celery_app
from app.tasks.db_helpers import get_sync_db
from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

BATCH_SIZE = 5000  # Rows per INSERT batch
COLUMN_MAP = {
    "Search Frequency Rank": "search_frequency_rank",
    "Search Term": "search_term",
    "Top Clicked Brand #1": "brand_1",
    "Top Clicked Brands #2": "brand_2",
    "Top Clicked Brands #3": "brand_3",
    "Top Clicked Category #1": "category_1",
    "Top Clicked Category #2": "category_2",
    "Top Clicked Category #3": "category_3",
    "Top Clicked Product #1: ASIN": "asin_1",
    "Top Clicked Product #1: Product Title": "title_1",
    "Top Clicked Product #1: Click Share": "click_share_1",
    "Top Clicked Product #1: Conversion Share": "conversion_share_1",
    "Top Clicked Product #2: ASIN": "asin_2",
    "Top Clicked Product #2: Product Title": "title_2",
    "Top Clicked Product #2: Click Share": "click_share_2",
    "Top Clicked Product #2: Conversion Share": "conversion_share_2",
    "Top Clicked Product #3: ASIN": "asin_3",
    "Top Clicked Product #3: Product Title": "title_3",
    "Top Clicked Product #3: Click Share": "click_share_3",
    "Top Clicked Product #3: Conversion Share": "conversion_share_3",
    "Reporting Date": "reporting_date",
}


def _safe_decimal(val):
    """Convert value to Decimal safely, returning None for invalid."""
    if val is None or val == "" or val == "N/A" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError, InvalidOperation):
        return None


def _safe_int(val):
    """Convert to int safely."""
    if val is None or val == "" or val == "N/A" or val == "-":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_str(val, max_len=None):
    """Convert to string safely."""
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s == "N/A" or s == "-":
        return None
    if max_len:
        s = s[:max_len]
    return s


def _detect_report_month(reporting_date):
    """Extract report month (first day of month) from reporting date."""
    if reporting_date is None:
        return None
    if isinstance(reporting_date, datetime):
        return date(reporting_date.year, reporting_date.month, 1)
    if isinstance(reporting_date, date):
        return date(reporting_date.year, reporting_date.month, 1)
    if isinstance(reporting_date, str):
        try:
            from dateutil.parser import parse
            dt = parse(reporting_date)
            return date(dt.year, dt.month, 1)
        except Exception:
            pass
    return None


def _read_xlsx_chunked(filepath, chunk_size=BATCH_SIZE):
    """Read XLSX file in chunks using openpyxl read-only mode (memory efficient)."""
    import openpyxl
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active

    # Read header row
    header_row = None
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter)
    headers = list(header_row)

    # Map column positions
    col_indices = {}
    for i, h in enumerate(headers):
        if h and h.strip() in COLUMN_MAP:
            col_indices[i] = COLUMN_MAP[h.strip()]

    chunk = []
    total_read = 0

    for row in rows_iter:
        record = {}
        for col_idx, field_name in col_indices.items():
            if col_idx < len(row):
                record[field_name] = row[col_idx]
        chunk.append(record)
        total_read += 1

        if len(chunk) >= chunk_size:
            yield chunk, total_read
            chunk = []

    if chunk:
        yield chunk, total_read

    wb.close()


def _read_csv_chunked(filepath, chunk_size=BATCH_SIZE):
    """Read CSV file in chunks. Handles Amazon BA metadata header row."""
    import csv
    csv.field_size_limit(10 * 1024 * 1024)  # 10MB field limit for long titles
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        # Amazon BA CSVs have a metadata row before the real headers
        # e.g.: Reporting Range=["Monthly"],Select year=["2024"],...
        first_line = f.readline()
        if '"Search Frequency Rank"' not in first_line:
            # First line was metadata, next line is the real header — continue
            pass
        else:
            # First line IS the header, seek back
            f.seek(0)

        reader = csv.DictReader(f)
        chunk = []
        total_read = 0

        for row in reader:
            record = {}
            for csv_col, db_col in COLUMN_MAP.items():
                if csv_col in row:
                    record[db_col] = row[csv_col]
            chunk.append(record)
            total_read += 1

            if len(chunk) >= chunk_size:
                yield chunk, total_read
                chunk = []

        if chunk:
            yield chunk, total_read


def _insert_batch(session, rows, country, report_month):
    """Insert a batch of rows with ON CONFLICT upsert."""
    if not rows:
        return 0, 0, 0

    inserted = 0
    skipped = 0
    errors = 0

    for row in rows:
        try:
            search_term = _safe_str(row.get("search_term"))
            if not search_term:
                skipped += 1
                continue

            rank = _safe_int(row.get("search_frequency_rank"))
            if rank is None:
                skipped += 1
                continue

            # Detect report_month from row if not provided
            row_report_month = report_month
            if not row_report_month:
                row_report_month = _detect_report_month(row.get("reporting_date"))
            if not row_report_month:
                skipped += 1
                continue

            reporting_date = row.get("reporting_date")
            if isinstance(reporting_date, datetime):
                reporting_date = reporting_date.date()
            elif isinstance(reporting_date, str):
                try:
                    from dateutil.parser import parse
                    reporting_date = parse(reporting_date).date()
                except Exception:
                    reporting_date = None

            session.execute(text("""
                INSERT INTO amazon_brand_analytics
                    (country, report_month, search_frequency_rank, search_term,
                     brand_1, brand_2, brand_3,
                     category_1, category_2, category_3,
                     asin_1, title_1, click_share_1, conversion_share_1,
                     asin_2, title_2, click_share_2, conversion_share_2,
                     asin_3, title_3, click_share_3, conversion_share_3,
                     reporting_date, imported_at)
                VALUES
                    (:country, :report_month, :rank, :search_term,
                     :brand_1, :brand_2, :brand_3,
                     :cat_1, :cat_2, :cat_3,
                     :asin_1, :title_1, :cs_1, :cvs_1,
                     :asin_2, :title_2, :cs_2, :cvs_2,
                     :asin_3, :title_3, :cs_3, :cvs_3,
                     :reporting_date, NOW())
                ON CONFLICT ON CONSTRAINT uq_ba_country_month_term
                DO UPDATE SET
                    search_frequency_rank = EXCLUDED.search_frequency_rank,
                    brand_1 = EXCLUDED.brand_1, brand_2 = EXCLUDED.brand_2, brand_3 = EXCLUDED.brand_3,
                    category_1 = EXCLUDED.category_1, category_2 = EXCLUDED.category_2, category_3 = EXCLUDED.category_3,
                    asin_1 = EXCLUDED.asin_1, title_1 = EXCLUDED.title_1,
                    click_share_1 = EXCLUDED.click_share_1, conversion_share_1 = EXCLUDED.conversion_share_1,
                    asin_2 = EXCLUDED.asin_2, title_2 = EXCLUDED.title_2,
                    click_share_2 = EXCLUDED.click_share_2, conversion_share_2 = EXCLUDED.conversion_share_2,
                    asin_3 = EXCLUDED.asin_3, title_3 = EXCLUDED.title_3,
                    click_share_3 = EXCLUDED.click_share_3, conversion_share_3 = EXCLUDED.conversion_share_3,
                    reporting_date = EXCLUDED.reporting_date, imported_at = NOW()
            """), {
                "country": country,
                "report_month": row_report_month,
                "rank": rank,
                "search_term": search_term[:500],
                "brand_1": _safe_str(row.get("brand_1"), 200),
                "brand_2": _safe_str(row.get("brand_2"), 200),
                "brand_3": _safe_str(row.get("brand_3"), 200),
                "cat_1": _safe_str(row.get("category_1"), 200),
                "cat_2": _safe_str(row.get("category_2"), 200),
                "cat_3": _safe_str(row.get("category_3"), 200),
                "asin_1": _safe_str(row.get("asin_1"), 20),
                "title_1": _safe_str(row.get("title_1")),
                "cs_1": _safe_decimal(row.get("click_share_1")),
                "cvs_1": _safe_decimal(row.get("conversion_share_1")),
                "asin_2": _safe_str(row.get("asin_2"), 20),
                "title_2": _safe_str(row.get("title_2")),
                "cs_2": _safe_decimal(row.get("click_share_2")),
                "cvs_2": _safe_decimal(row.get("conversion_share_2")),
                "asin_3": _safe_str(row.get("asin_3"), 20),
                "title_3": _safe_str(row.get("title_3")),
                "cs_3": _safe_decimal(row.get("click_share_3")),
                "cvs_3": _safe_decimal(row.get("conversion_share_3")),
                "reporting_date": reporting_date,
            })
            inserted += 1

        except Exception as e:
            errors += 1
            if errors <= 5:
                logger.warning("ba_import: row error",
                               term=row.get("search_term", "?")[:50],
                               error=str(e)[:200])

    session.commit()
    return inserted, skipped, errors


@celery_app.task(name="app.tasks.amazon_ba_import.import_amazon_ba_file",
                 bind=True, max_retries=1, time_limit=3600)
def import_amazon_ba_file(self, filepath: str, country: str = "US",
                           report_month_str: str = None, job_id: str = None):
    """
    Import an Amazon Brand Analytics XLSX/CSV file.

    Args:
        filepath: Path to the XLSX or CSV file inside the container
        country: Amazon marketplace country code (US, UK, DE, JP, etc.)
        report_month_str: Optional "YYYY-MM-DD" for report month. Auto-detected if not provided.
        job_id: Optional import job ID to track progress
    """
    report_month = None
    if report_month_str:
        try:
            report_month = date.fromisoformat(report_month_str)
        except ValueError:
            pass

    total_imported = 0
    total_skipped = 0
    total_errors = 0
    total_read = 0

    logger.info("ba_import: starting", filepath=filepath, country=country)

    # Create or update job record
    if not job_id:
        job_id = str(uuid.uuid4())

    with get_sync_db() as session:
        session.execute(text("""
            INSERT INTO amazon_ba_import_jobs (id, filename, country, report_month, status, started_at)
            VALUES (:id, :fname, :country, :month, 'processing', NOW())
            ON CONFLICT (id) DO UPDATE SET status = 'processing', started_at = NOW()
        """), {"id": job_id, "fname": os.path.basename(filepath), "country": country, "month": report_month})
        session.commit()

    try:
        # Choose reader based on file extension
        ext = os.path.splitext(filepath)[1].lower()
        if ext in ('.xlsx', '.xls'):
            reader = _read_xlsx_chunked(filepath, BATCH_SIZE)
        elif ext in ('.csv', '.tsv'):
            reader = _read_csv_chunked(filepath, BATCH_SIZE)
        else:
            raise ValueError(f"Unsupported file format: {ext}. Use .xlsx or .csv")

        # Process chunks
        for chunk, read_so_far in reader:
            total_read = read_so_far

            # Auto-detect report_month from first chunk if needed
            if not report_month and chunk:
                for row in chunk[:10]:
                    rm = _detect_report_month(row.get("reporting_date"))
                    if rm:
                        report_month = rm
                        break

            with get_sync_db() as session:
                ins, skip, err = _insert_batch(session, chunk, country, report_month)
                total_imported += ins
                total_skipped += skip
                total_errors += err

            # Update progress every batch
            with get_sync_db() as session:
                session.execute(text("""
                    UPDATE amazon_ba_import_jobs
                    SET total_rows = :total, rows_imported = :imported,
                        rows_skipped = :skipped, rows_error = :errors,
                        report_month = :month
                    WHERE id = :id
                """), {
                    "id": job_id, "total": total_read,
                    "imported": total_imported, "skipped": total_skipped,
                    "errors": total_errors, "month": report_month,
                })
                session.commit()

            logger.info("ba_import: progress",
                        read=total_read, imported=total_imported,
                        skipped=total_skipped, errors=total_errors)

        # Mark complete
        with get_sync_db() as session:
            session.execute(text("""
                UPDATE amazon_ba_import_jobs
                SET status = 'completed', completed_at = NOW(),
                    total_rows = :total, rows_imported = :imported,
                    rows_skipped = :skipped, rows_error = :errors,
                    report_month = :month
                WHERE id = :id
            """), {
                "id": job_id, "total": total_read,
                "imported": total_imported, "skipped": total_skipped,
                "errors": total_errors, "month": report_month,
            })
            session.commit()

        logger.info("ba_import: COMPLETE",
                     total=total_read, imported=total_imported,
                     skipped=total_skipped, errors=total_errors,
                     country=country, month=str(report_month))

    except Exception as e:
        logger.error("ba_import: FAILED", error=str(e))
        with get_sync_db() as session:
            session.execute(text("""
                UPDATE amazon_ba_import_jobs
                SET status = 'failed', completed_at = NOW(),
                    error_message = :err, total_rows = :total,
                    rows_imported = :imported
                WHERE id = :id
            """), {
                "id": job_id, "err": str(e)[:2000],
                "total": total_read, "imported": total_imported,
            })
            session.commit()
        raise

    return {
        "job_id": job_id, "status": "completed",
        "country": country, "report_month": str(report_month),
        "total_rows": total_read, "imported": total_imported,
        "skipped": total_skipped, "errors": total_errors,
    }
