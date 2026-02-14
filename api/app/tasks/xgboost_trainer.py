"""
NeuraNest — XGBoost Success Predictor
=======================================
THE core ML model. Predicts P(success) for product topics based on
upstream signal features computed 6-12 months before outcomes.

Architecture (from Blueprint v4.0):
  - XGBoost Classifier → P(success | features)
  - Temporal train/validate/test split (no data leakage)
  - Optuna hyperparameter tuning (200 trials, optimize F1)
  - SHAP feature importance (reveals which signals matter most)
  - Model versioning and persistence

Training Pipeline:
  1. Load aligned features + labels from feature store + label pipeline
  2. Preprocess (handle class imbalance, standardize if needed)
  3. Train XGBoost with Optuna-tuned hyperparameters
  4. Evaluate on validation and test sets
  5. Compute SHAP values for explainability
  6. Save model, metrics, and SHAP analysis to database
  7. Generate UDSI v2 learned weights from SHAP

Usage:
    from app.tasks.xgboost_trainer import train_success_predictor
    result = train_success_predictor(country='US')
"""

import json
import logging
import os
import pickle
import time
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database import sync_engine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

MODEL_DIR = os.environ.get('NEURANEST_MODEL_DIR', '/app/models')
OPTUNA_N_TRIALS = int(os.environ.get('OPTUNA_N_TRIALS', '100'))
RANDOM_SEED = 42

# Feature columns to exclude from training
META_COLUMNS = {
    'topic_id', 'feature_month', 'outcome_month', 'month', 'split',
    'starting_rank', 'ending_rank', 'rank_change_abs',
    'rank_improvement_ratio', 'term_count_at_start', 'min_rank_at_start',
    'label_binary', 'label_multiclass', 'label_class_name',
    'label_entered_top100', 'country',
}

# Signal group mapping for SHAP analysis (feature name prefix → signal group)
SIGNAL_GROUPS = {
    'rank_': 'Amazon Demand',
    'click_share_': 'Click Dynamics',
    'conv_share_': 'Click Dynamics',
    'click_conv_': 'Click Dynamics',
    'brand_': 'Brand Competition',
    'search_term_': 'Brand Competition',
    'gt_': 'Google Search',
    'reddit_': 'Social (Reddit)',
    'tiktok_': 'Social (TikTok)',
    'ig_': 'Social (Instagram)',
    'social_': 'Social (Cross-Platform)',
    'science_': 'Science Signal',
    'season_': 'Seasonality',
    'convergence_': 'Convergence',
}


def _get_signal_group(feature_name: str) -> str:
    """Map a feature name to its signal group."""
    for prefix, group in SIGNAL_GROUPS.items():
        if feature_name.startswith(prefix):
            return group
    return 'Other'


# ---------------------------------------------------------------------------
# DATA LOADING
# ---------------------------------------------------------------------------

def load_training_data(
    country: str = 'US',
    aligned_df: Optional[pd.DataFrame] = None,
) -> dict:
    """
    Load or build the training dataset.

    If aligned_df is provided, use it directly. Otherwise, load from
    the label creation + feature store pipeline.

    Returns dict with X_train, X_val, X_test, y_train, y_val, y_test,
    feature_names, and metadata DataFrames.
    """
    if aligned_df is None:
        # Run the full pipeline
        from app.tasks.temporal_feature_store import build_feature_store
        from app.tasks.label_creation import create_labels

        logger.info("Building feature store...")
        fs_result = build_feature_store(country=country, save_to_db=True, return_df=True)
        feature_df = fs_result.get('dataframe')

        if feature_df is None or feature_df.empty:
            raise ValueError("Feature store is empty. Import data first.")

        logger.info("Creating labels...")
        label_result = create_labels(
            country=country, save_to_db=True, feature_store_df=feature_df
        )
        aligned_df = label_result.get('aligned_df')

        if aligned_df is None or aligned_df.empty:
            raise ValueError("Label alignment produced no samples. "
                             "Need 6+ months of Amazon BA data with topic links.")

    # Identify feature columns
    feature_cols = [c for c in aligned_df.columns if c not in META_COLUMNS]
    logger.info(f"Training features: {len(feature_cols)}")

    # Split by temporal assignment
    train = aligned_df[aligned_df['split'] == 'train']
    val = aligned_df[aligned_df['split'] == 'validate']
    test = aligned_df[aligned_df['split'] == 'test']

    logger.info(f"Dataset sizes: train={len(train)}, val={len(val)}, test={len(test)}")

    if len(train) < 50:
        logger.warning(f"Very small training set ({len(train)} samples). "
                       f"Model may not generalize well.")

    # Extract X and y
    X_train = train[feature_cols].astype(np.float32)
    X_val = val[feature_cols].astype(np.float32) if len(val) > 0 else pd.DataFrame()
    X_test = test[feature_cols].astype(np.float32) if len(test) > 0 else pd.DataFrame()

    y_train = train['label_binary'].values
    y_val = val['label_binary'].values if len(val) > 0 else np.array([])
    y_test = test['label_binary'].values if len(test) > 0 else np.array([])

    # Replace any remaining NaN/inf
    for df in [X_train, X_val, X_test]:
        if not df.empty:
            df.replace([np.inf, -np.inf], 0, inplace=True)
            df.fillna(0, inplace=True)

    return {
        'X_train': X_train, 'X_val': X_val, 'X_test': X_test,
        'y_train': y_train, 'y_val': y_val, 'y_test': y_test,
        'feature_names': feature_cols,
        'meta_train': train[list(META_COLUMNS & set(aligned_df.columns))],
        'meta_val': val[list(META_COLUMNS & set(aligned_df.columns))],
        'meta_test': test[list(META_COLUMNS & set(aligned_df.columns))],
    }


# ---------------------------------------------------------------------------
# OPTUNA HYPERPARAMETER TUNING
# ---------------------------------------------------------------------------

def _optuna_objective(trial, X_train, y_train, X_val, y_val, scale_pos_weight):
    """Optuna objective function for XGBoost hyperparameter tuning."""
    import xgboost as xgb
    from sklearn.metrics import f1_score

    params = {
        'objective': 'binary:logistic',
        'eval_metric': 'logloss',
        'use_label_encoder': False,
        'tree_method': 'hist',
        'random_state': RANDOM_SEED,
        'scale_pos_weight': scale_pos_weight,

        # Tuned hyperparameters
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000, step=50),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
        'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
        'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
        'gamma': trial.suggest_float('gamma', 0, 5.0),
    }

    model = xgb.XGBClassifier(**params)

    if len(X_val) > 0:
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )
        y_pred = model.predict(X_val)
        return f1_score(y_val, y_pred, zero_division=0)
    else:
        # Cross-validate on training data if no validation set
        from sklearn.model_selection import cross_val_score
        scores = cross_val_score(model, X_train, y_train,
                                  cv=3, scoring='f1', n_jobs=-1)
        return scores.mean()


def tune_hyperparameters(X_train, y_train, X_val, y_val, n_trials=None):
    """Run Optuna hyperparameter search."""
    import optuna

    if n_trials is None:
        n_trials = OPTUNA_N_TRIALS

    # Class imbalance handling
    n_pos = y_train.sum()
    n_neg = len(y_train) - n_pos
    scale_pos_weight = n_neg / max(n_pos, 1)

    # Skip Optuna if n_trials <= 0: use best known params
    if n_trials <= 0:
        logger.info("Optuna tuning skipped (n_trials<=0). Using best known params.")
        best_params = {
            "n_estimators": 600,
            "max_depth": 9,
            "learning_rate": 0.014214229214122442,
            "min_child_weight": 7,
            "subsample": 0.9781975312213596,
            "colsample_bytree": 0.8906509886774797,
            "reg_alpha": 5.858869553029153e-08,
            "reg_lambda": 0.12134860409750635,
            "gamma": 1.0088403910948043,
        }
        return best_params, scale_pos_weight, None

    logger.info(f"Optuna tuning: {n_trials} trials, "
                f"class balance: {n_pos} pos / {n_neg} neg, "
                f"scale_pos_weight={scale_pos_weight:.2f}")

    # Suppress Optuna info logs
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    study = optuna.create_study(direction='maximize', sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED))
    study.optimize(
        lambda trial: _optuna_objective(trial, X_train, y_train, X_val, y_val, scale_pos_weight),
        n_trials=n_trials,
        show_progress_bar=True,
    )

    logger.info(f"Best F1: {study.best_value:.4f}")
    logger.info(f"Best params: {study.best_params}")

    return study.best_params, scale_pos_weight, study


# ---------------------------------------------------------------------------
# MODEL TRAINING
# ---------------------------------------------------------------------------

def train_model(X_train, y_train, X_val, y_val, best_params, scale_pos_weight):
    """Train final XGBoost model with best hyperparameters."""
    import xgboost as xgb

    params = {
        'objective': 'binary:logistic',
        'eval_metric': 'logloss',
        'use_label_encoder': False,
        'tree_method': 'hist',
        'random_state': RANDOM_SEED,
        'scale_pos_weight': scale_pos_weight,
        **best_params,
    }

    model = xgb.XGBClassifier(**params)

    eval_set = [(X_train, y_train)]
    if len(X_val) > 0:
        eval_set.append((X_val, y_val))

    model.fit(
        X_train, y_train,
        eval_set=eval_set,
        verbose=False,
    )

    return model


# ---------------------------------------------------------------------------
# EVALUATION
# ---------------------------------------------------------------------------

def evaluate_model(model, X, y, split_name='test'):
    """Comprehensive model evaluation."""
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score,
        roc_auc_score, average_precision_score, confusion_matrix,
        classification_report,
    )

    if len(X) == 0 or len(y) == 0:
        logger.warning(f"Empty {split_name} set — skipping evaluation")
        return {}

    y_pred = model.predict(X)
    y_prob = model.predict_proba(X)[:, 1]

    metrics = {
        'split': split_name,
        'samples': len(y),
        'accuracy': float(accuracy_score(y, y_pred)),
        'precision': float(precision_score(y, y_pred, zero_division=0)),
        'recall': float(recall_score(y, y_pred, zero_division=0)),
        'f1': float(f1_score(y, y_pred, zero_division=0)),
        'roc_auc': float(roc_auc_score(y, y_prob)) if len(np.unique(y)) > 1 else 0.0,
        'avg_precision': float(average_precision_score(y, y_prob)) if len(np.unique(y)) > 1 else 0.0,
        'positive_rate': float(y.mean()),
        'predicted_positive_rate': float(y_pred.mean()),
    }

    cm = confusion_matrix(y, y_pred)
    metrics['confusion_matrix'] = cm.tolist()

    # Classification report as string
    report = classification_report(y, y_pred, target_names=['Failure', 'Success'],
                                    zero_division=0)
    metrics['classification_report'] = report

    logger.info(f"\n{split_name.upper()} Evaluation:")
    logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
    logger.info(f"  Precision: {metrics['precision']:.4f}")
    logger.info(f"  Recall:    {metrics['recall']:.4f}")
    logger.info(f"  F1 Score:  {metrics['f1']:.4f}")
    logger.info(f"  ROC AUC:   {metrics['roc_auc']:.4f}")
    logger.info(f"  Avg Prec:  {metrics['avg_precision']:.4f}")

    return metrics


# ---------------------------------------------------------------------------
# SHAP EXPLAINABILITY
# ---------------------------------------------------------------------------

def compute_shap_analysis(model, X, feature_names):
    """
    Compute SHAP values for feature importance analysis.

    Returns:
        - Feature importance ranking (mean |SHAP|)
        - Signal group importance (aggregated by source)
        - UDSI v2 learned weights (normalized group importance)
    """
    import shap

    logger.info("Computing SHAP values...")

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)

    # Mean absolute SHAP value per feature
    mean_abs_shap = np.abs(shap_values).mean(axis=0)

    feature_importance = pd.DataFrame({
        'feature': feature_names,
        'mean_abs_shap': mean_abs_shap,
        'signal_group': [_get_signal_group(f) for f in feature_names],
    }).sort_values('mean_abs_shap', ascending=False)

    # Top features
    top_20 = feature_importance.head(20)
    logger.info("\nTop 20 Features by SHAP importance:")
    for _, row in top_20.iterrows():
        logger.info(f"  {row['feature']:40s} {row['mean_abs_shap']:.4f}  [{row['signal_group']}]")

    # Aggregate by signal group
    group_importance = feature_importance.groupby('signal_group')['mean_abs_shap'].sum()
    group_importance = group_importance.sort_values(ascending=False)
    total_importance = group_importance.sum()

    # UDSI v2 learned weights (normalized)
    udsi_v2_weights = (group_importance / total_importance).to_dict()

    logger.info("\nSignal Group Importance (UDSI v2 Learned Weights):")
    for group, weight in sorted(udsi_v2_weights.items(), key=lambda x: -x[1]):
        logger.info(f"  {group:25s} {weight:.4f} ({weight*100:.1f}%)")

    return {
        'feature_importance': feature_importance,
        'group_importance': group_importance.to_dict(),
        'udsi_v2_weights': udsi_v2_weights,
        'shap_values': shap_values,
        'top_20_features': top_20.to_dict('records'),
    }


# ---------------------------------------------------------------------------
# MODEL PERSISTENCE
# ---------------------------------------------------------------------------

def save_model(model, metadata: dict, version: str = None):
    """Save model and metadata to disk and database."""
    if version is None:
        version = datetime.now().strftime('v%Y%m%d_%H%M%S')

    os.makedirs(MODEL_DIR, exist_ok=True)

    # Save model file
    model_path = os.path.join(MODEL_DIR, f'xgboost_success_{version}.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    logger.info(f"Model saved to {model_path}")

    # Save metadata
    meta_path = os.path.join(MODEL_DIR, f'xgboost_success_{version}_meta.json')
    # Convert non-serializable items
    meta_clean = {}
    for k, v in metadata.items():
        if isinstance(v, (np.integer,)):
            meta_clean[k] = int(v)
        elif isinstance(v, (np.floating,)):
            meta_clean[k] = float(v)
        elif isinstance(v, np.ndarray):
            meta_clean[k] = v.tolist()
        elif isinstance(v, pd.DataFrame):
            meta_clean[k] = v.to_dict('records')
        elif isinstance(v, dict):
            meta_clean[k] = {str(kk): float(vv) if isinstance(vv, (np.floating, float)) else vv
                              for kk, vv in v.items()}
        else:
            try:
                json.dumps(v)
                meta_clean[k] = v
            except (TypeError, ValueError):
                meta_clean[k] = str(v)

    with open(meta_path, 'w') as f:
        json.dump(meta_clean, f, indent=2, default=str)
    logger.info(f"Metadata saved to {meta_path}")

    # Save to database
    _save_model_to_db(version, model_path, meta_clean)

    return model_path, meta_path


def _save_model_to_db(version: str, model_path: str, metadata: dict):
    """Record model version in database."""
    create_sql = """
    CREATE TABLE IF NOT EXISTS ml_models (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) UNIQUE NOT NULL,
        model_type VARCHAR(50) DEFAULT 'xgboost_success',
        model_path TEXT,
        metrics JSONB,
        hyperparameters JSONB,
        feature_importance JSONB,
        udsi_v2_weights JSONB,
        training_samples INTEGER,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    );
    """

    with sync_engine.begin() as conn:
        conn.execute(text(create_sql))

        conn.execute(text("""
            INSERT INTO ml_models
            (version, model_type, model_path, metrics, hyperparameters,
             feature_importance, udsi_v2_weights, training_samples, is_active)
            VALUES (:version, 'xgboost_success', :model_path, CAST(:metrics AS jsonb),
                    CAST(:hyperparameters AS jsonb), CAST(:feature_importance AS jsonb),
                    CAST(:udsi_v2_weights AS jsonb), :training_samples, TRUE)
            ON CONFLICT (version) DO UPDATE SET
                metrics = CAST(:metrics AS jsonb),
                hyperparameters = CAST(:hyperparameters AS jsonb),
                feature_importance = CAST(:feature_importance AS jsonb),
                udsi_v2_weights = CAST(:udsi_v2_weights AS jsonb),
                training_samples = :training_samples,
                is_active = TRUE
        """), {
            'version': version,
            'model_path': model_path,
            'metrics': json.dumps(metadata.get('metrics', {})),
            'hyperparameters': json.dumps(metadata.get('best_params', {})),
            'feature_importance': json.dumps(metadata.get('top_20_features', [])),
            'udsi_v2_weights': json.dumps(metadata.get('udsi_v2_weights', {})),
            'training_samples': metadata.get('training_samples', 0),
        })

        # Deactivate previous models
        conn.execute(text("""
            UPDATE ml_models SET is_active = FALSE
            WHERE version != :version AND model_type = 'xgboost_success'
        """), {'version': version})

    logger.info(f"Model {version} registered in database (active)")


def load_active_model():
    """Load the currently active model from disk."""
    with sync_engine.connect() as conn:
        row = conn.execute(text("""
            SELECT version, model_path, metrics, udsi_v2_weights
            FROM ml_models
            WHERE model_type = 'xgboost_success' AND is_active = TRUE
            ORDER BY created_at DESC LIMIT 1
        """)).fetchone()

    if not row:
        raise FileNotFoundError("No active XGBoost model found in database")

    model_path = row[1]
    with open(model_path, 'rb') as f:
        model = pickle.load(f)

    return model, {
        'version': row[0],
        'metrics': row[2],
        'udsi_v2_weights': row[3],
    }


# ---------------------------------------------------------------------------
# PREDICTION (INFERENCE)
# ---------------------------------------------------------------------------

def predict_success(topic_ids: list, country: str = 'US') -> pd.DataFrame:
    """
    Predict success probability for given topics using latest features.

    Returns DataFrame with topic_id, success_probability, confidence_level,
    and top contributing features.
    """
    model, model_meta = load_active_model()

    # Load latest features for these topics
    with sync_engine.connect() as conn:
        placeholders = ','.join([str(int(t)) for t in topic_ids])
        features_df = pd.read_sql(text(f"""
            SELECT topic_id, month, features
            FROM temporal_features
            WHERE country = :country
              AND topic_id IN ({placeholders})
            ORDER BY topic_id, month DESC
        """), conn, params={'country': country})

    if features_df.empty:
        return pd.DataFrame()

    # Get latest month per topic
    latest = features_df.groupby('topic_id').first().reset_index()

    # Expand JSONB features
    features_expanded = pd.json_normalize(latest['features'])
    X = features_expanded.reindex(columns=model.feature_names_in_, fill_value=0)
    X = X.fillna(0).replace([np.inf, -np.inf], 0).astype(np.float32)

    # Predict
    probabilities = model.predict_proba(X)[:, 1]

    results = pd.DataFrame({
        'topic_id': latest['topic_id'].values,
        'month': latest['month'].values,
        'success_probability': probabilities,
        'confidence_level': pd.cut(
            probabilities,
            bins=[0, 0.3, 0.5, 0.7, 0.85, 1.0],
            labels=['Very Low', 'Low', 'Medium', 'High', 'Very High']
        ),
    })

    return results.sort_values('success_probability', ascending=False)


# ---------------------------------------------------------------------------
# MAIN ORCHESTRATOR
# ---------------------------------------------------------------------------

def train_success_predictor(
    country: str = 'US',
    n_trials: int = None,
    aligned_df: Optional[pd.DataFrame] = None,
    skip_shap: bool = False,
) -> dict:
    """
    Full training pipeline for the XGBoost Success Predictor.

    Steps:
    1. Load/build training data (features + labels)
    2. Tune hyperparameters with Optuna
    3. Train final model
    4. Evaluate on train/val/test
    5. Compute SHAP analysis
    6. Save model + metadata
    7. Generate UDSI v2 weights

    Args:
        country: Country code
        n_trials: Optuna trials (default from env or 100)
        aligned_df: Pre-computed aligned features+labels DataFrame
        skip_shap: Skip SHAP computation (faster, for testing)

    Returns:
        dict with all metrics, SHAP results, model path, and UDSI v2 weights
    """
    start_time = time.time()
    logger.info("=" * 60)
    logger.info("NeuraNest XGBoost Success Predictor — Training Pipeline")
    logger.info("=" * 60)

    # ---- 1. Load data ----
    logger.info("\n[1/6] Loading training data...")
    data = load_training_data(country=country, aligned_df=aligned_df)

    X_train, X_val, X_test = data['X_train'], data['X_val'], data['X_test']
    y_train, y_val, y_test = data['y_train'], data['y_val'], data['y_test']
    feature_names = data['feature_names']

    logger.info(f"Training set: {len(X_train)} samples, {len(feature_names)} features")
    logger.info(f"Positive rate: {y_train.mean():.3f}")

    # ---- 2. Hyperparameter tuning ----
    logger.info("\n[2/6] Tuning hyperparameters with Optuna...")
    best_params, scale_pos_weight, study = tune_hyperparameters(
        X_train, y_train, X_val, y_val, n_trials=n_trials
    )

    # ---- 3. Train final model ----
    logger.info("\n[3/6] Training final model...")
    model = train_model(X_train, y_train, X_val, y_val, best_params, scale_pos_weight)

    # ---- 4. Evaluate ----
    logger.info("\n[4/6] Evaluating model...")
    train_metrics = evaluate_model(model, X_train, y_train, 'train')
    val_metrics = evaluate_model(model, X_val, y_val, 'validate') if len(X_val) > 0 else {}
    test_metrics = evaluate_model(model, X_test, y_test, 'test') if len(X_test) > 0 else {}

    # ---- 5. SHAP analysis ----
    shap_results = {}
    if not skip_shap:
        logger.info("\n[5/6] Computing SHAP feature importance...")
        # Use a sample if training set is large (SHAP is O(n²))
        X_shap = X_train.sample(min(1000, len(X_train)), random_state=RANDOM_SEED) \
            if len(X_train) > 1000 else X_train
        shap_results = compute_shap_analysis(model, X_shap, feature_names)
    else:
        logger.info("\n[5/6] Skipping SHAP analysis (skip_shap=True)")

    # ---- 6. Save ----
    logger.info("\n[6/6] Saving model and metadata...")
    metadata = {
        'metrics': {
            'train': train_metrics,
            'validate': val_metrics,
            'test': test_metrics,
        },
        'best_params': best_params,
        'scale_pos_weight': scale_pos_weight,
        'training_samples': len(X_train),
        'validation_samples': len(X_val),
        'test_samples': len(X_test),
        'feature_count': len(feature_names),
        'feature_names': feature_names,
        'positive_rate': float(y_train.mean()),
        'top_20_features': shap_results.get('top_20_features', []),
        'udsi_v2_weights': shap_results.get('udsi_v2_weights', {}),
        'group_importance': shap_results.get('group_importance', {}),
        'optuna_best_value': float(study.best_value) if study is not None else 0.0,
        'country': country,
    }

    model_path, meta_path = save_model(model, metadata)

    # ---- Update UDSI v2 weights in scores table ----
    if shap_results.get('udsi_v2_weights'):
        _update_udsi_v2_weights(shap_results['udsi_v2_weights'])

    elapsed = time.time() - start_time
    logger.info(f"\nTraining complete in {elapsed:.1f}s")
    logger.info(f"Model saved to {model_path}")

    # Primary metric: test F1 (or val F1 if no test set)
    primary_metric = test_metrics.get('f1', val_metrics.get('f1', train_metrics.get('f1', 0)))

    return {
        'status': 'success',
        'model_path': model_path,
        'primary_f1': primary_metric,
        'train_metrics': train_metrics,
        'val_metrics': val_metrics,
        'test_metrics': test_metrics,
        'best_params': best_params,
        'udsi_v2_weights': shap_results.get('udsi_v2_weights', {}),
        'top_20_features': shap_results.get('top_20_features', []),
        'elapsed_seconds': round(elapsed, 1),
    }


def _update_udsi_v2_weights(weights: dict):
    """Update the UDSI v2 learned weights in the system config."""
    logger.info("Updating UDSI v2 weights from SHAP analysis...")

    # Map signal groups back to UDSI weight keys
    udsi_mapping = {
        'Amazon Demand': 'amazon_demand',
        'Click Dynamics': 'click_dynamics',
        'Brand Competition': 'brand_competition',
        'Google Search': 'google_search',
        'Social (Reddit)': 'social_reddit',
        'Social (TikTok)': 'social_tiktok',
        'Social (Instagram)': 'social_instagram',
        'Social (Cross-Platform)': 'social_cross_platform',
        'Science Signal': 'science_signal',
        'Seasonality': 'seasonality',
        'Convergence': 'convergence',
    }

    udsi_weights = {}
    for group_name, weight in weights.items():
        key = udsi_mapping.get(group_name, group_name.lower().replace(' ', '_'))
        udsi_weights[key] = round(weight, 4)

    try:
        with sync_engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_config (
                    key VARCHAR(100) PRIMARY KEY,
                    value JSONB,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                INSERT INTO system_config (key, value, updated_at)
                VALUES ('udsi_v2_weights', CAST(:weights AS jsonb), NOW())
                ON CONFLICT (key) DO UPDATE SET
                    value = CAST(:weights AS jsonb), updated_at = NOW()
            """), {'weights': json.dumps(udsi_weights)})

        logger.info(f"UDSI v2 weights saved: {udsi_weights}")
    except Exception as e:
        logger.warning(f"Could not save UDSI v2 weights: {e}")


# ---------------------------------------------------------------------------
# CELERY TASK WRAPPER
# ---------------------------------------------------------------------------

try:
    from app.celery_app import celery_app

    @celery_app.task(name='train_success_predictor', bind=True, max_retries=0)
    def train_success_predictor_task(self, country: str = 'US', n_trials: int = 100):
        return train_success_predictor(country=country, n_trials=n_trials)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# CLI ENTRYPOINT
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

    result = train_success_predictor(
        country='US',
        n_trials=50,  # Fewer trials for quick test
    )

    print(f"\n{'='*60}")
    print(f"TRAINING RESULTS")
    print(f"{'='*60}")
    print(f"Status: {result['status']}")
    print(f"Primary F1: {result['primary_f1']:.4f}")
    print(f"Model: {result['model_path']}")
    print(f"Time: {result['elapsed_seconds']}s")

    if result.get('test_metrics'):
        m = result['test_metrics']
        print(f"\nTest Set Performance:")
        print(f"  Accuracy:  {m.get('accuracy', 0):.4f}")
        print(f"  Precision: {m.get('precision', 0):.4f}")
        print(f"  Recall:    {m.get('recall', 0):.4f}")
        print(f"  F1:        {m.get('f1', 0):.4f}")
        print(f"  ROC AUC:   {m.get('roc_auc', 0):.4f}")

    if result.get('udsi_v2_weights'):
        print(f"\nUDSI v2 Learned Weights:")
        for group, weight in sorted(result['udsi_v2_weights'].items(), key=lambda x: -x[1]):
            print(f"  {group:30s} {weight:.4f}")

    if result.get('top_20_features'):
        print(f"\nTop 20 Features:")
        for feat in result['top_20_features'][:20]:
            print(f"  {feat['feature']:40s} {feat['mean_abs_shap']:.4f}")
