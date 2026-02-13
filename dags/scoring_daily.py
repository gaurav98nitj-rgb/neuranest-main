"""Daily Scoring DAG - computes opportunity and competition scores."""
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import uuid

default_args = {"owner": "neuranest", "retries": 2, "retry_delay": timedelta(minutes=3)}
dag = DAG("scoring_daily", default_args=default_args, schedule_interval="0 9 * * *",
    start_date=datetime(2026, 1, 1), catchup=False, tags=["ml", "scoring"])

def compute_scores(**ctx):
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    hook = PostgresHook(postgres_conn_id="neuranest_db")
    topics = hook.get_records("SELECT id FROM topics WHERE is_active = true")
    for (topic_id,) in topics:
        # Simplified: in production, gather all signals and call scoring.py functions
        hook.run("""INSERT INTO scores (id, topic_id, score_type, score_value, explanation_json, computed_at)
            VALUES (%s, %s, 'opportunity', 50.0, '{}', NOW())
            ON CONFLICT DO NOTHING""", parameters=(str(uuid.uuid4()), str(topic_id)))

t1 = PythonOperator(task_id="compute_scores", python_callable=compute_scores, dag=dag)
