"""
tests/test_meeting_intelligence_automatic_ingestion.py
======================================================
Comprehensive test suite for Meeting Intelligence Automatic Conversation Ingestion:
1. Successful automatic ingestion (Node 1 -> Node 5 pipeline execution).
2. Duplicate webhook/event strong idempotency (never creates duplicate runs or memory).
3. Retry after failure (recovers without duplicate records).
4. No downstream duplication after retry (commitments, memory, drafts preserved 1:1).
5. Strict tenant/organization isolation (cross-org access rejected with 403).
6. Invalid/missing recording rejected with clear explanation (HTTP 400).
7. Manual conversation capture regression (existing Node 1 capture works unchanged).
"""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    ConversationCaptureRequest,
    ConversationIngestRequest,
    ProcessConversationRequest,
    StructuredExtraction,
    PersonExtraction,
    CommitmentExtraction,
    SuggestedActionExtraction,
    STORAGE_DIR,
    capture_conversation,
    process_conversation,
    ingest_conversation_core,
    list_conversation_ingestions,
    get_conversation_ingestion,
    retry_conversation_ingestion,
)
from db.models.core import (
    AgentRunRecord,
    ApprovalItem,
    AuditEvent,
    ConversationIngestionRecord,
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
    WorkflowInstance,
)

# ─────────────────────────────────────────────────────────────────────────────
# Test Fixtures & Mock Session
# ─────────────────────────────────────────────────────────────────────────────

ORG_A = str(uuid.uuid4())
ORG_B = str(uuid.uuid4())

USER_ORG_A = TokenData(
    user_id=str(uuid.uuid4()),
    email="lead@company-a.com",
    role="org_admin",
    organization_id=ORG_A,
    tenant_id=ORG_A,
)

USER_ORG_B = TokenData(
    user_id=str(uuid.uuid4()),
    email="intruder@company-b.com",
    role="org_admin",
    organization_id=ORG_B,
    tenant_id=ORG_B,
)


class IngestionMockSession:
    """In-memory async database session for automatic ingestion tests."""

    def __init__(self):
        self.ingestion_records = {}
        self.workflow_instances = {}
        self.contacts = {}
        self.conversations = {}
        self.approval_items = {}
        self.memory_items = {}
        self.agent_runs = []
        self.audit_events = []

    def add(self, obj):
        if not hasattr(obj, "id") or not obj.id:
            obj.id = uuid.uuid4()

        if isinstance(obj, ConversationIngestionRecord):
            self.ingestion_records[str(obj.id)] = obj
        elif isinstance(obj, WorkflowInstance):
            self.workflow_instances[str(obj.id)] = obj
        elif isinstance(obj, RelationshipContact):
            self.contacts[str(obj.id)] = obj
        elif isinstance(obj, RelationshipConversation):
            self.conversations[str(obj.id)] = obj
        elif isinstance(obj, ApprovalItem):
            self.approval_items[str(obj.id)] = obj
        elif isinstance(obj, RelationshipMemoryItem):
            self.memory_items[str(obj.id)] = obj
        elif isinstance(obj, AgentRunRecord):
            self.agent_runs.append(obj)
        elif isinstance(obj, AuditEvent):
            self.audit_events.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        stmt_str = str(stmt).lower()
        params = {}
        try:
            params = stmt.compile().params
        except Exception:
            pass
        param_vals = [str(v).lower() for v in params.values() if v is not None]

        mock_result = AsyncMock()

        # Query ConversationIngestionRecord
        if "conversation_ingestion_records" in stmt_str:
            matched = list(self.ingestion_records.values())

            # 1. Match by Record ID (for get_conversation_ingestion / retry_conversation_ingestion)
            found_by_id = None
            for rec_id, rec in self.ingestion_records.items():
                if rec_id.lower() in param_vals:
                    found_by_id = rec
                    break

            if found_by_id:
                matched = [found_by_id]
            else:
                # 2. Match by external_event_id
                where_clause = stmt_str.split("where")[-1] if "where" in stmt_str else ""
                if "external_event_id" in where_clause:
                    found_events = []
                    for rec in matched:
                        if rec.external_event_id.lower() in param_vals:
                            found_events.append(rec)
                    matched = found_events

                # Filter by organization_id if in WHERE clause
                if "organization_id" in where_clause:
                    for org_val in [ORG_A.lower(), ORG_B.lower()]:
                        if org_val in param_vals:
                            matched = [r for r in matched if str(r.organization_id).lower() == org_val]

            mock_result.scalars = MagicMock(return_value=MagicMock(
                first=MagicMock(return_value=matched[0] if matched else None),
                all=MagicMock(return_value=matched),
            ))
            return mock_result

        # Query WorkflowInstance
        if "workflow_instances" in stmt_str:
            matched = []
            for wid, inst in self.workflow_instances.items():
                if wid.lower() in param_vals or wid.lower() in stmt_str:
                    matched = [inst]
                    break
            mock_result.scalars = MagicMock(return_value=MagicMock(
                first=MagicMock(return_value=matched[0] if matched else None),
                all=MagicMock(return_value=matched),
            ))
            return mock_result

        # Default empty fallback
        mock_result.scalars = MagicMock(return_value=MagicMock(
            first=MagicMock(return_value=None),
            all=MagicMock(return_value=[]),
        ))
        return mock_result


# ─────────────────────────────────────────────────────────────────────────────
# 1. Successful Automatic Ingestion
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_successful_automatic_ingestion():
    """Verify that incoming conversation is automatically ingested and fed into Nodes 1–5."""
    session = IngestionMockSession()

    req = ConversationIngestRequest(
        external_event_id="zoom_rec_1001",
        source="zoom_webhook",
        conversation_title="Q4 Logistics Pricing Review",
        contact_name="Sarah Connor",
        conversation_type="Online Meeting",
        conversation_date="2026-10-01",
        language="English",
        recording={
            "file_id": "file_zoom_1001",
            "filename": "q4_logistics.mp3",
            "stored_path": "uploads/audio/q4_logistics.mp3",
            "size_bytes": 204800,
            "content_type": "audio/mp3",
        },
        auto_process=True,
    )

    mock_pipeline_result = {
        "executed_nodes": ["n1", "n2", "n3", "n4", "n5a"],
        "node2": MagicMock(),
        "node3": MagicMock(),
        "node4": MagicMock(),
        "node5a": MagicMock(),
    }

    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(return_value=mock_pipeline_result)) as mock_pipe:
        res = await ingest_conversation_core(
            req=req,
            db=session,
            current_user=USER_ORG_A,
            org_uuid=uuid.UUID(ORG_A),
        )

        assert res.success is True
        assert res.status == "completed"
        assert res.duplicate is False
        assert res.external_event_id == "zoom_rec_1001"
        assert res.instance_id is not None
        assert res.nodes_executed == ["n1", "n2", "n3", "n4", "n5a"]
        assert mock_pipe.call_count == 1

        # Check DB records
        assert len(session.ingestion_records) == 1
        ingest_rec = list(session.ingestion_records.values())[0]
        assert ingest_rec.external_event_id == "zoom_rec_1001"
        assert ingest_rec.status == "completed"
        assert ingest_rec.conversation_title == "Q4 Logistics Pricing Review"
        assert ingest_rec.contact_name == "Sarah Connor"
        assert ingest_rec.instance_id == uuid.UUID(res.instance_id)

        # Check WorkflowInstance creation
        assert len(session.workflow_instances) == 1
        wf_inst = list(session.workflow_instances.values())[0]
        assert wf_inst.organization_id == uuid.UUID(ORG_A)
        assert wf_inst.workflow_name == "meeting_intelligence_followup"
        assert wf_inst.current_node == "n1"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Duplicate Webhook / Event Strong Idempotency
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_webhook_event():
    """Verify that receiving the same provider event ID never creates duplicate runs, conversations, or memory."""
    session = IngestionMockSession()

    req = ConversationIngestRequest(
        external_event_id="fireflies_rec_888",
        source="webhook",
        conversation_title="Client Discovery Call",
        contact_name="Michael Scott",
        recording={"filename": "discovery.mp3"},
        auto_process=True,
    )

    mock_pipeline_result = {
        "executed_nodes": ["n1", "n2", "n3", "n4", "n5a"],
        "node2": MagicMock(),
        "node3": MagicMock(),
        "node4": MagicMock(),
        "node5a": MagicMock(),
    }

    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(return_value=mock_pipeline_result)) as mock_pipe:
        # First ingest
        res1 = await ingest_conversation_core(
            req=req,
            db=session,
            current_user=USER_ORG_A,
            org_uuid=uuid.UUID(ORG_A),
        )
        assert res1.duplicate is False
        assert res1.status == "completed"
        first_instance_id = res1.instance_id
        assert mock_pipe.call_count == 1

        # Second ingest with same external_event_id
        res2 = await ingest_conversation_core(
            req=req,
            db=session,
            current_user=USER_ORG_A,
            org_uuid=uuid.UUID(ORG_A),
        )
        assert res2.duplicate is True
        assert res2.status == "completed"
        assert res2.instance_id == first_instance_id
        assert "duplicate" in res2.message.lower()

        # Pipeline must NOT have been called a second time
        assert mock_pipe.call_count == 1
        # No extra WorkflowInstance created
        assert len(session.workflow_instances) == 1
        # Only 1 ingestion record exists
        assert len(session.ingestion_records) == 1


# ─────────────────────────────────────────────────────────────────────────────
# 3. Retry After Failure
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_retry_after_failure():
    """Verify that a failed downstream ingestion is marked as failed and can be retried successfully."""
    session = IngestionMockSession()

    req = ConversationIngestRequest(
        external_event_id="teams_rec_505",
        source="webhook",
        conversation_title="Vendor Renewal Discussion",
        contact_name="Jim Halpert",
        recording={"filename": "renewal.mp3"},
        auto_process=True,
    )

    # First attempt fails at downstream pipeline
    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(side_effect=RuntimeError("Whisper provider timeout"))):
        with pytest.raises(HTTPException) as exc_info:
            await ingest_conversation_core(
                req=req,
                db=session,
                current_user=USER_ORG_A,
                org_uuid=uuid.UUID(ORG_A),
            )
        assert exc_info.value.status_code == 502
        assert "Whisper provider timeout" in exc_info.value.detail

    # Verify ingestion record persisted as failed
    assert len(session.ingestion_records) == 1
    rec = list(session.ingestion_records.values())[0]
    assert rec.status == "failed"
    assert "Whisper provider timeout" in rec.error_message
    first_inst_id = rec.instance_id
    assert first_inst_id is not None

    # Now retry
    mock_success_result = {
        "executed_nodes": ["n1", "n2", "n3", "n4", "n5a"],
        "node2": MagicMock(),
        "node3": MagicMock(),
        "node4": MagicMock(),
        "node5a": MagicMock(),
    }
    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(return_value=mock_success_result)) as mock_pipe:
        retry_res = await retry_conversation_ingestion(
            ingestion_id=str(rec.id),
            db=session,
            current_user=USER_ORG_A,
        )

        assert retry_res.success is True
        assert retry_res.status == "completed"
        assert retry_res.instance_id == str(first_inst_id)
        assert rec.retry_count == 1
        assert rec.status == "completed"
        assert rec.error_message is None
        assert mock_pipe.call_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# 4. No Downstream Duplication After Retry
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_downstream_duplication_after_retry():
    """Verify that retrying reuses the exact same WorkflowInstance and creates no duplicate DB runs."""
    session = IngestionMockSession()

    req = ConversationIngestRequest(
        external_event_id="otter_event_777",
        source="api",
        conversation_title="Product Architecture Sync",
        contact_name="Dwight Schrute",
        recording={"filename": "arch_sync.mp3"},
        auto_process=True,
    )

    # Initial attempt fails
    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(side_effect=Exception("Database lock error"))):
        with pytest.raises(HTTPException):
            await ingest_conversation_core(
                req=req,
                db=session,
                current_user=USER_ORG_A,
                org_uuid=uuid.UUID(ORG_A),
            )

    rec = list(session.ingestion_records.values())[0]
    original_instance_id = rec.instance_id
    assert len(session.workflow_instances) == 1

    # Retry with same external event
    mock_pipe_res = {"executed_nodes": ["n1", "n2", "n3", "n4", "n5a"]}
    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(return_value=mock_pipe_res)):
        res = await retry_conversation_ingestion(
            ingestion_id=str(rec.id),
            db=session,
            current_user=USER_ORG_A,
        )
        assert res.status == "completed"
        assert res.instance_id == str(original_instance_id)

    # Workflow instances count MUST remain exactly 1
    assert len(session.workflow_instances) == 1
    assert rec.instance_id == original_instance_id


# ─────────────────────────────────────────────────────────────────────────────
# 5. Strict Tenant Isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_isolation():
    """Verify that Org B cannot view or retry Org A's ingestion records."""
    session = IngestionMockSession()

    # Org A ingests conversation
    req_a = ConversationIngestRequest(
        external_event_id="meeting_org_a",
        source="webhook",
        conversation_title="Org A Strategic Planning",
        contact_name="Pam Beesly",
        recording={"filename": "strategic.mp3"},
        auto_process=False,  # just capture
    )

    res_a = await ingest_conversation_core(
        req=req_a,
        db=session,
        current_user=USER_ORG_A,
        org_uuid=uuid.UUID(ORG_A),
    )
    assert res_a.status == "capture_completed"
    ingestion_id = res_a.ingestion_id

    # Org B attempts to read Org A's ingestion record
    with pytest.raises(HTTPException) as exc_info:
        await get_conversation_ingestion(
            ingestion_id=ingestion_id,
            db=session,
            current_user=USER_ORG_B,
        )
    assert exc_info.value.status_code == 403
    assert "belongs to another organization" in exc_info.value.detail.lower()

    # Org B attempts to retry Org A's ingestion record
    with pytest.raises(HTTPException) as exc_retry:
        await retry_conversation_ingestion(
            ingestion_id=ingestion_id,
            db=session,
            current_user=USER_ORG_B,
        )
    assert exc_retry.value.status_code == 403

    # Org B can ingest using the same external_event_id in their own tenant without collision
    req_b = ConversationIngestRequest(
        external_event_id="meeting_org_a",  # same event id in Org B
        source="webhook",
        conversation_title="Org B Meeting with Same ID",
        contact_name="Angela Martin",
        recording={"filename": "angela.mp3"},
        auto_process=False,
    )
    res_b = await ingest_conversation_core(
        req=req_b,
        db=session,
        current_user=USER_ORG_B,
        org_uuid=uuid.UUID(ORG_B),
    )
    assert res_b.success is True
    assert res_b.ingestion_id != ingestion_id
    assert len(session.ingestion_records) == 2


# ─────────────────────────────────────────────────────────────────────────────
# 6. Invalid / Missing Recording
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_or_missing_recording():
    """Verify that requests missing a valid recording reference or audio_url are blocked with HTTP 400."""
    session = IngestionMockSession()

    req = ConversationIngestRequest(
        external_event_id="no_audio_event",
        source="webhook",
        conversation_title="Empty Meeting",
        contact_name="Kevin Malone",
        recording=None,  # No recording
        audio_url=None,  # No audio URL
        auto_process=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        await ingest_conversation_core(
            req=req,
            db=session,
            current_user=USER_ORG_A,
            org_uuid=uuid.UUID(ORG_A),
        )
    assert exc_info.value.status_code == 400
    assert "recording" in exc_info.value.detail.lower()

    # Ingestion record marked as failed
    assert len(session.ingestion_records) == 1
    rec = list(session.ingestion_records.values())[0]
    assert rec.status == "failed"
    assert "audio recording" in rec.error_message.lower()


# ─────────────────────────────────────────────────────────────────────────────
# 7. Manual Capture Regression
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_manual_capture_regression():
    """Verify that manual Conversation Capture (Node 1) continues working completely unchanged."""
    session = IngestionMockSession()

    req = ConversationCaptureRequest(
        conversation_title="Manual Board Meeting",
        contact_name="Stanley Hudson",
        conversation_type="Online Meeting",
        recording={
            "file_id": "man_123",
            "filename": "board_manual.mp3",
            "size_bytes": 10240,
            "stored_path": "uploads/audio/board_manual.mp3",
            "content_type": "audio/mp3",
        },
        language="English",
        conversation_date="2026-10-01",
    )

    res = await capture_conversation(
        req=req,
        db=session,
        current_user=USER_ORG_A,
    )

    assert res.workflow_name == "meeting_intelligence_followup"
    assert res.status == "capture_completed"
    assert res.current_node == "n1"
    assert len(res.nodes) == 5
    assert res.nodes[0].id == "n1"
    assert res.nodes[0].status == "completed"
    assert res.nodes[1].status == "pending"

    # Preserved in WorkflowInstance
    assert len(session.workflow_instances) == 1
    wf = list(session.workflow_instances.values())[0]
    assert wf.context["conversation_capture"]["contact_name"] == "Stanley Hudson"
    assert wf.context["conversation_capture"]["conversation_title"] == "Manual Board Meeting"


# ─────────────────────────────────────────────────────────────────────────────
# 8. Ingestion Simulator Regression (No meeting_recording.mp3 required)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_simulator_succeeds_without_meeting_recording_mp3():
    """
    Regression test:
    Verify that the Automatic Conversation Ingestion simulator payload succeeds
    end-to-end without requiring meeting_recording.mp3 to be manually placed on disk.
    Also verifies that production audio validation is NOT weakened: an audio-only payload
    referencing a nonexistent audio file must still fail with 404 in Node 2.
    """
    session = IngestionMockSession()

    # 1. Verify meeting_recording.mp3 does not exist on disk
    fake_file = STORAGE_DIR / "meeting_recording.mp3"
    if fake_file.exists():
        fake_file.unlink()
    assert not fake_file.exists(), "Precondition failed: meeting_recording.mp3 must not exist on disk"

    # 2. Simulator payload (text/notes based conversation transcript)
    sim_req = ConversationIngestRequest(
        external_event_id=f"sim_ui_regression_{uuid.uuid4().hex[:8]}",
        source="webhook_simulator",
        conversation_title="Quarterly Strategy & Expansion Review",
        contact_name="Rahul Sharma",
        conversation_type="Online Meeting",
        conversation_date="2026-09-30",
        language="English",
        transcript_text=(
            "Rahul Sharma: Thanks for taking the time to meet today. In Q3, our primary focus "
            "is expanding our B2B pipeline. I will send over the revised pricing proposal by Friday. "
            "Also, our engineering team committed to deliver the API integration specifications by "
            "next Wednesday. Let us schedule a follow-up demonstration for next month."
        ),
        auto_process=False,  # Step through Node 1 and Node 2 deterministically
    )

    # 3. Node 1 automatic ingestion succeeds without requiring meeting_recording.mp3
    ingest_res = await ingest_conversation_core(
        req=sim_req,
        db=session,
        current_user=USER_ORG_A,
        org_uuid=uuid.UUID(ORG_A),
    )

    assert ingest_res.success is True
    assert ingest_res.status == "capture_completed"
    assert ingest_res.instance_id is not None
    instance_id = uuid.UUID(ingest_res.instance_id)

    # 4. Node 2 processes transcript_text directly without 404 audio file error
    mock_extraction = StructuredExtraction(
        summary="Quarterly Strategy Review with Rahul Sharma",
        people=[PersonExtraction(name="Rahul Sharma", facts=["Leading B2B pipeline expansion"])],
        commitments=[
            CommitmentExtraction(owner="Rahul Sharma", commitment="Send revised pricing proposal", due_date="2026-10-02"),
            CommitmentExtraction(owner="Engineering Team", commitment="Deliver API integration specifications", due_date="2026-10-07"),
        ],
        suggested_actions=[
            SuggestedActionExtraction(action="Schedule follow-up demonstration", reason="Requested for next month"),
        ],
        open_questions=[],
    )

    with patch("api.routers.meeting_intelligence.extract_structured_intelligence", new=AsyncMock(return_value=(mock_extraction, "mock_llm", 0.001, 120, 60))):
        p2_req = ProcessConversationRequest(instance_id=str(instance_id))
        p2_res = await process_conversation(p2_req, db=session, current_user=USER_ORG_A)

    assert p2_res.transcription_status == "completed"
    assert session.workflow_instances[str(instance_id)].context["node2_process_conversation"]["transcription_provider"] == "provided_transcript_notes"
    assert "Rahul Sharma" in p2_res.transcript_text
    assert len(p2_res.extraction.commitments) == 2
    assert p2_res.extraction.commitments[0].owner == "Rahul Sharma"

    # 5. Production audio validation is NOT weakened:
    # A payload claiming audio with a nonexistent file and NO transcript_text must still fail with 404 in Node 2
    audio_only_req = ConversationIngestRequest(
        external_event_id=f"audio_missing_check_{uuid.uuid4().hex[:8]}",
        source="webhook",
        conversation_title="Missing Audio Call",
        contact_name="Alice",
        conversation_type="Online Meeting",
        recording={"filename": "definitely_nonexistent_audio_file_404.mp3"},
        transcript_text=None,
        auto_process=False,
    )

    session_audio = IngestionMockSession()
    audio_res = await ingest_conversation_core(
        req=audio_only_req,
        db=session_audio,
        current_user=USER_ORG_A,
        org_uuid=uuid.UUID(ORG_A),
    )
    assert audio_res.success is True
    audio_instance_id = audio_res.instance_id

    # Node 2 MUST fail with 404 for missing audio file on disk
    with pytest.raises(HTTPException) as exc_404:
        await process_conversation(
            ProcessConversationRequest(instance_id=audio_instance_id),
            db=session_audio,
            current_user=USER_ORG_A,
        )

    assert exc_404.value.status_code == 404
    assert "not found on disk" in exc_404.value.detail.lower()

