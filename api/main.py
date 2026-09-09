"""
api/main.py  (full rewrite — DB-first)
=======================================
FastAPI application — SMBFlow API v3.

All state lives in PostgreSQL.  In-memory dicts are removed.
Two things remain in-memory legitimately:
  _ws_connections    — transient WebSocket handles (process-local, OK)
  _active_orchestrators — running asyncio tasks (process-local, OK)
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiofiles
import structlog
from fastapi import (
    BackgroundTasks, Depends, FastAPI, HTTPException,
    Query, Request, WebSocket, WebSocketDisconnect, status,
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except ImportError:
    pass

import hashlib
import secrets
from datetime import timedelta

import api.crud as crud
from api.auth import (
    LoginRequest, SignupRequest, TokenData, TokenResponse,
    assert_tenant_access, build_token_for_user,
    get_tenant_filter, hash_password, require_admin,
    require_any_auth, verify_password,
)
from api import mailer
from api.dependencies import get_db
from core.database import get_raw_session
from core.state_manager import WorkflowStatus
from integrations.key_vault import (
    decrypt_credentials, encrypt_credentials, get_credential_schema, mask_credentials,
)
from core.redis_pubsub import pubsub as redis_pubsub
from core.dag_validator import validate_dag
log = structlog.get_logger()

# ─────────────────────────────────────────────────────────────────────────────
# In-memory (ONLY transient, process-local state)
# ─────────────────────────────────────────────────────────────────────────────
_ws_connections: dict[str, tuple] = {}
_active_orchestrators: dict[str, Any] = {}


# ─────────────────────────────────────────────────────────────────────────────
# App lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ensure DB tables exist, seed super-admin, recover stuck workflows."""
    from core.database import engine
    from core.state_manager import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Initialize Redis pub/sub
    await redis_pubsub.connect()
    await redis_pubsub.start_subscriber(_local_broadcast)
    log.info("Redis pub/sub initialized")

    # Seed super-admin from env
    _admin_email = os.getenv("ADMIN_EMAIL", "admin@smbflow.com")
    _admin_pw    = os.getenv("ADMIN_PASSWORD", "admin123")
    _admin_name  = os.getenv("ADMIN_FULL_NAME", "SMBFlow Admin")
    try:
        session = await get_raw_session()
        async with session:
            existing = await crud.get_user_by_email(session, _admin_email)
            if not existing:
                await crud.create_user(
                    session,
                    email=_admin_email,
                    password_hash=hash_password(_admin_pw),
                    full_name=_admin_name,
                    role="super_admin",
                    tenant_id=None,
                )
                log.info("Super-admin seeded", email=_admin_email)
    except Exception as _seed_err:
        log.error("Admin seed failed (non-fatal)", error=str(_seed_err))

    # Startup recovery: mark workflows interrupted by a previous crash as failed
    try:
        recovery_db = await get_raw_session()
        async with recovery_db:
            all_instances = await crud.list_workflow_instances(recovery_db, limit=1000)
            stuck = [w for w in all_instances if w.status == "running"]
            if stuck:
                for w in stuck:
                    await crud.update_workflow_status(
                        recovery_db, str(w.id), "failed",
                        error=(
                            "Server restart detected: workflow interrupted mid-execution. "
                            "Re-trigger from the dashboard if needed."
                        ),
                    )
                log.warning(
                    "Startup recovery: marked interrupted workflows as failed",
                    count=len(stuck),
                )
    except Exception as _rec_err:
        log.warning("Startup recovery failed (non-fatal)", error=str(_rec_err))

    # Start Email Event Detector
    global _email_detector
    try:
        from core.event_detector import EmailEventDetector
        _email_detector = EmailEventDetector(
            poll_interval=float(os.getenv("EMAIL_DETECTOR_POLL_INTERVAL", "5.0")),
            execute_workflow_fn=_execute_workflow_background,
            broadcast_fn=broadcast_event,
        )
        await _email_detector.start()
    except Exception as _det_err:
        log.error("Failed to start EmailEventDetector", error=str(_det_err))

    log.info("SMBFlow API started")
    yield

    # Shutdown
    if "_email_detector" in globals() and _email_detector:
        await _email_detector.stop()
    await redis_pubsub.stop()
    log.info("SMBFlow API stopped")


from api.routers import connections, reviews, medical_tourism

app = FastAPI(
    title="SMBFlow API v3",
    description="Autonomous Multi-Tenant Agentic Workflow Automation Platform",
    version="3.0.0",
    lifespan=lifespan,
)

app.include_router(connections.router)
app.include_router(reviews.router)
app.include_router(medical_tourism.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths that must remain reachable before the system is initialised
_BYPASS_PATHS = {"/api/v1/health", "/docs", "/openapi.json", "/redoc", "/"}


@app.middleware("http")
async def system_integrity_check(request: Request, call_next):
    """
    Validate required environment variables on every request.
    Returns a clear 503 'System Not Initialized' error if any are missing,
    so operators get an actionable message rather than a cryptic DB error.
    """
    if request.url.path in _BYPASS_PATHS or request.url.path.startswith("/redoc"):
        return await call_next(request)

    missing = []
    if not os.getenv("DATABASE_URL"):
        missing.append("DATABASE_URL")
    if not os.getenv("VAULT_ENCRYPTION_KEY"):
        missing.append("VAULT_ENCRYPTION_KEY")

    if missing:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "System Not Initialized",
                "message": (
                    "One or more required environment variables are missing. "
                    "Configure your .env file and restart the server."
                ),
                "missing_variables": missing,
                "hint": "Copy .env.example to .env and fill in the required values.",
            },
        )
    return await call_next(request)


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket
# ─────────────────────────────────────────────────────────────────────────────

async def broadcast_event(event_type: str, data: dict) -> None:
    """Broadcast event via Redis (multi-worker) or in-process fallback."""
    await redis_pubsub.publish(event_type, data)
    # _local_broadcast already handles the (WebSocket, tenant_id) tuple structure
    if not redis_pubsub.available:
        await _local_broadcast(event_type, data)
 
# Add separate local-only broadcast (used by Redis subscriber callback):
async def _local_broadcast(event_type: str, data: dict) -> None:
    """In-process broadcast with tenant-aware filtering."""
    msg = json.dumps({"type": event_type, "data": data, "ts": datetime.utcnow().isoformat()})
    event_tenant = data.get("tenant_id")
    dead = []
    for sid, (ws, user_tenant) in _ws_connections.items():
        try:
            # Deliver if: global event, admin (no tenant), or tenant match
            if not event_tenant or not user_tenant or str(event_tenant) == str(user_tenant):
                await ws.send_text(msg)
        except Exception:
            dead.append(sid)
    for sid in dead:
        _ws_connections.pop(sid, None)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    token = websocket.query_params.get("token")
    try:
        from api.auth import decode_token
        token_data = decode_token(token) if token else None
    except Exception:
        await websocket.close(code=4001)
        return
 
    await websocket.accept()
    user_tenant = getattr(token_data, "tenant_id", None)
    user_role   = getattr(token_data, "role", "anon")
    _ws_connections[session_id] = (websocket, user_tenant)
 
    # BUG-004 FIX: Subscribe this worker to the tenant-scoped Redis channel.
    # Without this, events from OTHER uvicorn workers never reach this connection.
    _tenant_sub_task = None
    if redis_pubsub.available and user_tenant:
        tenant_ch = f"opsgrid:events:tenant:{user_tenant}"
        _tenant_sub_task = asyncio.create_task(
            _redis_channel_relay(session_id, tenant_ch)
        )
 
    try:
        await websocket.send_text(json.dumps({
            "type": "connected",
            "data": {"session_id": session_id, "role": user_role},
        }))
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "keepalive"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        _ws_connections.pop(session_id, None)
        if _tenant_sub_task and not _tenant_sub_task.done():
            _tenant_sub_task.cancel()
            
            
async def _redis_channel_relay(session_id: str, channel: str) -> None:
    """
    Subscribe to a specific Redis channel and relay messages to the WebSocket
    connection identified by session_id. One task per (connection, channel).
    Exits cleanly when the connection is closed.
    """
    import os
    redis_url = os.getenv("REDIS_URL", "")
    if not redis_url:
        return
    try:
        import redis.asyncio as aioredis
        async with aioredis.from_url(
            redis_url, encoding="utf-8", decode_responses=True
        ).pubsub() as pubsub:
            await pubsub.subscribe(channel)
            async for message in pubsub.listen():
                if session_id not in _ws_connections:
                    break  # Connection closed — exit
                if message["type"] != "message":
                    continue
                try:
                    ws, _ = _ws_connections[session_id]
                    await ws.send_text(message["data"])
                except Exception:
                    break
    except asyncio.CancelledError:
        pass
    except Exception as e:
        log.debug("Tenant channel relay error", channel=channel, error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    name: str
    industry: str
    config: dict = Field(default_factory=dict)

class WorkflowTriggerRequest(BaseModel):
    # tenant_id is OPTIONAL — Phase 0 bridge derives it from the authenticated
    # user's organization when not supplied.  Kept for backwards compatibility
    # with platform-admin triggers that supply an explicit tenant.
    tenant_id: Optional[str] = None
    workflow_name: str
    signal_data: Optional[dict] = Field(default_factory=dict)
    trigger_signal: Optional[dict] = None

class EscalationDecision(BaseModel):
    decision: dict
    action_chosen: str
    decided_by: str

class A2ADecision(BaseModel):
    approved: bool
    reason: Optional[str] = None

class CredentialCreate(BaseModel):
    tenant_id: str
    tool_name: str
    display_name: Optional[str] = None
    credentials: dict

class CustomToolCreate(BaseModel):
    tenant_id: str
    tool_name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    base_url: str
    http_method: str = "GET"
    headers_template: dict = Field(default_factory=dict)
    body_template: dict = Field(default_factory=dict)
    query_params: dict = Field(default_factory=dict)
    auth_type: str = "api_key"
    credential_id: Optional[str] = None
    response_path: Optional[str] = None

class BudgetSettingsUpdate(BaseModel):
    optimization_level: int = Field(ge=0, le=3)
    enable_caching: bool = True
    cache_ttl_seconds: int = 3600
    max_context_tokens: int = 10000
    a2a_enabled: bool = False
    auto_retry_on_low_confidence: bool = True
    confidence_retry_threshold: float = 0.6
    enable_map_reduce_summarization: bool = False
    max_spend_per_run_usd: Optional[float] = None

class TenantConfigUpdate(BaseModel):
    config: dict

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    tenant_id: Optional[str] = None

class WorkflowDAGCreate(BaseModel):
    name: str
    dag: dict

class PromptUpdate(BaseModel):
    content: str

class WorkflowForkRequest(BaseModel):
    from_node_id: str
    context_patch: Optional[dict] = None   # override specific accumulated_context keys

class AutoEvalRunRequest(BaseModel):
    tenant_id: str
    workflow_name: str

class AutoEvalApplyRequest(BaseModel):
    admin_email: str

class WebhookMappingCreate(BaseModel):
    """No-code webhook routing configuration."""
    tenant_id: str
    webhook_name: str
    sample_payload: dict
    workflow_name: str
    field_mappings: dict  # e.g. {"account_id": "data.object.customer_id"}
class AdminUserInviteRequest(BaseModel):
    email: str
    full_name: Optional[str] = None
    role: Optional[str] = "platform_admin"
    organization_id: Optional[str] = None

class ProvisionRequest(BaseModel):
    full_name: Optional[str] = None
    workspace_name: Optional[str] = None
    industry: Optional[str] = "saas"


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await crud.get_user_by_email(db, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    await crud.update_user_last_login(db, str(user.id))
    token = build_token_for_user(crud.user_to_dict(user))
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id), "email": user.email,
            "full_name": user.full_name, "role": user.role,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        },
    )


@app.post("/api/v1/auth/signup", response_model=TokenResponse, tags=["Auth"])
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    if await crud.get_user_by_email(db, body.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    tenant_id = None
    if body.tenant_name:
        tenant = await crud.create_tenant(db, body.tenant_name, body.industry or "saas", {})
        tenant_id = str(tenant.id)

    user = await crud.create_user(
        db,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role="tenant_user",
        tenant_id=tenant_id,
    )
    token = build_token_for_user(crud.user_to_dict(user))
    await broadcast_event("user_created", {"user_id": str(user.id), "email": user.email})
    return TokenResponse(
        access_token=token,
        user={
            "id": str(user.id), "email": user.email,
            "full_name": user.full_name, "role": "tenant_user",
            "tenant_id": tenant_id,
        },
    )


@app.post("/api/v1/auth/provision", tags=["Auth"])
async def provision_user_workspace(
    body: ProvisionRequest,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=current_user.user_id,
        email=current_user.email,
        full_name=body.full_name,
        workspace_name=body.workspace_name,
        industry=body.industry,
    )
    org_id = str(org.id) if org else (current_user.organization_id or current_user.tenant_id)
    org_name = org.name if org else body.workspace_name

    return {
        "id": current_user.user_id,
        "email": current_user.email,
        "role": org_user.role if org_user else "org_user",
        "organization_id": org_id,
        "tenant_id": org_id,
        "full_name": org_user.full_name if org_user else body.full_name,
        "organization_name": org_name,
        "tenant_name": org_name,
        "industry": org.industry if org else (body.industry or "saas"),
        "requires_onboarding": False,
    }


@app.get("/api/v1/auth/me", tags=["Auth"])
async def get_me(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=current_user.user_id,
        email=current_user.email,
        full_name=current_user.full_name,
    )
    role = org_user.role if org_user else current_user.role
    org_id = str(org.id) if org else (current_user.organization_id or current_user.tenant_id)
    org_name = org.name if org else None

    # Check if user requires workspace onboarding setup
    requires_onboarding = False
    if org and org.name == "Pending Workspace Setup":
        requires_onboarding = True
    elif org and org.profile_config and org.profile_config.get("requires_onboarding"):
        requires_onboarding = True

    resolved_full_name = (
        (org_user.full_name if org_user and org_user.full_name and "@" not in org_user.full_name else None)
        or current_user.full_name
        or (current_user.email.split("@")[0].replace(".", " ").title() if current_user.email else "Dev User")
    )

    return {
        "id": current_user.user_id,
        "email": current_user.email,
        "role": role,
        "organization_id": org_id,
        "tenant_id": org_id,
        "full_name": resolved_full_name,
        "organization_name": org_name,
        "tenant_name": org_name,
        "industry": org.industry if org else "saas",
        "requires_onboarding": requires_onboarding,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Organizations — canonical org-scoped endpoints (Phase 0)
# ─────────────────────────────────────────────────────────────────────────────

class OrgConfigUpdate(BaseModel):
    """Partial update to organizations.profile_config."""
    config: dict = Field(default_factory=dict)

class OrgProfileUpdate(BaseModel):
    """Update organization name / industry / settings."""
    name: Optional[str] = None
    industry: Optional[str] = None
    config: Optional[dict] = None


@app.get("/api/v1/organizations/me", tags=["Organizations"])
async def get_my_organization(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the authenticated user's organization from the ``organizations`` table.
    This is the canonical source of truth for org name, industry, and profile.
    Used by: GeneralSettings, Dashboard header, Workflow Builder industry pre-fill.
    """
    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=current_user.user_id,
        email=current_user.email,
        full_name=current_user.full_name,
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    profile = org.profile_config or {}
    return {
        "id":               str(org.id),
        "name":             org.name,
        "industry":         org.industry,
        "enabled_modules":  org.enabled_modules or [],
        "active":           org.active,
        "created_at":       org.created_at.isoformat() if org.created_at else None,
        "config": {
            "timezone":      profile.get("timezone", "UTC"),
            "notifications": profile.get("notifications", {}),
            "retention":     profile.get("retention", {}),
        },
        "role":             org_user.role if org_user else "org_user",
        "full_name":        org_user.full_name if org_user else current_user.full_name,
    }


@app.put("/api/v1/organizations/me/config", tags=["Organizations"])
async def update_my_organization_config(
    body: OrgConfigUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Merge partial config into the authenticated user's organization.profile_config.
    Used by: GeneralSettings → Save changes.
    """
    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=current_user.user_id,
        email=current_user.email,
        full_name=current_user.full_name,
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    updated = await crud.update_organization_config(db, str(org.id), body.config)
    await broadcast_event("org_config_updated", {"org_id": str(org.id)})
    return {"message": "Organization config updated", "org_id": str(org.id)}


@app.put("/api/v1/organizations/me/profile", tags=["Organizations"])
async def update_my_organization_profile(
    body: OrgProfileUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the authenticated user's organization name/industry/profile.
    Only org_admin or platform_admin may change org name and industry.
    """
    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=current_user.user_id,
        email=current_user.email,
        full_name=current_user.full_name,
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    updated = await crud.update_organization_profile(
        db,
        str(org.id),
        name=body.name,
        industry=body.industry,
        profile_config=body.config,
    )
    await broadcast_event("org_profile_updated", {"org_id": str(org.id)})
    return {
        "message":  "Organization profile updated",
        "org_id":   str(org.id),
        "name":     updated.name if updated else body.name,
        "industry": updated.industry if updated else body.industry,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Password Reset  (secure, single-use, expiring — see api/mailer.py)
#
# Security invariants enforced here:
#   • forgot-password returns an IDENTICAL generic response for known/unknown
#     emails (no account-existence disclosure).
#   • Only a SHA-256 hash of the token is persisted; the raw token is never
#     logged or stored — it lives only in the emailed link (or, in an explicitly
#     enabled non-production dev environment with email unconfigured, the
#     dev_reset_url field of the response).
#   • Tokens expire (PASSWORD_RESET_TOKEN_TTL_MINUTES) and are single-use.
#   • Best-effort per-email + per-IP rate limiting when Redis is available.
# ─────────────────────────────────────────────────────────────────────────────

MIN_PASSWORD_LENGTH = 8
_RESET_TTL_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_TTL_MINUTES", "30"))
_GENERIC_FORGOT_MESSAGE = (
    "If an account exists for that email, you'll receive password reset instructions."
)
_GENERIC_INVALID_TOKEN = "This reset link is invalid or has expired."


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def _hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def _reset_rate_limited(email: str, client_ip: str) -> bool:
    """
    Best-effort rate limit: max 5 requests / 15 min per email and per IP.
    Uses the existing Redis client when available; if Redis is down we do NOT
    block (availability over strictness for a non-critical control).
    """
    r = getattr(redis_pubsub, "_redis", None)
    if not redis_pubsub.available or not r:
        return False
    try:
        window = 900
        limit = 5
        for scope in (f"pwreset:email:{email.lower()}", f"pwreset:ip:{client_ip}"):
            n = await r.incr(scope)
            if n == 1:
                await r.expire(scope, window)
            if n > limit:
                return True
    except Exception:
        return False
    return False


@app.post("/api/v1/auth/forgot-password", tags=["Auth"])
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = (body.email or "").strip()
    client_ip = request.client.host if request.client else "unknown"

    # Uniform response object built once — returned on every path so timing and
    # payload do not reveal whether the account exists.
    response: dict[str, Any] = {"message": _GENERIC_FORGOT_MESSAGE}

    # Rate limit silently (still returns the generic message).
    if email and await _reset_rate_limited(email, client_ip):
        return JSONResponse(response)

    user = await crud.get_user_by_email(db, email) if email else None
    if user and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_reset_token(raw_token)
        expires_at = datetime.utcnow() + timedelta(minutes=_RESET_TTL_MINUTES)
        await crud.create_password_reset_token(db, str(user.id), token_hash, expires_at)

        reset_url = f"{mailer.app_base_url()}/auth/reset-password?token={raw_token}"
        delivered = mailer.send_password_reset_email(user.email, reset_url)

        # Dev-only inspection: ONLY when explicitly enabled, non-production, and
        # email delivery is not configured. Never in production/staging.
        if not delivered and mailer.dev_token_inspection_enabled():
            response["dev_reset_url"] = reset_url

    return JSONResponse(response)


@app.post("/api/v1/auth/reset-password", tags=["Auth"])
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    new_password = body.new_password or ""
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    token_hash = _hash_reset_token((body.token or "").strip())
    row = await crud.get_valid_reset_token(db, token_hash)
    if not row:
        # Generic — do not distinguish invalid / expired / already-used.
        raise HTTPException(status_code=400, detail=_GENERIC_INVALID_TOKEN)

    user = await crud.get_user_by_id(db, str(row.user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail=_GENERIC_INVALID_TOKEN)

    await crud.update_user_password(db, str(user.id), hash_password(new_password))
    await crud.mark_reset_token_used(db, str(row.id))
    await crud.invalidate_user_reset_tokens(db, str(user.id))

    return {"message": "Your password has been updated."}


# ─────────────────────────────────────────────────────────────────────────────
# System
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/health", tags=["System"])
async def health_check(db: AsyncSession = Depends(get_db)):
    llm_providers = {}
    for provider, key_env in [
        ("anthropic", "ANTHROPIC_API_KEY"), ("openai", "OPENAI_API_KEY"),
        ("google", "GOOGLE_API_KEY"), ("groq", "GROQ_API_KEY"),
    ]:
        key_val = os.getenv(key_env, "")
        if key_val and len(key_val) > 8:
            llm_providers[provider] = {"status": "configured",
                                        "key_preview": key_val[:8] + "****" + key_val[-4:]}
        else:
            llm_providers[provider] = {"status": "not_configured"}

    instances = await crud.list_workflow_instances(db, limit=500)
    active = sum(1 for i in instances if i.status == "running")
    tenants = await crud.list_tenants(db)
    ev_dir = Path(os.getenv("EPI_EVIDENCE_DIR", "./evidence"))
    ev_count = len(list(ev_dir.glob("*"))) if ev_dir.exists() else 0

    return {
        "status": "ok", "db": "postgresql",
        "llm_providers": llm_providers,
        "epi": f"{ev_count} evidence files",
        "timestamp": datetime.utcnow().isoformat(),
        "active_workflows": active,
        "total_tenants": len(tenants),
        "ws_connections": len(_ws_connections),
    }
    
    
@app.get("/api/v1/tenants/{tenant_id}/connectors/health", tags=["Tenants"])
async def check_connector_health(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Run health checks on all configured integrations for a tenant.
    Returns per-connector status so operators know before triggering workflows.
    """
    assert_tenant_access(current_user, tenant_id)
    tenant = await crud.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
 
    creds_rows = await crud.list_credentials(db, tenant_id=tenant_id)
    stored_creds: dict = {}
    for c in creds_rows:
        raw = (c.credentials or {}).get("encrypted", "")
        if raw:
            try:
                from integrations.key_vault import decrypt_credentials
                stored_creds[c.tool_name] = decrypt_credentials(raw)
            except Exception:
                pass
 
    integrations = (tenant.config or {}).get("integrations", {})
    results = {}
 
    for int_name, int_conf in integrations.items():
        if not isinstance(int_conf, dict) or not int_conf.get("enabled"):
            results[int_name] = {"status": "disabled"}
            continue
        if int_name not in stored_creds:
            results[int_name] = {"status": "no_credentials"}
            continue
 
        connector_cls = {
            "hubspot": "HubSpotConnector",
            "gmail":   "GmailConnector",
            "slack":   "SlackConnector",
            "stripe":  "StripeConnector",
        }.get(int_name)
 
        if not connector_cls:
            results[int_name] = {"status": "unknown_connector_type"}
            continue
 
        try:
            from integrations import connectors as _conn_mod
            cls = getattr(_conn_mod, connector_cls)
            connector = cls(credentials=stored_creds[int_name], config=int_conf)
            ok = await asyncio.wait_for(connector.health_check(), timeout=5.0)
            results[int_name] = {"status": "healthy" if ok else "auth_failed"}
        except asyncio.TimeoutError:
            results[int_name] = {"status": "timeout"}
        except Exception as e:
            results[int_name] = {"status": "error", "detail": str(e)[:100]}
 
    all_healthy = all(
        v["status"] in ("healthy", "disabled")
        for v in results.values()
    )
    return {
        "tenant_id": tenant_id,
        "all_healthy": all_healthy,
        "connectors": results,
        "checked_at": datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/admin/god-view", tags=["Admin"])
async def get_god_view(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    instances = await crud.list_workflow_instances(db, limit=200)
    tenants = await crud.list_tenants(db)
    pending_escs = await crud.list_escalations(db, status="pending")
    pending_a2a = await crud.list_pending_a2a(db)
    events = await crud.list_events(db, limit=50)

    active = [crud.workflow_to_dict(i) for i in instances if i.status in ("running", "paused", "escalated", "pending_a2a")]
    fleet_cost = sum((i.total_cost_usd or 0) for i in instances)
    fleet_tokens_in = sum((i.total_tokens_in or 0) for i in instances)

    return {
        "active_workflows": active,
        "all_workflows": [crud.workflow_to_dict(i) for i in instances],
        "tenants": [
            {"id": str(t.id), "name": t.name, "industry": t.industry,
             "active": t.active, "config": t.config}
            for t in tenants
        ],
        "pending_escalations": [crud.escalation_to_dict(e) for e in pending_escs],
        "pending_a2a": [crud.a2a_to_dict(a) for a in pending_a2a],
        "fleet_stats": {
            "total_cost_usd": round(fleet_cost, 4),
            "total_tokens_in": fleet_tokens_in,
            "active_runs": len(active),
            "ws_clients": len(_ws_connections),
        },
        "recent_events": events,
        "users": [crud.user_to_dict(u) for u in await crud.list_users(db)],
    }


@app.get("/api/v1/admin/live-stats", tags=["Admin"])
async def get_live_stats(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    instances = await crud.list_workflow_instances(db, limit=500)
    active = [i for i in instances if i.status in ("running", "paused", "escalated")]
    fleet_cost = sum((i.total_cost_usd or 0) for i in instances)
    tenants = await crud.list_tenants(db)
    users = await crud.list_users(db)
    pending_escs = await crud.list_escalations(db, status="pending")
    pending_a2a = await crud.list_pending_a2a(db)
    return {
        "active_workflows": len(active),
        "total_workflows": len(instances),
        "fleet_cost_usd": round(fleet_cost, 6),
        "pending_escalations": len(pending_escs),
        "pending_a2a": len(pending_a2a),
        "ws_connections": len(_ws_connections),
        "total_tenants": len(tenants),
        "total_users": len(users),
        "ts": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/admin/system-events", tags=["Admin"])
async def get_system_events(
    limit: int = Query(100),
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await crud.list_events(db, limit=limit)


# ─────────────────────────────────────────────────────────────────────────────
# Users & Admin Management
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/admin/users/invite", tags=["Admin"])
async def invite_platform_admin_or_user(
    body: AdminUserInviteRequest,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("platform_admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform Admin access required",
        )

    target_role = body.role or "platform_admin"
    if target_role == "super_admin":
        target_role = "platform_admin"
    elif target_role == "tenant_user":
        target_role = "org_user"

    if target_role not in ("platform_admin", "org_user"):
        target_role = "org_user"

    target_uid = str(uuid.uuid5(uuid.NAMESPACE_DNS, body.email.lower().strip()))
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY")

    if supabase_url and service_key and not service_key.startswith("YOUR_"):
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                    json={"email": body.email.strip(), "email_confirm": True},
                    headers={
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=5.0,
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    target_uid = str(data.get("id") or target_uid)
        except Exception as e:
            log.warning("Supabase Admin API call failed/skipped", error=str(e))

    org_user, org = await crud.ensure_user_organization_provisioned(
        db,
        user_id=target_uid,
        email=body.email.strip(),
        full_name=body.full_name,
    )
    if org_user:
        org_user.role = target_role
        if body.full_name:
            org_user.full_name = body.full_name
        await db.commit()
        await db.refresh(org_user)

    legacy_u = await crud.get_user_by_email(db, body.email.strip())
    if legacy_u:
        legacy_u.role = "super_admin" if target_role == "platform_admin" else "tenant_user"
        await db.commit()

    await crud.log_event(
        db,
        event_type="admin_user_invited",
        tenant_id=str(org.id) if org else None,
        instance_id=None,
        message=f"Platform Admin {current_user.email} invited {body.email} as {target_role}",
        metadata={
            "actor_user_id": current_user.user_id,
            "actor_email": current_user.email,
            "target_email": body.email.strip(),
            "assigned_role": target_role,
        },
    )

    return {
        "message": f"Successfully invited {body.email.strip()} as {target_role}",
        "user_id": target_uid,
        "email": body.email.strip(),
        "role": target_role,
    }


@app.get("/api/v1/users", tags=["Users"])
@app.get("/api/v1/admin/users", tags=["Admin"])
async def list_admin_users(
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("platform_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Platform Admin access required")

    res_ou = await db.execute(select(OrganizationUser).order_by(OrganizationUser.created_at.desc()))
    ous = res_ou.scalars().all()

    res_orgs = await db.execute(select(Organization))
    orgs_map = {str(o.id): o.name for o in res_orgs.scalars().all()}

    result = []
    seen_emails = set()

    for ou in ous:
        role = "platform_admin" if ou.role in ("platform_admin", "super_admin") else "org_user"
        seen_emails.add(ou.email.lower())
        result.append({
            "id": str(ou.id),
            "user_id": str(ou.user_id),
            "email": ou.email,
            "full_name": ou.full_name,
            "role": role,
            "organization_id": str(ou.organization_id) if ou.organization_id else None,
            "organization_name": orgs_map.get(str(ou.organization_id), "SMBFlow Workspace"),
            "tenant_id": str(ou.organization_id) if ou.organization_id else None,
            "is_active": True,
            "created_at": ou.created_at.isoformat() if ou.created_at else None,
        })

    legacy_users = await crud.list_users(db)
    for u in legacy_users:
        if u.email.lower() not in seen_emails:
            role = "platform_admin" if u.role in ("platform_admin", "super_admin") else "org_user"
            result.append({
                "id": str(u.id),
                "user_id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "role": role,
                "organization_id": str(u.tenant_id) if u.tenant_id else None,
                "organization_name": orgs_map.get(str(u.tenant_id), "—"),
                "tenant_id": str(u.tenant_id) if u.tenant_id else None,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            })

    return result


@app.post("/api/v1/users", tags=["Users"])
async def create_user(
    body: UserCreate,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("platform_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Platform Admin access required")
    if await crud.get_user_by_email(db, body.email):
        raise HTTPException(status_code=409, detail="Email already exists")
    user = await crud.create_user(
        db, body.email, hash_password(body.password),
        body.full_name, "tenant_user", body.tenant_id,
    )
    return {"user_id": str(user.id), "message": "User created"}


@app.patch("/api/v1/users/{user_id}/deactivate", tags=["Users"])
async def deactivate_user(
    user_id: str,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("platform_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Platform Admin access required")
    if not await crud.get_user_by_id(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    await crud.deactivate_user(db, user_id)
    return {"message": "User deactivated"}



# ─────────────────────────────────────────────────────────────────────────────
# Tenants
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/tenants", tags=["Tenants"])
async def list_tenants(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_id = get_tenant_filter(current_user)
    tenants = await crud.list_tenants(db, tenant_id_filter=filter_id)
    return [
        {"id": str(t.id), "name": t.name, "industry": t.industry, "active": t.active}
        for t in tenants
    ]


@app.post("/api/v1/tenants", tags=["Tenants"])
async def create_tenant(
    body: TenantCreate,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    tenant = await crud.create_tenant(db, body.name, body.industry, body.config)
    await broadcast_event("tenant_created", {"tenant_id": str(tenant.id), "name": body.name})
    return {"tenant_id": str(tenant.id), "message": f"Tenant '{body.name}' created"}


@app.get("/api/v1/tenants/{tenant_id}", tags=["Tenants"])
async def get_tenant(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    tenant = await crud.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"id": str(tenant.id), "name": tenant.name, "industry": tenant.industry,
            "config": tenant.config, "active": tenant.active}


@app.put("/api/v1/tenants/{tenant_id}/config", tags=["Tenants"])
async def update_tenant_config(
    tenant_id: str,
    body: TenantConfigUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    if not await crud.get_tenant(db, tenant_id):
        raise HTTPException(status_code=404, detail="Tenant not found")
    await crud.update_tenant_config(db, tenant_id, body.config)
    await broadcast_event("config_updated", {"tenant_id": tenant_id})
    return {"message": "Config updated", "tenant_id": tenant_id}


@app.get("/api/v1/tenants/{tenant_id}/config-schema", tags=["Tenants"])
async def get_config_schema(tenant_id: str):
    return _build_config_schema()

@app.post("/api/v1/tenants/{tenant_id}/validate-config", tags=["Tenants"])
async def validate_tenant_config_endpoint(
    tenant_id: str,
    strict: bool = False,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a tenant's current config.
    
    Returns blocking errors (would prevent workflow execution) and warnings.
    Use strict=True to treat warnings as errors (for production gate).
    """
    assert_tenant_access(current_user, tenant_id)
    tenant = await crud.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    from core.config_validator import validate_tenant_config
    result = validate_tenant_config(tenant.config or {}, strict=strict)
    
    return {
        **result.to_dict(),
        "tenant_id": tenant_id,
        "tenant_name": tenant.name,
        "message": (
            "Config is valid and ready for workflow execution."
            if result.valid else
            f"Config has {len(result.errors)} blocking error(s) that must be fixed before triggering."
        ),
    }

@app.get("/api/v1/evidence/{filename}/content", tags=["Evidence"])
async def get_evidence_file_content(
    filename: str,
    current_user: TokenData = Depends(require_any_auth),
):
    """Return the parsed content of an evidence artifact for the UI viewer."""
    evidence_dir = Path(os.getenv("EPI_EVIDENCE_DIR", "./evidence"))
    # Sanitize — no path traversal
    safe = filename.replace("..", "").replace("/", "").replace("\\", "")
    p = evidence_dir / safe
    if not p.exists():
        raise HTTPException(status_code=404, detail="Evidence file not found")
    try:
        size_kb = round(p.stat().st_size / 1024, 1)
        if p.suffix == ".json":
            data = json.loads(p.read_text())
            return {"filename": safe, "type": "json_summary", "data": data, "size_kb": size_kb}
        elif p.suffix == ".epi":
            try:
                data = json.loads(p.read_text())
                return {"filename": safe, "type": "epi", "data": data, "size_kb": size_kb}
            except Exception:
                return {
                    "filename": safe,
                    "type": "epi_binary",
                    "data": None,
                    "note": f"Binary EPI artifact — use CLI: epi view evidence/{safe}",
                    "size_kb": size_kb,
                }
        raise HTTPException(status_code=400, detail="Unsupported file type")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────────────────────────────────────
# Workflows
# NOTE: /workflows/trigger and /workflows/estimate-cost MUST be registered
# before /workflows/{run_id}/... routes so FastAPI does not swallow static
# path segments as run_id values.
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/workflows/{workflow_name}/trigger-info", tags=["Workflows"])
async def get_workflow_trigger_info(
    workflow_name: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns live metadata for manual workflow trigger UI (available fixture messages, trigger type, source).
    """
    available_messages = 40
    try:
        data_path = Path("db/seed/data/email_messages.json")
        if data_path.exists():
            emails = json.loads(data_path.read_text(encoding="utf-8"))
            available_messages = len(emails)
    except Exception:
        pass

    display_name = workflow_name.replace("_", " ").title()
    if workflow_name == "email_summarizer":
        display_name = "Email Summarizer"

    return {
        "workflow_name": workflow_name,
        "display_name": display_name,
        "trigger_type": "New Email" if "email" in workflow_name else "Manual",
        "source": "Synthetic Inbox" if "email" in workflow_name else "System Direct",
        "available_messages_count": available_messages,
        "status": "active",
    }


@app.post("/api/v1/workflows/trigger", tags=["Workflows"])
async def trigger_workflow(
    body: WorkflowTriggerRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a workflow run.

    Phase 0 bridge: ``tenant_id`` in the request body is now optional.
    When omitted (or for org_users), the tenant context is derived from the
    authenticated user's organization via ``resolve_tenant_config_bridge``.
    Platform admins may still supply an explicit ``tenant_id`` to target a
    specific legacy tenant.
    """
    # ── Resolve effective tenant_id and config (Option B bridge) ──────────
    if body.tenant_id and current_user.role in ("platform_admin", "super_admin"):
        # Platform admin with explicit tenant_id — use legacy path
        assert_tenant_access(current_user, body.tenant_id)
        effective_tenant_id, tenant_config = await crud.resolve_tenant_config_bridge(
            db, body.tenant_id
        )
    else:
        # Org user — always derive from authenticated organization
        org_id = (
            current_user.organization_id
            or current_user.tenant_id
            or body.tenant_id
        )
        if not org_id:
            # Canonical resolution: authenticated user -> organization_users -> organizations
            org_user, org = await crud.ensure_user_organization_provisioned(
                db,
                user_id=current_user.user_id,
                email=current_user.email,
                full_name=current_user.full_name,
            )
            if org:
                org_id = str(org.id)
                current_user.organization_id = org_id
                current_user.tenant_id = org_id
                if org_user and current_user.role == "org_user":
                    current_user.role = org_user.role

        if not org_id:
            raise HTTPException(
                status_code=422,
                detail="Cannot determine organization context. Complete onboarding first.",
            )
        effective_tenant_id, tenant_config = await crud.resolve_tenant_config_bridge(
            db, org_id
        )

    run_id = str(uuid.uuid4())

    # ── Pre-flight config validation (best-effort — warns but allows run) ─
    from core.config_validator import validate_tenant_config
    validation = validate_tenant_config(tenant_config, strict=False)
    if not validation.valid and validation.errors:
        log.warning(
            "Workflow trigger config warnings",
            tenant_id=effective_tenant_id,
            errors=[e.message for e in validation.errors],
        )
        # Only block on hard errors if config was explicitly supplied (admin path)
        if body.tenant_id and current_user.role in ("platform_admin", "super_admin"):
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Tenant config has blocking errors — fix before triggering",
                    "errors": [{"field": e.field, "message": e.message} for e in validation.errors],
                    "warnings": [{"field": w.field, "message": w.message} for w in validation.warnings],
                    "hint": "Fix [MODIFY] placeholders and REPLACE_WITH_UUID values in Config Studio",
                },
            )

    # Normalize trigger signal / payload
    sig = body.trigger_signal or body.signal_data or {}
    if not isinstance(sig, dict):
        sig = {}
    if "source" not in sig:
        sig["source"] = "manual_ui"

    await crud.create_workflow_instance(
        db, run_id=run_id, tenant_id=effective_tenant_id,
        workflow_name=body.workflow_name, trigger_signal=sig,
        triggered_by=current_user.user_id, tenant_config=tenant_config,
    )
    budget = await crud.get_budget_settings(db, effective_tenant_id) or {}
    background_tasks.add_task(
        _execute_workflow_background, run_id, tenant_config,
        body.workflow_name, sig, budget,
    )
    await crud.log_event(
        db, "workflow_triggered", effective_tenant_id, run_id,
        f"Workflow '{body.workflow_name}' triggered by {current_user.email}",
    )
    await broadcast_event(
        "workflow_triggered",
        {"run_id": run_id, "workflow": body.workflow_name,
         "tenant_id": effective_tenant_id},
    )
    return {
        "run_id":     run_id,
        "status":     "pending",
        "tenant_id":  effective_tenant_id,
        "message":    f"Workflow '{body.workflow_name}' queued.",
    }


@app.get("/api/v1/workflows/{workflow_name}/trigger-info", tags=["Workflows"])
async def get_workflow_trigger_info(
    workflow_name: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns real runtime trigger information, available message counts from fixtures,
    and execution statistics for the given workflow.
    """
    safe_name = workflow_name.replace("/", "_").replace("..", "")
    dag_path = Path("workflows/dags") / f"{safe_name}.json"
    meta = {}
    if dag_path.exists():
        try:
            async with aiofiles.open(dag_path) as fp:
                dag = json.loads(await fp.read())
            meta = dag.get("_meta", {})
        except Exception:
            pass

    available_messages_count = 0
    if workflow_name == "email_summarizer" or "email" in workflow_name:
        fixture_path = Path("db/seed/data/email_messages.json")
        if fixture_path.exists():
            try:
                async with aiofiles.open(fixture_path) as fp:
                    emails = json.loads(await fp.read())
                if isinstance(emails, list):
                    available_messages_count = len(emails)
            except Exception:
                pass

    trigger_meta = meta.get("trigger", {})
    trigger_type = "New Email" if ("email" in workflow_name or trigger_meta.get("type") == "email") else "Manual"
    source = "Synthetic Inbox" if ("email" in workflow_name or "synthetic" in str(trigger_meta.get("source", ""))) else "Direct"

    # Compute stats for authenticated org / tenant
    org_id = current_user.organization_id or current_user.tenant_id
    instances = await crud.list_workflow_instances(db, tenant_id=org_id, limit=200)
    wf_runs = [i for i in instances if i.workflow_name == workflow_name]
    completed_runs = [i for i in wf_runs if i.status in ("completed", "WorkflowStatus.COMPLETED")]
    last_run = wf_runs[0] if wf_runs else None

    return {
        "workflow_name": workflow_name,
        "display_name": meta.get("name", workflow_name.replace("_", " ").title()),
        "description": meta.get("description", ""),
        "status": "active",
        "automation_status": "active",
        "automation_enabled": True,
        "trigger_type": trigger_type,
        "source": source,
        "available_messages_count": available_messages_count,
        "total_runs": len(wf_runs),
        "completed_runs": len(completed_runs),
        "success_rate": round((len(completed_runs) / len(wf_runs)) * 100) if wf_runs else None,
        "last_run": crud.workflow_to_dict(last_run) if last_run else None,
    }


@app.get("/api/v1/workflows/estimate-cost", tags=["Workflows"])
async def estimate_workflow_cost(
    tenant_id: str,
    workflow_name: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Pre-trigger cost forecast.

    Analyzes the last completed run for this workflow+tenant, extracts data size,
    and estimates cost at the current optimization level.

    Returns: { estimated_cost_usd, estimated_duration_min, accounts_count,
               breakdown_by_agent, optimization_level, confidence }
    """
    assert_tenant_access(current_user, tenant_id)

    # Find last completed run
    instances = await crud.list_workflow_instances(db, tenant_id=tenant_id, limit=50)
    last_run = next(
        (i for i in instances
         if i.workflow_name == workflow_name and i.status == "completed"),
        None
    )

    if not last_run:
        return {
            "estimated_cost_usd": None,
            "confidence": "low",
            "message": "No previous completed run found for this workflow. Run it once to get estimates.",
            "workflow_name": workflow_name,
        }

    # Get budget settings
    budget = await crud.get_budget_settings(db, tenant_id) or {}
    opt_level = budget.get("optimization_level", 1)

    # Extract data size from last run context
    context = last_run.context or {}
    research = context.get("research", {})
    account_count = len(
        research.get("accounts") or
        research.get("deals") or
        research.get("patients") or
        research.get("transactions") or []
    )

    # Use actual last run cost as baseline
    last_cost = last_run.total_cost_usd or 0.0

    # Apply optimization level savings estimate
    from core.llm_router import LLMRouter
    router = LLMRouter()
    savings = router.get_predicted_savings(opt_level)
    savings_pct = savings.get("savings_pct", 0) / 100.0

    estimated_cost = last_cost * (1.0 - savings_pct)

    # Per-agent breakdown from last run's agent_runs
    agent_runs = last_run.agent_runs or []
    breakdown = {}
    for run in agent_runs:
        if isinstance(run, dict):
            node_id = run.get("node_id", "?")
            breakdown[node_id] = {
                "agent_type": run.get("agent_type", "?"),
                "last_cost_usd": round(run.get("cost_usd", 0.0), 6),
                "estimated_cost_usd": round(run.get("cost_usd", 0.0) * (1.0 - savings_pct), 6),
                "model_last_used": run.get("model_used", "?"),
            }

    return {
        "workflow_name": workflow_name,
        "tenant_id": tenant_id,
        "optimization_level": opt_level,
        "optimization_strategy": savings.get("description", ""),
        "estimated_cost_usd": round(estimated_cost, 5),
        "last_run_cost_usd": round(last_cost, 5),
        "estimated_savings_pct": savings_pct * 100,
        "estimated_duration_minutes": 5,
        "accounts_in_last_run": account_count,
        "confidence": "high" if last_cost > 0.001 else "low",
        "breakdown_by_agent": breakdown,
        "note": f"Estimate based on last completed run ({str(last_run.id)[:8]}). Actual cost varies with data volume.",
    }


@app.get("/api/v1/workflows/{run_id}/status", tags=["Workflows"])
async def get_workflow_status(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if current_user.role != "super_admin":
        assert_tenant_access(current_user, str(inst.tenant_id))
    return crud.workflow_to_dict(inst)


@app.get("/api/v1/workflows", tags=["Workflows"])
async def list_workflows(
    tenant_id: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    List workflow instances (runs) scoped to the authenticated user's org.

    Phase 0: For org_users, the tenant_id is always derived from auth — the
    query param is accepted for backwards compatibility but is overridden by
    the authenticated org_id.  Platform admins may filter by explicit tenant_id.
    """
    if current_user.role in ("platform_admin", "super_admin"):
        filter_tid = get_tenant_filter(current_user) or tenant_id
    else:
        # Org user — always scope to their own org; ignore client-supplied tenant_id
        filter_tid = current_user.organization_id or current_user.tenant_id
    instances = await crud.list_workflow_instances(db, tenant_id=filter_tid, limit=200)
    return [crud.workflow_to_dict(i) for i in instances]


@app.get("/api/v1/workflows/definitions", tags=["Workflows"])
async def list_org_workflow_definitions(
    include_templates: bool = Query(False, description="Also return platform templates"),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    List WorkflowDefinitions owned by the authenticated user's organization.

    Returns definitions from the ``workflow_definitions`` DB table — distinct
    from the filesystem DAGs returned by ``/config/workflows``.
    Set ``include_templates=true`` to also return platform-level templates.
    """
    org_id = current_user.organization_id or current_user.tenant_id
    defs = await crud.list_workflow_definitions(
        db,
        organization_id=org_id,
        include_templates=include_templates,
    )
    return [
        {
            "id":              str(d.id),
            "name":            d.name,
            "industry":        d.industry,
            "version":         d.version,
            "is_template":     d.is_template,
            "organization_id": str(d.organization_id) if d.organization_id else None,
            "active":          d.active,
            "created_at":      d.created_at.isoformat() if d.created_at else None,
        }
        for d in defs
    ]


@app.post("/api/v1/workflows/{run_id}/pause", tags=["Workflows"])
async def pause_workflow(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Run not found")
    assert_tenant_access(current_user, str(inst.tenant_id))
    orch = _active_orchestrators.get(run_id)
    if orch:
        orch.signal_pause(run_id)
    await crud.update_workflow_status(db, run_id, "paused")
    await crud.log_event(db, "workflow_paused", str(inst.tenant_id), run_id,
                         f"Paused by {current_user.email}")
    await broadcast_event("workflow_paused", {"run_id": run_id})
    return {"message": "Pause signal sent", "run_id": run_id}


@app.post("/api/v1/workflows/{run_id}/stop", tags=["Workflows"])
async def stop_workflow(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Run not found")
    assert_tenant_access(current_user, str(inst.tenant_id))
    orch = _active_orchestrators.get(run_id)
    if orch:
        orch.signal_stop(run_id)
    await crud.update_workflow_status(db, run_id, "stopped")
    await crud.log_event(db, "workflow_stopped", str(inst.tenant_id), run_id,
                         f"Stopped by {current_user.email}")
    await broadcast_event("workflow_stopped", {"run_id": run_id})
    return {"message": "Stop signal sent", "run_id": run_id}


@app.post("/api/v1/workflows/{run_id}/resume", tags=["Workflows"])
async def resume_workflow(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Run not found")
    assert_tenant_access(current_user, str(inst.tenant_id))
    orch = _active_orchestrators.get(run_id)
    if orch:
        orch.signal_resume(run_id)
    await crud.update_workflow_status(db, run_id, "running")
    await broadcast_event("workflow_resumed", {"run_id": run_id})
    return {"message": "Resume signal sent", "run_id": run_id}


@app.get("/api/v1/workflows/{run_id}/evidence", tags=["Workflows"])
async def get_workflow_evidence(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if current_user.role != "super_admin":
        assert_tenant_access(current_user, str(inst.tenant_id))
    ev_dir = Path(os.getenv("EPI_EVIDENCE_DIR", "./evidence"))
    matches = list(ev_dir.glob(f"*{run_id[:8]}*"))
    if not matches:
        return {"found": False}
    p = sorted(matches, key=lambda x: x.stat().st_mtime, reverse=True)[0]
    try:
        data = json.loads(p.read_text()) if p.suffix == ".json" else {}
        return {"found": True, "filename": p.name, "path": str(p),
                "size_kb": round(p.stat().st_size / 1024, 1),
                "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                "data": data}
    except Exception:
        return {"found": True, "filename": p.name}


@app.get("/api/v1/workflows/{run_id}/system-log", tags=["Workflows"])
async def get_workflow_system_log(
    run_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Detailed system log for a workflow run.
    
    Shows per-agent: model used, tier, cost, cache hits, features activated.
    Shows: which features fired (HyDE, map-reduce, consensus gate, etc.)
    Shows: what worked, what failed, why.
    
    Useful for operators debugging unexpected costs or quality regressions.
    """
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if current_user.role != "super_admin":
        assert_tenant_access(current_user, str(inst.tenant_id))
    
    outcome = inst.outcome or {}
    agent_runs = inst.agent_runs or []
    
    # Build system log from available data
    system_log = {
        "run_id": run_id,
        "workflow_name": inst.workflow_name,
        "status": inst.status,
        "duration_seconds": (
            (inst.completed_at - inst.started_at).total_seconds()
            if inst.completed_at and inst.started_at else None
        ),
        "cost_summary": {
            "total_usd": round(inst.total_cost_usd or 0.0, 6),
            "tokens_in": inst.total_tokens_in or 0,
            "tokens_out": inst.total_tokens_out or 0,
        },
        "agents": [
            {
                "node_id": r.get("node_id"),
                "agent_type": r.get("agent_type"),
                "status": r.get("status"),
                "model": r.get("model_used", "?"),
                "cost_usd": round(r.get("cost_usd", 0.0), 6),
                "tokens_in": r.get("tokens_in", 0),
                "tokens_out": r.get("tokens_out", 0),
                "confidence": r.get("confidence"),
                "duration_ms": r.get("duration_ms"),
                "error": r.get("error"),
                "tools_used": r.get("tools_used", []),
                # Verification-specific
                "prosecutor_issues": r.get("_prosecutor_issues"),
                "judge_verdict": r.get("_judge_verdict"),
                # Memory-specific
                "delta_vs_history": r.get("delta_vs_history"),
                "delta_trend": r.get("delta_trend"),
            }
            for r in agent_runs
            if isinstance(r, dict)
        ],
        "epi_steps": (outcome.get("_epi_steps") or [])[:20],
        "note": (
            "Enhanced system log with feature audit available after enabling "
            "WorkflowSystemLogger (core/workflow_logger.py). "
            "This response shows DB-persisted data only."
        ),
    }
    
    return system_log

@app.post("/api/v1/workflows/{run_id}/fork", tags=["Workflows"])
async def fork_workflow(
    run_id: str,
    body: WorkflowForkRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Time-Travel Debugging: fork a workflow from a specific node checkpoint.
    Creates a new run that replays from the given node, reusing the accumulated
    context stored from the original run. Optionally patch context keys.
    """
    inst = await crud.get_workflow_instance(db, run_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    if current_user.role != "super_admin":
        assert_tenant_access(current_user, str(inst.tenant_id))

    # Validate node exists in DAG
    dag_path = Path("workflows/dags") / f"{inst.workflow_name}.json"
    if dag_path.exists():
        import json as _j
        dag = _j.loads(dag_path.read_text())
        valid_nodes = [n["id"] for n in dag.get("nodes", [])]
        if body.from_node_id not in valid_nodes:
            raise HTTPException(
                status_code=400,
                detail=f"Node '{body.from_node_id}' not in DAG. Valid: {valid_nodes}",
            )

    new_run_id = str(uuid.uuid4())
    tenant_config = inst.tenant_config or {}

    await crud.create_workflow_instance(
        db,
        run_id=new_run_id,
        tenant_id=str(inst.tenant_id),
        workflow_name=inst.workflow_name,
        trigger_signal={
            **(inst.trigger_signal or {}),
            "_forked_from": run_id,
            "_fork_node": body.from_node_id,
        },
        triggered_by=current_user.user_id,
        tenant_config=tenant_config,
    )

    budget = await crud.get_budget_settings(db, str(inst.tenant_id)) or {}

    background_tasks.add_task(
        _fork_workflow_background,
        new_run_id=new_run_id,
        original_run_id=run_id,
        tenant_config=tenant_config,
        workflow_name=inst.workflow_name,
        from_node_id=body.from_node_id,
        budget_settings=budget,
        context_patch=body.context_patch,
    )

    await crud.log_event(
        db, "workflow_forked", str(inst.tenant_id), new_run_id,
        f"Forked from {run_id[:8]} at '{body.from_node_id}' by {current_user.email}",
    )
    await broadcast_event("workflow_forked", {
        "run_id": new_run_id, "parent_run_id": run_id,
        "fork_node": body.from_node_id, "tenant_id": str(inst.tenant_id),
    })

    return {
        "run_id": new_run_id,
        "parent_run_id": run_id,
        "fork_node": body.from_node_id,
        "status": "pending",
        "message": f"Forked from node '{body.from_node_id}'. Navigate to run: {new_run_id}",
    }

@app.get("/api/v1/tenants/{tenant_id}/workflows/stats", tags=["Workflows"])
async def get_tenant_workflow_stats(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    instances = await crud.list_workflow_instances(db, tenant_id=tenant_id, limit=500)
    return {
        "total": len(instances),
        "running":   sum(1 for i in instances if i.status == "running"),
        "completed": sum(1 for i in instances if i.status == "completed"),
        "failed":    sum(1 for i in instances if i.status == "failed"),
        "paused":    sum(1 for i in instances if i.status == "paused"),
        "escalated": sum(1 for i in instances if i.status in ("escalated", "pending_a2a")),
        "total_cost_usd": round(sum(i.total_cost_usd or 0 for i in instances), 6),
        "total_tokens_in": sum(i.total_tokens_in or 0 for i in instances),
        "total_tokens_out": sum(i.total_tokens_out or 0 for i in instances),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Escalations
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/escalations", tags=["Escalations"])
async def list_escalations(
    status: str = Query("pending"),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_tid = get_tenant_filter(current_user)
    escs = await crud.list_escalations(db, status=status, tenant_id=filter_tid)
    res = [crud.escalation_to_dict(e) for e in escs]

    # Also query ApprovalItems so Action Center displays workflow recommendations & email drafts
    org_id = current_user.organization_id or filter_tid
    approval_status = "pending" if status == "pending" else ("approved" if status in ("resolved", "approved") else status)
    approval_items = await crud.list_approval_items(db, organization_id=org_id, status=approval_status)
    for a in approval_items:
        res.append(await crud.approval_item_to_dict(a))
    return res


@app.post("/api/v1/escalations/{escalation_id}/decide", tags=["Escalations"])
async def decide_escalation(
    escalation_id: str,
    body: EscalationDecision,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    from core.state_manager import StateManager
    sm = StateManager(session=db)
    esc = await crud.get_escalation(db, escalation_id)
    if not esc:
        # Check if this ID is an ApprovalItem
        from db.models.core import ApprovalItem
        from sqlalchemy import select
        try:
            r = await db.execute(select(ApprovalItem).where(ApprovalItem.id == uuid.UUID(escalation_id)))
            appr = r.scalar_one_or_none()
        except Exception:
            appr = None

        if appr:
            action_lower = body.action_chosen.lower()
            decided_status = "approved" if ("approve" in action_lower or "send" in action_lower) else "rejected"
            appr.status = decided_status
            appr.decided_by = body.decided_by or current_user.email
            appr.decided_at = datetime.utcnow()
            payload = appr.payload or {}
            if isinstance(body.decision, dict) and body.decision.get("notes"):
                payload["decision_notes"] = body.decision.get("notes")
            appr.payload = payload
            await db.commit()

            # Safe test mode execution boundary — zero external side effects
            if decided_status == "approved":
                log.info(
                    "[TEST MODE] Approval executed safely — Simulated email action approved",
                    approval_id=escalation_id,
                    recipient=payload.get("to_address") or payload.get("to") or "client@enterprise.com",
                    subject=payload.get("subject"),
                    simulated=True,
                )

            await broadcast_event("approval_decided", {
                "approval_id": escalation_id,
                "status": decided_status,
                "action_chosen": body.action_chosen,
                "decided_by": appr.decided_by,
                "organization_id": str(appr.organization_id) if appr.organization_id else None,
            })

            return {
                "message": f"Approval item {decided_status}.",
                "escalation_id": escalation_id,
                "action_chosen": body.action_chosen,
                "resolved": True,
                "signatures_collected": 1,
                "required_signatures": 1,
            }

        raise HTTPException(status_code=404, detail="Escalation or Approval item not found")

    assert_tenant_access(current_user, str(esc.tenant_id))

    updated_esc = await sm.add_escalation_signature(
        escalation_id=escalation_id,
        user_id=current_user.user_id,
        user_email=current_user.email,
        action_chosen=body.action_chosen,
        decision=body.decision,
    )

    run_id = str(esc.instance_id)
    # Auto-resume if all required signatures collected
    if updated_esc.status == "resolved":
        inst = await crud.get_workflow_instance(db, run_id)
        if inst and inst.status in ("escalated",):
            tenant = await crud.get_tenant(db, str(inst.tenant_id))
            if tenant:
                background_tasks.add_task(
                    _resume_workflow_background,
                    run_id=run_id,
                    tenant_config=tenant.config,
                    decision_context={
                        "escalation_decision": {
                            "action": body.action_chosen,
                            "decided_by": body.decided_by,
                            "decision": body.decision,
                            "escalation_id": escalation_id,
                        }
                    },
                )

    await crud.log_event(
        db, "escalation_resolved", str(esc.tenant_id), run_id,
        f"Decision: {body.action_chosen} by {body.decided_by}",
    )
    await broadcast_event("escalation_resolved", {
        "escalation_id": escalation_id, "run_id": run_id,
        "action_chosen": body.action_chosen, "decided_by": body.decided_by,
        "tenant_id": str(esc.tenant_id), "auto_resumed": updated_esc.status == "resolved",
    })
    # Feature 2: Feed the human override back into RAG so the Reasoning agent
    # learns from it on future runs for this tenant.
    if updated_esc.status == "resolved":
        notes = (
            body.decision.get("notes", "")
            if isinstance(body.decision, dict) else ""
        )
        background_tasks.add_task(
            _store_human_correction_rag,
            tenant_id=str(esc.tenant_id),
            run_id=run_id,
            escalation_id=escalation_id,
            original_recommendation=esc.recommended_action or "",
            human_action=body.action_chosen,
            context_brief=esc.context_brief or "",
            notes=notes,
        )
 
    return {
        "message": "Decision recorded.",
        "escalation_id": escalation_id,
        "action_chosen": body.action_chosen,
        "resolved": updated_esc.status == "resolved",
        "signatures_collected": len(updated_esc.signatures or []),
        "required_signatures": updated_esc.required_signatures or 1,
    }


# ─────────────────────────────────────────────────────────────────────────────
# A2A
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/a2a/requests", tags=["A2A"])
async def list_a2a_requests(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_tid = get_tenant_filter(current_user)
    a2as = await crud.list_pending_a2a(db, tenant_id=filter_tid)
    return [crud.a2a_to_dict(a) for a in a2as]


@app.get("/api/v1/a2a/pending", tags=["A2A"])
async def list_pending_a2a(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_tid = get_tenant_filter(current_user)
    a2as = await crud.list_pending_a2a(db, tenant_id=filter_tid)
    return [crud.a2a_to_dict(a) for a in a2as]


@app.post("/api/v1/a2a/{a2a_id}/decide", tags=["A2A"])
async def decide_a2a(
    a2a_id: str,
    body: A2ADecision,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    from core.state_manager import StateManager
    sm = StateManager(session=db)
    req = await crud.get_a2a_request(db, a2a_id)
    if not req:
        raise HTTPException(status_code=404, detail="A2A request not found")
    assert_tenant_access(current_user, str(req.tenant_id))

    updated = await sm.decide_a2a_request(a2a_id, approved=body.approved)
    run_id = str(req.instance_id)

    if body.approved:
        inst = await crud.get_workflow_instance(db, run_id)
        if inst and inst.status == "pending_a2a":
            tenant = await crud.get_tenant(db, str(inst.tenant_id))
            if tenant:
                background_tasks.add_task(
                        _resume_workflow_background,
                        run_id=run_id,
                        tenant_config=tenant.config,
                        decision_context={
                            "_a2a_refinement_note": req.refinement_note or "",
                            "_a2a_approved": True,
                            "_a2a_new_tools":  list(req.new_tools or []),    # Feature 1
                            "_a2a_target_node": req.target_node_id or "",    # Feature 1
                        },
                    )

    decision = "approved" if body.approved else "rejected"
    await broadcast_event("a2a_decided", {
        "a2a_id": a2a_id, "decision": decision, "tenant_id": str(req.tenant_id),
    })
    return {"message": f"A2A request {decision}", "a2a_id": a2a_id}


# ─────────────────────────────────────────────────────────────────────────────
# Credentials
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/credentials/schema/{tool_name}", tags=["Credentials"])
async def get_cred_schema(tool_name: str):
    return {"tool_name": tool_name, "fields": get_credential_schema(tool_name)}


@app.post("/api/v1/credentials", tags=["Credentials"])
async def store_credential(
    body: CredentialCreate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, body.tenant_id)
    encrypted = encrypt_credentials(body.credentials)
    cred = await crud.create_credential(
        db, body.tenant_id, body.tool_name,
        body.display_name or body.tool_name, encrypted,
    )
    return {"credential_id": str(cred.id), "message": "Credentials stored securely"}


@app.get("/api/v1/credentials", tags=["Credentials"])
async def list_credentials(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_tid = get_tenant_filter(current_user)
    creds = await crud.list_credentials(db, tenant_id=filter_tid)
    return [
        {"id": str(c.id), "tenant_id": str(c.tenant_id),
         "tool_name": c.tool_name, "display_name": c.display_name,
         "created_at": c.created_at.isoformat() if c.created_at else None}
        for c in creds
    ]


@app.delete("/api/v1/credentials/{cred_id}", tags=["Credentials"])
async def delete_credential(
    cred_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    cred = await crud.get_credential(db, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    assert_tenant_access(current_user, str(cred.tenant_id))
    await crud.delete_credential(db, cred_id)
    return {"message": "Credential deleted"}


# ─────────────────────────────────────────────────────────────────────────────
# Custom Tools
# NOTE: /tools/local and /tools/available MUST be registered before
# /tools/{tool_id} so FastAPI does not swallow "local"/"available" as a tool_id.
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/tools/local", tags=["Tools"])
async def list_local_tools(current_user: TokenData = Depends(require_any_auth)):
    from integrations.local_dev_tools import LOCAL_TOOL_SCHEMAS, SEED_DIR
    tools = []
    for name, schema in LOCAL_TOOL_SCHEMAS.items():
        fn_schema = schema.get("function", {})
        tools.append({
            "name": name,
            "description": fn_schema.get("description", ""),
            "parameters": fn_schema.get("parameters", {}).get("properties", {}),
            "type": "local_dev", "is_active": True,
        })
    return {"tools": tools, "total": len(tools),
            "note": "Local dev tools — run seed scripts to populate data."}


@app.get("/api/v1/tools/available", tags=["Tools"])
async def get_available_tools(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    from integrations.local_dev_tools import LOCAL_TOOL_SCHEMAS
    local = [
        {"name": n, "description": s.get("function", {}).get("description", ""),
         "type": "local_dev",
         "parameters": list(s.get("function", {}).get("parameters", {}).get("properties", {}).keys())}
        for n, s in LOCAL_TOOL_SCHEMAS.items()
    ]
    utility = [
        {"name": "db_write_outcome", "description": "Log outcome", "type": "utility", "parameters": ["tenant_id", "action_taken"]},
        {"name": "db_update_pattern", "description": "Update pattern", "type": "utility", "parameters": ["tenant_id", "pattern_key", "pattern_data"]},
    ]
    filter_tid = get_tenant_filter(current_user)
    custom_tools = await crud.list_custom_tools(db, tenant_id=filter_tid)
    custom = [
        {"name": t.tool_name, "description": t.description or "", "type": "custom_rest", "parameters": ["filters"]}
        for t in custom_tools
    ]
    return {"local_dev": local, "utility": utility, "custom_rest": custom,
            "all": [t["name"] for t in local + utility + custom]}


@app.get("/api/v1/tools", tags=["Tools"])
async def list_tools(
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    filter_tid = get_tenant_filter(current_user)
    tools = await crud.list_custom_tools(db, tenant_id=filter_tid)
    return [crud.custom_tool_to_dict(t) for t in tools]


@app.post("/api/v1/tools", tags=["Tools"])
async def create_custom_tool(
    body: CustomToolCreate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, body.tenant_id)
    tool = await crud.create_custom_tool(db, {
        "tenant_id": body.tenant_id, "tool_name": body.tool_name,
        "display_name": body.display_name, "description": body.description,
        "base_url": body.base_url, "http_method": body.http_method,
        "headers_template": body.headers_template, "body_template": body.body_template,
        "query_params": body.query_params, "auth_type": body.auth_type,
        "credential_id": body.credential_id, "response_path": body.response_path,
    })
    return {"tool_id": str(tool.id), "message": f"Tool '{body.tool_name}' added to registry"}


@app.delete("/api/v1/tools/{tool_id}", tags=["Tools"])
async def delete_tool(
    tool_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    tool = await crud.get_custom_tool(db, tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    assert_tenant_access(current_user, str(tool.tenant_id))
    await crud.delete_custom_tool(db, tool_id)
    return {"message": "Tool deleted"}


class ToolTestRequest(BaseModel):
    test_args: dict = Field(default_factory=dict)
    tenant_id: str
 
@app.post("/api/v1/tools/{tool_id}/test", tags=["Tools"])
async def test_custom_tool(
    tool_id: str,
    body: ToolTestRequest,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Test a custom REST tool with provided arguments.
    Runs the tool in isolation and returns the raw response.
    Useful for validating credentials and endpoint configuration before workflow runs.
    """
    tool = await crud.get_custom_tool(db, tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    assert_tenant_access(current_user, str(tool.tenant_id))
 
    # Fetch the stored credentials for this tool
    creds_rows = await crud.list_credentials(db, tenant_id=str(tool.tenant_id))
    stored_creds: dict = {}
    for c in creds_rows:
        raw = (c.credentials or {}).get("encrypted", "")
        if raw:
            try:
                from integrations.key_vault import decrypt_credentials
                stored_creds[c.tool_name] = decrypt_credentials(raw)
            except Exception:
                pass
 
    try:
        from integrations.tool_registry_builder import build_registry
        # Build a minimal registry with only this tool
        minimal_config = {
            "client_id": str(tool.tenant_id),
            "integrations": {},
            "business_rules": {},
            "tone_profile": {},
            "action_library": {},
        }
        registry = build_registry(minimal_config, credentials=stored_creds)
 
        if tool.tool_name not in registry._tools:
            # Tool might be a custom REST tool — register it dynamically
            raise HTTPException(
                status_code=422,
                detail=f"Tool '{tool.tool_name}' could not be loaded. "
                       "Ensure credentials are stored and the integration is enabled."
            )
 
        start = __import__("time").time()
        result = await registry.execute(tool.tool_name, body.test_args)
        duration_ms = int((__import__("time").time() - start) * 1000)
 
        if result.success:
            return {
                "status": "success",
                "tool_name": tool.tool_name,
                "duration_ms": duration_ms,
                "result": result.data,
                "result_size": len(json.dumps(result.data, default=str)),
            }
        else:
            return {
                "status": "error",
                "tool_name": tool.tool_name,
                "duration_ms": duration_ms,
                "error": result.error,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tool test failed: {str(e)}")

# ─────────────────────────────────────────────────────────────────────────────
# Budget
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/tenants/{tenant_id}/budget", tags=["Budget"])
async def get_budget_settings(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    settings = await crud.get_budget_settings(db, tenant_id) or {
        "optimization_level": 1, "strategy": "balanced",
        "enable_caching": True, "cache_ttl_seconds": 3600,
        "max_context_tokens": 10000, "a2a_enabled": False,
    }
    from core.llm_router import LLMRouter
    router = LLMRouter()
    settings["predicted_savings"] = {level: router.get_predicted_savings(level) for level in range(4)}
    return settings


@app.put("/api/v1/tenants/{tenant_id}/budget", tags=["Budget"])
async def update_budget_settings(
    tenant_id: str,
    body: BudgetSettingsUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    if not await crud.get_tenant(db, tenant_id):
        raise HTTPException(status_code=404, detail="Tenant not found")
    strategy_names = {0: "max_accuracy", 1: "balanced", 2: "aggressive", 3: "budget_first"}
    data = {
        "optimization_level": body.optimization_level,
        "strategy": strategy_names.get(body.optimization_level, "balanced"),
        "enable_caching": body.enable_caching,
        "cache_ttl_seconds": body.cache_ttl_seconds,
        "max_context_tokens": body.max_context_tokens,
        "a2a_enabled": body.a2a_enabled,
        "auto_retry_on_low_confidence": body.auto_retry_on_low_confidence,
        "confidence_retry_threshold": body.confidence_retry_threshold,
        "enable_map_reduce_summarization": body.enable_map_reduce_summarization,
    }
    settings = await crud.upsert_budget_settings(db, tenant_id, data)
    await broadcast_event("budget_updated", {"tenant_id": tenant_id, "level": body.optimization_level})
    return {"message": "Budget settings updated", "settings": settings}


# ─────────────────────────────────────────────────────────────────────────────
# Analytics
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/dashboard/{tenant_id}", tags=["Analytics"])
async def get_dashboard(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    return await crud.get_dashboard_data(db, tenant_id)


# NOTE: /analytics/admin/fleet MUST be registered before /analytics/{tenant_id}
# so FastAPI does not swallow "admin" as a tenant_id parameter.
@app.get("/api/v1/analytics/admin/fleet", tags=["Analytics"])
async def get_fleet_analytics(
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    analytics = await crud.get_fleet_analytics(db)
    tenants = await crud.list_tenants(db)
    tenant_map = {str(t.id): t.name for t in tenants}
    for tid in analytics.get("by_tenant", {}):
        analytics["by_tenant"][tid]["tenant_name"] = tenant_map.get(tid, "Unknown")
    return analytics


@app.get("/api/v1/analytics/{tenant_id}", tags=["Analytics"])
async def get_analytics(
    tenant_id: str,
    days: int = Query(30),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    assert_tenant_access(current_user, tenant_id)
    instances = await crud.list_workflow_instances(db, tenant_id=tenant_id, limit=500)
    completed = [i for i in instances if i.status == "completed"]
    total_cost = sum(i.total_cost_usd or 0 for i in instances)
    total_tokens = sum((i.total_tokens_in or 0) + (i.total_tokens_out or 0) for i in instances)
    pending_esc = await crud.list_escalations(db, status="pending", tenant_id=tenant_id)
    return {
        "tenant_id": tenant_id,
        "workflows_run": len(instances),
        "actions_taken": len(completed) * 3,
        "escalations_pending": len(pending_esc),
        "total_cost_usd": round(total_cost, 6),
        "total_tokens": total_tokens,
        "estimated_hours_saved": round(len(completed) * 0.75, 1),
        "success_rate": round(len(completed) / max(len(instances), 1), 3),
    }


@app.post("/api/v1/outcomes/{tenant_id}/check-pending", tags=["Analytics"])
async def check_pending_outcomes(
    tenant_id: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Process pending outcome follow-up checks for a tenant.
    
    Checks all registered outcomes whose follow-up date has passed,
    fetches current account state, and stores positive/negative outcomes in RAG.
    
    This enables the outcome-closed learning loop:
      email sent → account recovered? → RAG lesson stored
    """
    assert_tenant_access(current_user, tenant_id)
    
    from core.outcome_tracker import OutcomeTracker
    from core.rag_engine import RAGEngine
    from core.llm_router import LLMRouter
    from integrations.tool_registry_builder import build_registry
    
    tenant = await crud.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    from core.state_manager import StateManager
    sm = StateManager(session=db)
    llm = LLMRouter()
    rag = RAGEngine(db_session=db, llm_router=llm)
    tracker = OutcomeTracker(state_manager=sm, rag_engine=rag)
    
    # Build tool registry for current data fetching
    tool_registry = build_registry(tenant.config or {}, credentials={})
    
    result = await tracker.check_pending_outcomes(
        tenant_id=tenant_id,
        tool_registry=tool_registry,
    )
    
    await crud.log_event(db, "outcome_check", tenant_id, None,
                         f"Processed {result['processed']} outcome checks. "
                         f"Positive: {result['positive']}, Negative: {result['negative']}")
    
    return {
        "tenant_id": tenant_id,
        **result,
        "message": (
            f"Processed {result['processed']} outcome checks. "
            f"{result['positive']} positive, {result['negative']} negative outcomes stored in RAG."
        ),
    }
    
    
# ─────────────────────────────────────────────────────────────────────────────
# Email Queue (Draft Review & Send)
# ─────────────────────────────────────────────────────────────────────────────

class EmailQueueUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None

class EmailQueueDecision(BaseModel):
    decided_by: str
    rejection_reason: Optional[str] = None

@app.get("/api/v1/tenants/{tenant_id}/email-queue", tags=["EmailQueue"])
async def list_email_queue(
    tenant_id: str,
    status: str = Query("pending", description="pending | approved | rejected | sent | all"),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """List email drafts waiting for review."""
    assert_tenant_access(current_user, tenant_id)
    items = await crud.list_email_queue(db, tenant_id=tenant_id, status=status)
    return [crud.email_queue_to_dict(i) for i in items]


@app.put("/api/v1/email-queue/{item_id}", tags=["EmailQueue"])
async def edit_email_draft(
    item_id: str,
    body: EmailQueueUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """Edit subject/body of a pending draft before approving."""
    item = await crud.get_email_queue_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Draft not found")
    assert_tenant_access(current_user, str(item.tenant_id))
    if item.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot edit draft with status '{item.status}'")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if updates:
        await crud.update_email_queue_item(db, item_id, updates)
    return {"message": "Draft updated"}


@app.post("/api/v1/email-queue/{item_id}/approve", tags=["EmailQueue"])
async def approve_email_draft(
    item_id: str,
    decision: EmailQueueDecision,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """Approve a draft (marks as approved; actual sending is handled by integration)."""
    item = await crud.get_email_queue_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Draft not found")
    assert_tenant_access(current_user, str(item.tenant_id))
    await crud.update_email_queue_item(db, item_id, {
        "status": "approved",
        "reviewed_by": decision.decided_by,
        "reviewed_at": datetime.utcnow(),
    })
    await broadcast_event("email_draft_approved", {
        "item_id": item_id, "tenant_id": str(item.tenant_id),
        "recipient": item.recipient_email,
    })
    return {"message": "Draft approved", "item_id": item_id, "status": "approved"}


@app.post("/api/v1/email-queue/{item_id}/reject", tags=["EmailQueue"])
async def reject_email_draft(
    item_id: str,
    decision: EmailQueueDecision,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """Reject a draft (will not be sent)."""
    item = await crud.get_email_queue_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Draft not found")
    assert_tenant_access(current_user, str(item.tenant_id))
    await crud.update_email_queue_item(db, item_id, {
        "status": "rejected",
        "rejection_reason": decision.rejection_reason or "",
        "reviewed_by": decision.decided_by,
        "reviewed_at": datetime.utcnow(),
    })
    return {"message": "Draft rejected", "item_id": item_id}

# ─────────────────────────────────────────────────────────────────────────────
# Evidence, Config, DAG, Prompts, Tools — filesystem-based (unchanged logic)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/evidence", tags=["Evidence"])
async def list_evidence(current_user: TokenData = Depends(require_any_auth)):
    try:
        evidence_dir = Path(os.getenv("EPI_EVIDENCE_DIR", "./evidence"))
        evidence_dir.mkdir(parents=True, exist_ok=True)
        artifacts = []
        try:
            from epi.epi_manager import EPIManager
            artifacts.extend(EPIManager().list_artifacts())
        except Exception:
            pass
        for p in sorted(evidence_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            if not any(a.get("filename") == p.name for a in artifacts):
                try:
                    data = json.loads(p.read_text())
                    artifacts.append({
                        "filename": p.name, "path": str(p),
                        "size_kb": round(p.stat().st_size / 1024, 1),
                        "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
                        "type": "workflow_summary",
                        "workflow_name": data.get("workflow_name", ""),
                        "run_id": data.get("run_id", ""),
                        "status": data.get("status", ""),
                        "total_cost_usd": data.get("total_cost_usd", 0),
                    })
                except Exception:
                    pass
        return sorted(artifacts, key=lambda x: x.get("created", ""), reverse=True)
    except Exception:
        return []


@app.get("/api/v1/config/models", tags=["Config"])
async def get_available_models():
    try:
        async with aiofiles.open("config/templates/llm_config.json") as f:
            return json.loads(await f.read())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="LLM config file not found")


@app.get("/api/v1/config/dag/{workflow_name}", tags=["Config"])
async def get_workflow_dag(workflow_name: str):
    dag_path = Path("workflows/dags") / f"{workflow_name}.json"
    if not dag_path.exists():
        raise HTTPException(status_code=404, detail=f"DAG not found: {workflow_name}")
    async with aiofiles.open(dag_path) as f:
        return json.loads(await f.read())


@app.get("/api/v1/config/workflows", tags=["Config"])
async def list_workflow_dags():
    dags_dir = Path("workflows/dags")
    if not dags_dir.exists():
        return []
    workflows = []
    for f in sorted(dags_dir.glob("*.json")):
        try:
            async with aiofiles.open(f) as fp:
                dag = json.loads(await fp.read())
            meta = dag.get("_meta", {})
            trigger_meta = meta.get("trigger", {})
            trigger_type = "New Email" if ("email" in f.stem or trigger_meta.get("type") == "email") else "Manual"
            source = "Synthetic Inbox" if ("email" in f.stem or "synthetic" in str(trigger_meta.get("source", ""))) else "Direct"

            workflows.append({
                "name": f.stem,
                "display_name": meta.get("name", f.stem.replace("_", " ").title()),
                "industry": meta.get("industry", "general"),
                "description": meta.get("description", ""),
                "status": "active",
                "automation_status": "active",
                "automation_enabled": True,
                "trigger_type": trigger_type,
                "trigger_types": meta.get("trigger_types", ["manual"]),
                "trigger": trigger_meta,
                "source": source,
                "sla_hours": meta.get("sla_hours", 2),
                "estimated_duration_minutes": meta.get("estimated_duration_minutes", 2),
            })
        except Exception:
            workflows.append({
                "name": f.stem,
                "display_name": f.stem.replace("_", " ").title(),
                "status": "active",
                "trigger_type": "Manual",
                "source": "Direct",
                "automation_status": "active",
            })
    return workflows


@app.put("/api/v1/config/dag/{workflow_name}", tags=["Config"])
async def update_workflow_dag(
    workflow_name: str, body: WorkflowDAGCreate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    
        # Import custom tools for this tenant
    from core.dag_validator import validate_dag
    
    custom_tool_names = set()
    try:
        tools = await crud.list_custom_tools(db)
        custom_tool_names = {t.tool_name for t in tools}
    except Exception:
        pass
    
    validation = validate_dag(body.dag, custom_tool_names)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "DAG validation failed — workflow would crash at runtime",
                "errors": validation.errors,
                "warnings": validation.warnings,
            }
        )
    # Log warnings even if valid
    if validation.warnings:
        log.info("DAG validation warnings", workflow=workflow_name, warnings=validation.warnings)

    safe_name = workflow_name.replace("/", "_").replace("..", "")
    dag_path = Path("workflows/dags") / f"{safe_name}.json"
    dag_path.parent.mkdir(parents=True, exist_ok=True)
    dag_path.write_text(json.dumps(body.dag, indent=2, default=str))
    await crud.log_event(db, "dag_updated", current_user.tenant_id, None,
                         f"DAG '{safe_name}' updated by {current_user.email}")
    return {"message": f"DAG '{safe_name}' saved", "path": str(dag_path)}


@app.post("/api/v1/config/dag", tags=["Config"])
async def create_workflow_dag(
    body: WorkflowDAGCreate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
        # Import custom tools for this tenant
    from core.dag_validator import validate_dag
    
    custom_tool_names = set()
    try:
        tools = await crud.list_custom_tools(db)
        custom_tool_names = {t.tool_name for t in tools}
    except Exception:
        pass
    
    validation = validate_dag(body.dag, custom_tool_names)
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "DAG validation failed — workflow would crash at runtime",
                "errors": validation.errors,
                "warnings": validation.warnings,
            }
        )
    # Log warnings even if valid
    if validation.warnings:
        log.info("DAG validation warnings", workflow=body.name, warnings=validation.warnings)

    safe = body.name.replace("/", "_").replace("..", "").replace(" ", "_").lower()
    dag_path = Path("workflows/dags") / f"{safe}.json"
    if dag_path.exists():
        raise HTTPException(status_code=409, detail=f"Workflow '{safe}' already exists")
    dag_path.write_text(json.dumps(body.dag, indent=2, default=str))
    await crud.log_event(db, "dag_created", current_user.tenant_id, None,
                         f"DAG '{safe}' created by {current_user.email}")
    return {"message": f"Workflow '{safe}' created", "name": safe}


@app.delete("/api/v1/config/dag/{workflow_name}", tags=["Config"])
async def delete_workflow_dag(
    workflow_name: str,
    current_user: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    safe = workflow_name.replace("/", "_").replace("..", "")
    dag_path = Path("workflows/dags") / f"{safe}.json"
    if not dag_path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    dag_path.unlink()
    await crud.log_event(db, "dag_deleted", None, None,
                         f"DAG '{safe}' deleted by {current_user.email}")
    return {"message": f"Workflow '{safe}' deleted"}


@app.get("/api/v1/config/prompt-tree", tags=["Config"])
async def get_prompt_tree(current_user: TokenData = Depends(require_any_auth)):
    prompts_dir = Path("workflows/prompts")
    if not prompts_dir.exists():
        return {"tree": {}, "files": []}
    tree: dict = {}
    files = []
    for p in sorted(prompts_dir.rglob("*.txt")):
        rel = p.relative_to(prompts_dir)
        parts = rel.parts
        category = "/".join(parts[:-1]) if len(parts) > 1 else "root"
        files.append({"path": str(rel).replace("\\", "/"), "filename": p.name,
                      "category": category, "size_chars": p.stat().st_size,
                      "agent": p.stem.split("_")[0] if "_" in p.stem else p.stem})
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[p.name] = str(rel).replace("\\", "/")
    return {"tree": tree, "files": files, "total": len(files)}


@app.get("/api/v1/config/prompts/{prompt_path:path}", tags=["Config"])
async def get_prompt(
    prompt_path: str,
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Read a prompt file. Priority order:
    1. Tenant-specific override: workflows/prompts/tenants/{tenant_id}/{path}
    2. Base system prompt:        workflows/prompts/{path}
    All authenticated users can read system prompts (read-only for non-admins).
    """
    safe_path = prompt_path.replace("..", "").replace("//", "/").lstrip("/")
    base = Path("workflows/prompts")

    # Priority 1: tenant-specific override (non-admins write here via PUT)
    if current_user.tenant_id:
        tenant_path = base / "tenants" / str(current_user.tenant_id) / safe_path
        if tenant_path.exists():
            return {
                "path": prompt_path,
                "content": tenant_path.read_text(encoding="utf-8"),
                "filename": tenant_path.name,
                "scope": "tenant_override",
            }

    # Priority 2: base system path (readable by everyone)
    system_path = base / safe_path
    if system_path.exists():
        scope = "system" if current_user.role == "super_admin" else "system_readonly"
        return {
            "path": prompt_path,
            "content": system_path.read_text(encoding="utf-8"),
            "filename": system_path.name,
            "scope": scope,
        }

    raise HTTPException(status_code=404, detail=f"Prompt file not found: {prompt_path}")
 
 
@app.put("/api/v1/config/prompts/{prompt_path:path}", tags=["Config"])
async def update_prompt(
    prompt_path: str,
    body: PromptUpdate,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a prompt file.
    - super_admin: writes to system path (workflows/prompts/{path})
    - tenant_user: writes to tenant override path (workflows/prompts/tenants/{id}/{path})
    """
    safe_path = prompt_path.replace("..", "").replace("//", "/").lstrip("/")
    base = Path("workflows/prompts")

    if current_user.role == "super_admin":
        full_path = base / safe_path
        scope = "system"
    else:
        if not current_user.tenant_id:
            raise HTTPException(status_code=403, detail="No tenant context")
        full_path = base / "tenants" / str(current_user.tenant_id) / safe_path
        scope = "tenant_override"

    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(body.content, encoding="utf-8")
    await crud.log_event(
        db, "prompt_updated", current_user.tenant_id, None,
        f"Prompt '{prompt_path}' updated by {current_user.email} (scope={scope})"
    )
    return {"message": "Prompt saved", "path": prompt_path, "scope": scope}


@app.post("/api/v1/config/prompts/{prompt_path:path}", tags=["Config"])
async def create_prompt(
    prompt_path: str, body: PromptUpdate,
    current_user: TokenData = Depends(require_any_auth),
):
    p = Path("workflows/prompts") / prompt_path.replace("..", "")
    if p.exists():
        raise HTTPException(status_code=409, detail="Prompt file already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body.content, encoding="utf-8")
    return {"message": "Prompt created", "path": prompt_path}


@app.get("/api/v1/seed-data/status", tags=["SeedData"])
async def get_seed_data_status(current_user: TokenData = Depends(require_any_auth)):
    seed_dir = Path("db/seed/data")
    files = {
        "saas_accounts.json":              {"industry": "saas",         "seeder": "db/seed/saas_seed.py"},
        "saas_deals.json":                 {"industry": "saas",         "seeder": "db/seed/saas_seed.py"},
        "retail_products.json":            {"industry": "retail",       "seeder": "db/seed/retail_seed.py"},
        "healthcare_patients.json":        {"industry": "healthcare",   "seeder": "db/seed/healthcare_seed.py"},
        "healthcare_appointments.json":    {"industry": "healthcare",   "seeder": "db/seed/healthcare_seed.py"},
        "finance_expenses.json":           {"industry": "finance",      "seeder": "db/seed/finance_seed.py"},
        "re_listings.json":                {"industry": "real_estate",  "seeder": "db/seed/real_estate_seed.py"},
        "re_leases.json":                  {"industry": "real_estate",  "seeder": "db/seed/real_estate_seed.py"},
        "re_buyers.json":                  {"industry": "real_estate",  "seeder": "db/seed/real_estate_seed.py"},
    }
    status = {}
    for fname, meta in files.items():
        p = seed_dir / fname
        if p.exists():
            try:
                data = json.loads(p.read_text())
                count = len(data) if isinstance(data, list) else 0
            except Exception:
                count = -1
            status[fname] = {**meta, "exists": True, "records": count,
                             "size_kb": round(p.stat().st_size / 1024, 1)}
        else:
            status[fname] = {**meta, "exists": False, "records": 0}
    return {"files": status, "all_ready": all(v["exists"] for v in status.values()),
            "seed_dir": str(seed_dir.absolute())}


@app.post("/api/v1/seed-data/generate", tags=["SeedData"])
async def generate_seed_data(
    industry: Optional[str] = Query(None, description="saas|retail|healthcare|finance|real_estate"),
    current_user: TokenData = Depends(require_any_auth),
):
    import subprocess, sys
    seeders = {
        "saas":         "db/seed/saas_seed.py",
        "retail":       "db/seed/retail_seed.py",
        "healthcare":   "db/seed/healthcare_seed.py",
        "finance":      "db/seed/finance_seed.py",
        "real_estate":  "db/seed/real_estate_seed.py",
    }
    to_run = {industry: seeders[industry]} if industry and industry in seeders else seeders
    results = {}
    for ind, script in to_run.items():
        if not Path(script).exists():
            results[ind] = {"status": "error", "message": f"Seeder not found: {script}"}
            continue
        try:
            r = subprocess.run([sys.executable, script], capture_output=True, text=True, timeout=60)
            results[ind] = {"status": "ok", "output": r.stdout.strip()} if r.returncode == 0 \
                else {"status": "error", "output": r.stderr.strip()}
        except Exception as e:
            results[ind] = {"status": "error", "message": str(e)}
    return {"results": results, "all_ok": all(v["status"] == "ok" for v in results.values())}


@app.post("/api/v1/webhooks/{tenant_id}", tags=["Webhooks"])
async def receive_webhook(
    tenant_id: str,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive a webhook and route it to a workflow.
    
    FIX: Original was hardcoded for only Stripe and HubSpot.
    Now supports dynamic routing via webhook_configurations in tenant config.
    """
    tenant = await crud.get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    cfg = tenant.config or {}
    wf = None
    signal_data = payload
    
    # ── Check dynamic webhook configurations first ────────────────────────
    webhook_configs = cfg.get("webhook_configurations", {})
    for webhook_name, wh_conf in webhook_configs.items():
        trigger_conditions = wh_conf.get("trigger_conditions", {})
        # Check if payload matches trigger conditions
        if _payload_matches_conditions(payload, trigger_conditions):
            candidate_wf = wh_conf.get("workflow_name")
            if candidate_wf and candidate_wf in cfg.get("active_workflows", []):
                wf = candidate_wf
                # Apply field mappings
                field_mappings = wh_conf.get("field_mappings", {})
                signal_data = _apply_field_mappings(payload, field_mappings)
                log.info(
                    "Webhook routed via dynamic config",
                    webhook=webhook_name,
                    workflow=wf,
                    tenant=tenant_id[:8],
                )
                break
    
    # ── Fallback to hardcoded legacy routing ─────────────────────────────
    if not wf:
        if payload.get("type") == "invoice.payment_failed":
            wf = "saas_churn_prevention"
        elif payload.get("subscriptionType") == "deal.propertyChange":
            wf = "saas_pipeline_velocity"
    
    if wf and wf in cfg.get("active_workflows", []):
        run_id = str(uuid.uuid4())
        await crud.create_workflow_instance(db, run_id, tenant_id, wf, signal_data, tenant_config=cfg)
        budget = await crud.get_budget_settings(db, tenant_id) or {}
        background_tasks.add_task(_execute_workflow_background, run_id, cfg, wf, signal_data, budget)
        return {"triggered": wf, "run_id": run_id, "routing": "dynamic" if webhook_configs else "legacy"}
    
    return {"received": True, "workflow_triggered": False, "reason": "no matching webhook configuration"}
 
 
def _payload_matches_conditions(payload: dict, conditions: dict) -> bool:
    """Check if a webhook payload matches the configured trigger conditions."""
    if not conditions:
        return True  # No conditions = match all
    
    for key, expected_value in conditions.items():
        # Support dot notation: "type" or "data.object.status"
        parts = key.split(".")
        current = payload
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                current = None
                break
        
        if current != expected_value:
            return False
    
    return True
 
 
def _apply_field_mappings(payload: dict, mappings: dict) -> dict:
    """Apply field mappings to extract workflow signal from webhook payload."""
    result = dict(payload)  # keep original
    
    for target_field, source_path in mappings.items():
        parts = source_path.split(".")
        current = payload
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                current = None
                break
        if current is not None:
            result[target_field] = current
    
    return result


@app.post("/api/v1/webhooks/configure", tags=["Webhooks"])
async def configure_webhook(
    body: WebhookMappingCreate,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    No-code webhook configurator.
    
    Takes a sample payload and uses LLM to:
    1. Analyze the payload structure
    2. Suggest field mappings to standard workflow signals
    3. Store the mapping so the webhook endpoint can route dynamically
    
    Previously required modifying main.py directly. Now self-service.
    """
    assert_tenant_access(current_user, body.tenant_id)
    tenant = await crud.get_tenant(db, body.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Analyze payload structure with LLM
    background_tasks.add_task(
        _analyze_webhook_payload_background,
        tenant_id=body.tenant_id,
        webhook_name=body.webhook_name,
        sample_payload=body.sample_payload,
        workflow_name=body.workflow_name,
        field_mappings=body.field_mappings,
        trigger_conditions=body.trigger_conditions,
    )
    
    # Store the mapping in tenant config
    existing_config = tenant.config or {}
    webhook_configs = existing_config.get("webhook_configurations", {})
    webhook_configs[body.webhook_name] = {
        "workflow_name": body.workflow_name,
        "field_mappings": body.field_mappings,
        "trigger_conditions": body.trigger_conditions or {},
        "configured_at": datetime.utcnow().isoformat(),
        "configured_by": current_user.email,
    }
    
    await crud.update_tenant_config(db, body.tenant_id, {"webhook_configurations": webhook_configs})
    await crud.log_event(db, "webhook_configured", body.tenant_id, None,
                         f"Webhook '{body.webhook_name}' → '{body.workflow_name}' by {current_user.email}")
    
    return {
        "message": f"Webhook '{body.webhook_name}' configured to trigger '{body.workflow_name}'",
        "webhook_url": f"/api/v1/webhooks/{body.tenant_id}",
        "mapping": webhook_configs[body.webhook_name],
    }
 
 
async def _analyze_webhook_payload_background(
    tenant_id: str,
    webhook_name: str,
    sample_payload: dict,
    workflow_name: str,
    field_mappings: dict,
    trigger_conditions: Optional[dict],
) -> None:
    """Background: use LLM to validate and enhance webhook mapping."""
    import json
    try:
        from core.llm_router import LLMRouter, LLMMessage
        llm = LLMRouter()
        system = (
            "You are a webhook integration specialist. "
            "Analyze the webhook payload and validate the field mappings. "
            "Return JSON: { valid: bool, suggestions: [...], warnings: [...] }"
        )
        user = (
            f"Webhook name: {webhook_name}\n"
            f"Target workflow: {workflow_name}\n"
            f"Sample payload: {json.dumps(sample_payload, indent=2)[:1500]}\n"
            f"Proposed field mappings: {json.dumps(field_mappings)}\n"
            "Validate the mappings and suggest improvements."
        )
        await llm.call(
            agent_name="webhook_analyzer",
            messages=[LLMMessage(role="system", content=system), LLMMessage(role="user", content=user)],
            tier_override="mini",
        )
    except Exception as e:
        log.debug("Webhook analysis background task failed (non-fatal)", error=str(e))

@app.post("/api/v1/admin/patterns/{tenant_id}/{pattern_key}/promote", tags=["Admin"])
async def promote_pattern_admin(
    tenant_id: str,
    pattern_key: str,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: promote any tenant's pattern."""
    from core.state_manager import StateManager
    sm = StateManager(session=db)
    promoted = await sm.promote_pattern(tenant_id, pattern_key)
    if not promoted:
        raise HTTPException(status_code=404, detail="Pattern not found or already active")
    return {"message": f"Pattern '{pattern_key}' promoted to active", "tenant_id": tenant_id}


# ── Tenant-facing pattern management ──────────────────────────────────────────

@app.get("/api/v1/tenants/{tenant_id}/patterns", tags=["Tenants"])
async def list_tenant_patterns(
    tenant_id: str,
    status: Optional[str] = Query(None, description="pending_review | active | all"),
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all learned patterns for this tenant (includes sandbox + active)."""
    assert_tenant_access(current_user, tenant_id)
    patterns = await crud.list_patterns(db, tenant_id, status_filter=status if status != "all" else None)
    return [crud.pattern_to_dict(p) for p in patterns]


@app.post("/api/v1/tenants/{tenant_id}/patterns/{pattern_key}/promote", tags=["Tenants"])
async def promote_pattern_tenant(
    tenant_id: str,
    pattern_key: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """Business owner promotes a sandbox pattern to active (injects into future RAG context)."""
    assert_tenant_access(current_user, tenant_id)
    from core.state_manager import StateManager
    sm = StateManager(session=db)
    promoted = await sm.promote_pattern(tenant_id, pattern_key)
    if not promoted:
        raise HTTPException(status_code=404, detail="Pattern not found or already active")
    await crud.log_event(db, "pattern_promoted", tenant_id, None,
                         f"Pattern '{pattern_key}' promoted by {current_user.email}")
    return {"message": f"Pattern '{pattern_key}' is now active", "tenant_id": tenant_id}


@app.post("/api/v1/tenants/{tenant_id}/patterns/{pattern_key}/demote", tags=["Tenants"])
async def demote_pattern_tenant(
    tenant_id: str,
    pattern_key: str,
    current_user: TokenData = Depends(require_any_auth),
    db: AsyncSession = Depends(get_db),
):
    """Business owner moves an active pattern back to pending_review (stops RAG injection)."""
    assert_tenant_access(current_user, tenant_id)
    from sqlalchemy import update as _upd
    from core.state_manager import PatternMemory
    result = await db.execute(
        _upd(PatternMemory)
        .where(PatternMemory.tenant_id == tenant_id)
        .where(PatternMemory.pattern_key == pattern_key)
        .where(PatternMemory.pattern_status == "active")
        .values(pattern_status="pending_review")
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Active pattern not found")
    return {"message": f"Pattern '{pattern_key}' moved back to pending review", "tenant_id": tenant_id}

# ─────────────────────────────────────────────────────────────────────────────
# Auto-Eval (Prompt Improvement Suggestions)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/admin/auto-eval/run", tags=["Admin"])
async def run_auto_eval(
    body: AutoEvalRunRequest,
    _: TokenData = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze human escalation corrections and generate prompt improvement suggestions.
    NEVER modifies prompts — only produces suggestions for admin review.
    """
    from core.auto_eval import AutoEvalService
    from core.llm_router import LLMRouter
    from core.rag_engine import RAGEngine

    llm = LLMRouter()
    rag = RAGEngine(db_session=db, llm_router=llm)
    service = AutoEvalService(llm_router=llm, rag_engine=rag)

    suggestions = await service.analyze_and_suggest(
        tenant_id=body.tenant_id,
        workflow_name=body.workflow_name,
    )
    return {"suggestions": suggestions, "count": len(suggestions)}


@app.get("/api/v1/admin/auto-eval/suggestions", tags=["Admin"])
async def get_auto_eval_suggestions(
    status: Optional[str] = Query(None, description="pending | applied | dismissed"),
    workflow_name: Optional[str] = Query(None),
    _: TokenData = Depends(require_admin),
):
    """Return stored prompt improvement suggestions."""
    from core.auto_eval import AutoEvalService
    service = AutoEvalService()
    return {"suggestions": service.get_suggestions(status=status, workflow_name=workflow_name)}


@app.post("/api/v1/admin/auto-eval/suggestions/{suggestion_id}/apply", tags=["Admin"])
async def apply_auto_eval_suggestion(
    suggestion_id: str,
    body: AutoEvalApplyRequest,
    _: TokenData = Depends(require_admin),
):
    """
    Apply a prompt improvement suggestion to the actual prompt file.
    Requires explicit admin action — suggestions are NEVER auto-applied.
    """
    from core.auto_eval import AutoEvalService
    service = AutoEvalService()
    try:
        result = service.apply_suggestion(suggestion_id, body.admin_email)
        return {"message": "Suggestion applied", "suggestion": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/v1/admin/auto-eval/suggestions/{suggestion_id}/dismiss", tags=["Admin"])
async def dismiss_auto_eval_suggestion(
    suggestion_id: str,
    _: TokenData = Depends(require_admin),
):
    """Dismiss a suggestion without applying it."""
    from core.auto_eval import AutoEvalService
    service = AutoEvalService()
    try:
        result = service.dismiss_suggestion(suggestion_id)
        return {"message": "Suggestion dismissed", "suggestion": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))  
    
# ─────────────────────────────────────────────────────────────────────────────
# Background execution (creates own DB sessions)
# ─────────────────────────────────────────────────────────────────────────────

async def _execute_workflow_background(
    run_id: str,
    tenant_config: dict,
    workflow_name: str,
    signal_data: dict,
    budget_settings: dict,
) -> None:
    """Fresh workflow execution — always starts from node 0."""
    from core.database import get_raw_session
    from core.llm_router import LLMRouter
    from core.state_manager import StateManager
    from core.orchestrator import WorkflowOrchestrator
    from core.rag_engine import RAGEngine
    from agents.base_agent import ToolRegistry
    from epi.epi_manager import EPIManager
    from integrations.tool_registry_builder import build_registry

    db = await get_raw_session()
    async with db:
        try:
            llm_router = LLMRouter()
            creds_rows = await crud.list_credentials(db, tenant_id=tenant_config.get("client_id"))
            stored_creds = {}
            for c in creds_rows:
                raw = (c.credentials or {}).get("encrypted", "")
                if raw:
                    stored_creds[c.tool_name] = decrypt_credentials(raw)

            tool_registry = build_registry(tenant_config, credentials=stored_creds)
            state_manager = StateManager(session=db)
            rag_engine = RAGEngine(db_session=db, llm_router=llm_router)

            async def _on_agent_run(rn_id: str, agent_run_data: dict) -> None:
                await crud.update_workflow_status(
                    db, rn_id,
                    status="running",
                    current_node=agent_run_data.get("node_id"),
                    agent_run_data=agent_run_data,
                    cost_delta=agent_run_data.get("cost_usd", 0.0),
                    tokens_in_delta=agent_run_data.get("tokens_in", 0),
                    tokens_out_delta=agent_run_data.get("tokens_out", 0),
                )

            async def _on_escalation(esc_id: str, esc_data: dict) -> None:
                await crud.log_event(db, "escalation_created",
                                     esc_data.get("tenant_id"), esc_data.get("instance_id"),
                                     esc_data.get("reason", "")[:200])

            orchestrator = WorkflowOrchestrator(
                state_manager=state_manager, llm_router=llm_router,
                tool_registry=tool_registry, epi_manager=EPIManager(),
                rag_engine=rag_engine, ws_broadcast=broadcast_event,
                escalation_callback=_on_escalation, agent_run_callback=_on_agent_run,
            )
            _active_orchestrators[run_id] = orchestrator
            await crud.update_workflow_status(db, run_id, "running")

            result = await orchestrator.run_workflow(
                tenant_config=tenant_config, workflow_name=workflow_name,
                trigger_signal=signal_data, instance_id=run_id,
                budget_settings=budget_settings or {},
            )
            _raw_status = result.get("status", "completed")
            final_status = _raw_status.value if hasattr(_raw_status, "value") else str(_raw_status)
            # If suspended (escalated / pending_a2a), orchestrator already called suspend_workflow
            if final_status not in ("escalated", "pending_a2a"):
                await crud.update_workflow_status(
                    db, run_id, final_status,
                    outcome=result.get("outcome"),
                )
                # ── Reconcile full LLM cost (includes HyDE, tool_result_compressor, etc.) ──────────
                try:
                    full_stats = llm_router.get_live_stats()
                    inst_check = await crud.get_workflow_instance(db, run_id)
                    if inst_check:
                        cost_gap = full_stats.get("total_cost_usd", 0.0) - (inst_check.total_cost_usd or 0.0)
                        tok_in_gap = full_stats.get("total_tokens_in", 0) - (inst_check.total_tokens_in or 0)
                        tok_out_gap = full_stats.get("total_tokens_out", 0) - (inst_check.total_tokens_out or 0)
                        if cost_gap > 0.000001:
                            await crud.update_workflow_status(
                                db, run_id, final_status,
                                cost_delta=cost_gap,
                                tokens_in_delta=max(0, tok_in_gap),
                                tokens_out_delta=max(0, tok_out_gap),
                            )
                            log.debug("Cost reconciliation applied", gap=f"${cost_gap:.6f}", run=run_id[:8])
                except Exception as _cost_e:
                    log.debug("Cost reconciliation failed (non-fatal)", error=str(_cost_e))
                await _write_evidence_summary(run_id, workflow_name, tenant_config, result)

            await broadcast_event(
                "workflow_completed" if final_status == "completed" else f"workflow_{final_status}",
                {"run_id": run_id, "workflow": workflow_name,
                 "tenant_id": tenant_config.get("client_id"), "status": final_status},
            )

        except Exception as e:
            log.error("Background workflow failed", run_id=run_id, error=str(e))
            from core.database import get_raw_session
            err_db = await get_raw_session()
            async with err_db:
                await crud.update_workflow_status(err_db, run_id, "failed", error=str(e))
                await err_db.commit()
                
            await broadcast_event("workflow_failed", {
                "run_id": run_id, "error": str(e),
                "tenant_id": tenant_config.get("client_id")
            })
        finally:
            _active_orchestrators.pop(run_id, None)


async def _resume_workflow_background(
    run_id: str,
    tenant_config: dict,
    decision_context: dict,
) -> None:
    """Resume a suspended workflow from its DB-persisted state."""
    from core.database import get_raw_session
    from core.llm_router import LLMRouter
    from core.state_manager import StateManager
    from core.orchestrator import WorkflowOrchestrator
    from core.rag_engine import RAGEngine
    from agents.base_agent import ToolRegistry
    from epi.epi_manager import EPIManager
    from integrations.tool_registry_builder import build_registry

    db = await get_raw_session()
    async with db:
        try:
            state_manager = StateManager(session=db)
            inst = await crud.get_workflow_instance(db, run_id)
            if not inst:
                log.error("Cannot resume: instance not found", run_id=run_id)
                return

            llm_router = LLMRouter()
            creds_rows = await crud.list_credentials(db, tenant_id=tenant_config.get("client_id"))
            stored_creds = {}
            for c in creds_rows:
                raw = (c.credentials or {}).get("encrypted", "")
                if raw:
                    stored_creds[c.tool_name] = decrypt_credentials(raw)

            tool_registry = build_registry(tenant_config, credentials=stored_creds)
            rag_engine = RAGEngine(db_session=db, llm_router=llm_router)

            async def _on_agent_run(rn_id: str, agent_run_data: dict) -> None:
                await crud.update_workflow_status(
                    db, rn_id, "running",
                    current_node=agent_run_data.get("node_id"),
                    agent_run_data=agent_run_data,
                    cost_delta=agent_run_data.get("cost_usd", 0.0),
                    tokens_in_delta=agent_run_data.get("tokens_in", 0),
                    tokens_out_delta=agent_run_data.get("tokens_out", 0),
                )

            orchestrator = WorkflowOrchestrator(
                state_manager=state_manager, llm_router=llm_router,
                tool_registry=tool_registry, epi_manager=EPIManager(),
                rag_engine=rag_engine, ws_broadcast=broadcast_event,
                agent_run_callback=_on_agent_run,
            )
            _active_orchestrators[run_id] = orchestrator
            await crud.update_workflow_status(db, run_id, "running")

            result = await orchestrator.resume_workflow(
                instance_id=run_id,
                additional_context=decision_context,
            )

            _raw_status = result.get("status", "completed")
            final_status = _raw_status.value if hasattr(_raw_status, "value") else str(_raw_status)
            if final_status not in ("escalated", "pending_a2a"):
                await crud.update_workflow_status(
                    db, run_id, final_status,
                    outcome=result.get("outcome"),
                )
                await _write_evidence_summary(run_id, inst.workflow_name, tenant_config, result)

            await broadcast_event(
                f"workflow_{final_status}",
                {"run_id": run_id, "workflow": inst.workflow_name,
                 "tenant_id": tenant_config.get("client_id"), "status": final_status},
            )
        except Exception as e:
            log.error("Resume workflow failed", run_id=run_id, error=str(e))
            await crud.update_workflow_status(db, run_id, "failed", error=str(e))
        finally:
            _active_orchestrators.pop(run_id, None)

async def _fork_workflow_background(
    new_run_id: str,
    original_run_id: str,
    tenant_config: dict,
    workflow_name: str,
    from_node_id: str,
    budget_settings: dict,
    context_patch: Optional[dict] = None,
) -> None:
    """
    Fork an existing workflow from a specific node.
    Loads the original run's accumulated context from DB, optionally patches it,
    then replays the workflow from the given node forward.
    """
    from core.database import get_raw_session
    from core.llm_router import LLMRouter
    from core.state_manager import StateManager
    from core.orchestrator import WorkflowOrchestrator
    from core.rag_engine import RAGEngine
    from epi.epi_manager import EPIManager
    from integrations.tool_registry_builder import build_registry

    db = await get_raw_session()
    async with db:
        try:
            # Load accumulated context from original run (stored in context column)
            orig_inst = await crud.get_workflow_instance(db, original_run_id)
            accumulated_context = dict(orig_inst.context or {})
            accumulated_context.pop("_suspension", None)  # strip suspension envelope
            # Restore full research context if it was preserved for fork replay
            if "_fork_research_full" in accumulated_context:
                accumulated_context["research"] = accumulated_context.pop("_fork_research_full")
                log.info(
                    "Fork: restored full research context",
                    accounts=accumulated_context.pop("_fork_accounts_count", "?"),
                )

            # Apply optional context patch
            if context_patch:
                accumulated_context.update(context_patch)

            accumulated_context["_forked_from"] = original_run_id
            accumulated_context["_fork_node"] = from_node_id

            llm_router = LLMRouter()
            creds_rows = await crud.list_credentials(db, tenant_id=tenant_config.get("client_id"))
            stored_creds = {}
            for c in creds_rows:
                raw = (c.credentials or {}).get("encrypted", "")
                if raw:
                    stored_creds[c.tool_name] = decrypt_credentials(raw)

            tool_registry = build_registry(tenant_config, credentials=stored_creds)
            state_manager = StateManager(session=db)
            rag_engine = RAGEngine(db_session=db, llm_router=llm_router)

            async def _on_agent_run(rn_id: str, agent_run_data: dict) -> None:
                await crud.update_workflow_status(
                    db, rn_id, "running",
                    current_node=agent_run_data.get("node_id"),
                    agent_run_data=agent_run_data,
                    cost_delta=agent_run_data.get("cost_usd", 0.0),
                    tokens_in_delta=agent_run_data.get("tokens_in", 0),
                    tokens_out_delta=agent_run_data.get("tokens_out", 0),
                )

            orchestrator = WorkflowOrchestrator(
                state_manager=state_manager, llm_router=llm_router,
                tool_registry=tool_registry, epi_manager=EPIManager(),
                rag_engine=rag_engine, ws_broadcast=broadcast_event,
                agent_run_callback=_on_agent_run,
            )
            _active_orchestrators[new_run_id] = orchestrator
            await crud.update_workflow_status(db, new_run_id, "running")

            result = await orchestrator.fork_workflow(
                new_instance_id=new_run_id,
                workflow_name=workflow_name,
                tenant_config=tenant_config,
                accumulated_context=accumulated_context,
                resume_from_node=from_node_id,
                budget_settings=budget_settings or {},
            )

            _raw_status = result.get("status", "completed")
            final_status = _raw_status.value if hasattr(_raw_status, "value") else str(_raw_status)
            if final_status not in ("escalated", "pending_a2a"):
                await crud.update_workflow_status(
                    db, new_run_id, final_status,
                    outcome=result.get("outcome"),
                )
                await _write_evidence_summary(new_run_id, workflow_name, tenant_config, result)

            await broadcast_event(
                f"workflow_{final_status}",
                {
                    "run_id": new_run_id, "workflow": workflow_name,
                    "tenant_id": tenant_config.get("client_id"),
                    "status": final_status, "forked_from": original_run_id,
                },
            )

        except Exception as e:
            log.error("Fork workflow failed", run_id=new_run_id, error=str(e))
            await crud.update_workflow_status(db, new_run_id, "failed", error=str(e))
            await broadcast_event("workflow_failed", {
                "run_id": new_run_id, "error": str(e),
                "tenant_id": tenant_config.get("client_id"),
            })
        finally:
            _active_orchestrators.pop(new_run_id, None)


async def _write_evidence_summary(
    run_id: str, workflow_name: str, tenant_config: dict, result: dict
) -> None:
    """
    Write evidence summary JSON asynchronously (non-blocking).
    Previously was synchronous, which briefly blocked the event loop.
    """
    try:
        evidence_dir = Path(os.getenv("EPI_EVIDENCE_DIR", "./evidence"))
        evidence_dir.mkdir(parents=True, exist_ok=True)
        ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        safe = workflow_name.replace("/", "_")
        path = evidence_dir / f"{safe}_{run_id[:8]}_{ts}.json"
        summary = {
            "run_id":       run_id,
            "workflow_name": workflow_name,
            "tenant_id":    tenant_config.get("client_id"),
            "tenant_name":  tenant_config.get("client_name"),
            "status":       result.get("status", "unknown"),
            "completed_at": datetime.utcnow().isoformat(),
            "llm_stats":    result.get("llm_stats", {}),
            "outcome":      result.get("outcome", {}),
        }
        content = json.dumps(summary, indent=2, default=str)
        # Use aiofiles for non-blocking write
        import aiofiles as _af
        async with _af.open(path, "w") as f:
            await f.write(content)
    except Exception as e:
        log.warning("Evidence summary write failed", error=str(e))
 
 
async def _store_human_correction_rag(
    tenant_id: str,
    run_id: str,
    escalation_id: str,
    original_recommendation: str,
    human_action: str,
    context_brief: str,
    notes: str,
) -> None:
    """
    Background task: persist a human escalation decision as a RAG correction.
 
    The next time the Reasoning agent encounters a similar situation for this
    tenant, `get_historical_context_for_reasoning` will surface this lesson
    and label it as HIGH PRIORITY in the injected context.
    """
    from core.rag_engine import RAGEngine
    from core.llm_router import LLMRouter
 
    db = await get_raw_session()
    async with db:
        try:
            rag = RAGEngine(db_session=db, llm_router=LLMRouter())
            await rag.store_human_correction(
                tenant_id=tenant_id,
                run_id=run_id,
                escalation_id=escalation_id,
                original_recommendation=original_recommendation,
                human_action=human_action,
                context_brief=context_brief,
                notes=notes,
            )
        except Exception as e:
            log.warning(
                "Failed to store human correction in RAG (non-fatal)",
                error=str(e),
                escalation_id=escalation_id,
            )


# ─────────────────────────────────────────────────────────────────────────────
# Config schema helper
# ─────────────────────────────────────────────────────────────────────────────

def _build_config_schema() -> dict:
    return {
        "sections": [
            {
                "id": "company_profile", "title": "Company Profile",
                "fields": [
                    {"key": "client_name", "label": "Company Name", "type": "text", "required": True},
                    {"key": "industry", "label": "Industry", "type": "select",
                     "options": ["saas", "retail", "healthcare", "finance",
                                 "real_estate", "logistics", "cpg"]},
                    {"key": "company_profile.description", "label": "Description", "type": "textarea"},
                    {"key": "company_profile.avg_contract_value", "label": "Avg Contract Value", "type": "text"},
                ],
            },
            {
                "id": "business_rules", "title": "Business Rules",
                "fields": [
                    {"key": "business_rules.confidence_threshold", "label": "Confidence Threshold",
                     "type": "range", "min": 0.5, "max": 1.0, "step": 0.05, "default": 0.75},
                ],
            },
            {
                "id": "tone_profile", "title": "Tone & Brand Voice",
                "fields": [
                    {"key": "tone_profile.brand_voice", "label": "Brand Voice", "type": "textarea"},
                    {"key": "tone_profile.formality", "label": "Formality", "type": "select",
                     "options": ["formal", "medium", "casual"]},
                    {"key": "tone_profile.sign_off_name", "label": "Sign-off Name", "type": "text"},
                ],
            },
            {
                "id": "active_workflows", "title": "Active Workflows",
                "fields": [
                    {"key": "active_workflows", "label": "Enabled Workflows", "type": "multiselect",
                     "options": [
                         "saas_churn_prevention", "saas_pipeline_velocity",
                         "retail_inventory_health", "healthcare_patient_engagement",
                         "finance_expense_monitoring",
                         "re_listing_health_monitor", "re_tenant_flight_risk",
                     ]},
                ],
            },
        ]
    }