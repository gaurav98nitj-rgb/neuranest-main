from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "NeuraNest Gen-Next"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://neuranest:neuranest_dev@localhost:5432/neuranest"
    DATABASE_URL_SYNC: str = "postgresql://neuranest:neuranest_dev@localhost:5432/neuranest"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Rate Limiting
    RATE_LIMIT_FREE: int = 60  # requests per minute
    RATE_LIMIT_PRO: int = 300

    # API Keys (data sources)
    KEYWORDTOOL_API_KEY: Optional[str] = None
    JUNGLESCOUT_API_KEY: Optional[str] = None
    SERPAPI_KEY: Optional[str] = None
    REDDIT_CLIENT_ID: Optional[str] = None
    REDDIT_CLIENT_SECRET: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None

    # Meta / Facebook
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_ACCESS_TOKEN: Optional[str] = None

    # TikTok
    TIKTOK_API_KEY: Optional[str] = None
    TIKTOK_API_SECRET: Optional[str] = None

    # Science sources
    ARXIV_MAX_RESULTS: int = 200
    BIORXIV_MAX_RESULTS: int = 100

    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # AWS
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    S3_RAW_BUCKET: str = "neuranest-raw"

    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
