"""
NeuraNest Models — Domain-organized, re-exported for backward compatibility.

All existing `from app.models import X` statements continue to work.
"""

# Auth
from app.models.auth import Org, User

# Categories (NEW)
from app.models.categories import Category, CategoryMetric

# Core topics and related entities
from app.models.topics import (
    Topic, Keyword, TopicCategoryMap, SourceTimeseries,
    AmazonCompetitionSnapshot, Asin, TopicTopAsin,
    Review, ReviewAspect,
    DerivedFeature, Forecast, Score, GenNextSpec,
    Watchlist, Alert, AlertEvent,
)

# Social listening (NEW)
from app.models.social import Brand, BrandMention, BrandSentimentDaily, ShareOfVoiceDaily

# Meta / TikTok platforms (NEW)
from app.models.platforms import (
    InstagramMention, FacebookMention,
    TikTokTrend, TikTokMention,
    AdCreative,
)

# Science Radar (NEW)
from app.models.science import ScienceItem, ScienceCluster, ScienceClusterItem, ScienceOpportunityCard
from app.models.amazon_ba import AmazonBrandAnalytics, AmazonBAImportJob

# Signal Fusion (NEW)
from app.models.signals import SignalFusionDaily

# Ops
from app.models.ops import IngestionRun, DQMetric, ErrorLog

__all__ = [
    # Auth
    "Org", "User",
    # Categories
    "Category", "CategoryMetric",
    # Topics
    "Topic", "Keyword", "TopicCategoryMap", "SourceTimeseries",
    "AmazonCompetitionSnapshot", "Asin", "TopicTopAsin",
    "Review", "ReviewAspect",
    "DerivedFeature", "Forecast", "Score", "GenNextSpec",
    "Watchlist", "Alert", "AlertEvent",
    # Social
    "Brand", "BrandMention", "BrandSentimentDaily", "ShareOfVoiceDaily",
    # Platforms
    "InstagramMention", "FacebookMention",
    "TikTokTrend", "TikTokMention",
    "AdCreative",
    # Science
    "ScienceItem", "ScienceCluster", "ScienceClusterItem", "ScienceOpportunityCard",
    # Signals
    "SignalFusionDaily",
    # Ops
    "IngestionRun", "DQMetric", "ErrorLog",
]
