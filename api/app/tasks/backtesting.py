"""
NeuraNest — Backtesting Framework
====================================
Answers the critical question: "If NeuraNest existed in Jan 2025,
what would it have predicted? What actually happened by Dec 2025?"

This framework validates the prediction engine by:
1. Walking through time month-by-month
2. At each month, making predictions using ONLY data available at that point
3. Comparing predictions against actual outcomes 6 months later
4. Computing precision, recall, and economic value of predictions

Usage:
    from app.tasks.backtesting import run_backtest
    result = run_backtest(country='US')
"""

import json
import logging
import time
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database import sync_engine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

DEFAULT_TOP_K = [10, 25, 50, 100]
OUTCOME_HORIZON_MONTHS = 6
MIN_PREDICTION_CONFIDENCE = 0.5
TARGET_PRECISION_AT_50 = 0.70


# ---------------------------------------------------------------------------
# BACKTESTING ENGINE
# ---------------------------------------------------------------------------

class BacktestEngine:
    """Walk-forward backtesting engine for NeuraNest predictions."""

    def __init__(self, country: str = 'US'):
        self.country = country
        self.model = None

    def load_model(self, model=None):
        if model is not None:
            self.model = model
            return
        from app.tasks.xgboost_trainer import load_active_model
        self.model, _ = load_active_model()

    def load_feature_store(self) -> pd.DataFrame:
        with sync_engine.connect() as conn:
            df = pd.read_sql(text("""
                SELECT topic_id, month, features
                FROM temporal_features
                WHERE country = :country
                ORDER BY topic_id, month
            """), conn, params={'country': self.country})

        if df.empty:
            return pd.DataFrame()

        features_expanded = pd.json_normalize(df['features'])
        return pd.concat([df[['topic_id', 'month']], features_expanded], axis=1)

    def load_outcomes(self) -> pd.DataFrame:
        with sync_engine.connect() as conn:
            return pd.read_sql(text("""
                SELECT
                    topic_id,
                    report_month,
                    AVG(search_frequency_rank) as mean_rank,
                    MIN(search_frequency_rank) as min_rank,
                    COUNT(DISTINCT search_term) as term_count
                FROM amazon_brand_analytics
                WHERE country = :country AND topic_id IS NOT NULL
                GROUP BY topic_id, report_month
                ORDER BY topic_id, report_month
            """), conn, params={'country': self.country})

    def _compute_actual_outcome(
        self, outcomes_df: pd.DataFrame, topic_id: int,
        prediction_month, horizon_months: int = OUTCOME_HORIZON_MONTHS
    ) -> Optional[dict]:
        """Determine what actually happened to a topic after prediction_month."""
        topic_data = outcomes_df[outcomes_df['topic_id'] == topic_id].sort_values('report_month')
        if topic_data.empty:
            return None

        pred_data = topic_data[topic_data['report_month'] <= prediction_month]
        if pred_data.empty:
            return None
        starting_rank = pred_data.iloc[-1]['mean_rank']

        outcome_date = pd.Timestamp(prediction_month) + pd.DateOffset(months=horizon_months)
        future_data = topic_data[topic_data['report_month'] >= outcome_date.date()]
        if future_data.empty:
            return None
        ending_rank = future_data.iloc[0]['mean_rank']

        improvement_ratio = (starting_rank - ending_rank) / starting_rank if starting_rank > 0 else 0.0

        return {
            'starting_rank': starting_rank,
            'ending_rank': ending_rank,
            'improvement_ratio': improvement_ratio,
            'actual_success': 1 if improvement_ratio >= 0.70 else 0,
            'entered_top100': 1 if starting_rank > 100 and ending_rank <= 100 else 0,
        }

    # ------------------------------------------------------------------
    # POINT-IN-TIME BACKTEST
    # ------------------------------------------------------------------

    def run_point_in_time(self, prediction_month: str, top_k: list = None) -> dict:
        """
        Run backtest at a single point in time.
        Uses ONLY data available at prediction_month.
        Evaluates against outcomes 6 months later.
        """
        if top_k is None:
            top_k = DEFAULT_TOP_K

        prediction_month = pd.Timestamp(prediction_month).date()
        logger.info(f"Point-in-time backtest at {prediction_month}")

        features_df = self.load_feature_store()
        if features_df.empty:
            return {'status': 'error', 'message': 'Feature store is empty'}

        # Point-in-time: only features available at prediction month
        pit_features = features_df[features_df['month'] <= prediction_month]
        latest_features = pit_features.sort_values('month').groupby('topic_id').last().reset_index()

        if latest_features.empty:
            return {'status': 'error', 'message': 'No features before prediction month'}

        if self.model is None:
            self.load_model()

        feature_cols = [c for c in latest_features.columns if c not in ['topic_id', 'month']]
        X = latest_features[feature_cols].reindex(
            columns=self.model.feature_names_in_, fill_value=0
        ).fillna(0).replace([np.inf, -np.inf], 0).astype(np.float32)

        probabilities = self.model.predict_proba(X)[:, 1]

        predictions = pd.DataFrame({
            'topic_id': latest_features['topic_id'].values,
            'prediction_month': prediction_month,
            'success_probability': probabilities,
            'predicted_success': (probabilities >= MIN_PREDICTION_CONFIDENCE).astype(int),
        }).sort_values('success_probability', ascending=False)

        # Evaluate against actual outcomes
        outcomes_df = self.load_outcomes()
        results = []
        for _, pred in predictions.iterrows():
            outcome = self._compute_actual_outcome(outcomes_df, pred['topic_id'], prediction_month)
            if outcome is not None:
                results.append({**pred.to_dict(), **outcome})

        if not results:
            return {'status': 'no_outcomes', 'predictions': predictions.to_dict('records')}

        results_df = pd.DataFrame(results)

        # Precision@K
        precision_at_k = {}
        for k in top_k:
            if k > len(results_df):
                continue
            top_preds = results_df.nlargest(k, 'success_probability')
            p = top_preds['actual_success'].mean()
            precision_at_k[f'precision@{k}'] = round(p, 4)

        # Overall metrics
        pred_pos = results_df[results_df['predicted_success'] == 1]
        actual_pos = results_df[results_df['actual_success'] == 1]

        precision = pred_pos['actual_success'].mean() if len(pred_pos) > 0 else 0.0
        recall = actual_pos['predicted_success'].mean() if len(actual_pos) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        metrics = {
            'prediction_month': str(prediction_month),
            'topics_evaluated': len(results_df),
            'predicted_successes': int(results_df['predicted_success'].sum()),
            'actual_successes': int(results_df['actual_success'].sum()),
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1': round(f1, 4),
            **precision_at_k,
            'meets_target_p50': precision_at_k.get('precision@50', 0) >= TARGET_PRECISION_AT_50,
        }

        return {
            'status': 'success',
            'metrics': metrics,
            'predictions': results_df.sort_values('success_probability', ascending=False).to_dict('records'),
        }

    # ------------------------------------------------------------------
    # ROLLING BACKTEST
    # ------------------------------------------------------------------

    def run_rolling_backtest(
        self,
        start_month: str = None,
        end_month: str = None,
        step_months: int = 1,
        top_k: list = None,
    ) -> dict:
        """
        Walk-forward rolling backtest across multiple months.
        At each month, predict using only past data, evaluate against future outcomes.
        """
        if top_k is None:
            top_k = DEFAULT_TOP_K

        logger.info("Running rolling backtest...")

        with sync_engine.connect() as conn:
            months = conn.execute(text("""
                SELECT DISTINCT report_month
                FROM amazon_brand_analytics
                WHERE country = :country AND topic_id IS NOT NULL
                ORDER BY report_month
            """), {'country': self.country}).fetchall()

        if len(months) < OUTCOME_HORIZON_MONTHS + 3:
            return {'status': 'insufficient_data',
                    'message': f'Need {OUTCOME_HORIZON_MONTHS + 3}+ months, have {len(months)}'}

        available_months = [row[0] for row in months]

        # Determine start/end indices
        start_idx = 6  # Need 6 months of history for features
        end_idx = len(available_months) - OUTCOME_HORIZON_MONTHS  # Need 6mo forward for outcomes

        if start_month:
            sm = pd.Timestamp(start_month).date()
            start_idx = max(start_idx, next((i for i, m in enumerate(available_months) if m >= sm), start_idx))
        if end_month:
            em = pd.Timestamp(end_month).date()
            end_idx = min(end_idx, next((i for i, m in enumerate(available_months) if m > em), end_idx))

        prediction_months = available_months[start_idx:end_idx:step_months]

        if not prediction_months:
            return {'status': 'error', 'message': 'No valid prediction months in range'}

        logger.info(f"Backtest: {prediction_months[0]} → {prediction_months[-1]} "
                    f"({len(prediction_months)} months)")

        monthly_metrics = []
        all_predictions = []

        for pred_month in prediction_months:
            result = self.run_point_in_time(str(pred_month), top_k=top_k)
            if result['status'] == 'success':
                monthly_metrics.append(result['metrics'])
                all_predictions.extend(result.get('predictions', []))

        if not monthly_metrics:
            return {'status': 'no_results', 'message': 'No successful backtests'}

        # Aggregate metrics
        metrics_df = pd.DataFrame(monthly_metrics)
        aggregate = {
            'months_tested': len(monthly_metrics),
            'date_range': f"{metrics_df['prediction_month'].min()} to {metrics_df['prediction_month'].max()}",
            'avg_precision': round(metrics_df['precision'].mean(), 4),
            'avg_recall': round(metrics_df['recall'].mean(), 4),
            'avg_f1': round(metrics_df['f1'].mean(), 4),
            'std_precision': round(metrics_df['precision'].std(), 4),
            'total_predicted_successes': int(metrics_df['predicted_successes'].sum()),
            'total_actual_successes': int(metrics_df['actual_successes'].sum()),
        }

        # Average precision@K across months
        for k in top_k:
            col = f'precision@{k}'
            if col in metrics_df.columns:
                aggregate[f'avg_{col}'] = round(metrics_df[col].mean(), 4)
                aggregate[f'std_{col}'] = round(metrics_df[col].std(), 4)

        aggregate['meets_target'] = aggregate.get('avg_precision@50', 0) >= TARGET_PRECISION_AT_50

        logger.info(f"\n{'='*60}")
        logger.info("ROLLING BACKTEST RESULTS")
        logger.info(f"{'='*60}")
        for k, v in aggregate.items():
            logger.info(f"  {k}: {v}")

        return {
            'status': 'success',
            'aggregate_metrics': aggregate,
            'monthly_metrics': monthly_metrics,
            'all_predictions': all_predictions,
        }

    # ------------------------------------------------------------------
    # CASE STUDY GENERATOR
    # ------------------------------------------------------------------

    def generate_case_studies(self, n_cases: int = 10) -> list:
        """
        Generate compelling case studies from backtest results.

        Finds the most impressive predictions: topics where NeuraNest
        would have flagged opportunity 6+ months before it materialized.
        """
        logger.info(f"Generating top {n_cases} case studies...")

        outcomes_df = self.load_outcomes()
        features_df = self.load_feature_store()

        if outcomes_df.empty or features_df.empty:
            return []

        if self.model is None:
            self.load_model()

        # Find topics with strong actual outcomes (>70% rank improvement)
        strong_outcomes = []
        for topic_id in outcomes_df['topic_id'].unique():
            topic_data = outcomes_df[outcomes_df['topic_id'] == topic_id].sort_values('report_month')
            if len(topic_data) < 7:
                continue

            for i in range(len(topic_data) - 6):
                start_rank = topic_data.iloc[i]['mean_rank']
                end_rank = topic_data.iloc[i + 6]['mean_rank']
                if start_rank > 100 and start_rank > 0:
                    improvement = (start_rank - end_rank) / start_rank
                    if improvement >= 0.70:
                        strong_outcomes.append({
                            'topic_id': topic_id,
                            'start_month': topic_data.iloc[i]['report_month'],
                            'end_month': topic_data.iloc[i + 6]['report_month'],
                            'start_rank': start_rank,
                            'end_rank': end_rank,
                            'improvement': improvement,
                        })

        if not strong_outcomes:
            logger.info("No strong outcomes found for case studies")
            return []

        strong_df = pd.DataFrame(strong_outcomes).sort_values('improvement', ascending=False)

        # For each strong outcome, check if NeuraNest would have predicted it
        case_studies = []
        for _, outcome in strong_df.iterrows():
            pred_month = outcome['start_month']
            topic_id = outcome['topic_id']

            # Get features at prediction time
            topic_features = features_df[
                (features_df['topic_id'] == topic_id) &
                (features_df['month'] <= pred_month)
            ]
            if topic_features.empty:
                continue

            latest = topic_features.sort_values('month').iloc[-1]
            feature_cols = [c for c in latest.index if c not in ['topic_id', 'month']]
            X = pd.DataFrame([latest[feature_cols]]).reindex(
                columns=self.model.feature_names_in_, fill_value=0
            ).fillna(0).replace([np.inf, -np.inf], 0).astype(np.float32)

            prob = self.model.predict_proba(X)[0, 1]

            # Get topic name
            with sync_engine.connect() as conn:
                topic_name = conn.execute(text(
                    "SELECT name FROM topics WHERE id = :id"
                ), {'id': str(topic_id)}).scalar() or f"Topic #{topic_id}"

            case_studies.append({
                'topic_id': str(topic_id),
                'topic_name': topic_name,
                'prediction_month': str(pred_month),
                'outcome_month': str(outcome['end_month']),
                'starting_rank': round(outcome['start_rank']),
                'ending_rank': round(outcome['end_rank']),
                'actual_improvement': round(outcome['improvement'] * 100, 1),
                'predicted_probability': round(prob, 4),
                'would_have_flagged': prob >= MIN_PREDICTION_CONFIDENCE,
                'lead_time_months': 6,
            })

            if len(case_studies) >= n_cases:
                break

        # Sort by probability (best predictions first)
        case_studies.sort(key=lambda x: -x['predicted_probability'])

        hits = sum(1 for cs in case_studies if cs['would_have_flagged'])
        logger.info(f"Case studies: {len(case_studies)} generated, "
                    f"{hits} would have been flagged ({hits/len(case_studies)*100:.0f}% hit rate)")

        return case_studies


# ---------------------------------------------------------------------------
# REPORT GENERATION
# ---------------------------------------------------------------------------

def generate_backtest_report(results: dict, case_studies: list = None) -> dict:
    """
    Generate a comprehensive backtest report for investors/stakeholders.

    The report proves NeuraNest's predictive value with metrics and examples.
    """
    report = {
        'title': 'NeuraNest Prediction Engine — Backtest Report',
        'generated_at': pd.Timestamp.now().isoformat(),
        'summary': {},
        'metrics': {},
        'case_studies': [],
        'methodology': {
            'approach': 'Walk-forward temporal backtesting with strict point-in-time features',
            'outcome_horizon': f'{OUTCOME_HORIZON_MONTHS} months',
            'success_definition': 'Search frequency rank improved by >70% over 6 months',
            'data_leakage_prevention': 'Only features available BEFORE prediction date used',
            'target': f'>70% precision on top 50 predictions (Blueprint v4.0)',
        },
    }

    if results.get('status') == 'success':
        agg = results.get('aggregate_metrics', {})
        report['summary'] = {
            'verdict': 'TARGET MET' if agg.get('meets_target') else 'IN PROGRESS',
            'months_tested': agg.get('months_tested', 0),
            'avg_precision': agg.get('avg_precision', 0),
            'avg_recall': agg.get('avg_recall', 0),
            'avg_f1': agg.get('avg_f1', 0),
            'total_topics_evaluated': sum(
                m.get('topics_evaluated', 0) for m in results.get('monthly_metrics', [])
            ),
        }
        report['metrics'] = agg

    if case_studies:
        report['case_studies'] = case_studies[:10]
        flagged = [cs for cs in case_studies if cs.get('would_have_flagged')]
        report['summary']['case_study_hit_rate'] = (
            len(flagged) / len(case_studies) if case_studies else 0
        )

    return report


def save_backtest_report(report: dict):
    """Save backtest report to database."""
    create_sql = """
    CREATE TABLE IF NOT EXISTS backtest_reports (
        id SERIAL PRIMARY KEY,
        report JSONB NOT NULL,
        verdict VARCHAR(50),
        avg_precision FLOAT,
        avg_f1 FLOAT,
        months_tested INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
    );
    """
    with sync_engine.begin() as conn:
        conn.execute(text(create_sql))
        conn.execute(text("""
            INSERT INTO backtest_reports (report, verdict, avg_precision, avg_f1, months_tested)
            VALUES (CAST(:report AS jsonb), :verdict, :avg_precision, :avg_f1, :months_tested)
        """), {
            'report': json.dumps(report, default=str),
            'verdict': report.get('summary', {}).get('verdict', 'UNKNOWN'),
            'avg_precision': report.get('summary', {}).get('avg_precision', 0),
            'avg_f1': report.get('summary', {}).get('avg_f1', 0),
            'months_tested': report.get('summary', {}).get('months_tested', 0),
        })


# ---------------------------------------------------------------------------
# MAIN ORCHESTRATOR
# ---------------------------------------------------------------------------

def run_backtest(
    country: str = 'US',
    mode: str = 'rolling',
    prediction_month: str = None,
    start_month: str = None,
    end_month: str = None,
    step_months: int = 1,
    top_k: list = None,
    n_case_studies: int = 10,
    save_report: bool = True,
) -> dict:
    """
    Run the complete backtesting pipeline.

    Args:
        country: Country code
        mode: 'rolling' for walk-forward, 'point' for single month
        prediction_month: For point-in-time mode
        start_month: Start of rolling backtest range
        end_month: End of rolling backtest range
        step_months: Months between predictions in rolling mode
        top_k: K values for precision@K
        n_case_studies: Number of case studies to generate
        save_report: Whether to save report to database

    Returns:
        Complete backtest report with metrics, predictions, and case studies
    """
    start_time = time.time()
    logger.info("=" * 60)
    logger.info("NeuraNest Backtesting Framework")
    logger.info("=" * 60)

    engine = BacktestEngine(country=country)
    engine.load_model()

    # Run backtest
    if mode == 'point' and prediction_month:
        results = engine.run_point_in_time(prediction_month, top_k=top_k)
    else:
        results = engine.run_rolling_backtest(
            start_month=start_month,
            end_month=end_month,
            step_months=step_months,
            top_k=top_k,
        )

    # Generate case studies
    case_studies = []
    if results.get('status') == 'success' and n_case_studies > 0:
        case_studies = engine.generate_case_studies(n_cases=n_case_studies)

    # Generate report
    report = generate_backtest_report(results, case_studies)
    report['elapsed_seconds'] = round(time.time() - start_time, 1)

    if save_report:
        save_backtest_report(report)
        logger.info("Report saved to database")

    # Print summary
    logger.info(f"\n{'='*60}")
    logger.info("BACKTEST SUMMARY")
    logger.info(f"{'='*60}")
    summary = report.get('summary', {})
    for k, v in summary.items():
        logger.info(f"  {k}: {v}")

    if case_studies:
        logger.info(f"\nTop Case Studies:")
        for i, cs in enumerate(case_studies[:5]):
            logger.info(
                f"  {i+1}. {cs['topic_name']}: "
                f"rank {cs['starting_rank']} → {cs['ending_rank']} "
                f"({cs['actual_improvement']}% improvement), "
                f"P(success)={cs['predicted_probability']:.2f} "
                f"{'✓ FLAGGED' if cs['would_have_flagged'] else '✗ MISSED'}"
            )

    return report


# ---------------------------------------------------------------------------
# CELERY TASK WRAPPER
# ---------------------------------------------------------------------------

try:
    from app.celery_app import celery_app

    @celery_app.task(name='run_backtest')
    def run_backtest_task(country: str = 'US', mode: str = 'rolling'):
        return run_backtest(country=country, mode=mode)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# CLI ENTRYPOINT
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    report = run_backtest(country='US', mode='rolling', n_case_studies=10)

    print(f"\n{'='*60}")
    print("FINAL BACKTEST REPORT")
    print(f"{'='*60}")
    print(json.dumps(report.get('summary', {}), indent=2, default=str))
