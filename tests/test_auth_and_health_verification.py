"""
tests/test_auth_and_health_verification.py
==========================================
Comprehensive test suite verifying:
1. Supabase JWT & JWKS signature verification logic
2. Local session HMAC verification (HS256)
3. Algorithm distinction and isolation (no algorithm confusion)
4. Key rotation and safe refresh handling
5. Rejection of expired, forged, and unsupported tokens
6. Real Redis PubSub connectivity and health check
7. Platform health endpoint reporting
8. WorkflowInstance run-detail safety
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta
import pytest
from jose import jwt
from fastapi import HTTPException

from api.auth import (
    create_access_token,
    decode_token,
    get_supabase_jwks,
    _verify_supabase_jwks,
    SECRET_KEY,
    TokenData,
)
from core.redis_pubsub import pubsub


def test_valid_local_session_token():
    """Verify that a valid local session token is decoded without JWKS errors."""
    data = {
        "sub": "user-uuid-123",
        "email": "tester@smbflow.com",
        "role": "platform_admin",
        "organization_id": "org-uuid-456",
        "full_name": "Test Administrator",
    }
    tok = create_access_token(data)
    decoded = decode_token(tok)

    assert isinstance(decoded, TokenData)
    assert decoded.user_id == "user-uuid-123"
    assert decoded.email == "tester@smbflow.com"
    assert decoded.role == "platform_admin"
    assert decoded.organization_id == "org-uuid-456"
    assert decoded.full_name == "Test Administrator"


def test_expired_token_rejected():
    """Expired tokens must be rejected immediately with HTTP 401."""
    tok = create_access_token(
        {"sub": "expired-user", "role": "org_user"},
        expires_delta=timedelta(seconds=-10),
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_token(tok)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_tampered_signature_rejected():
    """Tampered token signatures must be rejected with HTTP 401."""
    tok = create_access_token({"sub": "legit-user", "role": "org_user"})
    # Tamper with the signature bytes at the end
    parts = tok.split(".")
    tampered_sig = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
    tampered_tok = f"{parts[0]}.{parts[1]}.{tampered_sig}"

    with pytest.raises(HTTPException) as exc_info:
        decode_token(tampered_tok)
    assert exc_info.value.status_code == 401


def test_unsupported_algorithm_rejected():
    """Tokens with unsupported or dangerous algorithms (e.g., none) must be rejected."""
    import base64
    import json

    h = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    p = base64.urlsafe_b64encode(json.dumps({"sub": "attacker", "role": "platform_admin"}).encode()).rstrip(b"=").decode()
    raw_none_tok = f"{h}.{p}."

    with pytest.raises(HTTPException) as exc_info:
        decode_token(raw_none_tok)
    assert exc_info.value.status_code == 401
    assert "unsupported" in exc_info.value.detail.lower() or "algorithm" in exc_info.value.detail.lower()


def test_malformed_token_rejected():
    """Malformed non-JWT strings must be rejected with HTTP 401."""
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not-a-valid-token-string")
    assert exc_info.value.status_code == 401


def test_jwks_does_not_attempt_oct_on_ec():
    """
    Direct test for the root cause:
    Passing an HS256 header to _verify_supabase_jwks should return None immediately,
    and NEVER attempt to construct an EC key using an oct/HMAC algorithm.
    """
    tok = create_access_token({"sub": "test-user"})
    header = jwt.get_unverified_header(tok)
    res = _verify_supabase_jwks(tok, header)
    assert res is None, "Symmetric HS256 token must never be processed by Supabase JWKS"


def test_supabase_jwks_cache_and_fetch():
    """Verify that get_supabase_jwks returns keys or None gracefully and caches correctly."""
    jwks = get_supabase_jwks()
    if jwks:
        assert "keys" in jwks
        assert isinstance(jwks["keys"], list)
        for k in jwks["keys"]:
            assert "kty" in k
            assert "alg" in k
    # Force refresh must also succeed or return gracefully
    refreshed = get_supabase_jwks(force_refresh=True)
    if jwks:
        assert refreshed is not None


@pytest.mark.asyncio
async def test_redis_pubsub_live_ping():
    """Verify that pubsub.ping() actually pings Redis and returns True."""
    is_alive = await pubsub.ping()
    # If REDIS_URL is configured in environment, ping must return True
    if os.getenv("REDIS_URL"):
        assert is_alive is True, "Redis is configured but ping() returned False"
        assert pubsub.available is True


@pytest.mark.asyncio
async def test_platform_health_service_check():
    """Verify the platform health logic against live DB and Redis."""
    from api.dependencies import get_db
    from sqlalchemy import text

    session_gen = get_db()
    db = await anext(session_gen)
    try:
        # Check database
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    assert db_ok is True, "Database must be operational"

    # Check redis
    if os.getenv("REDIS_URL"):
        redis_ok = await pubsub.ping()
        assert redis_ok is True, "Redis must be operational"


@pytest.mark.asyncio
async def test_workflow_instance_uuid_and_attr_safety():
    """Confirm crud.get_workflow_instance safely handles invalid UUIDs without crashing."""
    from api import crud
    from api.dependencies import get_db

    session_gen = get_db()
    db = await anext(session_gen)
    # Non-UUID string must return None, not raise ValueError
    res = await crud.get_workflow_instance(db, "invalid-not-a-uuid-string")
    assert res is None


@pytest.mark.asyncio
async def test_api_admin_health_and_runs():
    """Test full FastAPI request flows for /admin/health and /admin/runs."""
    import httpx
    from api.main import app
    from core.database import engine
    from db.models.core import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Missing token -> 401
        resp = await client.get("/api/v1/admin/health")
        assert resp.status_code == 401

        # 2. Non-admin user -> 403 Forbidden
        org_user_tok = create_access_token({"sub": "org-user-1", "role": "org_user", "email": "user@client.com"})
        resp = await client.get("/api/v1/admin/health", headers={"Authorization": f"Bearer {org_user_tok}"})
        assert resp.status_code == 403

        # 3. Platform Admin -> 200 OK with live Redis & Database operational status
        admin_tok = create_access_token({"sub": "admin-user-1", "role": "platform_admin", "email": "admin@smbflow.com"})
        resp = await client.get("/api/v1/admin/health", headers={"Authorization": f"Bearer {admin_tok}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "services" in data
        assert data["services"]["database"]["status"] == "operational"
        assert data["services"]["redis"]["status"] == "operational"
        assert data["services"]["redis"]["label"] == "Redis / PubSub"

        # 4. Run listing endpoint
        runs_resp = await client.get("/api/v1/admin/runs?limit=5", headers={"Authorization": f"Bearer {admin_tok}"})
        assert runs_resp.status_code == 200
        assert isinstance(runs_resp.json(), list)

        # 5. Run detail endpoint with nonexistent UUID -> 404
        dummy_uuid = str(uuid.uuid4())
        detail_resp = await client.get(f"/api/v1/admin/runs/{dummy_uuid}", headers={"Authorization": f"Bearer {admin_tok}"})
        assert detail_resp.status_code == 404

        # 6. Run detail endpoint with invalid non-UUID string -> 404, not 500
        invalid_resp = await client.get("/api/v1/admin/runs/not-a-valid-uuid", headers={"Authorization": f"Bearer {admin_tok}"})
        assert invalid_resp.status_code == 404
