import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import redis.asyncio as aioredis  # redis>=5.x includes async support
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User

settings = get_settings()

# ─── Password Hashing ───
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT ───
security = HTTPBearer()


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "role": role, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ─── Current User Dependency ───
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_role(*roles: str):
    """Dependency factory for role-based access control."""
    async def _check(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


def require_pro():
    """Require Pro plan or above."""
    async def _check(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from app.models import Org
        if user.org_id:
            result = await db.execute(select(Org).where(Org.id == user.org_id))
            org = result.scalar_one_or_none()
            if org and org.plan in ("pro", "enterprise"):
                return user
        if user.role == "admin":
            return user
        raise HTTPException(status_code=403, detail="Pro plan required")
    return _check


# ─── Redis Cache ───
_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def cache_key(prefix: str, **kwargs) -> str:
    raw = json.dumps(kwargs, sort_keys=True, default=str)
    h = hashlib.md5(raw.encode()).hexdigest()
    return f"neuranest:{prefix}:{h}"


async def get_cached(key: str, redis: aioredis.Redis) -> Optional[str]:
    return await redis.get(key)


async def set_cached(key: str, value: str, ttl_seconds: int, redis: aioredis.Redis):
    await redis.set(key, value, ex=ttl_seconds)


# ─── Rate Limiting ───
async def check_rate_limit(request: Request, user: User = Depends(get_current_user)):
    redis = await get_redis()
    from app.models import Org

    # Determine limit based on plan
    limit = settings.RATE_LIMIT_FREE
    if user.role == "admin":
        limit = 1000
    # In production, look up org plan here
    # For now, use role-based heuristic

    key = f"ratelimit:{user.id}:{datetime.utcnow().strftime('%Y%m%d%H%M')}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 60)

    if current > limit:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": "60"},
        )
    return user
