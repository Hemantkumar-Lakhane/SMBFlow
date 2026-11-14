"""
tests/test_security_hardening.py
================================
Validates production-grade security, rate limiting, and attack resistance:
  1. HTTP Security Headers (nosniff, frameguard, XSS protection, HSTS, referrer policy)
  2. Sliding-window rate limiting on auth and API endpoints (429 handling)
  3. Payload size guard (>15MB rejection)
  4. Credential vault encryption and masking
"""

import pytest
from httpx import AsyncClient, ASGITransport
from api.main import app
from core.redis_cache import cache as redis_cache
from integrations.key_vault import encrypt_credentials, decrypt_credentials, mask_credentials


@pytest.mark.asyncio
async def test_security_headers_present():
    """Verify production security headers are attached to every response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/docs")
        assert resp.status_code == 200
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "max-age=31536000" in resp.headers.get("Strict-Transport-Security", "")


@pytest.mark.asyncio
async def test_rate_limiter_auth_route():
    """Verify auth endpoints are strictly rate limited against brute force."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Pre-seed rate limit key near limit
        key = "ratelimit:auth:192.0.2.1"
        await redis_cache.set(key, 20, ttl=60)

        # 21st attempt should be blocked with 429 Too Many Requests
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "attacker@example.com", "password": "wrong"},
            headers={"X-Forwarded-For": "192.0.2.1"}
        )
        assert resp.status_code == 429
        body = resp.json()
        assert body.get("detail") == "Rate limit exceeded"
        assert "Retry-After" in resp.headers


@pytest.mark.asyncio
async def test_payload_size_limit():
    """Verify payloads exceeding 15MB are rejected with 413 Payload Too Large."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/copilot/chat",
            content=b"test",
            headers={
                "Content-Length": str(20 * 1024 * 1024),  # 20MB
                "Content-Type": "application/json",
            }
        )
        assert resp.status_code == 413
        assert resp.json().get("detail") == "Payload Too Large"


def test_credential_encryption_and_masking():
    """Verify secrets are encrypted with Fernet and masked in responses."""
    raw_secrets = {
        "api_key": "sk-ant-api03-live-super-secret-key-9999",
        "bot_token": "xoxb-12345678-secret-slack-token",
        "nested": {"password": "super-secure-pass"},
    }

    # 1. Encryption
    encrypted = encrypt_credentials(raw_secrets)
    assert isinstance(encrypted, str)
    assert "super-secret" not in encrypted
    assert "super-secure" not in encrypted

    # 2. Decryption
    decrypted = decrypt_credentials(encrypted)
    assert decrypted["api_key"] == raw_secrets["api_key"]

    # 3. Masking
    masked = mask_credentials(decrypted)
    assert masked["api_key"].startswith("sk-")
    assert "..." in masked["api_key"] or "***" in masked["api_key"]
    assert masked["api_key"] != raw_secrets["api_key"]
    assert "super-secret" not in masked["api_key"]
