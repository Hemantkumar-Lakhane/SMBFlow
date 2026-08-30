"""
api/auth.py
===========
JWT-based authentication with Role-Based Access Control.
Roles: super_admin (full system access), tenant_user (tenant-scoped).

CONSTANT — do not modify for business customization.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

log = structlog.get_logger()

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("SECRET_KEY", "opsgrid-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24h

security = HTTPBearer()


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class TokenData(BaseModel):
    user_id: str
    email: str
    role: str
    tenant_id: Optional[str] = None


class UserInDB(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    role: str
    tenant_id: Optional[str]
    is_active: bool


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    tenant_name: Optional[str] = None   # Creates tenant if provided
    industry: Optional[str] = "saas"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ─────────────────────────────────────────────────────────────────────────────
# Password helpers
#
# Uses the ``bcrypt`` library directly rather than passlib's CryptContext.
# passlib 1.7.4 performs a backend self-probe on first use that is incompatible
# with bcrypt >= 4.1 (it reads ``bcrypt.__about__`` and hashes a >72-byte probe
# string), which raises at import/verify time under bcrypt 5.x. Calling bcrypt
# directly preserves identical semantics: the same 2b/2a/2y hashes verify, the
# same 72-byte truncation is applied, and the default work factor (12 rounds) is
# unchanged. Existing stored hashes remain valid; no credential is weakened.
# ─────────────────────────────────────────────────────────────────────────────

# bcrypt operates on the first 72 bytes of the UTF-8 encoded password; longer
# inputs are truncated (this matches passlib's prior behavior exactly).
_BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bcrypt_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_to_bcrypt_bytes(plain), hashed.encode("utf-8"))
    except ValueError:
        # Malformed / unrecognized stored hash — treat as non-match, not a 500.
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Token helpers
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(
            user_id=payload["sub"],
            email=payload["email"],
            role=payload["role"],
            tenant_id=payload.get("tenant_id"),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Dependencies
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenData:
    """Extract and validate JWT from Authorization header."""
    return decode_token(credentials.credentials)


async def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Require super_admin role."""
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )
    return current_user


async def require_any_auth(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Any authenticated user."""
    return current_user


def get_tenant_filter(current_user: TokenData) -> Optional[str]:
    """
    Returns tenant_id filter:
    - super_admin: None (can see everything)
    - tenant_user: their tenant_id (scoped)
    """
    if current_user.role == "super_admin":
        return None
    return current_user.tenant_id


def assert_tenant_access(current_user: TokenData, tenant_id: str) -> None:
    """Raise 403 if a tenant_user tries to access another tenant's data."""
    if current_user.role == "super_admin":
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this tenant's data",
        )


# ─────────────────────────────────────────────────────────────────────────────
# In-memory user store (replace with DB queries in production)
# Used alongside the DB — auth checks use this for fast lookups
# ─────────────────────────────────────────────────────────────────────────────

# This is populated by the API startup and updated on user creation
_user_cache: dict[str, dict] = {}


def cache_user(user_dict: dict) -> None:
    _user_cache[user_dict["email"]] = user_dict


def get_cached_user(email: str) -> Optional[dict]:
    return _user_cache.get(email)


def build_token_for_user(user: dict) -> str:
    return create_access_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "tenant_id": str(user["tenant_id"]) if user.get("tenant_id") else None,
    })