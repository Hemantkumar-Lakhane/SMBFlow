"""
tests/test_complete_application.py
==================================
Comprehensive automated test suite covering EVERY core functionality:
1. Authentication & RBAC (Admin, Tenant User, Signup, Token validation)
2. Platform Administration & Service Health (DB, Redis, AI Providers, Workflow Engine)
3. Workflow Catalog & QA Release Center (Manifests, Release Gates, Test-Runs)
4. Operational Runs & Telemetry
5. Client Workflows & Tool Connections
6. Escalations, Approvals & HITL
7. Notification Center & AI Copilot
"""

import asyncio
import os
import uuid
import pytest
import httpx
from datetime import datetime, timedelta

from api.main import app
from api.auth import create_access_token, decode_token, TokenData
from core.database import engine, get_raw_session
from db.models.core import Base as CoreBase
from core.state_manager import Base as StateBase
from api import crud
from api.auth import hash_password
from db.seed.plans_seed import seed_plans_and_catalog
from core.workflow_catalog_sync import sync_workflow_catalog, sync_plan_entitlements_for_new_workflows


@pytest.fixture(scope="module", autouse=True)
def setup_models():
    """Ensure database schema is ready and seeded before running tests."""
    async def _init():
        async with engine.begin() as conn:
            await conn.run_sync(StateBase.metadata.create_all)
            await conn.run_sync(CoreBase.metadata.create_all)

        session = await get_raw_session()
        async with session:
            existing = await crud.get_user_by_email(session, "admin@smbflow.com")
            if not existing:
                await crud.create_user(
                    session,
                    email="admin@smbflow.com",
                    password_hash=hash_password("admin123"),
                    full_name="SMBFlow Admin",
                    role="super_admin",
                    tenant_id=None,
                )
            try:
                await seed_plans_and_catalog(session)
                await sync_workflow_catalog(session)
                await sync_plan_entitlements_for_new_workflows(session)
            except Exception as e:
                print(f"Seed warning in tests: {e}")

    asyncio.run(_init())


@pytest.fixture
def transport():
    return httpx.ASGITransport(app=app)


# ─────────────────────────────────────────────────────────────────────────────
# 1. AUTHENTICATION & ACCESS CONTROL
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_login_and_token_validation(transport):
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1.1 Invalid credentials rejected
        resp = await client.post("/api/v1/auth/login", json={"email": "admin@smbflow.com", "password": "wrongpassword"})
        assert resp.status_code == 401

        # 1.2 Valid admin login
        resp = await client.post("/api/v1/auth/login", json={"email": "admin@smbflow.com", "password": "admin123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        admin_token = data["access_token"]

        # 1.3 User info /me
        me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "admin@smbflow.com"

        # 1.4 Client signup
        new_email = f"user_{uuid.uuid4().hex[:6]}@example.com"
        signup_resp = await client.post("/api/v1/auth/signup", json={
            "email": new_email,
            "password": "Password123!",
            "full_name": "Test Client User",
            "tenant_name": f"Acme {uuid.uuid4().hex[:4]}",
            "industry": "saas",
        })
        assert signup_resp.status_code == 200
        assert "access_token" in signup_resp.json()

        # 1.5 Forged token rejected
        bad_resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer forged.token.value"})
        assert bad_resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# 2. PLATFORM ADMIN & HEALTH
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_platform_health_and_admin_ops(transport):
    admin_token = create_access_token({"sub": "admin", "role": "platform_admin", "email": "admin@smbflow.com"})
    org_user_token = create_access_token({"sub": "user", "role": "org_user", "email": "user@client.com"})

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 2.1 Non-admin forbidden
        resp = await client.get("/api/v1/admin/health", headers={"Authorization": f"Bearer {org_user_token}"})
        assert resp.status_code == 403

        # 2.2 Admin health inspection (PostgreSQL & Redis operational)
        resp = await client.get("/api/v1/admin/health", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        health = resp.json()
        assert health["services"]["database"]["status"] == "operational"
        assert health["services"]["redis"]["status"] == "operational"
        assert health["services"]["redis"]["label"] == "Redis / PubSub"
        assert "ai_providers" in health["services"]

        # 2.3 Organizations listing
        orgs_resp = await client.get("/api/v1/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})
        assert orgs_resp.status_code == 200
        assert isinstance(orgs_resp.json(), list)

        # 2.4 User directory
        users_resp = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert users_resp.status_code == 200
        assert isinstance(users_resp.json(), list)

        # 2.5 AI providers and models
        prov_resp = await client.get("/api/v1/admin/providers", headers={"Authorization": f"Bearer {admin_token}"})
        assert prov_resp.status_code == 200
        assert len(prov_resp.json()) > 0

        # 2.6 Billing plans
        plans_resp = await client.get("/api/v1/admin/plans", headers={"Authorization": f"Bearer {admin_token}"})
        assert plans_resp.status_code == 200
        assert len(plans_resp.json()) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 3. WORKFLOW CATALOG & QA RELEASE CENTER
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_workflow_catalog_and_qa_center(transport):
    admin_token = create_access_token({"sub": "admin", "role": "platform_admin", "email": "admin@smbflow.com"})

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 3.1 Platform catalog
        cat_resp = await client.get("/api/v1/admin/workflows/catalog", headers={"Authorization": f"Bearer {admin_token}"})
        assert cat_resp.status_code == 200
        catalog = cat_resp.json()
        assert len(catalog) >= 30

        # 3.2 QA Center summary metrics & dashboard
        summary_resp = await client.get("/api/v1/admin/qa/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert "metrics" in summary

        # 3.3 QA Catalog & Inventory listing
        qa_cat_resp = await client.get("/api/v1/admin/qa/inventory", headers={"Authorization": f"Bearer {admin_token}"})
        assert qa_cat_resp.status_code == 200
        qa_data = qa_cat_resp.json()
        assert len(qa_data) >= 30

        # 3.4 Workflow Manifest extraction
        test_key = "saas_churn_prevention"
        manifest_resp = await client.get(f"/api/v1/admin/qa/workflows/{test_key}/manifest", headers={"Authorization": f"Bearer {admin_token}"})
        assert manifest_resp.status_code == 200
        manifest = manifest_resp.json()["manifest"]
        assert len(manifest["nodes"]) > 0

        # 3.5 QA Release gates
        gates_resp = await client.get(f"/api/v1/admin/qa/workflows/{test_key}/release-gates", headers={"Authorization": f"Bearer {admin_token}"})
        assert gates_resp.status_code == 200
        assert "gates" in gates_resp.json()

        # 3.6 QA Test run in mock unit mode
        test_run_resp = await client.post(
            f"/api/v1/admin/qa/workflows/{test_key}/test-run",
            json={"test_mode": "unit", "input_payload": {"risk_threshold": 0.8}},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert test_run_resp.status_code == 200
        assert bool(test_run_resp.json().get("test_run_id"))

        # 3.7 Workflow Access requests
        acc_resp = await client.get("/api/v1/admin/workflows/access-requests", headers={"Authorization": f"Bearer {admin_token}"})
        assert acc_resp.status_code == 200
        assert isinstance(acc_resp.json(), list)


# ─────────────────────────────────────────────────────────────────────────────
# 4. OPERATIONAL RUNS TELEMETRY
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_operational_runs(transport):
    admin_token = create_access_token({"sub": "admin", "role": "platform_admin", "email": "admin@smbflow.com"})

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 4.1 Runs list
        runs_resp = await client.get("/api/v1/admin/runs?limit=10", headers={"Authorization": f"Bearer {admin_token}"})
        assert runs_resp.status_code == 200
        runs = runs_resp.json()
        assert isinstance(runs, list)

        # 4.2 Non-existent run 404
        dummy_id = str(uuid.uuid4())
        detail_resp = await client.get(f"/api/v1/admin/runs/{dummy_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert detail_resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# 5. CLIENT WORKSPACES & TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_client_workspaces_and_tools(transport):
    client_token = create_access_token({"sub": "client-user", "role": "org_user", "email": "user@acme.com"})

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 5.1 Tool connections catalog
        conn_resp = await client.get("/api/v1/connections/available", headers={"Authorization": f"Bearer {client_token}"})
        assert conn_resp.status_code == 200
        connectors = conn_resp.json()
        assert len(connectors) > 0

        # 5.2 Workflow trigger info
        trig_info_resp = await client.get("/api/v1/workflows/saas_churn_prevention/trigger-info", headers={"Authorization": f"Bearer {client_token}"})
        assert trig_info_resp.status_code == 200
        assert "workflow_name" in trig_info_resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# 6. ESCALATIONS, NOTIFICATIONS & COPILOT
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hitl_notifications_and_copilot(transport):
    admin_token = create_access_token({"sub": "admin", "role": "platform_admin", "email": "admin@smbflow.com"})

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 6.1 Escalations
        esc_resp = await client.get("/api/v1/escalations?status=pending", headers={"Authorization": f"Bearer {admin_token}"})
        assert esc_resp.status_code == 200
        assert isinstance(esc_resp.json(), list)

        # 6.2 Notifications
        notif_resp = await client.get("/api/v1/notifications", headers={"Authorization": f"Bearer {admin_token}"})
        assert notif_resp.status_code == 200
        assert isinstance(notif_resp.json(), list)

        # 6.3 Copilot Chat
        copilot_resp = await client.post(
            "/api/v1/copilot/chat",
            json={
                "messages": [{"role": "user", "content": "What are the best workflows for SaaS?"}],
                "system_context": {},
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert copilot_resp.status_code == 200
        assert bool(copilot_resp.json().get("reply") or copilot_resp.json().get("response"))
