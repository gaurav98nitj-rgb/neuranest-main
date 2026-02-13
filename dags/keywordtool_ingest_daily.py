"""KeywordTool.io Daily Ingestion DAG"""
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import logging, uuid
logger = logging.getLogger(__name__)

default_args = {"owner": "neuranest", "depends_on_past": False, "retries": 3, "retry_delay": timedelta(minutes=5)}

dag = DAG("keywordtool_ingest_daily", default_args=default_args,
    description="Fetch keyword volumes from KeywordTool.io",
    schedule_interval="0 2 * * *", start_date=datetime(2026, 1, 1), catchup=False, tags=["ingestion"])

def get_tracked_keywords(**ctx):
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    hook = PostgresHook(postgres_conn_id="neuranest_db")
    records = hook.get_records("SELECT id, keyword, geo FROM keywords WHERE source = 'keywordtool'")
    ctx["ti"].xcom_push(key="keywords", value=[{"id": str(r[0]), "keyword": r[1], "geo": r[2]} for r in records])

def fetch_from_api(**ctx):
    import httpx
    from airflow.models import Variable
    keywords = ctx["ti"].xcom_pull(key="keywords")
    api_key = Variable.get("KEYWORDTOOL_API_KEY")
    results = []
    for i in range(0, len(keywords), 50):
        batch = keywords[i:i+50]
        try:
            resp = httpx.get("https://api.keywordtool.io/v2/search/volume/google",
                params={"apikey": api_key, "keyword": [k["keyword"] for k in batch]}, timeout=30)
            resp.raise_for_status()
            results.append({"data": resp.json(), "keywords": batch})
        except Exception as e:
            results.append({"error": str(e), "keywords": batch})
    ctx["ti"].xcom_push(key="api_results", value=results)

def parse_and_upsert(**ctx):
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    hook = PostgresHook(postgres_conn_id="neuranest_db")
    results = ctx["ti"].xcom_pull(key="api_results")
    inserted = 0
    for batch in results:
        if "error" in batch: continue
        for kw in batch["keywords"]:
            vol = batch["data"].get("results", {}).get(kw["keyword"], {}).get("volume", 0)
            hook.run("""INSERT INTO source_timeseries (topic_id, source, date, geo, raw_value)
                SELECT k.topic_id, 'keywordtool', %s, k.geo, %s FROM keywords k WHERE k.id = %s AND k.topic_id IS NOT NULL
                ON CONFLICT (topic_id, source, date, geo) DO UPDATE SET raw_value = EXCLUDED.raw_value""",
                parameters=(ctx["ds"], vol, kw["id"]))
            inserted += 1
    ctx["ti"].xcom_push(key="inserted", value=inserted)

def log_run(**ctx):
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    hook = PostgresHook(postgres_conn_id="neuranest_db")
    hook.run("INSERT INTO ingestion_runs (id, dag_id, run_date, status, records_inserted, completed_at) VALUES (%s, 'keywordtool_ingest_daily', %s, 'success', %s, NOW())",
        parameters=(str(uuid.uuid4()), ctx["ds"], ctx["ti"].xcom_pull(key="inserted") or 0))

t1 = PythonOperator(task_id="get_keywords", python_callable=get_tracked_keywords, dag=dag)
t2 = PythonOperator(task_id="fetch_api", python_callable=fetch_from_api, dag=dag)
t3 = PythonOperator(task_id="upsert", python_callable=parse_and_upsert, dag=dag)
t4 = PythonOperator(task_id="log_run", python_callable=log_run, dag=dag)
t1 >> t2 >> t3 >> t4
