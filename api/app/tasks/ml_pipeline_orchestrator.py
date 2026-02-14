"""
NeuraNest — Phase 4 ML Pipeline Orchestrator
===============================================
Runs the complete ML pipeline end-to-end:

  1. Temporal Feature Store → 200+ features per topic per month
  2. Label Creation → Binary/multiclass success labels from Amazon BA
  3. XGBoost Training → Core prediction model with Optuna + SHAP
  4. Backtesting → Prove it works with walk-forward validation

Usage:
    # Full pipeline
    docker compose exec api python -c "
    from app.tasks.ml_pipeline_orchestrator import run_full_pipeline
    result = run_full_pipeline(country='US')
    "

    # Individual steps
    docker compose exec api python -c "
    from app.tasks.temporal_feature_store import build_feature_store
    result = build_feature_store(country='US')
    print(result)
    "
"""

import logging
import time

logger = logging.getLogger(__name__)


def run_full_pipeline(
    country: str = 'US',
    optuna_trials: int = 100,
    n_case_studies: int = 10,
    skip_if_fresh: bool = True,
) -> dict:
    """
    Run the complete Phase 4 ML pipeline.

    Steps:
    1. Build Temporal Feature Store (200+ features)
    2. Create Training Labels (binary + multiclass)
    3. Train XGBoost Success Predictor (with Optuna + SHAP)
    4. Run Backtesting Framework (rolling + case studies)

    Args:
        country: Country code for Amazon BA data
        optuna_trials: Number of Optuna hyperparameter trials
        n_case_studies: Number of case studies to generate
        skip_if_fresh: Skip steps if recently completed

    Returns:
        dict with results from all four steps
    """
    pipeline_start = time.time()
    results = {}

    logger.info("=" * 70)
    logger.info("NeuraNest Phase 4 — ML Pipeline Orchestrator")
    logger.info("=" * 70)

    # ---- Step 1: Temporal Feature Store ----
    logger.info("\n" + "=" * 70)
    logger.info("STEP 1/4: Building Temporal Feature Store")
    logger.info("=" * 70)

    from app.tasks.temporal_feature_store import build_feature_store

    fs_result = build_feature_store(country=country, save_to_db=True, return_df=True)
    results['feature_store'] = {
        k: v for k, v in fs_result.items() if k != 'dataframe'
    }
    feature_df = fs_result.get('dataframe')

    logger.info(f"Feature Store: {fs_result['rows']:,} rows, "
                f"{fs_result['features']} features, "
                f"{fs_result['topics']} topics")

    if feature_df is None or feature_df.empty:
        logger.error("Feature store is empty. Cannot proceed.")
        return {'status': 'failed', 'step': 'feature_store',
                'message': 'No features computed. Import data first.'}

    # ---- Step 2: Label Creation ----
    logger.info("\n" + "=" * 70)
    logger.info("STEP 2/4: Creating Training Labels")
    logger.info("=" * 70)

    from app.tasks.label_creation import create_labels

    label_result = create_labels(
        country=country,
        save_to_db=True,
        feature_store_df=feature_df,
    )
    results['labels'] = {
        k: v for k, v in label_result.items() if k != 'aligned_df'
    }
    aligned_df = label_result.get('aligned_df')

    logger.info(f"Labels: {label_result.get('total_samples', 0)} samples, "
                f"{label_result.get('success_rate', 0)}% success rate")

    if aligned_df is None or aligned_df.empty:
        logger.error("Label alignment failed. Need 6+ months of data per topic.")
        return {'status': 'failed', 'step': 'label_creation',
                'message': 'Insufficient data for label creation.', 'results': results}

    # ---- Step 3: XGBoost Training ----
    logger.info("\n" + "=" * 70)
    logger.info("STEP 3/4: Training XGBoost Success Predictor")
    logger.info("=" * 70)

    from app.tasks.xgboost_trainer import train_success_predictor

    train_result = train_success_predictor(
        country=country,
        n_trials=optuna_trials,
        aligned_df=aligned_df,
    )
    results['xgboost'] = {
        k: v for k, v in train_result.items()
        if k not in ('top_20_features',)  # Keep summary only
    }

    logger.info(f"XGBoost: F1={train_result.get('primary_f1', 0):.4f}")

    # ---- Step 4: Backtesting ----
    logger.info("\n" + "=" * 70)
    logger.info("STEP 4/4: Running Backtesting Framework")
    logger.info("=" * 70)

    from app.tasks.backtesting import run_backtest

    backtest_result = run_backtest(
        country=country,
        mode='rolling',
        n_case_studies=n_case_studies,
        save_report=True,
    )
    results['backtest'] = {
        'summary': backtest_result.get('summary', {}),
        'methodology': backtest_result.get('methodology', {}),
        'case_studies': backtest_result.get('case_studies', [])[:5],
    }

    # ---- Summary ----
    elapsed = time.time() - pipeline_start
    results['pipeline'] = {
        'status': 'success',
        'total_elapsed_seconds': round(elapsed, 1),
        'country': country,
    }

    logger.info("\n" + "=" * 70)
    logger.info("PIPELINE COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Total time: {elapsed:.1f}s")
    logger.info(f"Features: {fs_result.get('features', 0)} features × "
                f"{fs_result.get('topics', 0)} topics")
    logger.info(f"Labels: {label_result.get('total_samples', 0)} samples "
                f"({label_result.get('success_rate', 0)}% success)")
    logger.info(f"Model F1: {train_result.get('primary_f1', 0):.4f}")
    logger.info(f"UDSI v2 weights: {train_result.get('udsi_v2_weights', {})}")

    bt_summary = backtest_result.get('summary', {})
    logger.info(f"Backtest: precision={bt_summary.get('avg_precision', 'N/A')}, "
                f"recall={bt_summary.get('avg_recall', 'N/A')}, "
                f"target={'MET' if bt_summary.get('meets_target') else 'NOT MET'}")

    return results


# ---------------------------------------------------------------------------
# QUICK-CHECK: Verify prerequisites before running pipeline
# ---------------------------------------------------------------------------

def check_prerequisites(country: str = 'US') -> dict:
    """
    Check if all prerequisites for the ML pipeline are met.
    Returns status and any blocking issues.
    """
    from sqlalchemy import text as sa_text
    from app.database import sync_engine

    checks = {}

    with sync_engine.connect() as conn:
        # Amazon BA data
        ba_count = conn.execute(sa_text(
            "SELECT COUNT(*) FROM amazon_brand_analytics WHERE country = :c"
        ), {'c': country}).scalar()
        ba_months = conn.execute(sa_text(
            "SELECT COUNT(DISTINCT report_month) FROM amazon_brand_analytics WHERE country = :c"
        ), {'c': country}).scalar()
        ba_topics = conn.execute(sa_text(
            "SELECT COUNT(DISTINCT topic_id) FROM amazon_brand_analytics "
            "WHERE country = :c AND topic_id IS NOT NULL"
        ), {'c': country}).scalar()

        checks['amazon_ba'] = {
            'rows': ba_count,
            'months': ba_months,
            'linked_topics': ba_topics,
            'ok': ba_months >= 7 and ba_topics >= 10,
            'issue': None if ba_months >= 7 else f'Need 7+ months (have {ba_months}). '
                     f'Run remaining Amazon BA imports.' if ba_months < 7 else None,
        }

        # Entity Resolution
        er_count = conn.execute(sa_text(
            "SELECT COUNT(*) FROM entity_resolution WHERE topic_id IS NOT NULL"
        )).scalar()
        checks['entity_resolution'] = {
            'matched_terms': er_count,
            'ok': er_count >= 100,
            'issue': None if er_count >= 100 else 'Run entity resolution first.',
        }

        # Google Trends
        gt_count = conn.execute(sa_text(
            "SELECT COUNT(DISTINCT search_term) FROM google_trends_backfill"
        )).scalar()
        checks['google_trends'] = {
            'terms': gt_count,
            'ok': gt_count >= 10,
            'issue': None if gt_count >= 10 else f'Only {gt_count} terms. Run backfill.',
        }

        # Reddit
        rd_count = conn.execute(sa_text(
            "SELECT COUNT(DISTINCT search_term) FROM reddit_backfill"
        )).scalar()
        checks['reddit'] = {
            'terms': rd_count,
            'ok': rd_count >= 10,
            'issue': None if rd_count >= 10 else f'Only {rd_count} terms. Run backfill.',
        }

    # Overall verdict
    blocking = [name for name, check in checks.items()
                if not check['ok'] and name == 'amazon_ba']
    warnings = [name for name, check in checks.items()
                if not check['ok'] and name != 'amazon_ba']

    checks['verdict'] = {
        'can_proceed': len(blocking) == 0,
        'blocking_issues': blocking,
        'warnings': warnings,
    }

    return checks


# ---------------------------------------------------------------------------
# CELERY TASK
# ---------------------------------------------------------------------------

try:
    from app.celery_app import celery_app

    @celery_app.task(name='run_ml_pipeline', bind=True, max_retries=0)
    def run_full_pipeline_task(self, country: str = 'US', optuna_trials: int = 100):
        return run_full_pipeline(country=country, optuna_trials=optuna_trials)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import sys
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

    if '--check' in sys.argv:
        checks = check_prerequisites()
        print("\n=== PIPELINE PREREQUISITES ===")
        for name, check in checks.items():
            if name == 'verdict':
                print(f"\n  VERDICT: {'READY' if check['can_proceed'] else 'NOT READY'}")
                if check['blocking_issues']:
                    print(f"  Blocking: {check['blocking_issues']}")
                if check['warnings']:
                    print(f"  Warnings: {check['warnings']}")
            else:
                status = '✓' if check.get('ok') else '✗'
                print(f"  {status} {name}: {check}")
    else:
        result = run_full_pipeline(country='US')
        print("\n=== PIPELINE RESULTS ===")
        for step, data in result.items():
            print(f"\n{step}:")
            if isinstance(data, dict):
                for k, v in data.items():
                    if not isinstance(v, (list, dict)) or len(str(v)) < 200:
                        print(f"  {k}: {v}")
