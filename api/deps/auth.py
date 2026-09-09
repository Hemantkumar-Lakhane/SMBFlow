"""
api/deps/auth.py
================
Supabase Auth Bearer Token validation and Organization & Role resolution.
Supports roles: platform_admin, org_admin, org_user.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Optional

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from api.auth import TokenData, SECRET_KEY, ALGORITHM

try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except ImportError:
    pass

log = structlog.get_logger()
security = HTTPBearer(auto_error=False)


def _verify_supabase_token_online(token: str) -> Optional[dict]:
    """
    Cryptographically validates a Supabase Auth Bearer token by querying the
    Supabase Auth server API endpoint (/auth/v1/user).
    Returns the authenticated user object if valid, or None if invalid/expired.
    """
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
    if not supabase_url or not supabase_key:
        return None
    url = f"{supabase_url.rstrip('/')}/auth/v1/user"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": supabase_key,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        pass
    return None

def get_supabase_jwt_secret() -> str:
    raw = os.getenv("SUPABASE_JWT_SECRET", "")
    if raw and not raw.startswith("YOUR_"):
        return raw
    return SECRET_KEY

SUPABASE_JWT_SECRET = get_supabase_jwt_secret()

async def _resolve_org_context(user_id: Optional[str], email: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Resolve organization_id and role from organization_users DB table if not in JWT."""
    try:
        import uuid
        from sqlalchemy import text
        from core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            uid_val = None
            if user_id:
                try:
                    uid_val = uuid.UUID(str(user_id))
                except Exception:
                    pass

            if uid_val and email:
                stmt = text(
                    "SELECT organization_id, role FROM organization_users "
                    "WHERE user_id = :uid OR email = :email LIMIT 1"
                )
                res = await db.execute(stmt, {"uid": uid_val, "email": email})
            elif uid_val:
                stmt = text(
                    "SELECT organization_id, role FROM organization_users "
                    "WHERE user_id = :uid LIMIT 1"
                )
                res = await db.execute(stmt, {"uid": uid_val})
            elif email:
                stmt = text(
                    "SELECT organization_id, role FROM organization_users "
                    "WHERE email = :email LIMIT 1"
                )
                res = await db.execute(stmt, {"email": email})
            else:
                return None, None

            row = res.fetchone()
            if row:
                return str(row[0]), str(row[1])
    except Exception as e:
        log.debug("DB organization lookup fallback skipped", error=str(e))
    return None, None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> TokenData:
    """Validate Supabase / SMBFlow bearer JWT token and extract identity."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        # Try decoding with Supabase JWT Secret or fallback SECRET_KEY
        key = get_supabase_jwt_secret()
        payload = jwt.decode(token, key, algorithms=["HS256"], options={"verify_aud": False})
        
        user_id = payload.get("sub") or payload.get("user_id")
        email = payload.get("email", "user@smbflow.com")
        role = payload.get("role") or payload.get("user_metadata", {}).get("role", "org_user")
        
        # Normalize roles: super_admin -> platform_admin, tenant_user/authenticated -> org_user
        if role == "super_admin":
            role = "platform_admin"
        elif role in ("tenant_user", "authenticated"):
            role = "org_user"
            
        org_id = payload.get("organization_id") or payload.get("tenant_id") or payload.get("user_metadata", {}).get("organization_id")

        if not org_id and user_id:
            db_org_id, db_role = await _resolve_org_context(str(user_id), email)
            if db_org_id:
                org_id = db_org_id
            if db_role and role == "org_user":
                role = db_role

        return TokenData(
            user_id=str(user_id),
            email=email,
            role=role,
            organization_id=str(org_id) if org_id else None,
            tenant_id=str(org_id) if org_id else None,
        )
    except JWTError as e:
        # Fallback to local token decoder
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            role = payload.get("role", "org_user")
            if role == "super_admin":
                role = "platform_admin"
            org_id = payload.get("tenant_id") or payload.get("organization_id")
            
            user_id = payload.get("sub")
            email = payload.get("email", "")
            if not org_id and user_id:
                db_org_id, db_role = await _resolve_org_context(str(user_id), email)
                if db_org_id:
                    org_id = db_org_id
                if db_role and role == "org_user":
                    role = db_role

            return TokenData(
                user_id=user_id,
                email=email,
                role=role,
                organization_id=str(org_id) if org_id else None,
                tenant_id=str(org_id) if org_id else None,
            )
        except JWTError:
            pass

    # 3. Server-side online validation against Supabase Auth API (/auth/v1/user)
    user_data = _verify_supabase_token_online(token)
    if user_data and user_data.get("id"):
        user_id = user_data["id"]
        email = user_data.get("email", f"{user_id}@smbflow.com")
        user_meta = user_data.get("user_metadata") or {}
        role = user_data.get("role") or user_meta.get("role", "org_user")
        if role == "super_admin":
            role = "platform_admin"
        elif role in ("tenant_user", "authenticated"):
            role = "org_user"
        org_id = user_meta.get("organization_id") or user_meta.get("tenant_id")
        user_id_str = str(user_id)
        if not org_id:
            db_org_id, db_role = await _resolve_org_context(user_id_str, email)
            if db_org_id:
                org_id = db_org_id
            if db_role and role == "org_user":
                role = db_role
        full_name = user_meta.get("full_name") or user_meta.get("name")
        return TokenData(
            user_id=user_id_str,
            email=email,
            role=role,
            organization_id=str(org_id) if org_id else None,
            tenant_id=str(org_id) if org_id else None,
            full_name=full_name,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def require_platform_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role not in ("platform_admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform Admin access required",
        )
    return current_user

async def require_org_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    if current_user.role not in ("platform_admin", "super_admin", "org_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization Admin access required",
        )
    return current_user

async def require_authenticated_user(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    return current_user
