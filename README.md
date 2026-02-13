# NeuraNest Gen-Next: Trend & Product Intelligence Platform

Predictive e-commerce trend intelligence SaaS. Ingests multi-source keyword data, forecasts trends 3-6 months ahead, analyzes Amazon competition/reviews, and generates AI-powered product specs.

## Quick Start

```bash
# Clone and start all services
docker-compose up -d

# API:      http://localhost:8000 (Swagger at /docs)
# Frontend: http://localhost:3000
# Airflow:  http://localhost:8080
```

## Stack
- **Backend:** FastAPI, SQLAlchemy (async), PostgreSQL + pgvector, Redis, Celery
- **Frontend:** React 18, TypeScript, Tailwind, Recharts, TanStack Query, Zustand
- **ML:** Prophet, HDBSCAN, sentence-transformers, LLM (Claude/GPT-4)
- **Orchestration:** Airflow DAGs
- **Infra:** Docker, AWS (ECS, RDS, S3, CloudFront)

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/signup | Register |
| POST | /api/v1/auth/login | JWT login |
| GET | /api/v1/topics | List with filters/sort/pagination |
| GET | /api/v1/topics/{id} | Topic detail + scores |
| GET | /api/v1/topics/{id}/timeseries | Multi-source timeseries |
| GET | /api/v1/topics/{id}/forecast | Prophet 3m/6m forecast |
| GET | /api/v1/topics/{id}/competition | Amazon competition snapshot |
| GET | /api/v1/topics/{id}/reviews/summary | Aspect-based review intelligence |
| GET | /api/v1/topics/{id}/gen-next | AI product spec (Pro) |
| POST/GET/DELETE | /api/v1/watchlist | Watchlist CRUD |
| POST/GET/DELETE | /api/v1/alerts | Alert management (Pro) |
| GET | /api/v1/exports/topics.csv | CSV export (Pro) |

## Database (20+ tables)
Core: `orgs`, `users`, `topics`, `keywords`, `topic_category_map`
Timeseries: `source_timeseries`, `derived_features`
Amazon: `amazon_competition_snapshot`, `asins`, `topic_top_asins`, `reviews`, `review_aspects`
ML: `forecasts`, `scores`, `gen_next_specs`
User: `watchlists`, `alerts`, `alert_events`
Ops: `ingestion_runs`, `dq_metrics`, `error_logs`

## Airflow DAGs
| DAG | Schedule | Purpose |
|-----|----------|---------|
| keywordtool_ingest_daily | 2 AM UTC | KeywordTool.io volumes |
| junglescout_ingest_daily | 3 AM UTC | Jungle Scout data |
| googletrends_ingest_daily | 4 AM UTC | Google Trends |
| reddit_ingest_daily | 5 AM UTC | Reddit mentions |
| amazon_catalog_ingest_weekly | Mon 6 AM | ASIN catalog |
| amazon_reviews_ingest_weekly | Mon 8 AM | Top ASIN reviews |
| topic_clustering_weekly | Tue 10 AM | Keyword clustering |
| feature_generation_daily | 7 AM UTC | Growth/acceleration |
| forecasting_weekly | Tue 12 PM | Prophet forecasts |
| scoring_daily | 9 AM UTC | Opportunity scores |
| gen_next_spec_weekly | Wed 2 PM | LLM product specs |
