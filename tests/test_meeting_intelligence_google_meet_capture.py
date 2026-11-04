"""
tests/test_meeting_intelligence_google_meet_capture.py
======================================================
Comprehensive test suite for Meeting Intelligence Hands-Free Google Meet Capture:
1. Valid Google Meet URL validation.
2. Invalid meeting URL rejection (HTTP 400).
3. Recall bot creation & persistence in ConversationIngestionRecord.
4. Recall API failure handling (HTTP 502).
5. Webhook authenticity verification failure (HTTP 401).
6. Successful transcript delivery -> existing automatic ingestion pipeline (Nodes 1-5).
7. Duplicate webhook delivery -> strict idempotency (no duplicate pipeline runs).
8. Strict tenant isolation (cross-organization access rejected with HTTP 403).
9. Capture disabled / not configured handling (HTTP 400).
"""

import base64
import hashlib
import hmac
import json
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    GoogleMeetCaptureRequest,
    GoogleMeetCaptureResponse,
    GoogleMeetStatusResponse,
    capture_google_meet,
    get_google_meet_status,
    recall_webhook_handler,
    validate_google_meet_url,
    verify_recall_webhook_signature,
    extract_recall_transcript_text,
    _resolve_recall_connector,
    _resolve_recall_webhook_secret,
)
from db.models.core import (
    ConversationIngestionRecord,
    ToolConnection,
    WorkflowInstance,
)
from integrations.connectors import RecallAIConnector
from integrations.key_vault import encrypt_credentials

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures & Mock Session
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


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Ensure tests run in clean isolation from developer's local .env secrets."""
    monkeypatch.delenv("RECALL_WEBHOOK_SECRET", raising=False)



class MeetMockSession:
    """In-memory async database session for Google Meet capture tests."""

    def __init__(self):
        self.ingestion_records = {}
        self.tool_connections = {}
        self.workflow_instances = {}

    def add(self, obj):
        if not hasattr(obj, "id") or not obj.id:
            obj.id = uuid.uuid4()

        if isinstance(obj, ConversationIngestionRecord):
            self.ingestion_records[str(obj.id)] = obj
        elif isinstance(obj, ToolConnection):
            self.tool_connections[str(obj.id)] = obj
        elif isinstance(obj, WorkflowInstance):
            self.workflow_instances[str(obj.id)] = obj

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

        # Query ToolConnection
        if "tool_connections" in stmt_str:
            matched = list(self.tool_connections.values())
            where_clause = stmt_str.split("where")[-1] if "where" in stmt_str else ""
            if "organization_id" in where_clause:
                for org_val in [ORG_A.lower(), ORG_B.lower()]:
                    if org_val in param_vals:
                        matched = [c for c in matched if str(c.organization_id).lower() == org_val]
            mock_result.scalars = MagicMock(return_value=MagicMock(
                first=MagicMock(return_value=matched[0] if matched else None),
                all=MagicMock(return_value=matched),
            ))
            return mock_result

        # Query ConversationIngestionRecord
        if "conversation_ingestion_records" in stmt_str:
            matched = list(self.ingestion_records.values())

            # 1. Match by Record ID (if UUID in params)
            found_by_id = None
            for rec_id, rec in self.ingestion_records.items():
                if rec_id.lower() in param_vals:
                    found_by_id = rec
                    break

            if found_by_id:
                matched = [found_by_id]
            else:
                where_clause = stmt_str.split("where")[-1] if "where" in stmt_str else ""
                # 2. Match by external_event_id
                if "external_event_id" in where_clause:
                    found_events = []
                    for rec in matched:
                        if rec.external_event_id.lower() in param_vals:
                            found_events.append(rec)
                    matched = found_events

                # Filter by organization_id if present
                if "organization_id" in where_clause:
                    for org_val in [ORG_A.lower(), ORG_B.lower()]:
                        if org_val in param_vals:
                            matched = [r for r in matched if str(r.organization_id).lower() == org_val]

            mock_result.scalars = MagicMock(return_value=MagicMock(
                first=MagicMock(return_value=matched[0] if matched else None),
                all=MagicMock(return_value=matched),
            ))
            return mock_result

        mock_result.scalars = MagicMock(return_value=MagicMock(
            first=MagicMock(return_value=None),
            all=MagicMock(return_value=[]),
        ))
        return mock_result


class MockFastAPIRequest:
    """Mock Request for FastAPI webhook endpoint tests."""

    def __init__(self, body_bytes: bytes, headers: dict = None):
        self._body_bytes = body_bytes
        self.headers = headers or {}

    async def body(self) -> bytes:
        return self._body_bytes


# ─────────────────────────────────────────────────────────────────────────────
# 1. Test Valid Google Meet URL
# ─────────────────────────────────────────────────────────────────────────────

def test_valid_google_meet_urls():
    """Verify that various valid Google Meet URLs pass validation and are normalized."""
    # Standard format
    assert validate_google_meet_url("https://meet.google.com/abc-defg-hij") == "https://meet.google.com/abc-defg-hij"
    # HTTP protocol normalized to HTTPS
    assert validate_google_meet_url("http://meet.google.com/abc-defg-hij") == "https://meet.google.com/abc-defg-hij"
    # Protocol omitted
    assert validate_google_meet_url("meet.google.com/abc-defg-hij") == "https://meet.google.com/abc-defg-hij"
    # With query parameters
    assert validate_google_meet_url("https://meet.google.com/abc-defg-hij?authuser=0&hs=179") == "https://meet.google.com/abc-defg-hij?authuser=0&hs=179"
    # Alphanumeric codes / vanity lookup
    assert validate_google_meet_url("https://meet.google.com/lookup/team-standup") == "https://meet.google.com/lookup/team-standup"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Test Invalid URLs
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("invalid_url", [
    "https://zoom.us/j/123456789",
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
    "https://google.com",
    "https://meet.google.com",
    "https://meet.google.com/",
    "https://meet.google.com/landing",
    "not-a-valid-url",
    "",
    "   ",
])
def test_invalid_urls_rejected(invalid_url):
    """Verify that non-Google Meet or malformed URLs are rejected with HTTP 400."""
    with pytest.raises(HTTPException) as exc_info:
        validate_google_meet_url(invalid_url)
    assert exc_info.value.status_code == 400
    assert "Google Meet" in exc_info.value.detail or "Invalid" in exc_info.value.detail


# ─────────────────────────────────────────────────────────────────────────────
# 3. Test Capture Disabled / Not Configured
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_capture_disabled_not_configured():
    """Verify that capture raises HTTP 400 when RECALL_API_KEY and ToolConnection are absent."""
    session = MeetMockSession()

    with patch.dict("os.environ", {}, clear=True):
        req = GoogleMeetCaptureRequest(
            meeting_url="https://meet.google.com/abc-defg-hij",
            conversation_title="Q4 Strategy Sync",
        )
        with pytest.raises(HTTPException) as exc_info:
            await capture_google_meet(
                req=req,
                db=session,
                current_user=USER_ORG_A,
            )
        assert exc_info.value.status_code == 400
        assert "not configured" in exc_info.value.detail.lower() or "recall_api_key" in exc_info.value.detail.lower()


# ─────────────────────────────────────────────────────────────────────────────
# 4. Test Recall Bot Creation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recall_bot_creation_success():
    """Verify successful Recall.ai bot creation, persistence in ConversationIngestionRecord, and response format."""
    session = MeetMockSession()

    mock_bot_response = {
        "id": "bot_998877",
        "bot_name": "SMBFlow Notetaker",
        "meeting_url": "https://meet.google.com/abc-defg-hij",
        "status_changes": [{"code": "ready"}],
    }

    with patch.dict("os.environ", {"RECALL_API_KEY": "test_recall_key_123"}):
        with patch.object(RecallAIConnector, "create_bot", new=AsyncMock(return_value=mock_bot_response)) as mock_create:
            req = GoogleMeetCaptureRequest(
                meeting_url="https://meet.google.com/abc-defg-hij",
                conversation_title="Client Discovery Call",
                contact_name="Sarah Connor",
            )
            res = await capture_google_meet(
                req=req,
                db=session,
                current_user=USER_ORG_A,
            )

            assert res.success is True
            assert res.bot_id == "bot_998877"
            assert res.external_event_id == "recall_bot_998877"
            assert res.status == "waiting_for_bot"
            assert "scheduled" in res.message.lower() or "recall" in res.message.lower()
            assert res.meeting_url == "https://meet.google.com/abc-defg-hij"

            # Verify persisted record in ConversationIngestionRecord
            saved_record = session.ingestion_records[res.ingestion_id]
            assert str(saved_record.organization_id) == ORG_A
            assert saved_record.external_event_id == "recall_bot_998877"
            assert saved_record.source == "google_meet_recall"
            assert saved_record.status == "waiting_for_bot"
            assert saved_record.contact_name == "Sarah Connor"
            assert saved_record.recording_data["bot_id"] == "bot_998877"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Test Recall API Failure
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recall_api_failure_handled():
    """Verify that failures from the Recall.ai API return HTTP 502 Bad Gateway with diagnostic detail."""
    session = MeetMockSession()

    with patch.dict("os.environ", {"RECALL_API_KEY": "test_recall_key_123"}):
        with patch.object(RecallAIConnector, "create_bot", new=AsyncMock(side_effect=RuntimeError("Recall.ai connection timed out"))):
            req = GoogleMeetCaptureRequest(
                meeting_url="https://meet.google.com/abc-defg-hij",
            )
            with pytest.raises(HTTPException) as exc_info:
                await capture_google_meet(
                    req=req,
                    db=session,
                    current_user=USER_ORG_A,
                )
            assert exc_info.value.status_code == 502
            assert "Recall.ai bot creation failed" in exc_info.value.detail


# ─────────────────────────────────────────────────────────────────────────────
# 6. Test Recall Region Configuration
# ─────────────────────────────────────────────────────────────────────────────

def test_recall_region_and_url_configuration():
    """Verify that RecallAIConnector correctly handles RECALL_REGION and default us-west-2 region."""
    # 1. Default region is us-west-2
    with patch.dict("os.environ", {"RECALL_API_KEY": "test_key"}, clear=True):
        connector_default = RecallAIConnector()
        assert connector_default.region == "us-west-2"
        assert connector_default.base_url == "https://us-west-2.recall.ai/api/v1"

    # 2. Custom region via RECALL_REGION env var
    with patch.dict("os.environ", {"RECALL_API_KEY": "test_key", "RECALL_REGION": "eu-central-1"}, clear=True):
        connector_custom = RecallAIConnector()
        assert connector_custom.region == "eu-central-1"
        assert connector_custom.base_url == "https://eu-central-1.recall.ai/api/v1"

    # 3. Custom region via config dict
    connector_cfg = RecallAIConnector(credentials={"api_key": "test_key"}, config={"region": "ap-northeast-1"})
    assert connector_cfg.region == "ap-northeast-1"
    assert connector_cfg.base_url == "https://ap-northeast-1.recall.ai/api/v1"


TEST_WHSEC = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw="


def make_recall_svix_headers(
    raw_bytes: bytes,
    secret: str = TEST_WHSEC,
    msg_id: str = "msg_test_123",
    timestamp: int = None,
    header_prefix: str = "webhook-",
) -> dict:
    """Helper to generate authentic Svix webhook headers matching Recall.ai specification."""
    import time
    ts = int(time.time()) if timestamp is None else timestamp
    clean_sec = secret.removeprefix("whsec_")
    missing_padding = len(clean_sec) % 4
    if missing_padding:
        clean_sec += "=" * (4 - missing_padding)
    try:
        secret_bytes = base64.b64decode(clean_sec)
    except Exception:
        secret_bytes = clean_sec.encode("utf-8")
    to_sign = f"{msg_id}.{ts}.".encode("utf-8") + raw_bytes
    sig = base64.b64encode(hmac.new(secret_bytes, to_sign, hashlib.sha256).digest()).decode("utf-8")
    return {
        f"{header_prefix}id": msg_id,
        f"{header_prefix}timestamp": str(ts),
        f"{header_prefix}signature": f"v1,{sig}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. Test Webhook Verification (Success & Failure Cases)
# ─────────────────────────────────────────────────────────────────────────────

def test_verify_recall_webhook_signature_official_mechanism():
    """Verify official Recall.ai / Svix HMAC-SHA256 signature verification."""
    secret = TEST_WHSEC
    body = b'{"event":"bot.status_change","data":{"bot_id":"bot_123"}}'

    # Valid webhook-* headers
    headers = make_recall_svix_headers(body, secret=secret, header_prefix="webhook-")
    assert verify_recall_webhook_signature(body, headers, secret) is True

    # Valid svix-* headers
    headers_svix = make_recall_svix_headers(body, secret=secret, header_prefix="svix-")
    assert verify_recall_webhook_signature(body, headers_svix, secret) is True

    # Multi-signature header (secret rotation)
    valid_sig = headers["webhook-signature"]
    rotated_headers = dict(headers)
    rotated_headers["webhook-signature"] = f"v1,old_expired_sig== {valid_sig}"
    assert verify_recall_webhook_signature(body, rotated_headers, secret) is True

    # Tampered body fails
    tampered_body = b'{"event":"bot.status_change","data":{"bot_id":"bot_TAMPERED"}}'
    assert verify_recall_webhook_signature(tampered_body, headers, secret) is False

    # Expired timestamp (> 300s) fails replay protection
    import time
    old_ts = int(time.time()) - 600
    expired_headers = make_recall_svix_headers(body, secret=secret, timestamp=old_ts)
    assert verify_recall_webhook_signature(body, expired_headers, secret, tolerance=300) is False

    # Invented/custom headers are strictly rejected
    invalid_custom_headers = {
        "x-recall-signature": "sha256=abcdef",
        "authorization": "Bearer whsec_supersecretkey123",
    }
    assert verify_recall_webhook_signature(body, invalid_custom_headers, secret) is False


@pytest.mark.asyncio
async def test_webhook_verification_failure():
    """Verify that inbound Recall webhooks with invalid or missing signatures are rejected (HTTP 401)."""
    session = MeetMockSession()

    bot_id = "bot_sec_fail_01"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="waiting_for_bot",
        conversation_title="Security Test Call",
        contact_name="Bob Vance",
        conversation_type="Online Meeting",
        conversation_date="2026-10-01",
        recording_data={"bot_id": bot_id},
    )
    session.add(record)

    webhook_payload = {
        "event": "bot.status_change",
        "data": {
            "bot_id": bot_id,
            "status": {"code": "in_call_recording"},
        },
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")

    with patch.dict("os.environ", {"RECALL_WEBHOOK_SECRET": TEST_WHSEC}):
        # 1. Missing signature headers
        req_missing = MockFastAPIRequest(body_bytes=raw_bytes, headers={})
        with pytest.raises(HTTPException) as exc_info1:
            await recall_webhook_handler(request=req_missing, db=session)
        assert exc_info1.value.status_code == 401

        # 2. Tampered signature header
        req_tampered = MockFastAPIRequest(
            body_bytes=raw_bytes,
            headers={
                "webhook-id": "msg_123",
                "webhook-timestamp": "1690000000",
                "webhook-signature": "v1,invalidbase64signature==",
            },
        )
        with pytest.raises(HTTPException) as exc_info2:
            await recall_webhook_handler(request=req_tampered, db=session)
        assert exc_info2.value.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# 8. Test Official Recall Events: bot.status_change
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recall_webhook_bot_status_change_lifecycle():
    """Verify bot.status_change updates lifecycle states (in_waiting_room, in_call_recording, fatal)."""
    session = MeetMockSession()

    bot_id = "bot_lifecycle_44"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="waiting_for_bot",
        conversation_title="Status Change Call",
        recording_data={"bot_id": bot_id},
    )
    session.add(record)

    # 1. in_waiting_room -> status remains waiting_for_bot
    p1 = {"event": "bot.status_change", "data": {"bot_id": bot_id, "status": {"code": "in_waiting_room"}}}
    res1 = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(p1).encode("utf-8")), db=session)
    assert res1["success"] is True
    assert record.status == "waiting_for_bot"

    # 2. in_call_recording -> bot_joined
    p2 = {"event": "bot.status_change", "data": {"bot_id": bot_id, "status": {"code": "in_call_recording"}}}
    res2 = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(p2).encode("utf-8")), db=session)
    assert res2["success"] is True
    assert record.status == "bot_joined"

    # 3. fatal error -> failed
    p3 = {"event": "bot.status_change", "data": {"bot_id": bot_id, "status": {"code": "fatal", "sub_code": "denied_entry"}}}
    res3 = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(p3).encode("utf-8")), db=session)
    assert res3["success"] is True
    assert record.status == "failed"
    assert record.error_message == "denied_entry"


# ─────────────────────────────────────────────────────────────────────────────
# 9. Test Official Recall Events: recording.done & recording.failed
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recall_webhook_recording_events():
    """Verify recording.done and recording.failed events are handled correctly."""
    session = MeetMockSession()

    bot_id = "bot_rec_event_55"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="bot_joined",
        conversation_title="Recording Event Call",
        recording_data={"bot_id": bot_id},
    )
    session.add(record)

    # 1. recording.done
    rec_done_payload = {
        "event": "recording.done",
        "data": {
            "data": {"code": "done"},
            "recording": {"id": "rec_uuid_999"},
            "bot": {"id": bot_id},
        },
    }
    res_done = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(rec_done_payload).encode("utf-8")), db=session)
    assert res_done["success"] is True
    assert record.status == "processing_transcript"
    assert record.recording_data.get("recording_id") == "rec_uuid_999"

    # 2. recording.failed
    record.status = "bot_joined"
    rec_fail_payload = {
        "event": "recording.failed",
        "data": {
            "data": {"code": "failed", "sub_code": "audio_stream_interrupted"},
            "recording": {"id": "rec_uuid_999"},
            "bot": {"id": bot_id},
        },
    }
    res_fail = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(rec_fail_payload).encode("utf-8")), db=session)
    assert res_fail["success"] is True
    assert record.status == "failed"
    assert "audio_stream_interrupted" in record.error_message


# ─────────────────────────────────────────────────────────────────────────────
# 10. Test Official Recall Events: transcript.done & transcript.failed
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recall_webhook_transcript_failed():
    """Verify transcript.failed event updates ingestion record to failed status with sub_code."""
    session = MeetMockSession()

    bot_id = "bot_tr_fail_66"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="processing_transcript",
        conversation_title="Transcript Failure Call",
        recording_data={"bot_id": bot_id},
    )
    session.add(record)

    tr_fail_payload = {
        "event": "transcript.failed",
        "data": {
            "data": {"code": "failed", "sub_code": "provider_connection_failed"},
            "transcript": {"id": "tr_uuid_888"},
            "bot": {"id": bot_id},
        },
    }
    res = await recall_webhook_handler(request=MockFastAPIRequest(json.dumps(tr_fail_payload).encode("utf-8")), db=session)
    assert res["success"] is True
    assert record.status == "failed"
    assert "provider_connection_failed" in record.error_message


@pytest.mark.asyncio
async def test_successful_transcript_triggers_pipeline():
    """Verify that transcript.done delivers transcript into existing ingest_conversation_core and Nodes 1-5."""
    session = MeetMockSession()

    bot_id = "bot_transcript_pass_99"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="bot_joined",
        conversation_title="Product Demo & Architecture Review",
        contact_name="Michael Scott",
        conversation_type="Online Meeting",
        conversation_date="2026-10-01",
        recording_data={"bot_id": bot_id, "meeting_url": "https://meet.google.com/abc-defg-hij"},
    )
    session.add(record)

    # Official Recall transcript.done payload structure
    webhook_payload = {
        "event": "transcript.done",
        "data": {
            "data": {"code": "done"},
            "transcript": {
                "id": "tr_completed_123",
            },
            "bot": {"id": bot_id},
            # Inline transcript data or shortcuts
            "parts": [
                {
                    "participant": {"name": "Michael Scott"},
                    "words": [
                        {"text": "Welcome", "start_timestamp": 0.0, "end_timestamp": 0.5},
                        {"text": "everyone.", "start_timestamp": 0.6, "end_timestamp": 1.0},
                        {"text": "Let", "start_timestamp": 1.1, "end_timestamp": 1.3},
                        {"text": "us", "start_timestamp": 1.4, "end_timestamp": 1.6},
                        {"text": "approve", "start_timestamp": 1.7, "end_timestamp": 2.0},
                        {"text": "the", "start_timestamp": 2.1, "end_timestamp": 2.2},
                        {"text": "budget.", "start_timestamp": 2.3, "end_timestamp": 2.7},
                    ],
                },
                {
                    "participant": {"name": "Dwight Schrute"},
                    "words": [
                        {"text": "Question:", "start_timestamp": 3.0, "end_timestamp": 3.5},
                        {"text": "what", "start_timestamp": 3.6, "end_timestamp": 3.8},
                        {"text": "bear", "start_timestamp": 3.9, "end_timestamp": 4.1},
                        {"text": "is", "start_timestamp": 4.2, "end_timestamp": 4.3},
                        {"text": "best?", "start_timestamp": 4.4, "end_timestamp": 4.7},
                    ],
                }
            ],
        },
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")
    req = MockFastAPIRequest(body_bytes=raw_bytes, headers={})

    mock_pipeline_res = {
        "executed_nodes": ["n1", "n2", "n3", "n4", "n5a"],
        "node2": MagicMock(),
        "node3": MagicMock(),
        "node4": MagicMock(),
        "node5a": MagicMock(),
    }

    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline", new=AsyncMock(return_value=mock_pipeline_res)),          patch.object(RecallAIConnector, "get_transcript", new=AsyncMock(return_value={"data": {"parts": webhook_payload["data"]["parts"]}})):
        res = await recall_webhook_handler(request=req, db=session)

        # Ingest response check
        assert res.success is True
        assert res.status == "completed"
        assert res.external_event_id == ext_id
        assert res.duplicate is False
        assert res.nodes_executed == ["n1", "n2", "n3", "n4", "n5a"]

        # Ingestion record status updated
        assert record.status == "completed"
        assert record.completed_at is not None
        assert record.instance_id is not None


# ─────────────────────────────────────────────────────────────────────────────
# 11. Test Duplicate Webhook Handling (Transport & Domain Layer)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_webhook_no_duplicate_processing():
    """Verify that webhook retries for already completed meetings return duplicate=True and don't re-run pipeline."""
    session = MeetMockSession()

    bot_id = "bot_dupe_test_77"
    ext_id = f"recall_{bot_id}"
    instance_id = uuid.uuid4()

    # Pre-existing completed record
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="completed",
        conversation_title="Already Ingested Call",
        contact_name="Jim Halpert",
        conversation_type="Online Meeting",
        conversation_date="2026-10-01",
        instance_id=instance_id,
        completed_at=datetime.utcnow(),
    )
    session.add(record)

    webhook_payload = {
        "event": "transcript.done",
        "data": {
            "bot_id": bot_id,
            "status": {"code": "done"},
            "transcript": [{"speaker": "Jim Halpert", "text": "Duplicate transcript payload"}],
        },
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")
    req = MockFastAPIRequest(body_bytes=raw_bytes, headers={})

    with patch("api.routers.meeting_intelligence.execute_full_meeting_intelligence_pipeline") as mock_pipeline:
        res = await recall_webhook_handler(request=req, db=session)

        assert res["success"] is True
        assert res["duplicate"] is True
        assert res["status"] == "completed"
        assert "duplicate" in res["message"].lower()

        # Pipeline was NEVER re-invoked
        mock_pipeline.assert_not_called()


@pytest.mark.asyncio
async def test_duplicate_webhook_id_transport_deduplication():
    """Verify fast duplicate rejection when identical webhook-id header is received repeatedly."""
    session = MeetMockSession()

    bot_id = "bot_transport_dupe_88"
    ext_id = f"recall_{bot_id}"
    record = ConversationIngestionRecord(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="waiting_for_bot",
        conversation_title="Transport Dupe Call",
        recording_data={"bot_id": bot_id},
    )
    session.add(record)

    webhook_payload = {
        "event": "bot.status_change",
        "data": {"bot_id": bot_id, "status": {"code": "in_call_recording"}},
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")
    msg_id = f"msg_unique_{uuid.uuid4()}"

    # First request: processed normally
    req1 = MockFastAPIRequest(body_bytes=raw_bytes, headers={"webhook-id": msg_id})
    res1 = await recall_webhook_handler(request=req1, db=session)
    assert res1["success"] is True
    assert record.status == "bot_joined"

    # Second request with identical webhook-id: rejected as duplicate
    req2 = MockFastAPIRequest(body_bytes=raw_bytes, headers={"webhook-id": msg_id})
    res2 = await recall_webhook_handler(request=req2, db=session)
    assert res2["success"] is True
    assert res2.get("duplicate") is True
    assert "duplicate" in res2["message"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# 12. Test Strict Tenant Isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_isolation_enforced():
    """Verify that Organization B cannot view or retrieve Organization A's Google Meet capture record."""
    session = MeetMockSession()

    bot_id = "bot_tenant_iso_11"
    ext_id = f"recall_{bot_id}"
    record_id = uuid.uuid4()

    record = ConversationIngestionRecord(
        id=record_id,
        organization_id=uuid.UUID(ORG_A),
        external_event_id=ext_id,
        source="google_meet_recall",
        status="waiting_for_bot",
        conversation_title="Confidential Org A Board Meeting",
        contact_name="Pam Beesly",
        conversation_type="Online Meeting",
        conversation_date="2026-10-01",
        recording_data={"bot_id": bot_id, "meeting_url": "https://meet.google.com/org-aaaa-aaa"},
    )
    session.add(record)

    # Org A user can access
    status_a = await get_google_meet_status(
        identifier=str(record_id),
        db=session,
        current_user=USER_ORG_A,
    )
    assert status_a.success is True
    assert status_a.conversation_title == "Confidential Org A Board Meeting"

    # Org B user is rejected with HTTP 403
    with pytest.raises(HTTPException) as exc_info:
        await get_google_meet_status(
            identifier=str(record_id),
            db=session,
            current_user=USER_ORG_B,
        )
    assert exc_info.value.status_code == 403
    assert "Access denied" in exc_info.value.detail or "another organization" in exc_info.value.detail

    # Cross-tenant webhook with mismatched tenant_id in URL path is rejected with HTTP 403
    p = {"event": "bot.status_change", "data": {"bot_id": bot_id, "status": {"code": "in_call_recording"}}}
    req_cross_tenant = MockFastAPIRequest(json.dumps(p).encode("utf-8"), headers={})
    with pytest.raises(HTTPException) as exc_info_tenant:
        await recall_webhook_handler(request=req_cross_tenant, tenant_id=ORG_B, db=session)
    assert exc_info_tenant.value.status_code == 403
    assert "Tenant ID mismatch" in exc_info_tenant.value.detail

