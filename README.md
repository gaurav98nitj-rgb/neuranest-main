# NeuraNest Intelligence: Trend & Product Intelligence Platform

Predictive e-commerce trend intelligence that identifies winning product opportunities 6–24 months early. Fuses 6 signal layers (Science → Expert → Social → Search → Competition → Amazon) into decision-grade intelligence with score explainability.

**Vision:** The "Bloomberg Terminal" for the physical product economy.

## Current Status — Phase 4 (88% complete)

| Component | Status | Details |
|-----------|--------|---------|
| 6-Layer Signal Engine | ✅ Live | Google Trends, Reddit, Instagram, Facebook, TikTok, Ad Creatives, Science Papers |
| Amazon BA Import | ✅ Live | 27.8M rows imported, entity resolution (55% match, 2,751 terms linked) |
| ML Pipeline | ✅ Baseline | Feature Store (102 features), 7,299 labels, XGBoost (F1: 0.447) |
| Opportunity Scoring | ✅ Live | 7-component weighted score with explainability API |
| Frontend UI | ✅ Live | 12 pages, warm design system, Decision Cards, Evidence Page |
| Demand Forecasting | 🔲 Planned | TFT (Temporal Fusion Transformer) — Phase 5C |
| Backtesting | 🔲 Planned | Model P&L tracking — Phase 5A |

## Quick Start

```bash
# Clone and start all services
docker-compose up -d

# API:      http://localhost:8000 (Swagger at /docs)
# Frontend: http://localhost:3000
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 18 + TypeScript)          │
│  Warm Design System: Coral/Sage/Amber/Rose/Plum palette     │
│  Newsreader headings · Plus Jakarta Sans body · JetBrains   │
│                                                             │
│  Pages: Dashboard · Explorer · TopicDetail · Categories     │
│         CategoryDetail · Brands · WhiteSpace · Science      │
│         AmazonBA · Alerts · Watchlist                       │
├─────────────────────────────────────────────────────────────┤
│                    API (FastAPI + SQLAlchemy Async)          │
│  /topics (explainability) · /dashboard/daily-intelligence   │
│  /categories (overview, opportunities, voice)               │
│  /brands · /whitespace · /science · /amazon-ba              │
│  /alerts · /watchlist · /social · /ml-pipeline              │
├─────────────────────────────────────────────────────────────┤
│                    ML PIPELINE (Celery + Redis)              │
│  Feature Store → Labels → XGBoost → UDSI Scoring            │
│  Entity Resolution · Topic Clustering · Signal Propagation  │
├─────────────────────────────────────────────────────────────┤
│                    DATA LAYER                                │
│  PostgreSQL 16 + pgvector · Redis · S3                      │
│  6 Signal Sources · Amazon BA · Science Papers              │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend:** FastAPI, Python 3.11, SQLAlchemy (async), PostgreSQL 16 + pgvector, Redis, Celery
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, TanStack Query, Zustand
- **ML:** XGBoost, scikit-learn, sentence-transformers, HDBSCAN, LLM (Claude API)
- **Infra:** Docker, AWS (ECS, RDS, S3, CloudFront)

## Signal Sources (6 Layers)

| Layer | Source | Signal Type |
|-------|--------|-------------|
| 1. Science | arXiv, bioRxiv, patents | Research velocity, novelty scores |
| 2. Expert | Ad creatives, clinical trials | Professional adoption signals |
| 3. Social | Reddit, Instagram, Facebook, TikTok | Mention velocity, sentiment |
| 4. Search | Google Trends | Search interest, regional breakouts |
| 5. Competition | Amazon catalog, pricing | Listing density, price distribution |
| 6. Amazon | Brand Analytics (27.8M rows) | Search frequency rank, click/conversion share |

## Key API Endpoints

### Core Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /topics | List with filters, sort, pagination |
| GET | /topics/{id} | Topic detail + all scores |
| GET | /topics?include_explainability=true | Topics with score breakdown |
| GET | /topics/{id}/timeseries | Multi-source timeseries data |
| GET | /topics/{id}/competition | Amazon competition snapshot |
| GET | /topics/{id}/reviews/summary | Aspect-based review intelligence |
| GET | /topics/{id}/gen-next | AI product spec |

### Dashboard & Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dashboard/daily-intelligence | Rising, falling, exploding, funnel, momentum |
| GET | /categories | List with KPIs, growth, stage distribution |
| GET | /categories/{id}/overview | Detail with metrics history, top opportunities |
| GET | /categories/{id}/opportunities | Paginated topics with stage filter |

### Amazon Brand Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /amazon-ba/stats | Import stats and coverage |
| POST | /amazon-ba/upload | Upload monthly BA file |
| GET | /amazon-ba/search | Search BA terms |
| GET | /amazon-ba/trending | Rising demand signals |

### Science Radar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /science/overview | Paper counts, cluster stats |
| GET | /science/clusters | Research clusters with velocity/novelty |
| GET | /science/opportunities | AI-generated product ideas from papers |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /brands | Brand monitoring with sentiment |
| GET | /whitespace | White-space opportunity heatmap |
| POST/GET/DELETE | /watchlist | Watchlist CRUD |
| POST/GET/DELETE | /alerts | Alert management |

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | / | Intelligence Panel: Funnel, Momentum, Rising/Falling, Exploding |
| Explorer | /explore | Decision Cards with explainability, convergence, risk indicators |
| Topic Detail | /topics/:id | Hero + 3-column evidence panel + 5 tabs (Overview, Signals, Competition, Reviews, Gen-Next) |
| Categories | /categories | Category grid with KPIs, growth rates, stage distribution |
| Category Detail | /categories/:id | Hero + metrics history + opportunities table + voice tab |
| Brands | /brands | Brand cards with sentiment, mentions, complaints |
| White Space | /whitespace | Price × Competition heatmap with AI product concepts |
| Science Radar | /science | Research clusters → product opportunity mapping |
| Amazon BA | /amazon-ba | Import, search, trending analysis |
| Alerts | /alerts | Configurable alerts with event history |
| Watchlist | /watchlist | Tracked topics with score rings and growth badges |

## Design System

Warm Claude × HubSpot palette replacing dark theme:

| Token | Hex | Usage |
|-------|-----|-------|
| Coral | #E8714A | Primary action, exploding trends |
| Sage | #1A8754 | Success, emerging trends |
| Amber | #D4930D | Warnings, velocity |
| Rose | #C0392B | Errors, declining trends |
| Plum | #7C3AED | Science, premium features |
| Charcoal | #2D3E50 | Primary text |
| Sand | #B8B2A8 | Muted text |
| Background | #F9F7F4 | Page background (cream) |

**Typography:** Newsreader (headings) · Plus Jakarta Sans (body) · JetBrains Mono (numbers/code)

## Database Schema (25+ tables)

- **Core:** orgs, users, topics, keywords, categories, category_metrics
- **Timeseries:** source_timeseries, derived_features
- **Amazon:** amazon_ba_rows, amazon_competition_snapshot, asins, reviews, review_aspects
- **ML:** forecasts, scores, feature_store, labels, model_runs
- **Science:** science_papers, science_clusters, science_opportunities
- **Social:** social_signals, platform_metrics, brand_mentions
- **User:** watchlists, alerts, alert_events
- **Ops:** ingestion_runs, dq_metrics, error_logs

## Codebase

- **Total:** ~17,880 lines
- **Backend:** Python (FastAPI + Celery tasks)
- **Frontend:** TypeScript/React
- **GitHub:** https://github.com/gaurav98nitj-rgb/neuranest-main

## Roadmap

See `NeuraNest_Strategic_Roadmap.docx` for full dual-track strategy:
- **Track A:** Enterprise Intelligence for CPG (P&G, Unilever, Nestlé)
- **Track B:** Shein-model product execution for non-fashion categories
- **Phase 5A:** Backtesting + data scale + category briefs (credibility)
- **Phase 5B:** Product Brief Generator + first 3 launches (execution)
- **Phase 5C:** TFT demand forecaster + ABSA pipeline (ML upgrade)
- **Phase 5D:** Multi-user RBAC + API + ontology (enterprise readiness)
