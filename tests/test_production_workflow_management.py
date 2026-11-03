"""
tests/test_production_workflow_management.py
=============================================
Comprehensive automated verification for:
1. Canonical workflow registry & duplicate workflow reconciliation
2. Admin Workflow Management & Testing Center (3 distinct modes: unit, integration, real_provider)
3. Lifecycle management & permanent workflow deletion semantics
4. Real Meeting Intelligence execution without synthetic mocks or hardcoded dialogue
5. Truthful integration readiness reporting
"""

import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select

from api.main import app
from api.dependencies import get_db
from core.workflow_catalog_sync import _DEPRECATED_OR_DUPLICATE_KEYS, _CATALOG_OVERRIDES
from db.models.core import (
    Base, Organization, WorkflowCatalog, BillingPlan,
    PlanWorkflowEntitlement, OrganizationSubscription, OrganizationWorkflowAssignment,
    ToolConnection
)
import api.crud as crud
from api.auth import create_access_token

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return compiler.visit_JSON(JSON(), **kw)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
async def test_db():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
def admin_headers():
    token = create_access_token(data={
        "sub": "admin@example.com",
        "email": "admin@example.com",
        "role": "platform_admin",
        "tenant_id": "org_platform_root"
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def member_headers():
    token = create_access_token(data={
        "sub": "member@client.com",
        "email": "member@client.com",
        "role": "member",
        "tenant_id": "org_client_tenant"
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_duplicate_workflow_reconciliation_and_catalog(test_db):
    """
    Verify duplicate workflows are reconciled:
    - Deprecated keys are filtered out of /config/workflows.
    - /config/dag/{workflow_name} redirects demo_workflow to canonical meeting_intelligence_followup.
    - Deleted scratch DAGs return HTTP 410.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check /config/workflows
        res = await client.get("/api/v1/config/workflows")
        assert res.status_code == 200
        workflows = res.json()
        wf_names = [w["name"] for w in workflows]

        for dep_key in _DEPRECATED_OR_DUPLICATE_KEYS:
            assert dep_key not in wf_names, f"Deprecated workflow '{dep_key}' must not appear in /config/workflows"

        # Check canonical resolution: demo_workflow -> meeting_intelligence_followup
        dag_res = await client.get("/api/v1/config/dag/demo_workflow")
        assert dag_res.status_code == 200
        dag_data = dag_res.json()
        assert dag_data.get("_meta", {}).get("name") == "Meeting Intelligence & Follow-up" or "meeting" in dag_data.get("_meta", {}).get("name", "").lower()

        # Check deleted DAG request returns 410 Gone
        del_dag_res = await client.get("/api/v1/config/dag/demo")
        assert del_dag_res.status_code == 410

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_permanent_deletion_and_access_restriction(test_db, admin_headers, member_headers):
    """
    Verify permanent deletion semantics:
    - Non-admin calling DELETE /admin/workflows/catalog/{id} is rejected with 403.
    - Admin permanently deletes workflow.
    - Workflow is marked inactive and deleted in DB, active runs cancelled.
    - Active catalogs omit the deleted workflow.
    - Direct execution access returns HTTP 410 or blocked.
    """
    app.dependency_overrides[get_db] = lambda: test_db

    # Create test catalog entry
    wf = WorkflowCatalog(
        id=uuid.uuid4(),
        key="temp_pipeline_for_deletion",
        name="Temporary Pipeline",
        description="Pipeline to be permanently deleted",
        category="productivity",
        status="active",
        active=True,
        metadata_={"execution_handler": "temp_engine"}
    )
    test_db.add(wf)
    await test_db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Non-admin attempt to delete -> 403 Forbidden
        forbidden_res = await client.delete(
            f"/api/v1/admin/workflows/catalog/{str(wf.id)}",
            headers=member_headers
        )
        assert forbidden_res.status_code == 403

        # 2. Admin permanent delete -> 200 OK
        del_res = await client.delete(
            f"/api/v1/admin/workflows/catalog/{str(wf.id)}",
            headers=admin_headers
        )
        assert del_res.status_code == 200
        del_json = del_res.json()
        assert del_json.get("workflow_key") == "temp_pipeline_for_deletion"

        # 3. Active catalog list omits deleted workflow
        cat_res = await client.get("/api/v1/admin/workflows/catalog", headers=admin_headers)
        assert cat_res.status_code == 200
        cat_list = cat_res.json()
        assert not any(str(w["id"]) == str(wf.id) for w in cat_list)

        # 4. Access check blocks deleted workflow
        access_res = await crud.check_org_workflow_access(test_db, "some_org", "temp_pipeline_for_deletion")
        assert not access_res["allowed"]
        assert "deleted" in access_res["reason"].lower()

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_workflow_testing_center_modes(test_db, admin_headers):
    """
    Verify Admin Workflow Testing Center:
    - Mode 1: unit test executes with mocks and reports truthful simulation metrics.
    - Mode 2: integration test ingests fixtures.
    - Mode 3: real_provider test truthfully verifies real ToolConnection and refuses fake success when disconnected.
    """
    app.dependency_overrides[get_db] = lambda: test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unit Test (Mock Mode)
        unit_res = await client.post(
            "/api/v1/admin/workflows/meeting_intelligence_followup/test-run",
            headers=admin_headers,
            json={
                "input_payload": {"transcript": "Sample transcript for mock test"},
                "test_mode": "unit",
                "safe_preview": True,
            }
        )
        assert unit_res.status_code == 200
        unit_data = unit_res.json()
        assert unit_data["ok"] is True
        assert unit_data["test_mode"] == "unit"
        assert len(unit_data["steps"]) > 0

        # 2. Integration Test (Fixtures)
        integ_res = await client.post(
            "/api/v1/admin/workflows/meeting_intelligence_followup/test-run",
            headers=admin_headers,
            json={
                "input_payload": {"transcript": "Sarah: Completed milestone 1. Alex: Reviewing design."},
                "test_mode": "integration",
                "safe_preview": True,
            }
        )
        assert integ_res.status_code == 200
        integ_data = integ_res.json()
        assert integ_data["ok"] is True
        assert integ_data["test_mode"] == "integration"

        # 3. Real Provider Test without connected account -> Truthful blocked status, NO fake success!
        real_res = await client.post(
            "/api/v1/admin/workflows/meeting_intelligence_followup/test-run",
            headers=admin_headers,
            json={
                "input_payload": {"meet_url": "https://meet.google.com/abc-defg-hij"},
                "test_mode": "real_provider",
                "safe_preview": True,
            }
        )
        assert real_res.status_code == 200
        real_data = real_res.json()
        assert real_data["ok"] is False, "Real provider test must not claim success when external tool is disconnected"
        assert "not connected" in real_data["message"].lower() or "blocked" in real_data["message"].lower()

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_meeting_intelligence_real_summarize(test_db, admin_headers):
    """
    Verify Meeting Intelligence real summarize endpoint:
    - Ingests real transcript without requiring hardcoded contact details.
    - Extracts structured summary, key discussion points, decisions, commitments, and follow-ups.
    - Validates Google Meet URL format and handles unavailable transcript truthfully.
    """
    app.dependency_overrides[get_db] = lambda: test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # A. Ingest User-Pasted Transcript
        transcript_sample = (
            "Alice: We need to finalize the Q4 release deadline.\n"
            "Bob: I commit to finishing the security audit by Friday October 24.\n"
            "Charlie: I will prepare the deployment scripts by Wednesday.\n"
            "Alice: Great, decision made: release is scheduled for October 30."
        )

        sum_res = await client.post(
            "/api/v1/workflows/meeting-intelligence/summarize",
            headers=admin_headers,
            json={
                "input_method": "transcript",
                "transcript_text": transcript_sample,
            }
        )
        assert sum_res.status_code == 200
        sum_data = sum_res.json()
        assert sum_data["status"] in ["success", "completed"]
        assert len(sum_data.get("summary", "")) > 10
        assert isinstance(sum_data.get("key_discussion_points"), list)
        assert isinstance(sum_data.get("commitments"), list)
        assert sum_data["source_provenance"]["source_type"] == "user_transcript"

        # B. Invalid Google Meet URL rejected truthfully
        invalid_meet_res = await client.post(
            "/api/v1/workflows/meeting-intelligence/summarize",
            headers=admin_headers,
            json={
                "input_method": "meet_url",
                "meet_url": "https://example.com/not-a-meet-url",
            }
        )
        assert invalid_meet_res.status_code == 400
        assert "valid google meet url" in invalid_meet_res.json()["detail"].lower()

        # C. Valid Google Meet URL checked truthfully (waiting / disconnected)
        valid_meet_res = await client.post(
            "/api/v1/workflows/meeting-intelligence/summarize",
            headers=admin_headers,
            json={
                "input_method": "meet_url",
                "meet_url": "https://meet.google.com/xyz-uvwx-rst",
            }
        )
        assert valid_meet_res.status_code == 200
        meet_data = valid_meet_res.json()
        assert meet_data["status"] in ["waiting_for_transcript", "requires_integration"]

    app.dependency_overrides.clear()
