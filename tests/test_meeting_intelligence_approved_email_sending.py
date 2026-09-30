"""
tests/test_meeting_intelligence_approved_email_sending.py
==========================================================
Comprehensive test suite for Meeting Intelligence Approved Follow-up Email Sending:
1. No send before explicit approval (draft generation, edit, snooze, discard).
2. Successful approved send (GmailConnector, message ID, timestamp, sent status).
3. Missing recipient blocks sending without fabricating emails.
4. Disconnected Google Workspace returns connection_required without crashing or sending.
5. Provider/API failure keeps draft retryable and unsent.
6. Double-click/retry idempotency returns existing sent result without second dispatch.
7. Sent-state persistence & rehydration after simulated page refresh (GET /runs/{instance_id}).
8. Strict organization/tenant isolation (Org B cannot approve or access Org A's connection).
"""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    FollowupDraftActionRequest,
    FollowupDraftRequest,
    generate_followup_draft,
    get_meeting_intelligence_run,
    handle_followup_draft_action,
)
from db.models.core import (
    AgentRunRecord,
    ApprovalItem,
    AuditEvent,
    RelationshipContact,
    RelationshipConversation,
    ToolConnection,
    WorkflowInstance,
)
from integrations.key_vault import encrypt_credentials

# ─────────────────────────────────────────────────────────────────────────────
# Test Fixtures & Mock Session
# ─────────────────────────────────────────────────────────────────────────────

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


class ApprovedSendMockSession:
    """In-memory async database session for approved email sending tests."""

    def __init__(self):
        self.workflow_instances = {}
        self.contacts = {}
        self.conversations = {}
        self.approval_items = {}
        self.tool_connections = {}
        self.audit_events = []
        self.agent_runs = []

    def add(self, obj):
        if not hasattr(obj, "id") or not obj.id:
            obj.id = uuid.uuid4()

        if isinstance(obj, WorkflowInstance):
            self.workflow_instances[str(obj.id)] = obj
        elif isinstance(obj, RelationshipContact):
            self.contacts[str(obj.id)] = obj
        elif isinstance(obj, RelationshipConversation):
            self.conversations[str(obj.id)] = obj
        elif isinstance(obj, ApprovalItem):
            self.approval_items[str(obj.id)] = obj
        elif isinstance(obj, ToolConnection):
            self.tool_connections[str(obj.id)] = obj
        elif isinstance(obj, AuditEvent):
            self.audit_events.append(obj)
        elif isinstance(obj, AgentRunRecord):
            self.agent_runs.append(obj)

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

        # Query WorkflowInstance
        if "workflow_instances" in stmt_str:
            matched = list(self.workflow_instances.values())
            for wid, inst in self.workflow_instances.items():
                if wid.lower() in param_vals or wid.lower() in stmt_str:
                    matched = [inst]
                    break
            mock_result.scalars = lambda: AsyncMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # Query RelationshipContact
        if "relationship_contacts" in stmt_str:
            matched = list(self.contacts.values())
            for cid, c in self.contacts.items():
                if cid.lower() in param_vals or cid.lower() in stmt_str:
                    matched = [c]
                    break
            mock_result.scalars = lambda: AsyncMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # Query RelationshipConversation
        if "relationship_conversations" in stmt_str:
            matched = []
            for conv in self.conversations.values():
                if str(conv.workflow_instance_id).lower() in param_vals or str(conv.workflow_instance_id).lower() in stmt_str:
                    matched.append(conv)
                elif str(conv.id).lower() in param_vals or str(conv.id).lower() in stmt_str:
                    matched.append(conv)
                elif not params:
                    matched.append(conv)
            matched.sort(key=lambda x: getattr(x, "created_at", datetime.min) or datetime.min, reverse=True)
            mock_result.scalars = lambda: AsyncMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # Query ApprovalItem
        if "approval_items" in stmt_str:
            matched = []
            for appr in self.approval_items.values():
                if str(appr.id).lower() in param_vals or str(appr.id).lower() in stmt_str:
                    matched.append(appr)
                elif str(appr.instance_id).lower() in param_vals or str(appr.instance_id).lower() in stmt_str:
                    matched.append(appr)
                elif not params:
                    matched.append(appr)

            if "followup_email_draft" in param_vals or "followup_email_draft" in stmt_str:
                matched = [a for a in matched if a.review_type == "followup_email_draft"]

            mock_result.scalars = lambda: AsyncMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        # Query ToolConnection
        if "tool_connections" in stmt_str:
            matched = []
            for tc in self.tool_connections.values():
                # Filter by organization_id
                if any(str(tc.organization_id).lower() in p for p in param_vals) or str(tc.organization_id).lower() in stmt_str:
                    if tc.status == "connected":
                        matched.append(tc)
                elif not params and tc.status == "connected":
                    matched.append(tc)

            # Preference for 'gmail' over 'google_workspace'
            matched.sort(key=lambda x: 0 if x.tool_name == "gmail" else 1)
            mock_result.scalars = lambda: AsyncMock(
                first=lambda: matched[0] if matched else None,
                all=lambda: matched,
            )
            return mock_result

        mock_result.scalars = lambda: AsyncMock(first=lambda: None, all=lambda: [])
        return mock_result


def _build_test_run(
    org_id: str,
    contact_name: str = "Priya Mehta",
    contact_email: str = "priya@acme-corp.com",
    connected_tools: bool = True,
):
    """Helper to set up mock session with completed Nodes 1-4 and optional connected Gmail."""
    session = ApprovedSendMockSession()
    inst_id = uuid.uuid4()
    org_uuid = uuid.UUID(org_id)
    contact_id = uuid.uuid4()
    conv_id = uuid.uuid4()

    # Contact
    contact = RelationshipContact(
        id=contact_id,
        organization_id=org_uuid,
        name=contact_name,
        normalized_name=contact_name.strip().lower(),
        role="Head of Operations",
        company="Acme Corp",
        metadata_={"email": contact_email} if contact_email else {},
        created_at=datetime.utcnow(),
    )
    session.add(contact)

    # Conversation
    conv = RelationshipConversation(
        id=conv_id,
        organization_id=org_uuid,
        contact_id=contact_id,
        workflow_instance_id=inst_id,
        title=f"AI Workflow Assessment with {contact_name}",
        conversation_type="client_meeting",
        conversation_date="2026-09-28",
        transcript="We agreed to send the technical demo outline by Thursday.",
        summary="Discussion on workflow automation and timeline agreement.",
        created_at=datetime.utcnow(),
    )
    session.add(conv)

    # WorkflowInstance context
    w_inst = WorkflowInstance(
        id=inst_id,
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        current_node="n4",
        status="in_progress",
        trigger_payload={
            "contact_name": contact_name,
            "contact_email": contact_email,
            "conversation_title": f"Meeting with {contact_name}",
        },
        context={
            "conversation_capture": {
                "contact_name": contact_name,
                "contact_email": contact_email,
                "conversation_title": f"Meeting with {contact_name}",
            },
            "node2_process_conversation": {
                "transcription": {"text": "Agreed to follow up on the demo."},
                "extraction": {"summary": "Agreed to follow up on the demo."},
            },
            "node3_central_memory": {
                "contact_id": str(contact_id),
                "contact_name": contact_name,
            },
            "node4_action_generator": {
                "our_commitments": [
                    {
                        "action_id": str(uuid.uuid4()),
                        "action": "Send technical demo outline by Thursday",
                        "owner_type": "internal",
                        "owner_display": "You / Internal",
                        "due_date": "2026-10-01",
                        "status": "pending",
                    }
                ],
                "contact_commitments": [],
                "ai_suggestions": [],
                "open_questions": [],
            },
        },
        started_at=datetime.utcnow(),
    )
    session.add(w_inst)

    # Node 4 ApprovalItem
    n4_item = ApprovalItem(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        instance_id=inst_id,
        node_id="n4",
        review_type="action_item",
        reason="Send technical demo outline",
        context_brief="Follow-up commitment",
        payload={"action_type": "our_commitment", "action": "Send technical demo outline"},
        status="approved",
    )
    session.add(n4_item)

    # Optional Gmail ToolConnection
    if connected_tools:
        encrypted_creds = encrypt_credentials({
            "access_token": "ya29.mock_access_token_123",
            "refresh_token": "mock_refresh_token_456",
            "client_id": "mock_client_id.apps.googleusercontent.com",
            "client_secret": "mock_client_secret_xyz",
        })
        tool_conn = ToolConnection(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            tool_name="gmail",
            display_name="Gmail / Email",
            status="connected",
            encrypted_credentials=encrypted_creds,
            config={"sender_alias": "team@smbflow.io", "sender_name": "SMBFlow Team"},
            created_at=datetime.utcnow(),
        )
        session.add(tool_conn)

    return session, inst_id, contact_id, conv_id


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: No Send Before Approval
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_send_before_approval():
    """Verify follow-up draft generation, editing, snoozing, and discarding NEVER send email."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=True)

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        # 1. Draft generation must NEVER send automatically
        gen_req = FollowupDraftRequest(instance_id=str(inst_id))
        with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
            gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)

        draft_id = gen_resp.draft.approval_id
        assert gen_resp.status == "awaiting_review"
        assert gen_resp.draft.status == "awaiting_review"
        assert mock_send.call_count == 0

        # 2. Edit draft must NOT send email
        edit_req = FollowupDraftActionRequest(action="edit", subject="Updated Subject Line", body="Updated body content")
        edit_resp = await handle_followup_draft_action(draft_id=draft_id, req=edit_req, db=session, current_user=USER_ORG_A)
        assert edit_resp.status == "awaiting_review"
        assert mock_send.call_count == 0

        # 3. Snooze draft must NOT send email
        snooze_req = FollowupDraftActionRequest(action="snooze", snoozed_until="Tomorrow 9am")
        snooze_resp = await handle_followup_draft_action(draft_id=draft_id, req=snooze_req, db=session, current_user=USER_ORG_A)
        assert snooze_resp.status == "snoozed"
        assert mock_send.call_count == 0

        # 4. Discard draft must NOT send email
        discard_req = FollowupDraftActionRequest(action="discard")
        discard_resp = await handle_followup_draft_action(draft_id=draft_id, req=discard_req, db=session, current_user=USER_ORG_A)
        assert discard_resp.status == "discarded"
        assert mock_send.call_count == 0

        # Verify zero send audit events
        send_audits = [e for e in session.audit_events if e.action == "followup_draft_sent"]
        assert len(send_audits) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Successful Approved Send
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_successful_approved_send():
    """Verify approving a draft with connected Gmail dispatches email, persists metadata, and records audit."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=True)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id

    mock_send_return = {"id": "1893f4a2b91c8901", "threadId": "1893f4a2b91c8901", "labelIds": ["SENT"]}

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = mock_send_return

        action_req = FollowupDraftActionRequest(action="approve", notes="Looks great, sending to Priya.")
        action_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=action_req,
            db=session,
            current_user=USER_ORG_A,
        )

        # 1. Verify connector invocation
        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args.kwargs
        assert call_kwargs["to"] == "priya@acme-corp.com"
        assert "demo" in call_kwargs["subject"].lower() or len(call_kwargs["subject"]) > 0
        assert len(call_kwargs["body"]) > 0

        # 2. Verify response model
        assert action_resp.status == "sent"
        assert action_resp.sent is True
        assert action_resp.provider_message_id == "1893f4a2b91c8901"
        assert action_resp.draft.status == "sent"
        assert action_resp.draft.provider_message_id == "1893f4a2b91c8901"
        assert action_resp.draft.sent_to == "priya@acme-corp.com"
        assert action_resp.draft.sent_at is not None
        assert "successfully sent" in action_resp.message.lower()

        # 3. Verify PostgreSQL ApprovalItem persistence
        appr = session.approval_items[draft_id]
        assert appr.status == "sent"
        assert appr.payload["status"] == "sent"
        assert appr.payload["provider_message_id"] == "1893f4a2b91c8901"
        assert appr.payload["sent_to"] == "priya@acme-corp.com"
        assert appr.payload["sent_at"] is not None

        # 4. Verify WorkflowInstance context synchronization
        w_inst = session.workflow_instances[str(inst_id)]
        n5_ctx = w_inst.context.get("node5_followup_draft")
        assert n5_ctx["status"] == "sent"
        assert n5_ctx["provider_message_id"] == "1893f4a2b91c8901"
        assert n5_ctx["sent_to"] == "priya@acme-corp.com"

        # 5. Verify AuditEvent
        sent_audits = [e for e in session.audit_events if e.action == "followup_draft_sent"]
        assert len(sent_audits) == 1
        assert sent_audits[0].metadata_["email_sent"] is True
        assert sent_audits[0].metadata_["provider_message_id"] == "1893f4a2b91c8901"


# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Missing Recipient Blocks Sending
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_recipient_blocks_send():
    """Verify approving without a valid recipient email is strictly blocked with a clear reason."""
    # Set up run with contact_email=None
    session, inst_id, contact_id, conv_id = _build_test_run(
        ORG_A,
        contact_name="Unknown Prospect",
        contact_email=None,
        connected_tools=True,
    )

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id
    assert gen_resp.draft.recipient_email is None

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        # Attempt to approve without providing recipient email
        action_req = FollowupDraftActionRequest(action="approve")
        with pytest.raises(HTTPException) as exc_info:
            await handle_followup_draft_action(
                draft_id=draft_id,
                req=action_req,
                db=session,
                current_user=USER_ORG_A,
            )

        assert exc_info.value.status_code == 400
        assert "recipient email address is missing" in exc_info.value.detail.lower()

        # Connector was NEVER called
        assert mock_send.call_count == 0

        # Draft remains unsent
        appr = session.approval_items[draft_id]
        assert appr.status != "sent"
        assert appr.payload.get("status") != "sent"

        # Now approve with explicit valid recipient email provided
        action_req_resolved = FollowupDraftActionRequest(
            action="approve",
            recipient_email="prospect@targetcorp.com",
        )
        mock_send.return_value = {"id": "msg_resolved_123"}
        resolved_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=action_req_resolved,
            db=session,
            current_user=USER_ORG_A,
        )

        assert resolved_resp.status == "sent"
        assert resolved_resp.draft.sent_to == "prospect@targetcorp.com"
        assert mock_send.call_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Disconnected Google Workspace
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_disconnected_google_workspace():
    """Verify approving when Google Workspace is disconnected returns connection_required without crashing."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=False)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        action_req = FollowupDraftActionRequest(action="approve")
        action_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=action_req,
            db=session,
            current_user=USER_ORG_A,
        )

        # 1. Did not crash and returned connection-required state
        assert action_resp.status == "connection_required"
        assert action_resp.sent is False
        assert action_resp.connection_status == "connection_required"
        assert action_resp.draft.status == "connection_required"
        assert "not connected" in action_resp.message.lower()

        # 2. Never called external email API
        assert mock_send.call_count == 0

        # 3. ApprovalItem persisted connection_required state
        appr = session.approval_items[draft_id]
        assert appr.status == "connection_required"
        assert appr.payload["connection_status"] == "connection_required"

        # 4. Zero sent audit events
        sent_audits = [e for e in session.audit_events if e.action == "followup_draft_sent"]
        assert len(sent_audits) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Provider Failure Keeps Draft Retryable
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_provider_failure_keeps_draft_retryable():
    """Verify provider/API failure does not mark draft as sent and leaves it safely retryable."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=True)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id

    # 1. Google API returns 503 error
    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = RuntimeError("Google Workspace API HTTP 503: Backend Error")

        action_req = FollowupDraftActionRequest(action="approve")
        with pytest.raises(HTTPException) as exc_info:
            await handle_followup_draft_action(
                draft_id=draft_id,
                req=action_req,
                db=session,
                current_user=USER_ORG_A,
            )

        assert exc_info.value.status_code == 502
        assert "email dispatch failed" in exc_info.value.detail.lower()

        # Draft is NOT marked as sent
        appr = session.approval_items[draft_id]
        assert appr.status != "sent"
        assert appr.payload.get("status") != "sent"
        assert "503" in appr.payload.get("last_send_error", "")

    # 2. Retry succeeds
    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send_retry:
        mock_send_retry.return_value = {"id": "msg_retry_success_456"}

        retry_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=FollowupDraftActionRequest(action="approve"),
            db=session,
            current_user=USER_ORG_A,
        )

        assert retry_resp.status == "sent"
        assert retry_resp.provider_message_id == "msg_retry_success_456"
        assert session.approval_items[draft_id].status == "sent"


# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Double-Click / Retry Idempotency
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_double_click_retry_idempotency():
    """Verify repeated approve clicks / retries return existing sent result without duplicate sending."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=True)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id

    mock_send_return = {"id": "first_send_msg_id_999"}

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = mock_send_return

        # Click 1: Approve & Send
        first_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=FollowupDraftActionRequest(action="approve"),
            db=session,
            current_user=USER_ORG_A,
        )
        assert first_resp.status == "sent"
        assert first_resp.provider_message_id == "first_send_msg_id_999"
        assert mock_send.call_count == 1

        # Click 2: Repeated Approve (Double Click or Network Retry)
        second_resp = await handle_followup_draft_action(
            draft_id=draft_id,
            req=FollowupDraftActionRequest(action="approve"),
            db=session,
            current_user=USER_ORG_A,
        )
        # Must return the existing sent result idempotently
        assert second_resp.status == "sent"
        assert second_resp.provider_message_id == "first_send_msg_id_999"
        assert "already been sent" in second_resp.message.lower()

        # Connector was strictly NOT called a second time
        assert mock_send.call_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# Test 7: Sent-State Persistence & Rehydration
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sent_state_persistence_and_rehydration():
    """Verify sent status, provider message ID, and sent timestamp survive and rehydrate in GET /runs/{instance_id}."""
    session, inst_id, contact_id, conv_id = _build_test_run(ORG_A, connected_tools=True)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session, current_user=USER_ORG_A)
    draft_id = gen_resp.draft.approval_id

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"id": "msg_persistent_rehydrate_777"}
        await handle_followup_draft_action(
            draft_id=draft_id,
            req=FollowupDraftActionRequest(action="approve"),
            db=session,
            current_user=USER_ORG_A,
        )

    # Simulate page refresh / fetching run detail
    run_detail = await get_meeting_intelligence_run(
        instance_id=str(inst_id),
        db=session,
        current_user=USER_ORG_A,
    )

    assert run_detail.followup_draft is not None
    assert run_detail.followup_draft.status == "sent"
    assert run_detail.followup_draft.provider_message_id == "msg_persistent_rehydrate_777"
    assert run_detail.followup_draft.sent_to == "priya@acme-corp.com"
    assert run_detail.followup_draft.sent_at is not None

    # Check Node 5 note reflects sent status
    n5_node = next((n for n in run_detail.nodes if n.id == "n5"), None)
    assert n5_node is not None
    assert "Follow-up Email Sent" in n5_node.note


# ─────────────────────────────────────────────────────────────────────────────
# Test 8: Tenant Isolation Enforced
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_isolation_enforced():
    """Verify Org B cannot approve or trigger sending on Org A's drafts, and cannot access Org A's Gmail connection."""
    # Org A has run and ToolConnection
    session_a, inst_id_a, contact_id_a, conv_id_a = _build_test_run(ORG_A, connected_tools=True)

    gen_req = FollowupDraftRequest(instance_id=str(inst_id_a))
    with patch("api.routers.meeting_intelligence.LLMRouter.call", side_effect=Exception("deterministic fallback")):
        gen_resp = await generate_followup_draft(gen_req, db=session_a, current_user=USER_ORG_A)
    draft_id_a = gen_resp.draft.approval_id

    with patch("integrations.connectors.GmailConnector.send_email", new_callable=AsyncMock) as mock_send:
        # Org B attempts to approve Org A's draft -> 403 Forbidden
        with pytest.raises(HTTPException) as exc_info:
            await handle_followup_draft_action(
                draft_id=draft_id_a,
                req=FollowupDraftActionRequest(action="approve"),
                db=session_a,
                current_user=USER_ORG_B,
            )

        assert exc_info.value.status_code == 403
        assert "access denied" in exc_info.value.detail.lower()
        assert mock_send.call_count == 0
