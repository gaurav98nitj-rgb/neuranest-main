from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, date
from enum import Enum


# ─── Enums ───
class PlanType(str, Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class UserRole(str, Enum):
    viewer = "viewer"
    editor = "editor"
    admin = "admin"


class TrendStage(str, Enum):
    emerging = "emerging"
    exploding = "exploding"
    peaking = "peaking"
    declining = "declining"
    unknown = "unknown"


class ScoreType(str, Enum):
    opportunity = "opportunity"
    competition = "competition"
    demand = "demand"
    review_gap = "review_gap"


class AlertType(str, Enum):
    stage_change = "stage_change"
    score_threshold = "score_threshold"
    new_competitor = "new_competitor"
    price_drop = "price_drop"


class ForecastDirection(str, Enum):
    rising = "rising"
    flat = "flat"
    falling = "falling"


# ─── Auth Schemas ───
class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    org_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role: UserRole
    org_id: Optional[UUID] = None
    created_at: Optional[datetime] = None


# ─── Topic Schemas ───
class TopicListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    stage: TrendStage
    primary_category: Optional[str] = None
    opportunity_score: Optional[float] = None
    competition_index: Optional[float] = None
    forecast_direction: Optional[ForecastDirection] = None
    sparkline: Optional[List[float]] = None
    sources_active: Optional[List[str]] = None


class TopicDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    stage: TrendStage
    primary_category: Optional[str] = None
    categories: Optional[List[Dict[str, Any]]] = None
    is_active: bool
    latest_scores: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TopicFilters(BaseModel):
    category: Optional[str] = None
    stage: Optional[TrendStage] = None
    geo: Optional[str] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    forecast_direction: Optional[ForecastDirection] = None
    search: Optional[str] = None
    sort: Optional[str] = "-opportunity_score"
    page: int = 1
    page_size: int = 20


# ─── Timeseries Schemas ───
class TimeseriesPoint(BaseModel):
    date: date
    source: str
    raw_value: Optional[float] = None
    normalized_value: Optional[float] = None


class TimeseriesResponse(BaseModel):
    topic_id: UUID
    geo: str = "US"
    data: List[TimeseriesPoint]


# ─── Forecast Schemas ───
class ForecastPoint(BaseModel):
    forecast_date: date
    horizon_months: int
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ForecastResponse(BaseModel):
    topic_id: UUID
    model_version: str
    generated_at: datetime
    forecasts: List[ForecastPoint]


# ─── Competition Schemas ───
class AsinSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asin: str
    title: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    rank: Optional[int] = None


class CompetitionResponse(BaseModel):
    topic_id: UUID
    date: date
    marketplace: str = "US"
    listing_count: Optional[int] = None
    median_price: Optional[float] = None
    avg_price: Optional[float] = None
    median_reviews: Optional[int] = None
    avg_rating: Optional[float] = None
    brand_count: Optional[int] = None
    brand_hhi: Optional[float] = None
    top3_brand_share: Optional[float] = None
    competition_index: Optional[float] = None
    rating_distribution: Optional[Dict[str, float]] = None
    price_range: Optional[Dict[str, float]] = None
    top_asins: List[AsinSummary] = []


# ─── Review Schemas ───
class AspectSummary(BaseModel):
    aspect: str
    mention_count: int
    sentiment_pct: float
    sample: Optional[str] = None


class PainPoint(BaseModel):
    aspect: str
    severity: float
    evidence: str


class MissingFeature(BaseModel):
    feature: str
    demand_signal: str


class ReviewsSummaryResponse(BaseModel):
    topic_id: UUID
    total_reviews_analyzed: int
    asins_covered: int
    pros: List[AspectSummary]
    cons: List[AspectSummary]
    top_pain_points: List[PainPoint]
    missing_features: List[MissingFeature]


# ─── Gen-Next Spec Schemas ───
class MustFix(BaseModel):
    issue: str
    severity: str
    evidence: str


class MustAdd(BaseModel):
    feature: str
    demand_signal: str
    priority: int


class Differentiator(BaseModel):
    idea: str
    rationale: str


class Positioning(BaseModel):
    target_price: Optional[float] = None
    target_rating: Optional[float] = None
    tagline: Optional[str] = None
    target_demographic: Optional[str] = None


class GenNextSpecResponse(BaseModel):
    topic_id: UUID
    version: int
    generated_at: datetime
    model_used: Optional[str] = None
    must_fix: List[MustFix]
    must_add: List[MustAdd]
    differentiators: List[Differentiator]
    positioning: Positioning


# ─── Watchlist Schemas ───
class WatchlistAddRequest(BaseModel):
    topic_id: UUID


class WatchlistItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    topic_id: UUID
    topic_name: Optional[str] = None
    topic_stage: Optional[str] = None
    opportunity_score: Optional[float] = None
    added_at: datetime


# ─── Alert Schemas ───
class AlertCreateRequest(BaseModel):
    topic_id: Optional[UUID] = None
    alert_type: AlertType
    config_json: Dict[str, Any]


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    topic_id: Optional[UUID] = None
    alert_type: AlertType
    config_json: Dict[str, Any]
    is_active: bool
    created_at: Optional[datetime] = None


class AlertEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    alert_id: UUID
    triggered_at: datetime
    payload_json: Optional[Dict[str, Any]] = None
    delivered: bool


# ─── Score Schema ───
class ScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    topic_id: UUID
    score_type: ScoreType
    score_value: float
    explanation_json: Optional[Dict[str, Any]] = None
    computed_at: datetime


# ─── Pagination ───
class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class PaginatedResponse(BaseModel):
    data: List[Any]
    pagination: PaginationMeta
