"""Weekly Forecasting DAG - Prophet models for all active topics."""
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import uuid

default_args = {"owner": "neuranest", "retries": 2, "retry_delay": timedelta(minutes=10)}
dag = DAG("forecasting_weekly", default_args=default_args, schedule_interval="0 12 * * 2",
    start_date=datetime(2026, 1, 1), catchup=False, tags=["ml", "forecasting"])

def run_forecasts(**ctx):
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    import pandas as pd
    hook = PostgresHook(postgres_conn_id="neuranest_db")
    topics = hook.get_records("""
        SELECT t.id FROM topics t
        JOIN source_timeseries ts ON ts.topic_id = t.id
        WHERE t.is_active = true
        GROUP BY t.id HAVING COUNT(DISTINCT ts.date) >= 6
    """)
    for (topic_id,) in topics:
        ts_data = hook.get_pandas_df(
            "SELECT date as ds, AVG(COALESCE(normalized_value, raw_value)) as y FROM source_timeseries WHERE topic_id = %s GROUP BY date ORDER BY date",
            parameters=(str(topic_id),))
        if len(ts_data) < 6: continue
        try:
            from prophet import Prophet
            m = Prophet(yearly_seasonality=True, weekly_seasonality=False, changepoint_prior_scale=0.1, interval_width=0.80)
            m.fit(ts_data)
            for horizon in [3, 6]:
                future = m.make_future_dataframe(periods=horizon * 30, freq="D")
                forecast = m.predict(future)
                # Store monthly forecasts
                monthly = forecast.tail(horizon * 30).resample("M", on="ds").last()
                for _, row in monthly.iterrows():
                    hook.run("""INSERT INTO forecasts (id, topic_id, horizon_months, forecast_date, yhat, yhat_lower, yhat_upper, model_version, generated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
                        parameters=(str(uuid.uuid4()), str(topic_id), horizon, row["ds"].date(),
                            float(row["yhat"]), float(row["yhat_lower"]), float(row["yhat_upper"]), "prophet_v1"))
        except Exception as e:
            print(f"Forecast failed for {topic_id}: {e}")

t1 = PythonOperator(task_id="run_forecasts", python_callable=run_forecasts, dag=dag)
