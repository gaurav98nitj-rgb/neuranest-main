"""Organization and User models."""
from app.models.base import *


class Org(Base):
    __tablename__ = "orgs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    plan = Column(String, nullable=False, default="free")
    stripe_customer_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="org")

    __table_args__ = (
        CheckConstraint("plan IN ('free', 'pro', 'enterprise')", name="ck_orgs_plan"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    org = relationship("Org", back_populates="users")
    watchlists = relationship("Watchlist", back_populates="user")
    alerts = relationship("Alert", back_populates="user")

    __table_args__ = (
        CheckConstraint("role IN ('viewer', 'editor', 'admin')", name="ck_users_role"),
        Index("idx_users_org", "org_id"),
    )
