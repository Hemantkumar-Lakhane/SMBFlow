"""
tests/test_meeting_intelligence_node5b.py
==========================================
Automated test suite for Meeting Intelligence & Follow-up:
NODE 5B â€” Meeting Prep Brief + Private Calendar Prep Block

Tests (21 total):
 1.  Meeting Prep generated from Central Memory.
 2.  Contact history correctly used.
 3.  Recent conversation included in brief.
 4.  Our commitments remain separate from contact commitments.
 5.  Contact commitments remain separate from our commitments.
 6.  AI suggestions are explicitly labelled "AI Suggested â€” Not Previously Agreed".
 7.  Missing contact fields are not hallucinated (role/company stay None if unknown).
 8.  Missing upcoming meeting does not fabricate one (400 if no meeting payload).
 9.  Correct 30-minute prep calculation (prep_end = meeting_start, prep_start = meeting_start - 30min).
10.  Timezone preserved correctly (UTC-aware output).
11.  Disconnected calendar stores intended block but makes NO external call.
12.  Connected calendar creates one PRIVATE prep event.
13.  Repeat execution with same meeting creates zero duplicates (idempotent).
14.  Reschedule updates existing prep event instead of creating another.
15.  Cancellation deactivates prep block and removes Google Calendar event.
16.  Conflict detection produces conflict_review_required and no overlapping event.
17.  Cross-tenant access rejected (HTTP 403).
18.  Rehydration (GET /runs/{id}) restores Node 5B state.
19.  Node 5 remains PARTIAL when calendar connection required.
20.  Node 5 becomes COMPLETED only when prep block is scheduled + 5A exists.
21.  Existing Node 5A (followup_email_draft) remains unchanged after Node 5B runs.
"""

import json
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from api.auth import TokenData
from api.routers.meeting_intelligence import (
    MeetingPrepRequest,
    MeetingPrepRescheduleRequest,
    MeetingPrepCancelRequest,
    UpcomingMeetingInput,
    process_meeting_prep,
    reschedule_meeting_prep,
    cancel_meeting_prep,
    get_workflow_run_detail,
    _parse_meeting_dt,
    _calculate_prep_block,
    _to_iso,
    _build_prep_identity,
    _compute_n5_status,
    _generate_meeting_prep_brief,
)
from db.models.core import (
    AgentRunRecord,
    ApprovalItem,
    AuditEvent,
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
    ToolConnection,
    WorkflowInstance,
)

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Constants
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ORG_A = str(uuid.uuid4())
ORG_B = str(uuid.uuid4())

USER_ORG_A = TokenData(
    user_id=str(uuid.uuid4()),
    email="alice@company-a.com",
    role="org_admin",
    organization_id=ORG_A,
    tenant_id=ORG_A,
)

USER_ORG_B = TokenData(
    user_id=str(uuid.uuid4()),
    email="bob@company-b.com",
    role="org_admin",
    organization_id=ORG_B,
    tenant_id=ORG_B,
)

# Upcoming meeting: 2026-10-05 15:00 â†’ 16:00 UTC
MEETING_START = "2026-10-05T15:00:00Z"
MEETING_END   = "2026-10-05T16:00:00Z"
MEETING_TZ    = "UTC"
MEETING_TITLE = "Q4 Strategy Review"

# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Mock Session
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class Node5BMockSession:
    """Minimal async DB session mock for Node 5B tests."""

    def __init__(self):
        self.workflow_instances: dict = {}
        self.contacts: dict = {}
        self.conversations: dict = {}
        self.memory_items: list = []
        self.approval_items: dict = {}
        self.tool_connections: dict = {}
        self.agent_runs: list = []
        self.audit_events: list = []

    def add(self, obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, WorkflowInstance):
            self.workflow_instances[str(obj.id)] = obj
        elif isinstance(obj, RelationshipContact):
            self.contacts[str(obj.id)] = obj
        elif isinstance(obj, RelationshipConversation):
            self.conversations[str(obj.id)] = obj
        elif isinstance(obj, RelationshipMemoryItem):
            self.memory_items.append(obj)
        elif isinstance(obj, ApprovalItem):
            self.approval_items[str(obj.id)] = obj
        elif isinstance(obj, ToolConnection):
            self.tool_connections[str(obj.id)] = obj
        elif isinstance(obj, AgentRunRecord):
            self.agent_runs.append(obj)
        elif isinstance(obj, AuditEvent):
            self.audit_events.append(obj)

    async def flush(self): pass
    async def commit(self): pass
    async def refresh(self, obj): pass

    async def execute(self, stmt):
        stmt_str = str(stmt).lower()
        try:
            params = stmt.compile().params
        except Exception:
            params = {}
        param_vals = [str(v).lower() for v in params.values() if v is not None]

        mock_result = MagicMock()

        # WorkflowInstance
        if "workflow_instances" in stmt_str:
            matched = list(self.workflow_instances.values())
            for wid, inst in self.workflow_instances.items():
                if wid.lower() in param_vals:
                    matched = [inst]
                    break
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # RelationshipContact
        if "relationship_contacts" in stmt_str:
            matched = list(self.contacts.values())
            for cid, c in self.contacts.items():
                if cid.lower() in param_vals:
                    matched = [c]
                    break
                if c.normalized_name and c.normalized_name in param_vals:
                    matched = [c]
                    break
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # RelationshipConversation
        if "relationship_conversations" in stmt_str:
            matched = list(self.conversations.values())
            for cid, c in self.conversations.items():
                if cid.lower() in param_vals:
                    matched = [c]
                    break
                if hasattr(c, "workflow_instance_id") and str(c.workflow_instance_id).lower() in param_vals:
                    matched = [c]
                    break
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # RelationshipMemoryItem
        if "relationship_memory_items" in stmt_str:
            matched = list(self.memory_items)
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # ApprovalItem
        if "approval_items" in stmt_str:
            matched = list(self.approval_items.values())
            for av in param_vals:
                filtered = [a for a in matched if str(a.instance_id).lower() == av or str(a.id).lower() == av]
                if filtered:
                    matched = filtered
                    break
            if "followup_email_draft" in stmt_str or "followup_email_draft" in param_vals:
                matched = [a for a in matched if a.review_type == "followup_email_draft"]
            if "node_id" in stmt_str and '"n4"' in stmt_str:
                matched = [a for a in matched if a.node_id == "n4"]
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # ToolConnection
        if "tool_connections" in stmt_str:
            matched = list(self.tool_connections.values())
            for tc in matched:
                if any(name in param_vals for name in [tc.tool_name, tc.tool_name.lower()]):
                    matched = [tc]
                    break
            mock_result.scalars = lambda: MagicMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        mock_result.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])
        return mock_result


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Test run builder
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _build_node5b_test_run(
    org_id: str,
    contact_name: str = "Rahul Sharma",
    contact_role: str = "VP of Operations",
    contact_company: str = "Apex Logistics",
    with_draft: bool = True,
    with_tool_connection: bool = False,
    tool_connected: bool = False,
):
    """Build a fully-prepped mock session with Nodes 1â€“4 completed."""
    session = Node5BMockSession()
    inst_id = uuid.uuid4()
    org_uuid = uuid.UUID(org_id)
    contact_id = uuid.uuid4()
    conv_id = uuid.uuid4()

    contact = RelationshipContact(
        id=contact_id,
        organization_id=org_uuid,
        name=contact_name,
        normalized_name=contact_name.strip().lower(),
        role=contact_role,
        company=contact_company,
        metadata_={"email": "rahul@apexlogistics.com"},
        created_at=datetime.utcnow(),
    )
    session.add(contact)

    conv = RelationshipConversation(
        id=conv_id,
        organization_id=org_uuid,
        contact_id=contact_id,
        workflow_instance_id=inst_id,
        title="AI Pilot Action Planning with Rahul Sharma",
        conversation_type="sales_discovery",
        conversation_date="2026-09-27",
        transcript="Speaker: I will send the pilot proposal by Friday.",
        summary="Discussion on AI customer support automation pilot.",
        created_at=datetime.utcnow(),
    )
    session.add(conv)

    # Memory items
    for cat, content, is_ai in [
        ("fact",    "Rahul manages a 40-person logistics team",     False),
        ("interest","AI-powered customer support automation",       False),
        ("need",    "Reduce average query resolution time",         False),
        ("opportunity", "Pilot expansion across 3 warehouses",     False),
        ("suggested_action", "Prepare demo with logistics use-case", True),
    ]:
        session.add(RelationshipMemoryItem(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            contact_id=contact_id,
            conversation_id=conv_id,
            workflow_instance_id=inst_id,
            category=cat,
            content=content,
            details={},
            source_date="2026-09-27",
            is_ai_generated=is_ai,
        ))

    our_cmt_id = uuid.uuid4()
    contact_cmt_id = uuid.uuid4()
    ai_sugg_id = uuid.uuid4()

    # Node 4 ApprovalItems
    session.add(ApprovalItem(
        id=our_cmt_id,
        organization_id=org_uuid,
        instance_id=inst_id,
        node_id="n4",
        review_type="meeting_action",
        reason="Send Rahul the pilot proposal",
        context_brief="Our commitment",
        status="pending",
        payload={
            "action_type": "our_commitment",
            "action": "Send Rahul the pilot proposal",
            "owner_type": "internal",
            "owner_display": "You / Internal",
            "due_date": "2026-10-02",
            "due_date_display": "Oct 2, 2026",
        },
        created_at=datetime.utcnow(),
    ))
    session.add(ApprovalItem(
        id=contact_cmt_id,
        organization_id=org_uuid,
        instance_id=inst_id,
        node_id="n4",
        review_type="meeting_action",
        reason="Share customer queries list",
        context_brief="Contact commitment",
        status="waiting",
        payload={
            "action_type": "contact_commitment",
            "action": "Share list of common customer queries",
            "owner_type": "contact",
            "owner_display": contact_name,
            "due_date": "2026-10-01",
            "due_date_display": "Oct 1, 2026",
        },
        created_at=datetime.utcnow(),
    ))
    session.add(ApprovalItem(
        id=ai_sugg_id,
        organization_id=org_uuid,
        instance_id=inst_id,
        node_id="n4",
        review_type="meeting_action",
        reason="Prepare evaluation criteria for query list",
        context_brief="AI suggestion",
        status="suggested",
        payload={
            "action_type": "ai_suggestion",
            "action": "Prepare evaluation criteria for query list",
            "reason": "Accelerates review once queries arrive",
        },
        created_at=datetime.utcnow(),
    ))

    # Optional Node 5A draft
    if with_draft:
        session.add(ApprovalItem(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            instance_id=inst_id,
            node_id="n5",
            review_type="followup_email_draft",
            reason="Follow-up draft for Rahul",
            context_brief="Draft",
            status="awaiting_review",
            payload={
                "subject": "Follow-up: AI Pilot Next Steps",
                "body": "Hi Rahul, ...",
                "recipient_name": contact_name,
                "recipient_email": None,
                "our_commitments_count": 1,
                "contact_commitments_count": 1,
            },
            created_at=datetime.utcnow(),
        ))

    # Optional ToolConnection
    if with_tool_connection:
        session.add(ToolConnection(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            tool_name="google_workspace",
            display_name="Google Workspace",
            status="connected" if tool_connected else "not_connected",
            encrypted_credentials=b"mock_encrypted" if tool_connected else None,
            config={},
            created_at=datetime.utcnow(),
        ))

    ctx = {
        "conversation_capture": {
            "contact_name": contact_name,
            "conversation_title": "AI Pilot Action Planning with Rahul Sharma",
            "conversation_date": "2026-09-27",
            "conversation_type": "Online Meeting",
        },
        "node2_process_conversation": {
            "status": "completed",
            "transcript_text": conv.transcript,
            "extraction": {
                "summary": conv.summary,
                "commitments": [
                    {"owner": "Speaker", "commitment": "Send Rahul the pilot proposal", "due_date": "2026-10-02"},
                    {"owner": "Rahul", "commitment": "Share list of common customer queries", "due_date": "2026-10-01"},
                ],
                "suggested_actions": [
                    {"action": "Prepare evaluation criteria", "reason": "Accelerates review"}
                ],
                "open_questions": ["What is the target response latency?"],
            },
        },
        "node3_central_memory": {
            "status": "completed",
            "contact_id": str(contact_id),
            "contact_name": contact_name,
            "conversation_id": str(conv_id),
        },
        "node4_action_generator": {
            "status": "completed",
            "our_commitments": [{"action": "Send Rahul the pilot proposal", "due_date": "2026-10-02", "due_date_display": "Oct 2, 2026"}],
            "contact_commitments": [{"action": "Share list of common customer queries", "due_date": "2026-10-01", "due_date_display": "Oct 1, 2026"}],
            "ai_suggestions": [{"action": "Prepare evaluation criteria", "reason": "Accelerates review"}],
            "open_questions": [{"question": "What is the target response latency?"}],
        },
    }

    instance = WorkflowInstance(
        id=inst_id,
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="processed",
        current_node="n5",
        context=ctx,
        started_at=datetime.utcnow(),
    )
    session.add(instance)

    return session, inst_id, contact_id, conv_id


def _make_meeting_req(instance_id, source_event_id=None):
    return MeetingPrepRequest(
        instance_id=str(instance_id),
        meeting=UpcomingMeetingInput(
            title=MEETING_TITLE,
            start=MEETING_START,
            end=MEETING_END,
            timezone=MEETING_TZ,
            source_event_id=source_event_id,
        ),
    )


# =============================================================================
# HELPER UNIT TESTS
# =============================================================================

def test_prep_block_calculation():
    """Test 9: prep_end = meeting_start, prep_start = meeting_start - 30min."""
    meeting_start = datetime(2026, 10, 5, 15, 0, 0, tzinfo=timezone.utc)
    meeting_end   = datetime(2026, 10, 5, 16, 0, 0, tzinfo=timezone.utc)

    prep_start, prep_end = _calculate_prep_block(meeting_start, meeting_end, "UTC")

    assert prep_end == meeting_start, "prep_end must equal meeting_start"
    assert prep_start == datetime(2026, 10, 5, 14, 30, 0, tzinfo=timezone.utc), \
        "prep_start must be 30 minutes before meeting_start"
    assert (prep_end - prep_start) == timedelta(minutes=30), "Prep block must be exactly 30 minutes"


def test_timezone_preservation():
    """Test 10: Timezone-aware input is preserved correctly in UTC output."""
    # +05:30 offset â†’ UTC: 15:00+05:30 = 09:30 UTC
    dt_str = "2026-10-05T15:00:00+05:30"
    dt_utc = _parse_meeting_dt(dt_str, "Asia/Kolkata")
    assert dt_utc.tzinfo is not None
    assert dt_utc.hour == 9
    assert dt_utc.minute == 30


def test_to_iso_format():
    """Verify _to_iso produces a valid ISO 8601 Z-suffix string."""
    dt = datetime(2026, 10, 5, 14, 30, 0, tzinfo=timezone.utc)
    result = _to_iso(dt)
    assert result == "2026-10-05T14:30:00Z"


def test_prep_identity_with_source_event():
    """Idempotency key includes source event ID when present."""
    org = uuid.uuid4()
    inst = uuid.uuid4()
    key = _build_prep_identity(org, inst, "google_ev_abc123", "2026-10-05T15:00:00Z")
    assert "google_ev_abc123" in key
    assert str(org) in key


def test_prep_identity_without_source_event():
    """Idempotency key uses org+instance+start when no source event ID."""
    org = uuid.uuid4()
    inst = uuid.uuid4()
    key = _build_prep_identity(org, inst, None, "2026-10-05T15:00:00Z")
    assert str(org) in key
    assert str(inst) in key
    assert "20261005" in key


def test_compute_n5_status_completed():
    """Node 5 â†’ completed when draft exists AND prep block is scheduled."""
    status, note = _compute_n5_status("awaiting_review", "scheduled")
    assert status == "completed"
    assert "Private Prep Block Scheduled" in note


def test_compute_n5_status_partial_no_prep():
    """Node 5 â†’ partial when draft exists but prep block not yet done."""
    status, note = _compute_n5_status("awaiting_review", None)
    assert status == "partial"
    assert "Pending" in note


def test_compute_n5_status_partial_calendar_required():
    """Node 5 â†’ partial when calendar connection required."""
    status, note = _compute_n5_status("awaiting_review", "calendar_connection_required")
    assert status == "partial"
    assert "Calendar Connection Required" in note


def test_compute_n5_status_partial_conflict():
    """Node 5 â†’ partial when conflict requires review."""
    status, note = _compute_n5_status("approved", "conflict_review_required")
    assert status == "partial"
    assert "Conflict" in note


def test_compute_n5_status_partial_cancelled():
    """Node 5 â†’ partial when prep block is cancelled."""
    status, note = _compute_n5_status("awaiting_review", "cancelled")
    assert status == "partial"


# =============================================================================
# INTEGRATION TESTS (async)
# =============================================================================

@pytest.mark.asyncio
async def test_meeting_prep_generated_from_central_memory():
    """Test 1: Meeting Prep Brief generated from stored Central Memory."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", new=AsyncMock(
        return_value=(
            json.dumps([{"topic": "Discuss Q4 expansion plan", "rationale": "Based on pilot success"}]),
            MagicMock(model="gpt-4o-mini", cost_usd=0.001, tokens_in=100, tokens_out=50),
        )
    )):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.brief is not None
    assert resp.brief.contact_name == "Rahul Sharma"
    assert resp.idempotent_reused is False


@pytest.mark.asyncio
async def test_contact_history_used():
    """Test 2: Brief includes correct conversation count and last conversation date."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", new=AsyncMock(
        side_effect=Exception("LLM offline")
    )):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.brief.total_conversations >= 1
    assert resp.brief.last_conversation_date == "2026-09-27"


@pytest.mark.asyncio
async def test_recent_conversation_included():
    """Test 3: Brief includes recent conversation title, date, and summary."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("LLM offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.brief.recent_conversation_title == "AI Pilot Action Planning with Rahul Sharma"
    assert resp.brief.recent_conversation_date == "2026-09-27"
    assert resp.brief.recent_conversation_summary is not None


@pytest.mark.asyncio
async def test_our_commitments_separate():
    """Test 4: our_outstanding_commitments contains OUR actions, not contact's."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    our_actions = [c.get("action") if isinstance(c, dict) else str(c) for c in resp.brief.our_outstanding_commitments]
    contact_actions = [c.get("action") if isinstance(c, dict) else str(c) for c in resp.brief.waiting_on_contact]

    # "Send Rahul" belongs to our side
    assert any("Send Rahul" in (a or "") or "pilot proposal" in (a or "") for a in our_actions), \
        "Our commitment 'Send Rahul the pilot proposal' should be in our_outstanding_commitments"
    # "Share list" belongs to contact's side
    assert not any("Share list" in (a or "") for a in our_actions), \
        "Contact's commitment should NOT appear in our_outstanding_commitments"


@pytest.mark.asyncio
async def test_contact_commitments_separate():
    """Test 5: waiting_on_contact contains contact's actions, not ours."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    contact_actions = [c.get("action") if isinstance(c, dict) else str(c) for c in resp.brief.waiting_on_contact]

    assert any("customer queries" in (a or "").lower() or "Share list" in (a or "") for a in contact_actions), \
        "Contact commitment should appear in waiting_on_contact"
    assert not any("pilot proposal" in (a or "").lower() for a in contact_actions), \
        "Our commitment should NOT appear in waiting_on_contact"


@pytest.mark.asyncio
async def test_ai_suggestions_explicitly_labelled():
    """Test 6: AI suggested topics are labelled 'AI Suggested â€” Not Previously Agreed'."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    # Force deterministic fallback so we control what appears
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    for topic in resp.brief.ai_suggested_topics:
        label = topic.get("label") or ""
        assert "AI Suggested" in label and "Not Previously Agreed" in label, \
            f"Topic label must contain 'AI Suggested' and 'Not Previously Agreed', got: {label!r}"


@pytest.mark.asyncio
async def test_missing_contact_fields_not_hallucinated():
    """Test 7: role/company stay None when not stored in DB â€” never fabricated."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A,
        contact_role="",
        contact_company="",
    )
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.brief.contact_role is None, "Role must be None when not stored, not hallucinated"
    assert resp.brief.contact_company is None, "Company must be None when not stored, not hallucinated"


@pytest.mark.asyncio
async def test_missing_upcoming_meeting_raises_400():
    """Test 8: Calling endpoint without meeting payload raises HTTP 400."""
    with pytest.raises(Exception):  # Pydantic ValidationError on missing required field
        MeetingPrepRequest(instance_id=str(uuid.uuid4()))  # 'meeting' field is required


@pytest.mark.asyncio
async def test_prep_block_calculation_endpoint():
    """Test 9 (integration): Endpoint correctly calculates 14:30â†’15:00 prep block for 15:00â†’16:00 meeting."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.prep_block.prep_end == "2026-10-05T15:00:00Z", \
        f"prep_end must equal meeting_start, got: {resp.prep_block.prep_end}"
    assert resp.prep_block.prep_start == "2026-10-05T14:30:00Z", \
        f"prep_start must be 30 min before meeting_start, got: {resp.prep_block.prep_start}"


@pytest.mark.asyncio
async def test_timezone_preserved_in_endpoint():
    """Test 10: Timezone offset in input is correctly preserved in UTC output."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)

    # Meeting at 17:00+02:00 = 15:00 UTC â†’ prep at 14:30 UTC
    req = MeetingPrepRequest(
        instance_id=str(inst_id),
        meeting=UpcomingMeetingInput(
            title="Strategy Call",
            start="2026-10-05T17:00:00+02:00",
            end="2026-10-05T18:00:00+02:00",
            timezone="Europe/Berlin",
        ),
    )

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    assert resp.prep_block.prep_end == "2026-10-05T15:00:00Z"
    assert resp.prep_block.prep_start == "2026-10-05T14:30:00Z"


@pytest.mark.asyncio
async def test_disconnected_calendar_no_external_call():
    """Test 11: No calendar connection â†’ stores intent, makes ZERO external API calls."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A, with_tool_connection=False)
    req = _make_meeting_req(inst_id)

    mock_connector_instance = MagicMock()
    mock_connector_instance.schedule_event = AsyncMock()
    mock_connector_class = MagicMock(return_value=mock_connector_instance)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", mock_connector_class):
            resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    # No external calendar call made — connector never instantiated when no ToolConnection
    mock_connector_class.assert_not_called()
    mock_connector_instance.schedule_event.assert_not_called()

    assert resp.prep_block.status == "calendar_connection_required"
    assert resp.prep_block.google_event_id is None

    # Intent stored in context
    inst = session.workflow_instances[str(inst_id)]
    assert inst.context.get("node5b_meeting_prep") is not None
    assert inst.context["node5b_meeting_prep"]["status"] == "calendar_connection_required"


@pytest.mark.asyncio
async def test_connected_calendar_creates_private_prep_event():
    """Test 12: Connected calendar â†’ creates ONE private Google Calendar event."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A, with_tool_connection=True, tool_connected=True
    )
    req = _make_meeting_req(inst_id)

    mock_connector = MagicMock()
    mock_connector.schedule_event = AsyncMock(return_value={"id": "goog_evt_001", "status": "confirmed"})
    mock_connector.update_event = AsyncMock(return_value={"id": "goog_evt_001"})
    mock_connector.read = AsyncMock(return_value=[])  # no conflicts
    mock_connector.close = AsyncMock()

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        with patch("api.routers.meeting_intelligence.decrypt_credentials", return_value={}):
            with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", return_value=mock_connector):
                resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    mock_connector.schedule_event.assert_called_once()
    # Visibility patch should have been called with "private"
    update_calls = mock_connector.update_event.call_args_list
    assert any(call.kwargs.get("visibility") == "private" or (call.args and "private" in call.args) for call in update_calls), \
        "update_event must be called with visibility='private'"

    assert resp.prep_block.status == "scheduled"
    assert resp.prep_block.google_event_id == "goog_evt_001"

    # Node 5 should now be completed (5A draft + 5B scheduled)
    n5_node = next(n for n in resp.nodes if n.id == "n5")
    assert n5_node.status == "completed"


@pytest.mark.asyncio
async def test_idempotency_no_duplicates():
    """Test 13: Calling /meeting-prep twice with same meeting â†’ zero duplicates, idempotent=True."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp1 = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)
        assert resp1.idempotent_reused is False

        # Second call â€” same instance_id, same meeting
        resp2 = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)
        assert resp2.idempotent_reused is True

    # Agent run records: only 1 (from first call)
    n5b_runs = [r for r in session.agent_runs if r.node_id == "n5b"]
    assert len(n5b_runs) == 1, "Only ONE AgentRunRecord should be created across duplicate calls"


@pytest.mark.asyncio
async def test_reschedule_updates_existing_event():
    """Test 14: Reschedule updates existing Google Calendar event, does not create new one."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A, with_tool_connection=True, tool_connected=True
    )

    # Inject existing prep state (as if already scheduled)
    inst = list(session.workflow_instances.values())[0]
    inst.context = {
        **inst.context,
        "node5b_meeting_prep": {
            "prep_identity": "prep:org=test:src_event=src_ev_001",
            "status": "scheduled",
            "google_event_id": "goog_evt_original",
            "meeting_title": MEETING_TITLE,
            "meeting_start": "2026-10-05T15:00:00Z",
            "meeting_end": "2026-10-05T16:00:00Z",
            "prep_start": "2026-10-05T14:30:00Z",
            "prep_end": "2026-10-05T15:00:00Z",
            "timezone": "UTC",
            "event_title": f"Prep: {MEETING_TITLE}",
            "brief": {"contact_name": "Rahul Sharma", "total_conversations": 1,
                      "relationship_snapshot": {}, "our_outstanding_commitments": [],
                      "waiting_on_contact": [], "open_questions": [], "ai_suggested_topics": [],
                      "model_used": "rehydrated"},
        }
    }

    reschedule_req = MeetingPrepRescheduleRequest(
        instance_id=str(inst_id),
        meeting=UpcomingMeetingInput(
            title=MEETING_TITLE,
            start="2026-10-05T16:00:00Z",  # Meeting moved 1 hour later
            end="2026-10-05T17:00:00Z",
            timezone="UTC",
            source_event_id="src_ev_001",
        ),
    )

    mock_connector = MagicMock()
    mock_connector.update_event = AsyncMock(return_value={"id": "goog_evt_original"})
    mock_connector.schedule_event = AsyncMock()
    mock_connector.close = AsyncMock()

    with patch("api.routers.meeting_intelligence.decrypt_credentials", return_value={}):
        with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", return_value=mock_connector):
            resp = await reschedule_meeting_prep(reschedule_req, db=session, current_user=USER_ORG_A)

    # Must UPDATE existing event, NOT create a new one
    mock_connector.update_event.assert_called_once()
    mock_connector.schedule_event.assert_not_called()

    assert resp.prep_block.prep_end == "2026-10-05T16:00:00Z", "prep_end must equal new meeting_start"
    assert resp.prep_block.prep_start == "2026-10-05T15:30:00Z", "prep_start must be 30min before new meeting_start"
    assert resp.prep_block.google_event_id == "goog_evt_original", "Must reuse the same Google event ID"


@pytest.mark.asyncio
async def test_cancellation_removes_prep_block():
    """Test 15: Cancellation sets status=cancelled and deletes Google Calendar event."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A, with_tool_connection=True, tool_connected=True
    )

    inst = list(session.workflow_instances.values())[0]
    inst.context = {
        **inst.context,
        "node5b_meeting_prep": {
            "prep_identity": "prep:org=test:inst=abc",
            "status": "scheduled",
            "google_event_id": "goog_evt_to_delete",
            "meeting_title": MEETING_TITLE,
            "meeting_start": "2026-10-05T15:00:00Z",
            "meeting_end": "2026-10-05T16:00:00Z",
            "prep_start": "2026-10-05T14:30:00Z",
            "prep_end": "2026-10-05T15:00:00Z",
            "timezone": "UTC",
            "event_title": f"Prep: {MEETING_TITLE}",
            "brief": {},
        }
    }

    mock_connector = MagicMock()
    mock_connector.delete_event = AsyncMock(return_value=True)
    mock_connector.close = AsyncMock()

    cancel_req = MeetingPrepCancelRequest(
        instance_id=str(inst_id),
        reason="Meeting cancelled by client",
    )

    with patch("api.routers.meeting_intelligence.decrypt_credentials", return_value={}):
        with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", return_value=mock_connector):
            resp = await cancel_meeting_prep(cancel_req, db=session, current_user=USER_ORG_A)

    mock_connector.delete_event.assert_called_once_with(event_id="goog_evt_to_delete")
    assert resp.status == "cancelled"

    inst_after = session.workflow_instances[str(inst_id)]
    assert inst_after.context["node5b_meeting_prep"]["status"] == "cancelled"
    assert inst_after.context["node5b_meeting_prep"]["calendar_event_deleted"] is True

    # Relationship memory must be untouched
    assert len(session.memory_items) > 0, "Relationship memory must be preserved after cancellation"


@pytest.mark.asyncio
async def test_conflict_detection_no_auto_schedule():
    """Test 16: Conflict in prep window â†’ status=conflict_review_required, NO prep event created."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A, with_tool_connection=True, tool_connected=True
    )
    req = _make_meeting_req(inst_id)

    # Conflicting event overlaps with 14:30â€“15:00 prep window
    conflicting_event = {
        "id": "conflict_ev_999",
        "summary": "Team Standup",
        "start": {"dateTime": "2026-10-05T14:45:00Z"},
        "end":   {"dateTime": "2026-10-05T15:00:00Z"},
    }

    mock_connector = MagicMock()
    mock_connector.read = AsyncMock(return_value=[conflicting_event])
    mock_connector.schedule_event = AsyncMock()
    mock_connector.close = AsyncMock()

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        with patch("api.routers.meeting_intelligence.decrypt_credentials", return_value={}):
            with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", return_value=mock_connector):
                resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    # MUST NOT create the prep event when conflict exists
    mock_connector.schedule_event.assert_not_called()

    assert resp.prep_block.status == "conflict_review_required"
    assert resp.prep_block.google_event_id is None
    assert resp.prep_block.conflict_metadata is not None
    assert len(resp.prep_block.conflict_metadata["conflicting_events"]) == 1
    assert resp.prep_block.conflict_metadata["conflicting_events"][0]["event_id"] == "conflict_ev_999"

    # Node 5 must be PARTIAL (conflict requires review)
    n5_node = next(n for n in resp.nodes if n.id == "n5")
    assert n5_node.status == "partial"
    assert "Conflict" in n5_node.note


@pytest.mark.asyncio
async def test_cross_tenant_rejected():
    """Test 17: User from Org B cannot access Org A's workflow run (HTTP 403)."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)
    req = _make_meeting_req(inst_id)

    with pytest.raises(HTTPException) as exc_info:
        with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
            await process_meeting_prep(req, db=session, current_user=USER_ORG_B)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_rehydration_restores_node5b_state():
    """Test 18: GET /runs/{id} rehydrates Node 5B from context."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A)

    # Inject existing Node 5B state
    inst = list(session.workflow_instances.values())[0]
    inst.context = {
        **inst.context,
        "node5b_meeting_prep": {
            "prep_identity": "prep:org=test:inst=abc",
            "status": "scheduled",
            "google_event_id": "goog_evt_rehydrate",
            "meeting_title": MEETING_TITLE,
            "meeting_start": "2026-10-05T15:00:00Z",
            "meeting_end": "2026-10-05T16:00:00Z",
            "prep_start": "2026-10-05T14:30:00Z",
            "prep_end": "2026-10-05T15:00:00Z",
            "timezone": "UTC",
            "event_title": f"Prep: {MEETING_TITLE}",
            "brief": {
                "contact_name": "Rahul Sharma",
                "total_conversations": 1,
                "relationship_snapshot": {},
                "our_outstanding_commitments": [],
                "waiting_on_contact": [],
                "open_questions": [],
                "ai_suggested_topics": [],
                "model_used": "gpt-4o-mini",
            },
        }
    }

    resp = await get_workflow_run_detail(
        instance_id=str(inst_id),
        db=session,
        current_user=USER_ORG_A,
    )

    assert resp.meeting_prep is not None
    assert resp.meeting_prep["status"] == "scheduled"
    assert resp.meeting_prep["google_event_id"] == "goog_evt_rehydrate"
    assert resp.meeting_prep["meeting_title"] == MEETING_TITLE


@pytest.mark.asyncio
async def test_node5_partial_when_calendar_required():
    """Test 19: Node 5 remains PARTIAL when calendar is disconnected."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A, with_tool_connection=False)
    req = _make_meeting_req(inst_id)

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    n5_node = next(n for n in resp.nodes if n.id == "n5")
    assert n5_node.status == "partial"
    assert "Calendar Connection Required" in n5_node.note


@pytest.mark.asyncio
async def test_node5_completed_when_scheduled():
    """Test 20: Node 5 becomes COMPLETED when draft exists AND prep block is scheduled."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(
        ORG_A, with_draft=True, with_tool_connection=True, tool_connected=True
    )
    req = _make_meeting_req(inst_id)

    mock_connector = MagicMock()
    mock_connector.read = AsyncMock(return_value=[])  # no conflicts
    mock_connector.schedule_event = AsyncMock(return_value={"id": "goog_evt_done"})
    mock_connector.update_event = AsyncMock(return_value={"id": "goog_evt_done"})
    mock_connector.close = AsyncMock()

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        with patch("api.routers.meeting_intelligence.decrypt_credentials", return_value={}):
            with patch("api.routers.meeting_intelligence.GoogleWorkspaceConnector", return_value=mock_connector):
                resp = await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    n5_node = next(n for n in resp.nodes if n.id == "n5")
    assert n5_node.status == "completed", \
        f"Node 5 must be COMPLETED when draft exists and prep block is scheduled, got: {n5_node.status}"
    assert "Private Prep Block Scheduled" in n5_node.note


@pytest.mark.asyncio
async def test_node5a_unchanged_after_node5b():
    """Test 21: Existing Node 5A follow-up draft is untouched after Node 5B runs."""
    session, inst_id, contact_id, conv_id = _build_node5b_test_run(ORG_A, with_draft=True)
    req = _make_meeting_req(inst_id)

    # Record draft state before Node 5B
    draft_before = [a for a in session.approval_items.values() if a.review_type == "followup_email_draft"]
    assert len(draft_before) == 1
    original_draft_id = str(draft_before[0].id)
    original_subject = draft_before[0].payload.get("subject")

    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("offline")):
        await process_meeting_prep(req, db=session, current_user=USER_ORG_A)

    # Draft must be unchanged
    draft_after = [a for a in session.approval_items.values() if a.review_type == "followup_email_draft"]
    assert len(draft_after) == 1, "No new followup_email_draft items should be created by Node 5B"
    assert str(draft_after[0].id) == original_draft_id, "Original draft ID must be unchanged"
    assert draft_after[0].payload.get("subject") == original_subject, "Draft subject must be unchanged"
    assert draft_after[0].status == "awaiting_review", "Draft status must be unchanged"

