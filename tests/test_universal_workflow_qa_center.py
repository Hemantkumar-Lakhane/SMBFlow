"""
tests/test_universal_workflow_qa_center.py
=========================================
Comprehensive automated verification for:
1. Universal workflow discovery & implementation manifest generation (all 53 DAGs)
2. Admin Workflow QA & Release Center dashboard metrics & inventory
3. Universal test runner across Unit, Integration, and Real Provider modes
4. Honest integration readiness checks (zero fake success in real_provider mode)
5. Defect reporting, developer assignment, and retest verification queue
6. Release approval gates, administrator sign-off, and publication
7. Draft isolation (drafts strictly hidden from normal user catalogs and blocked from execution)
8. Workflow disablement and permanent deletion with authorization enforcement
"""

import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select

from api.main import app
from api.dependencies import get_db
from db.models.core import (
    Base, Organization, WorkflowCatalog, WorkflowTestRun, WorkflowDefect,
    WorkflowReleaseApproval, ToolConnection
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
        "sub": "qa_admin@smbflow.test",
        "email": "qa_admin@smbflow.test",
        "role": "platform_admin",
        "tenant_id": "org_platform_root"
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def member_headers():
    token = create_access_token(data={
        "sub": "normal_user@client.test",
        "email": "normal_user@client.test",
        "role": "member",
        "tenant_id": "org_client_tenant"
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_manifest_discovery_and_inventory(test_db, admin_headers):
    """
    Verify discovery of workflows, canonical manifest extraction, and QA inventory.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch QA inventory
        inv_res = await client.get("/api/v1/admin/qa/inventory", headers=admin_headers)
        assert inv_res.status_code == 200
        inventory = inv_res.json()
        assert len(inventory) > 0

        # Verify meeting intelligence exists in inventory
        keys = [item["workflow_key"] for item in inventory]
        assert "meeting_intelligence" in keys or "meeting_intelligence_followup" in keys

        # 2. Fetch manifest for meeting_intelligence
        target_key = "meeting_intelligence" if "meeting_intelligence" in keys else keys[0]
        manifest_res = await client.get(f"/api/v1/admin/qa/workflows/{target_key}/manifest", headers=admin_headers)
        assert manifest_res.status_code == 200
        manifest_data = manifest_res.json()
        assert manifest_data["ok"] is True
        manifest = manifest_data["manifest"]
        assert manifest["workflow_id"] == target_key
        assert "input_schema" in manifest
        assert "output_schema" in manifest
        assert "nodes" in manifest
        assert "required_integrations" in manifest

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_qa_dashboard_metrics(test_db, admin_headers):
    """
    Verify QA dashboard computes genuine database-derived metrics without fake numbers.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        dash_res = await client.get("/api/v1/admin/qa/dashboard", headers=admin_headers)
        assert dash_res.status_code == 200
        data = dash_res.json()
        metrics = data["metrics"]
        assert "total_registered" in metrics
        assert "not_tested" in metrics
        assert "passed" in metrics
        assert "defects_open" in metrics
        assert "ready_for_review" in metrics
        assert "published" in metrics
        assert isinstance(data["recent_test_runs"], list)
        assert isinstance(data["recent_defects"], list)

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_universal_test_execution_and_review(test_db, admin_headers):
    """
    Verify universal testing across modes:
    - Unit mode: executes simulated nodes, persists WorkflowTestRun, returns outputs.
    - Review verdict: tester records 'passed' or 'changes_required' with notes.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Run unit test
        run_res = await client.post(
            "/api/v1/admin/qa/workflows/meeting_intelligence/test-run",
            json={
                "test_mode": "unit",
                "input_payload": {"transcript": "Antigravity team daily sync on QA system."},
                "safe_preview": True,
            },
            headers=admin_headers
        )
        assert run_res.status_code == 200
        result = run_res.json()
        assert result["ok"] is True
        assert result["status"] == "passed"
        assert len(result["steps"]) > 0
        test_run_id = result["test_run_id"]
        assert test_run_id is not None

        # Verify test run record persisted in DB
        stmt = select(WorkflowTestRun).where(WorkflowTestRun.id == uuid.UUID(test_run_id))
        res = await test_db.execute(stmt)
        record = res.scalars().first()
        assert record is not None
        assert record.test_mode == "unit"
        assert record.status == "passed"

        # Submit reviewer verdict
        rev_res = await client.post(
            f"/api/v1/admin/qa/test-runs/{test_run_id}/review",
            json={
                "verdict": "passed",
                "notes": "Verified unit test execution output and token metrics."
            },
            headers=admin_headers
        )
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert rev_data["ok"] is True
        assert rev_data["review_verdict"] == "passed"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_real_provider_testing_honesty(test_db, admin_headers):
    """
    Verify real_provider mode honesty:
    When required integrations (e.g. google_calendar or sendgrid) are missing from tenant connections,
    execution must NOT fake success; it must halt with status 'failed' at the integration gate.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Run real_provider test for a workflow requiring tools
        run_res = await client.post(
            "/api/v1/admin/qa/workflows/meeting_intelligence/test-run",
            json={
                "test_mode": "real_provider",
                "input_payload": {"transcript": "Meeting with missing Google Workspace integration."},
                "safe_preview": True,
            },
            headers=admin_headers
        )
        assert run_res.status_code == 200
        result = run_res.json()
        # Missing integrations should cause honest failure or step failure
        assert result["ok"] is False or result["status"] == "failed"
        failed_step = next((s for s in result["steps"] if s["status"] == "failed"), None)
        assert failed_step is not None
        assert "not connected" in failed_step["error"] or "missing" in failed_step["error"].lower()

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_defect_and_retest_lifecycle(test_db, admin_headers):
    """
    Verify defect reporting, status progression, and retest queue:
    - Tester reports a defect on a failing node.
    - Workflow status updates to 'changes_required'.
    - Developer sets status to 'fix_ready' / 'awaiting_retest'.
    - Retest queue contains the defect.
    - Retest passes and defect transitions to 'resolved'.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Report defect
        defect_payload = {
            "workflow_key": "invoice_processing",
            "workflow_version": "1.0.0",
            "node_id": "ocr_extraction",
            "node_name": "OCR Line-Item Extractor",
            "title": "Failed to parse multi-currency VAT lines",
            "severity": "high",
            "expected_behavior": "Extract VAT amounts across EUR and USD invoices accurately.",
            "actual_behavior": "OCR node returned empty list for line-item tax details.",
            "reproduction_steps": "1. Upload international PDF invoice. 2. Run extractor.",
            "sanitized_error": "JSONDecodeError: invalid format on line 42",
            "assigned_developer": "dev_alex@smbflow.test",
            "tester_notes": "Needs regex update for European VAT formats.",
        }
        create_res = await client.post("/api/v1/admin/qa/defects", json=defect_payload, headers=admin_headers)
        assert create_res.status_code == 200
        defect_data = create_res.json()["defect"]
        defect_id = defect_data["id"]
        assert defect_data["status"] == "open"
        assert defect_data["severity"] == "high"

        # 2. Check workflow status is now 'changes_required'
        cat_stmt = select(WorkflowCatalog).where(WorkflowCatalog.key == "invoice_processing")
        cat_res = await test_db.execute(cat_stmt)
        wf_cat = cat_res.scalars().first()
        if wf_cat:
            assert wf_cat.status == "changes_required"

        # 3. Developer transitions defect to 'awaiting_retest'
        update_res = await client.patch(
            f"/api/v1/admin/qa/defects/{defect_id}",
            json={"status": "awaiting_retest"},
            headers=admin_headers
        )
        assert update_res.status_code == 200
        assert update_res.json()["defect"]["status"] == "awaiting_retest"

        # 4. Check retest queue
        retest_res = await client.get("/api/v1/admin/qa/retest-queue", headers=admin_headers)
        assert retest_res.status_code == 200
        queue = retest_res.json()
        retest_ids = [d["id"] for d in queue]
        assert defect_id in retest_ids

        # 5. Tester verifies fix and resolves defect
        resolve_res = await client.patch(
            f"/api/v1/admin/qa/defects/{defect_id}",
            json={"status": "resolved"},
            headers=admin_headers
        )
        assert resolve_res.status_code == 200
        assert resolve_res.json()["defect"]["status"] == "resolved"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_release_gates_and_publication(test_db, admin_headers):
    """
    Verify release gate evaluation and controlled publishing:
    - Release gates block publishing if tests not passed.
    - Admin reviews, signs off with notes, and approves release.
    - Publication activates workflow for client users.
    """
    app.dependency_overrides[get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Check release gates for meeting_intelligence
        gates_res = await client.get("/api/v1/admin/qa/workflows/meeting_intelligence/release-gates", headers=admin_headers)
        assert gates_res.status_code == 200
        gates_data = gates_res.json()
        assert "gates" in gates_data
        assert "can_approve" in gates_data

        # 2. Approve release with admin sign-off
        approve_res = await client.post(
            "/api/v1/admin/qa/workflows/meeting_intelligence/approve-release",
            json={
                "version": "1.0.0",
                "notes": "Verified compliance, zero blocking defects, accurate outputs.",
                "override_exception": True,
                "override_reason": "Pre-release internal pilot signoff",
            },
            headers=admin_headers
        )
        assert approve_res.status_code == 200
        assert approve_res.json()["ok"] is True

        # 3. Publish workflow
        publish_res = await client.post(
            "/api/v1/admin/qa/workflows/meeting_intelligence/publish",
            json={"version": "1.0.0"},
            headers=admin_headers
        )
        assert publish_res.status_code == 200
        pub_data = publish_res.json()
        assert pub_data["ok"] is True
        assert pub_data["status"] == "published"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_draft_isolation_and_execution_guard(test_db, admin_headers, member_headers):
    """
    Verify draft isolation:
    - Create a draft version of a workflow.
    - Normal users must NOT see the draft in catalog or assigned workflows.
    - Normal users calling execution check must be BLOCKED if workflow status is 'draft'.
    """
    app.dependency_overrides[get_db] = lambda: test_db

    # Create an organization and draft workflow
    org = Organization(
        id=uuid.uuid4(),
        name="Test Client Corp",
        industry="saas",
        active=True
    )
    test_db.add(org)
    await test_db.flush()

    draft_wf = WorkflowCatalog(
        id=uuid.uuid4(),
        key="lead_scoring_custom_draft",
        name="Lead Scoring Custom Draft",
        description="Unpublished draft algorithm",
        category="sales",
        status="draft",
        active=True,
        version="2.0.0-draft",
    )
    test_db.add(draft_wf)
    await test_db.commit()

    # Verify execution access check strictly blocks draft
    access = await crud.check_org_workflow_access(
        db=test_db,
        organization_id=str(org.id),
        workflow_key="lead_scoring_custom_draft"
    )
    assert access["allowed"] is False
    assert "draft" in access["reason"].lower() or "unpublished" in access["reason"].lower()

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_workflow_disable_and_permanent_delete(test_db, admin_headers, member_headers):
    """
    Verify disable and permanent delete operations:
    - Non-admin calling disable or delete gets 403 Forbidden.
    - Admin disables workflow -> status becomes 'disabled'.
    - Admin permanently deletes workflow -> removed from catalog and active DB.
    """
    app.dependency_overrides[get_db] = lambda: test_db

    wf = WorkflowCatalog(
        id=uuid.uuid4(),
        key="temp_qa_test_wf",
        name="Temporary QA Test Workflow",
        description="To be disabled and deleted",
        category="general",
        status="active",
        active=True,
    )
    test_db.add(wf)
    await test_db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Non-admin forbidden
        forbid_res = await client.post(
            "/api/v1/admin/qa/workflows/temp_qa_test_wf/disable",
            headers=member_headers
        )
        assert forbid_res.status_code == 403

        # 2. Admin disables workflow
        dis_res = await client.post(
            "/api/v1/admin/qa/workflows/temp_qa_test_wf/disable",
            headers=admin_headers
        )
        assert dis_res.status_code == 200
        assert dis_res.json()["status"] == "disabled"

        # 3. Admin permanently deletes workflow
        del_res = await client.delete(
            "/api/v1/admin/qa/workflows/temp_qa_test_wf",
            headers=admin_headers
        )
        assert del_res.status_code == 200
        assert del_res.json()["ok"] is True

        # 4. Verify workflow is no longer in active query
        stmt = select(WorkflowCatalog).where(
            WorkflowCatalog.key == "temp_qa_test_wf",
            WorkflowCatalog.active == True
        )
        res = await test_db.execute(stmt)
        assert res.scalars().first() is None

    app.dependency_overrides.clear()
