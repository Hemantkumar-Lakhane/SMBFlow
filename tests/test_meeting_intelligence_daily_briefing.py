"""
tests/test_meeting_intelligence_daily_briefing.py
=================================================
Automated test suite for Meeting Intelligence — Daily Briefing capability.

Tests:
 1. Empty database generation: zero fabrication, empty sections, totals = 0.
 2. Full data generation: meetings today, upcoming meetings, commitments,
    waiting contacts, drafts awaiting review, suggested follow-ups, and verified research.
 3. Idempotency: second generation reuses existing record, never duplicates.
 4. Manual regeneration (force=True): updates existing record in-place.
 5. Tenant isolation: Org A's briefing and data are strictly invisible to Org B.
 6. Config GET & PUT: retrieval of defaults, updating time & timezone, UTC calculation.
 7. Config validation: invalid time format (e.g. "25:99") and invalid timezone fail validation.
 8. Timezone handling: conversion from various IANA timezones to UTC.
 9. Verified research usage: only completed research with verified facts appears; uncertain matches excluded.
 10. API endpoints: GET /daily-briefing, POST /daily-briefing/generate, GET/PUT config.
 11. Scheduler matching logic: checks matching org local time against configured delivery time.
"""

import json
import uuid
import pytest
from datetime import datetime, date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    DailyBriefingGenerateRequest,
    DailyBriefingConfigUpdateRequest,
    _calc_scheduled_utc,
    get_daily_briefing,
    generate_daily_briefing_endpoint,
    get_daily_briefing_config,
    update_daily_briefing_config,
)
from core.daily_briefing_generator import (
    generate_daily_briefing,
    _idempotency_key,
    _assemble_priorities,
)
from db.models.core import (
    ApprovalItem,
    AuditEvent,
    DailyBriefing,
    Organization,
    RelationshipContact,
    RelationshipConversation,
    WorkflowInstance,
)

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures & Mock DB Session
# ─────────────────────────────────────────────────────────────────────────────

ORG_A_ID = "11111111-1111-1111-1111-111111111111"
ORG_B_ID = "22222222-2222-2222-2222-222222222222"

USER_A = TokenData(
    user_id=str(uuid.uuid4()),
    email="alice@org-a.com",
    role="org_admin",
    organization_id=ORG_A_ID,
    tenant_id=ORG_A_ID,
)

USER_B = TokenData(
    user_id=str(uuid.uuid4()),
    email="bob@org-b.com",
    role="org_admin",
    organization_id=ORG_B_ID,
    tenant_id=ORG_B_ID,
)


class BriefingMockSession:
    """In-memory mock SQLAlchemy AsyncSession for Daily Briefing tests."""

    def __init__(self):
        self.daily_briefings: dict = {}      # id -> DailyBriefing
        self.organizations: dict = {}         # id -> Organization
        self.workflow_instances: dict = {}   # id -> WorkflowInstance
        self.approval_items: dict = {}       # id -> ApprovalItem
        self.contacts: dict = {}             # id -> RelationshipContact
        self.conversations: dict = {}        # id -> RelationshipConversation
        self.audit_events: list = []

    def add(self, obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid.uuid4()

        if isinstance(obj, DailyBriefing):
            self.daily_briefings[str(obj.id)] = obj
        elif isinstance(obj, Organization):
            self.organizations[str(obj.id)] = obj
        elif isinstance(obj, WorkflowInstance):
            self.workflow_instances[str(obj.id)] = obj
        elif isinstance(obj, ApprovalItem):
            self.approval_items[str(obj.id)] = obj
        elif isinstance(obj, RelationshipContact):
            self.contacts[str(obj.id)] = obj
        elif isinstance(obj, RelationshipConversation):
            self.conversations[str(obj.id)] = obj
        elif isinstance(obj, AuditEvent):
            self.audit_events.append(obj)

    async def flush(self): pass
    async def commit(self): pass
    async def refresh(self, obj): pass

    async def execute(self, stmt):
        stmt_str = str(stmt).lower()
        mock = MagicMock()

        try:
            params = stmt.compile().params
        except Exception:
            params = {}
        param_vals = [str(v).lower() for v in params.values() if v is not None]

        if "daily_briefings" in stmt_str:
            matched = list(self.daily_briefings.values())
            # filter by organization_id if param present
            for obj in list(matched):
                if hasattr(obj, "organization_id") and str(obj.organization_id).lower() not in param_vals and any(p in param_vals for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]):
                    # Check if this query targeted another org
                    if any(str(obj.organization_id).lower() != p and p in [ORG_A_ID.lower(), ORG_B_ID.lower()] for p in param_vals):
                        matched = [m for m in matched if str(m.organization_id).lower() in param_vals]
            # filter by briefing_date if in params
            for p in param_vals:
                if len(p) == 10 and p.count("-") == 2:
                    matched = [m for m in matched if getattr(m, "briefing_date", "") == p]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "organizations" in stmt_str:
            matched = list(self.organizations.values())
            for org_id, org in self.organizations.items():
                if org_id.lower() in param_vals:
                    matched = [org]
                    break
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "workflow_instances" in stmt_str:
            matched = list(self.workflow_instances.values())
            # filter by org
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [w for w in matched if str(w.organization_id).lower() == p]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "approval_items" in stmt_str:
            matched = list(self.approval_items.values())
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [a for a in matched if str(a.organization_id).lower() == p]
            if "followup_email_draft" in stmt_str:
                matched = [a for a in matched if getattr(a, "review_type", None) == "followup_email_draft"]
            if "node_id" in stmt_str and "n4" in stmt_str:
                matched = [a for a in matched if getattr(a, "node_id", None) == "n4"]
            if "created_at" in stmt_str and "desc" in stmt_str:
                matched = sorted(matched, key=lambda x: getattr(x, "created_at", None) or datetime.min, reverse=True)
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_contacts" in stmt_str:
            matched = list(self.contacts.values())
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [c for c in matched if str(c.organization_id).lower() == p]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_conversations" in stmt_str:
            matched = list(self.conversations.values())
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [c for c in matched if str(c.organization_id).lower() == p]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        else:
            mock.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])

        return mock


# ─────────────────────────────────────────────────────────────────────────────
# Test Cases
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_empty_db_generation_never_fabricates():
    """Requirement 2: When no data exists, briefing succeeds with zero fabrication."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    today_str = date.today().isoformat()

    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date=today_str,
        org_timezone="UTC",
        force=False,
    )

    assert briefing is not None
    assert briefing.status == "ready"
    assert briefing.briefing_date == today_str
    assert briefing.organization_id == org_uuid

    content = briefing.content
    assert content["meetings_today"] == []
    assert content["upcoming_meetings"] == []
    assert content["pending_commitments"] == []
    assert content["contacts_waiting"] == []
    assert content["drafts_awaiting_review"] == []
    assert content["suggested_followups"] == []
    assert content["research_highlights"] == []

    totals = content.get("totals", {})
    assert totals.get("meetings_today") == 0
    assert totals.get("upcoming_meetings") == 0
    assert totals.get("our_commitments") == 0
    assert totals.get("waiting_on_contacts") == 0
    assert totals.get("drafts_review") == 0
    assert totals.get("suggested_followups") == 0
    assert totals.get("verified_research") == 0


@pytest.mark.asyncio
async def test_full_data_generation():
    """Requirement 2: Full briefing incorporates meetings, commitments, reviews, and research."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    today_str = date.today().isoformat()
    tomorrow_str = (date.today() + timedelta(days=1)).isoformat()

    # 1. Today's meeting (Node 5B prep block)
    inst_today = WorkflowInstance(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="processed",
        started_at=datetime.utcnow(),
        context={
            "conversation_capture": {"contact_name": "Elena Rostova"},
            "node5b_meeting_prep": {
                "meeting_title": "Quarterly Operations Review",
                "meeting_start": f"{today_str}T10:00:00Z",
                "meeting_end": f"{today_str}T11:00:00Z",
                "status": "confirmed",
                "prep_start": f"{today_str}T09:30:00Z",
                "prep_end": f"{today_str}T10:00:00Z",
            }
        }
    )
    db.add(inst_today)

    # 2. Upcoming meeting (tomorrow)
    inst_upcoming = WorkflowInstance(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="processed",
        started_at=datetime.utcnow(),
        context={
            "conversation_capture": {"contact_name": "Marcus Chen"},
            "node5b_meeting_prep": {
                "meeting_title": "Product Architecture Sync",
                "meeting_start": f"{tomorrow_str}T15:00:00Z",
                "meeting_end": f"{tomorrow_str}T16:00:00Z",
                "status": "confirmed",
            }
        }
    )
    db.add(inst_upcoming)

    # 3. Our pending commitment (ApprovalItem n4)
    item_our_commit = ApprovalItem(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        node_id="n4",
        status="pending",
        reason="Send revised API specifications",
        payload={
            "action_type": "our_commitment",
            "action": "Send revised API specifications",
            "due_date": today_str,
            "contact_name": "Elena Rostova",
        },
        created_at=datetime.utcnow(),
    )
    db.add(item_our_commit)

    # 4. Contact waiting commitment (ApprovalItem n4)
    item_waiting = ApprovalItem(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        node_id="n4",
        status="waiting",
        reason="Elena sending sandbox credentials",
        payload={
            "action_type": "contact_commitment",
            "action": "Elena sending sandbox credentials",
            "due_date": today_str,
            "contact_name": "Elena Rostova",
        },
        created_at=datetime.utcnow(),
    )
    db.add(item_waiting)

    # 5. Draft awaiting review (ApprovalItem review_type)
    item_draft = ApprovalItem(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        node_id="n5a",
        review_type="followup_email_draft",
        status="awaiting_review",
        reason="Human review required for outbound follow-up email",
        payload={
            "subject": "Follow-up: Architecture & Specs",
            "recipient_name": "Elena Rostova",
            "recipient_email": "elena@acme.com",
            "recipient_email_available": True,
            "conversation_title": "Quarterly Operations Review",
        },
        created_at=datetime.utcnow(),
    )
    db.add(item_draft)

    # 6. Verified research record
    inst_research = WorkflowInstance(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="completed",
        started_at=datetime.utcnow(),
        context={
            "contact_research": {
                "status": "completed",
                "contact_name": "Elena Rostova",
                "company": "Acme Corp",
                "verified_facts": [
                    {
                        "fact": "Promoted to Senior VP of Engineering in August 2026",
                        "source_name": "Acme Press",
                        "url": "https://acme.com/news/elena-promotion",
                        "confidence": 0.95
                    }
                ],
                "retrieved_at": f"{today_str}T08:00:00Z"
            }
        }
    )
    db.add(inst_research)

    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date=today_str,
        org_timezone="UTC",
        force=True,
    )

    c = briefing.content
    assert len(c["meetings_today"]) == 1
    assert c["meetings_today"][0]["meeting_title"] == "Quarterly Operations Review"

    assert len(c["upcoming_meetings"]) == 1
    assert c["upcoming_meetings"][0]["meeting_title"] == "Product Architecture Sync"

    assert len(c["pending_commitments"]) == 1
    assert c["pending_commitments"][0]["action"] == "Send revised API specifications"

    assert len(c["contacts_waiting"]) == 1
    assert c["contacts_waiting"][0]["contact_name"] == "Elena Rostova"

    assert len(c["drafts_awaiting_review"]) == 1
    assert c["drafts_awaiting_review"][0]["recipient_name"] == "Elena Rostova"

    assert len(c["research_highlights"]) == 1
    assert c["research_highlights"][0]["contact_name"] == "Elena Rostova"
    assert len(c["research_highlights"][0]["facts"]) == 1

    # Priorities assembly
    priorities = c["priorities"]
    assert len(priorities) >= 3  # Meeting, commitment, draft
    categories = {p["category"] for p in priorities}
    assert "meeting" in categories
    assert "commitment" in categories
    assert "draft_review" in categories


@pytest.mark.asyncio
async def test_idempotency_no_duplicate_records():
    """Requirement 6: Exactly one briefing per org/date. Repeated generation reuses/updates."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    today_str = date.today().isoformat()

    # First generation
    b1 = await generate_daily_briefing(db=db, org_uuid=org_uuid, briefing_date=today_str)
    b1_id = b1.id
    assert len(db.daily_briefings) == 1

    # Second generation with force=False returns existing record
    b2 = await generate_daily_briefing(db=db, org_uuid=org_uuid, briefing_date=today_str, force=False)
    assert b2.id == b1_id
    assert len(db.daily_briefings) == 1

    # Third generation with force=True updates existing record in-place
    b3 = await generate_daily_briefing(db=db, org_uuid=org_uuid, briefing_date=today_str, force=True)
    assert b3.id == b1_id
    assert len(db.daily_briefings) == 1
    assert b3.idempotency_key == f"{org_uuid}:{today_str}"


@pytest.mark.asyncio
async def test_tenant_isolation():
    """Requirement 9: Org A cannot access or see Org B's briefing data."""
    db = BriefingMockSession()
    org_a = uuid.UUID(ORG_A_ID)
    org_b = uuid.UUID(ORG_B_ID)
    today_str = date.today().isoformat()

    # Org A has a meeting
    inst_a = WorkflowInstance(
        id=uuid.uuid4(),
        organization_id=org_a,
        workflow_name="meeting_intelligence_followup",
        status="processed",
        started_at=datetime.utcnow(),
        context={
            "conversation_capture": {"contact_name": "Org A Contact"},
            "node5b_meeting_prep": {
                "meeting_title": "Confidential Org A Acquisition",
                "meeting_start": f"{today_str}T09:00:00Z",
                "status": "confirmed",
            }
        }
    )
    db.add(inst_a)

    # Generate Org B briefing
    briefing_b = await generate_daily_briefing(
        db=db,
        org_uuid=org_b,
        briefing_date=today_str,
    )

    # Org B must see 0 meetings
    assert len(briefing_b.content["meetings_today"]) == 0
    assert briefing_b.organization_id == org_b


@pytest.mark.asyncio
async def test_config_get_and_put():
    """Requirements 1 & 3: Config GET returns defaults/stored settings; PUT updates them."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    org = Organization(
        id=org_uuid,
        name="Org A Enterprises",
        profile_config={},
        created_at=datetime.utcnow(),
    )
    db.add(org)

    # GET default config
    cfg_default = await get_daily_briefing_config(current_user=USER_A, db=db)
    assert cfg_default.enabled is True
    assert cfg_default.time == "08:00"
    assert cfg_default.timezone == "UTC"
    assert cfg_default.scheduled_time_utc == "08:00"

    # PUT updated config with America/New_York
    update_req = DailyBriefingConfigUpdateRequest(
        enabled=True,
        time="09:30",
        timezone="America/New_York",
    )
    cfg_updated = await update_daily_briefing_config(req=update_req, current_user=USER_A, db=db)

    assert cfg_updated.enabled is True
    assert cfg_updated.time == "09:30"
    assert cfg_updated.timezone == "America/New_York"
    # In EDT (UTC-4) 09:30 EDT = 13:30 UTC, or in EST (UTC-5) 14:30 UTC
    assert cfg_updated.scheduled_time_utc in ["13:30", "14:30"]

    # Verify persisted in Organization.profile_config
    assert "daily_briefing_config" in org.profile_config
    assert org.profile_config["daily_briefing_config"]["time"] == "09:30"


def test_timezone_conversion():
    """Requirement 3: _calc_scheduled_utc computes accurate UTC times across timezones."""
    # UTC stays identical
    assert _calc_scheduled_utc("08:00", "UTC") == "08:00"
    assert _calc_scheduled_utc("18:45", "UTC") == "18:45"

    # Asia/Kolkata is UTC+5:30 -> 08:00 IST is 02:30 UTC
    assert _calc_scheduled_utc("08:00", "Asia/Kolkata") == "02:30"

    # Europe/London
    utc_london = _calc_scheduled_utc("10:00", "Europe/London")
    assert utc_london in ["09:00", "10:00"]  # BST vs GMT


def test_config_validation_invalid_time_and_timezone():
    """Requirement 3: Invalid time formats and timezones are strictly rejected."""
    # Invalid time string format
    with pytest.raises(ValidationError):
        DailyBriefingConfigUpdateRequest(
            time="25:00",
            timezone="UTC"
        )

    with pytest.raises(ValidationError):
        DailyBriefingConfigUpdateRequest(
            time="8:00",  # missing leading zero
            timezone="UTC"
        )

    # Invalid timezone
    with pytest.raises(ValidationError):
        DailyBriefingConfigUpdateRequest(
            time="08:00",
            timezone="Invalid/Timezone_Not_Existing"
        )


@pytest.mark.asyncio
async def test_verified_research_usage_excludes_uncertain():
    """Requirement 2: Only completed research with verified facts is included; uncertain omitted."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    today_str = date.today().isoformat()

    # Workflow instance with uncertain/unverified facts only
    inst_uncertain = WorkflowInstance(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="completed",
        started_at=datetime.utcnow(),
        context={
            "contact_research": {
                "status": "completed",
                "contact_name": "Bob Uncertain",
                "verified_facts": [],
                "uncertain_matches": [{"title": "Possible match"}],
            }
        }
    )
    db.add(inst_uncertain)

    briefing = await generate_daily_briefing(db=db, org_uuid=org_uuid, briefing_date=today_str)
    # Bob Uncertain should NOT be added to research_highlights because verified_facts is empty
    assert len(briefing.content["research_highlights"]) == 0


@pytest.mark.asyncio
async def test_api_generate_and_get_endpoints():
    """Requirements 1 & 5: GET /daily-briefing and POST /daily-briefing/generate endpoints."""
    db = BriefingMockSession()
    org_uuid = uuid.UUID(ORG_A_ID)
    today_str = date.today().isoformat()

    org = Organization(
        id=org_uuid,
        name="Org A Enterprises",
        profile_config={"daily_briefing_config": {"timezone": "UTC"}},
        created_at=datetime.utcnow(),
    )
    db.add(org)

    with patch("core.redis_pubsub.pubsub.publish", new=AsyncMock()) as mock_pub:
        # 1. GET /daily-briefing auto-generates if not existing
        res_get = await get_daily_briefing(date_str=today_str, current_user=USER_A, db=db)
        assert res_get.briefing_date == today_str
        assert res_get.status == "ready"
        assert res_get.content["totals"]["meetings_today"] == 0

        # 2. POST /daily-briefing/generate manually forces regeneration
        gen_req = DailyBriefingGenerateRequest(date=today_str, force=True)
        res_gen = await generate_daily_briefing_endpoint(req=gen_req, current_user=USER_A, db=db)
        assert res_gen.id == res_get.id
        assert res_gen.briefing_date == today_str

        # Verified audit event logged
        assert len(db.audit_events) == 1
        assert db.audit_events[0].action == "daily_briefing_generated"

        # Verified event published
        mock_pub.assert_called_once()
        assert mock_pub.call_args[0][0] == "daily_briefing_updated"


@pytest.mark.asyncio
async def test_scheduler_matching_logic():
    """Requirement 4: Background scheduler matches org local time to trigger generation."""
    org_uuid = uuid.UUID(ORG_A_ID)
    now_utc = datetime.now(ZoneInfo("UTC"))
    current_time_str = now_utc.strftime("%H:%M")
    current_date_str = now_utc.strftime("%Y-%m-%d")

    org = Organization(
        id=org_uuid,
        name="Org A Enterprises",
        profile_config={
            "daily_briefing_config": {
                "enabled": True,
                "time": current_time_str,
                "timezone": "UTC",
            }
        },
        created_at=datetime.utcnow(),
    )

    db = BriefingMockSession()
    db.add(org)

    # Simulate scheduler evaluation for org
    cfg = org.profile_config.get("daily_briefing_config") or {}
    tz = ZoneInfo(cfg.get("timezone", "UTC"))
    local_now = datetime.now(tz)
    local_time = local_now.strftime("%H:%M")
    local_date = local_now.strftime("%Y-%m-%d")

    assert local_time == current_time_str
    assert local_date == current_date_str

    # Trigger generation
    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date=local_date,
        org_timezone="UTC",
        force=False,
    )
    assert briefing is not None
    assert briefing.briefing_date == local_date
    assert len(db.daily_briefings) == 1


@pytest.mark.asyncio
async def test_repeated_runs_same_meeting_deduplication():
    """
    Regression test: When the same meeting is processed repeatedly across multiple runs,
    Daily Briefing must deduplicate identical commitments, waiting items, and drafts,
    retaining the newest record and its provenance/ID.
    """
    org_uuid = uuid.UUID(ORG_A_ID)
    db = BriefingMockSession()

    # Create 3 repeated runs with increasing timestamps
    # Run 1 (oldest): t0
    # Run 2 (middle): t1
    # Run 3 (newest): t2
    base_time = datetime(2026, 9, 28, 10, 0, 0)
    
    # Commitments: "Prepare and send pilot proposal" for Rahul Sharma due 2026-10-02
    comm_id_old = uuid.uuid4()
    comm_id_mid = uuid.uuid4()
    comm_id_new = uuid.uuid4()

    db.add(ApprovalItem(
        id=comm_id_old,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n4",
        status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Prepare and send pilot proposal", "contact_name": "Rahul Sharma", "due_date": "2026-10-02"},
        created_at=base_time,
    ))
    db.add(ApprovalItem(
        id=comm_id_mid,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n4",
        status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Prepare and send pilot proposal", "contact_name": "Rahul Sharma", "due_date": "2026-10-02"},
        created_at=base_time + timedelta(hours=1),
    ))
    db.add(ApprovalItem(
        id=comm_id_new,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n4",
        status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Prepare and send pilot proposal", "contact_name": "Rahul Sharma", "due_date": "2026-10-02"},
        created_at=base_time + timedelta(hours=2),
    ))

    # Waiting-on-contact commitments: "Share list of most common customer queries" for Rahul Sharma
    wait_id_old = uuid.uuid4()
    wait_id_new = uuid.uuid4()

    db.add(ApprovalItem(
        id=wait_id_old,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n4",
        status="waiting",
        review_type="meeting_action",
        payload={"action_type": "contact_commitment", "action": "Share list of most common customer queries", "contact_name": "Rahul Sharma", "due_date": "2026-10-01"},
        created_at=base_time,
    ))
    db.add(ApprovalItem(
        id=wait_id_new,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n4",
        status="waiting",
        review_type="meeting_action",
        payload={"action_type": "contact_commitment", "action": "Share list of most common customer queries", "contact_name": "Rahul Sharma", "due_date": "2026-10-01"},
        created_at=base_time + timedelta(hours=2),
    ))

    # Drafts awaiting review: "Follow-Up: AI Customer Support Pilot – Next Steps" for Rahul Sharma
    draft_id_old = uuid.uuid4()
    draft_id_new = uuid.uuid4()

    db.add(ApprovalItem(
        id=draft_id_old,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n5",
        status="awaiting_review",
        review_type="followup_email_draft",
        payload={"subject": "Follow-Up: AI Customer Support Pilot – Next Steps", "recipient_name": "Rahul Sharma", "recipient_email": "rahul@example.com"},
        created_at=base_time,
    ))
    db.add(ApprovalItem(
        id=draft_id_new,
        organization_id=org_uuid,
        instance_id=uuid.uuid4(),
        node_id="n5",
        status="awaiting_review",
        review_type="followup_email_draft",
        payload={"subject": "Follow-Up: AI Customer Support Pilot – Next Steps", "recipient_name": "Rahul Sharma", "recipient_email": "rahul@example.com"},
        created_at=base_time + timedelta(hours=2),
    ))

    # Generate daily briefing
    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date="2026-09-29",
        force=True,
    )

    content = briefing.content or {}
    pending = content.get("pending_commitments", [])
    waiting = content.get("contacts_waiting", [])
    drafts = content.get("drafts_awaiting_review", [])
    priorities = content.get("priorities", [])
    totals = content.get("totals", {})

    # 1. Exactly one pending commitment retained with newest ID
    assert len(pending) == 1
    assert pending[0]["approval_id"] == str(comm_id_new)
    assert pending[0]["action"] == "Prepare and send pilot proposal"

    # 2. Exactly one waiting item retained with newest ID
    assert len(waiting) == 1
    assert waiting[0]["approval_id"] == str(wait_id_new)
    assert waiting[0]["contact_name"] == "Rahul Sharma"

    # 3. Exactly one draft retained with newest ID
    assert len(drafts) == 1
    assert drafts[0]["approval_id"] == str(draft_id_new)
    assert drafts[0]["recipient_name"] == "Rahul Sharma"

    # 4. Priorities use deduplicated collections — no duplicate titles
    p_titles = [p["title"] for p in priorities]
    assert len(p_titles) == len(set(p_titles)), f"Duplicate priority titles found: {p_titles}"

    # 5. Totals reflect deduplicated counts
    assert totals["our_commitments"] == 1
    assert totals["waiting_on_contacts"] == 1
    assert totals["drafts_review"] == 1


@pytest.mark.asyncio
async def test_distinct_commitments_and_drafts_preserved():
    """
    Regression test: Genuinely distinct commitments and drafts must NOT be merged
    just because they belong to the same contact, have the same action, or have the same subject.
    """
    org_uuid = uuid.UUID(ORG_A_ID)
    db = BriefingMockSession()
    now = datetime(2026, 9, 29, 12, 0, 0)

    # 1. Distinct commitments:
    # C1: Rahul Sharma - Send pilot proposal - 2026-10-02
    # C2: Rahul Sharma - Send pricing tier documentation - 2026-10-02 (different action, same contact)
    # C3: Priya Patel - Send pilot proposal - 2026-10-02 (different contact, same action)
    # C4: Rahul Sharma - Send pilot proposal - 2026-10-15 (different due date)
    c1 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Send pilot proposal", "contact_name": "Rahul Sharma", "due_date": "2026-10-02"},
        created_at=now,
    )
    c2 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Send pricing tier documentation", "contact_name": "Rahul Sharma", "due_date": "2026-10-02"},
        created_at=now,
    )
    c3 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Send pilot proposal", "contact_name": "Priya Patel", "due_date": "2026-10-02"},
        created_at=now,
    )
    c4 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="pending",
        review_type="meeting_action",
        payload={"action_type": "our_commitment", "action": "Send pilot proposal", "contact_name": "Rahul Sharma", "due_date": "2026-10-15"},
        created_at=now,
    )
    db.add(c1); db.add(c2); db.add(c3); db.add(c4)

    # 2. Distinct waiting-on-contact items:
    # W1: Rahul Sharma - Share list of most common customer queries
    # W2: Rahul Sharma - Provide security compliance questionnaire (different action, same contact)
    # W3: Priya Patel - Share list of most common customer queries (different contact, same action)
    w1 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="waiting",
        review_type="meeting_action",
        payload={"action_type": "contact_commitment", "action": "Share list of most common customer queries", "contact_name": "Rahul Sharma"},
        created_at=now,
    )
    w2 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="waiting",
        review_type="meeting_action",
        payload={"action_type": "contact_commitment", "action": "Provide security compliance questionnaire", "contact_name": "Rahul Sharma"},
        created_at=now,
    )
    w3 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n4", status="waiting",
        review_type="meeting_action",
        payload={"action_type": "contact_commitment", "action": "Share list of most common customer queries", "contact_name": "Priya Patel"},
        created_at=now,
    )
    db.add(w1); db.add(w2); db.add(w3)

    # 3. Distinct drafts awaiting review:
    # D1: Rahul Sharma - Follow-Up: AI Customer Support Pilot
    # D2: Rahul Sharma - Contract & SLA Agreement Review (different subject, same recipient)
    # D3: Priya Patel - Follow-Up: AI Customer Support Pilot (different recipient, same subject)
    d1 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n5", status="awaiting_review",
        review_type="followup_email_draft",
        payload={"subject": "Follow-Up: AI Customer Support Pilot", "recipient_name": "Rahul Sharma"},
        created_at=now,
    )
    d2 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n5", status="awaiting_review",
        review_type="followup_email_draft",
        payload={"subject": "Contract & SLA Agreement Review", "recipient_name": "Rahul Sharma"},
        created_at=now,
    )
    d3 = ApprovalItem(
        id=uuid.uuid4(), organization_id=org_uuid, node_id="n5", status="awaiting_review",
        review_type="followup_email_draft",
        payload={"subject": "Follow-Up: AI Customer Support Pilot", "recipient_name": "Priya Patel"},
        created_at=now,
    )
    db.add(d1); db.add(d2); db.add(d3)

    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date="2026-09-29",
        force=True,
    )

    content = briefing.content or {}
    assert len(content.get("pending_commitments", [])) == 4, "All 4 genuinely distinct commitments must be preserved"
    assert len(content.get("contacts_waiting", [])) == 3, "All 3 genuinely distinct waiting items must be preserved"
    assert len(content.get("drafts_awaiting_review", [])) == 3, "All 3 genuinely distinct drafts must be preserved"

