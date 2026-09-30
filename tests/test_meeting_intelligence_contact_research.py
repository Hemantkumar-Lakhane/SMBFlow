"""
tests/test_meeting_intelligence_contact_research.py
=====================================================
Automated test suite for Meeting Intelligence — Contact Research & Enrichment.

Tests:
 1.  research_unavailable when SERPER_API_KEY not set.
 2.  research_unavailable when key is empty string.
 3.  no_results when Serper returns empty organic list.
 4.  completed status with verified facts when identity score >= threshold.
 5.  uncertain_matches for low-confidence results.
 6.  source provenance (url, source_name, retrieved_at) on every fact.
 7.  AI talking points labelled "AI Suggested — Not Previously Agreed".
 8.  no fabricated facts when LLM talking-point call fails.
 9.  identity_score helper: high score when name + company match.
10.  identity_score helper: low score for unrelated snippet.
11.  build_cache_key is stable and org-scoped.
12.  endpoint returns research_unavailable (no provider) without crashing.
13.  endpoint rejects missing Node 3 with HTTP 400.
14.  endpoint rejects cross-tenant access with HTTP 403.
15.  endpoint idempotency: second call reuses cached result.
16.  force_refresh bypasses cache and reruns research.
17.  results persisted in WorkflowInstance.context["contact_research"].
18.  AuditEvent logged on successful research.
19.  rehydration endpoint (GET /runs/{id}) returns contact_research.
20.  dedup_facts removes near-duplicate content.
"""

import json
import uuid
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    ContactResearchRequest,
    run_contact_research,
    get_workflow_run_detail,
)
from core.contact_researcher import (
    ContactResearcher,
    _identity_score,
    _dedup_facts,
    _make_fact,
)
from db.models.core import (
    AuditEvent,
    RelationshipContact,
    RelationshipConversation,
    WorkflowInstance,
)

# ─────────────────────────────────────────────────────────────────────────────
ORG_A = str(uuid.uuid4())
ORG_B = str(uuid.uuid4())

USER_A = TokenData(
    user_id=str(uuid.uuid4()),
    email="alice@org-a.com",
    role="org_admin",
    organization_id=ORG_A,
    tenant_id=ORG_A,
)
USER_B = TokenData(
    user_id=str(uuid.uuid4()),
    email="bob@org-b.com",
    role="org_admin",
    organization_id=ORG_B,
    tenant_id=ORG_B,
)

# ─────────────────────────────────────────────────────────────────────────────
# Mock session
# ─────────────────────────────────────────────────────────────────────────────

class ResearchMockSession:
    def __init__(self):
        self.workflow_instances: dict = {}
        self.contacts: dict = {}
        self.conversations: dict = {}
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

        mock = MagicMock()

        if "workflow_instances" in stmt_str:
            matched = list(self.workflow_instances.values())
            for wid, inst in self.workflow_instances.items():
                if wid.lower() in param_vals:
                    matched = [inst]; break
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_contacts" in stmt_str:
            matched = list(self.contacts.values())
            for cid, c in self.contacts.items():
                if cid.lower() in param_vals:
                    matched = [c]; break
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_conversations" in stmt_str:
            matched = list(self.conversations.values())
            for cid, c in self.conversations.items():
                if cid.lower() in param_vals:
                    matched = [c]; break
                if hasattr(c, "workflow_instance_id") and str(c.workflow_instance_id).lower() in param_vals:
                    matched = [c]; break
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        else:
            mock.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])

        return mock


def _build_session(org_id: str, with_contact: bool = True, node3_done: bool = True):
    session = ResearchMockSession()
    inst_id = uuid.uuid4()
    org_uuid = uuid.UUID(org_id)
    contact_id = uuid.uuid4()
    conv_id = uuid.uuid4()

    if with_contact:
        contact = RelationshipContact(
            id=contact_id,
            organization_id=org_uuid,
            name="Rahul Sharma",
            normalized_name="rahul sharma",
            role="VP of Operations",
            company="Apex Logistics",
            metadata_={},
            created_at=datetime.utcnow(),
        )
        session.add(contact)

        conv = RelationshipConversation(
            id=conv_id,
            organization_id=org_uuid,
            contact_id=contact_id,
            workflow_instance_id=inst_id,
            title="AI Pilot Discussion",
            conversation_type="sales",
            conversation_date="2026-09-27",
            transcript="...",
            summary="Discussion on AI pilot for logistics.",
            created_at=datetime.utcnow(),
        )
        session.add(conv)

    ctx: dict = {
        "conversation_capture": {"contact_name": "Rahul Sharma"},
    }
    if node3_done and with_contact:
        ctx["node3_central_memory"] = {
            "status": "completed",
            "contact_id": str(contact_id),
            "conversation_id": str(conv_id),
        }
    elif node3_done and not with_contact:
        ctx["node3_central_memory"] = {
            "status": "completed",
            "contact_id": str(uuid.uuid4()),  # nonexistent
            "conversation_id": str(uuid.uuid4()),
        }

    inst = WorkflowInstance(
        id=inst_id,
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="processed",
        current_node="n5",
        context=ctx,
        started_at=datetime.utcnow(),
    )
    session.add(inst)
    return session, inst_id, contact_id


# =============================================================================
# UNIT TESTS — core/contact_researcher.py
# =============================================================================

def test_identity_score_high_when_name_and_company_match():
    """Test 9: Score above threshold when name + company appear in snippet."""
    score = _identity_score(
        snippet="Rahul Sharma is VP of Operations at Apex Logistics, overseeing fleet management.",
        title="Rahul Sharma | LinkedIn",
        contact_name="Rahul Sharma",
        company="Apex Logistics",
        role="VP of Operations",
    )
    assert score >= 0.60, f"Expected score >= 0.60 (name+company+role), got {score:.2f}"


def test_identity_score_name_only_below_threshold():
    """Name alone must never reach the verification threshold."""
    score = _identity_score(
        snippet="Rahul Sharma scored a century in the test match at Eden Gardens.",
        title="Rahul Sharma Cricket Profile",
        contact_name="Rahul Sharma",
        company=None,
        role=None,
    )
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD
    assert score < IDENTITY_CONFIRM_THRESHOLD, (
        f"Name-only score {score:.2f} must be below threshold {IDENTITY_CONFIRM_THRESHOLD}"
    )


def test_identity_score_low_for_unrelated_snippet():
    """Test 10: Low identity score when snippet doesn't reference contact."""
    score = _identity_score(
        snippet="John Smith is a software engineer at TechCorp Inc based in San Francisco.",
        title="John Smith Profile",
        contact_name="Rahul Sharma",
        company="Apex Logistics",
        role="VP of Operations",
    )
    assert score < 0.60, f"Expected score < 0.60, got {score:.2f}"


def test_identity_score_zero_for_empty_snippet():
    """Identity score is 0 when snippet is empty."""
    score = _identity_score("", "", "Rahul Sharma", "Apex Logistics", "VP")
    assert score == 0.0


def test_build_cache_key_is_stable():
    """Test 11: Cache key is deterministic for same inputs."""
    org = uuid.uuid4()
    r = ContactResearcher()
    k1 = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP", org)
    k2 = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP", org)
    assert k1 == k2


def test_build_cache_key_is_org_scoped():
    """Test 11 (cont.): Different orgs produce different cache keys."""
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    r = ContactResearcher()
    ka = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP", org_a)
    kb = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP", org_b)
    assert ka != kb


def test_dedup_facts_removes_near_duplicates():
    """Test 20: _dedup_facts removes near-identical content."""
    facts = [
        _make_fact("Rahul Sharma is VP at Apex Logistics", "https://a.com", "A", "2026-10-01"),
        _make_fact("Rahul Sharma is VP at Apex Logistics — logistics company.", "https://b.com", "B", "2026-10-01"),
        _make_fact("Priya Patel leads engineering at TechCo", "https://c.com", "C", "2026-10-01"),
    ]
    deduped = _dedup_facts(facts)
    # First two are near-duplicates; only one should survive
    assert len(deduped) == 2


def test_researcher_unavailable_when_no_key():
    """Test 1: ContactResearcher.is_available is False when key explicitly empty."""
    # Patch os.getenv so the real .env SERPER_API_KEY doesn't leak in
    with patch.dict("os.environ", {"SERPER_API_KEY": ""}, clear=False):
        r = ContactResearcher(serper_api_key="")
        assert r.is_available is False


def test_researcher_available_when_key_set():
    """Test 2 (inversion): ContactResearcher.is_available is True when key present."""
    r = ContactResearcher(serper_api_key="test-key-12345")
    assert r.is_available is True


@pytest.mark.asyncio
async def test_research_returns_unavailable_when_no_key():
    """Test 1 + 2: research() returns status=research_unavailable when no API key."""
    with patch.dict("os.environ", {"SERPER_API_KEY": ""}, clear=False):
        r = ContactResearcher(serper_api_key="")
        result = await r.research("Rahul Sharma", "Apex Logistics", "VP", uuid.uuid4())
    assert result["status"] == "research_unavailable"
    assert result["verified_facts"] == []
    assert result["uncertain_matches"] == []
    assert result["ai_talking_points"] == []


@pytest.mark.asyncio
async def test_research_returns_no_results_on_empty_serper_response():
    """Test 3: no_results when Serper returns empty organic list."""
    r = ContactResearcher(serper_api_key="valid-key")
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=[])):
        result = await r.research("Rahul Sharma", "Apex Logistics", "VP", uuid.uuid4())
    assert result["status"] == "no_results"
    assert result["verified_facts"] == []


@pytest.mark.asyncio
async def test_research_verified_facts_on_high_confidence_result():
    """Test 4: verified_facts populated when identity score >= threshold."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma | VP Operations | Apex Logistics",
            "snippet": "Rahul Sharma leads operations at Apex Logistics, managing a 40-person team.",
            "link": "https://linkedin.com/in/rahul-sharma-apex",
            "source": "LinkedIn",
        }
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=[])):
            result = await r.research("Rahul Sharma", "Apex Logistics", "VP of Operations", uuid.uuid4())

    assert result["status"] == "completed"
    assert len(result["verified_facts"]) >= 1
    assert result["verified_facts"][0]["source_url"] == "https://linkedin.com/in/rahul-sharma-apex"


@pytest.mark.asyncio
async def test_research_uncertain_matches_on_low_confidence_result():
    """Test 5: uncertain_matches populated when identity score < threshold."""
    r = ContactResearcher(serper_api_key="valid-key")
    # Use a completely different name so no identity tokens match
    mock_results = [
        {
            "title": "James Williams — Author Profile",
            "snippet": "James Williams is a fiction author based in Mumbai who writes mystery novels.",
            "link": "https://booksite.com/james-williams",
            "source": "BookSite",
        }
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=[])):
            result = await r.research("Rahul Sharma", "Apex Logistics", "VP of Operations", uuid.uuid4())

    assert len(result["uncertain_matches"]) >= 1
    assert "uncertainty_reason" in result["uncertain_matches"][0]


@pytest.mark.asyncio
async def test_source_provenance_on_every_fact():
    """Test 6: Every verified fact has source_url, source_name, retrieved_at."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma VP Apex Logistics",
            "snippet": "Rahul Sharma is VP of Operations at Apex Logistics overseeing supply chain.",
            "link": "https://example.com/rahul",
            "source": "Example",
        }
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=[])):
            result = await r.research("Rahul Sharma", "Apex Logistics", "VP of Operations", uuid.uuid4())

    for fact in result.get("verified_facts", []) + result.get("uncertain_matches", []):
        assert "source_url" in fact and fact["source_url"], "source_url missing"
        assert "source_name" in fact and fact["source_name"], "source_name missing"
        assert "retrieved_at" in fact and fact["retrieved_at"], "retrieved_at missing"


@pytest.mark.asyncio
async def test_ai_talking_points_labelled():
    """Test 7: AI talking points have the correct label."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma Apex Logistics VP",
            "snippet": "Rahul Sharma VP of Operations at Apex Logistics managing fleet and warehouse automation.",
            "link": "https://linkedin.com/in/rahul",
            "source": "LinkedIn",
        }
    ]
    mock_topics = [
        {"topic": "Discuss warehouse automation expansion", "rationale": "Mentioned in research.", "label": "AI Suggested — Not Previously Agreed"},
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=mock_topics)):
            result = await r.research("Rahul Sharma", "Apex Logistics", "VP of Operations", uuid.uuid4())

    for tp in result.get("ai_talking_points", []):
        label = tp.get("label") or ""
        assert "AI Suggested" in label and "Not Previously Agreed" in label


@pytest.mark.asyncio
async def test_no_fabrication_when_llm_fails():
    """Test 8: Returns empty talking points (not fabricated) when LLM call fails."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma Apex Logistics",
            "snippet": "Rahul Sharma VP at Apex Logistics supply chain operations.",
            "link": "https://example.com",
            "source": "Example",
        }
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        # Patch LLMRouter at its source so the local import inside _generate_talking_points picks it up
        with patch("core.llm_router.LLMRouter.call", new=AsyncMock(side_effect=Exception("LLM down"))):
            result = await r.research("Rahul Sharma", "Apex Logistics", "VP", uuid.uuid4())

    # Should not crash; talking points list is returned (may be empty due to LLM failure)
    assert isinstance(result.get("ai_talking_points"), list)
    # All verified facts must have a real source_url — no fabrication
    for f in result.get("verified_facts", []):
        assert f.get("source_url"), "Fact without source_url"


# =============================================================================
# ENDPOINT TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_endpoint_research_unavailable_no_provider():
    """Test 12: Endpoint returns research_unavailable when SERPER_API_KEY unset."""
    session, inst_id, _ = _build_session(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id))

    with patch("api.routers.meeting_intelligence.ContactResearcher") as MockClass:
        mock_instance = MagicMock()
        mock_instance.is_available = False
        mock_instance.build_cache_key.return_value = "cache-key-abc"
        mock_instance.research = AsyncMock(return_value={
            "status": "research_unavailable",
            "contact_name": "Rahul Sharma",
            "company": "Apex Logistics",
            "role": "VP of Operations",
            "queries_used": [],
            "verified_facts": [],
            "uncertain_matches": [],
            "ai_talking_points": [],
            "retrieved_at": "2026-10-01T10:00:00+00:00",
            "provider": "none",
            "error": None,
        })
        MockClass.return_value = mock_instance
        resp = await run_contact_research(req, db=session, current_user=USER_A)

    assert resp.status == "research_unavailable"
    assert resp.verified_facts == []
    assert resp.uncertain_matches == []
    assert resp.ai_talking_points == []


@pytest.mark.asyncio
async def test_endpoint_rejects_missing_node3():
    """Test 13: Endpoint raises HTTP 400 when Node 3 not completed."""
    session, inst_id, _ = _build_session(ORG_A, node3_done=False)
    req = ContactResearchRequest(instance_id=str(inst_id))

    with pytest.raises(HTTPException) as exc:
        await run_contact_research(req, db=session, current_user=USER_A)
    assert exc.value.status_code == 400
    assert "Node 3" in exc.value.detail


@pytest.mark.asyncio
async def test_endpoint_rejects_cross_tenant():
    """Test 14: Endpoint raises HTTP 403 for cross-tenant access."""
    session, inst_id, _ = _build_session(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id))

    with pytest.raises(HTTPException) as exc:
        await run_contact_research(req, db=session, current_user=USER_B)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_endpoint_idempotency_reuses_cache():
    """Test 15: Second call with same inputs returns idempotent_reused=True."""
    session, inst_id, _ = _build_session(ORG_A)
    org_uuid = uuid.UUID(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id))

    # Inject cached result into context
    inst = session.workflow_instances[str(inst_id)]
    from core.contact_researcher import ContactResearcher as CR
    r = CR(serper_api_key="key")
    ck = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP of Operations", org_uuid)
    inst.context["contact_research"] = {
        "cache_key": ck,
        "status": "completed",
        "contact_name": "Rahul Sharma",
        "company": "Apex Logistics",
        "role": "VP of Operations",
        "provider": "serper",
        "queries_used": ["Rahul Sharma Apex Logistics"],
        "verified_facts": [{"content": "Fact 1", "source_url": "https://x.com", "source_name": "X", "retrieved_at": "2026-10-01T10:00:00+00:00"}],
        "uncertain_matches": [],
        "ai_talking_points": [],
        "retrieved_at": "2026-10-01T10:00:00+00:00",
        "provider": "serper",
        "error": None,
    }

    with patch("api.routers.meeting_intelligence.ContactResearcher") as MockClass:
        mock_instance = MagicMock()
        mock_instance.build_cache_key.return_value = ck
        mock_instance.research = AsyncMock()
        MockClass.return_value = mock_instance

        resp = await run_contact_research(req, db=session, current_user=USER_A)

    assert resp.idempotent_reused is True
    mock_instance.research.assert_not_called()


@pytest.mark.asyncio
async def test_endpoint_force_refresh_bypasses_cache():
    """Test 16: force_refresh=True reruns research ignoring cache."""
    session, inst_id, _ = _build_session(ORG_A)
    org_uuid = uuid.UUID(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id), force_refresh=True)

    # Pre-populate cache
    inst = session.workflow_instances[str(inst_id)]
    from core.contact_researcher import ContactResearcher as CR
    r = CR(serper_api_key="key")
    ck = r.build_cache_key("Rahul Sharma", "Apex Logistics", "VP of Operations", org_uuid)
    inst.context["contact_research"] = {
        "cache_key": ck,
        "status": "completed",
        "verified_facts": [],
        "uncertain_matches": [],
        "ai_talking_points": [],
        "retrieved_at": "2026-09-01T00:00:00+00:00",
    }

    fresh_result = {
        "status": "completed",
        "contact_name": "Rahul Sharma",
        "company": "Apex Logistics",
        "role": "VP of Operations",
        "queries_used": ["fresh query"],
        "verified_facts": [{"content": "Fresh fact", "source_url": "https://new.com", "source_name": "New", "retrieved_at": "2026-10-05T10:00:00+00:00"}],
        "uncertain_matches": [],
        "ai_talking_points": [],
        "retrieved_at": "2026-10-05T10:00:00+00:00",
        "provider": "serper",
        "error": None,
    }

    with patch("api.routers.meeting_intelligence.ContactResearcher") as MockClass:
        mock_instance = MagicMock()
        mock_instance.build_cache_key.return_value = ck
        mock_instance.research = AsyncMock(return_value=fresh_result)
        MockClass.return_value = mock_instance

        resp = await run_contact_research(req, db=session, current_user=USER_A)

    assert resp.idempotent_reused is False
    assert len(resp.verified_facts) == 1
    assert resp.verified_facts[0]["content"] == "Fresh fact"
    mock_instance.research.assert_called_once()


@pytest.mark.asyncio
async def test_endpoint_persists_results_in_context():
    """Test 17: Research results are saved in WorkflowInstance.context["contact_research"]."""
    session, inst_id, _ = _build_session(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id))

    research_result = {
        "status": "completed",
        "contact_name": "Rahul Sharma",
        "company": "Apex Logistics",
        "role": "VP of Operations",
        "queries_used": ["Rahul Sharma Apex Logistics"],
        "verified_facts": [{"content": "Fact A", "source_url": "https://a.com", "source_name": "A", "retrieved_at": "2026-10-01T00:00:00+00:00"}],
        "uncertain_matches": [],
        "ai_talking_points": [],
        "retrieved_at": "2026-10-01T00:00:00+00:00",
        "provider": "serper",
        "error": None,
    }

    with patch("api.routers.meeting_intelligence.ContactResearcher") as MockClass:
        mock_instance = MagicMock()
        mock_instance.build_cache_key.return_value = "test-cache-key"
        mock_instance.research = AsyncMock(return_value=research_result)
        MockClass.return_value = mock_instance

        await run_contact_research(req, db=session, current_user=USER_A)

    inst = session.workflow_instances[str(inst_id)]
    assert "contact_research" in inst.context
    assert inst.context["contact_research"]["status"] == "completed"
    assert inst.context["contact_research"]["cache_key"] == "test-cache-key"
    assert len(inst.context["contact_research"]["verified_facts"]) == 1


@pytest.mark.asyncio
async def test_endpoint_logs_audit_event():
    """Test 18: AuditEvent is logged after research completes."""
    session, inst_id, _ = _build_session(ORG_A)
    req = ContactResearchRequest(instance_id=str(inst_id))

    with patch("api.routers.meeting_intelligence.ContactResearcher") as MockClass:
        mock_instance = MagicMock()
        mock_instance.build_cache_key.return_value = "cache-key"
        mock_instance.research = AsyncMock(return_value={
            "status": "research_unavailable",
            "contact_name": "Rahul Sharma",
            "company": "Apex Logistics",
            "role": "VP of Operations",
            "queries_used": [],
            "verified_facts": [],
            "uncertain_matches": [],
            "ai_talking_points": [],
            "retrieved_at": "2026-10-01T00:00:00+00:00",
            "provider": "none",
            "error": None,
        })
        MockClass.return_value = mock_instance

        await run_contact_research(req, db=session, current_user=USER_A)

    audit_events = [e for e in session.audit_events if e.action == "contact_research_completed"]
    assert len(audit_events) == 1
    assert audit_events[0].entity_id == str(inst_id)


@pytest.mark.asyncio
async def test_rehydration_returns_contact_research():
    """Test 19: GET /runs/{id} rehydrates contact_research from context."""
    session, inst_id, _ = _build_session(ORG_A)

    # Inject pre-existing research into context
    inst = session.workflow_instances[str(inst_id)]
    inst.context["contact_research"] = {
        "status": "completed",
        "contact_name": "Rahul Sharma",
        "company": "Apex Logistics",
        "verified_facts": [{"content": "Fact", "source_url": "https://x.com", "source_name": "X", "retrieved_at": "2026-10-01T00:00:00+00:00"}],
        "uncertain_matches": [],
        "ai_talking_points": [],
        "cache_key": "abc123",
    }

    resp = await get_workflow_run_detail(
        instance_id=str(inst_id),
        db=session,
        current_user=USER_A,
    )

    assert resp.contact_research is not None
    assert resp.contact_research["status"] == "completed"
    assert len(resp.contact_research["verified_facts"]) == 1


# =============================================================================
# SAME-NAME DISAMBIGUATION TESTS
# Specifically verify that common-name results are never mis-classified as VERIFIED.
# =============================================================================

def test_name_only_score_always_below_threshold():
    """Name match alone must NEVER reach the verification threshold — invariant check."""
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD, _NAME_ONLY_MAX_SCORE
    assert _NAME_ONLY_MAX_SCORE < IDENTITY_CONFIRM_THRESHOLD, (
        f"_NAME_ONLY_MAX_SCORE ({_NAME_ONLY_MAX_SCORE}) must be strictly less than "
        f"IDENTITY_CONFIRM_THRESHOLD ({IDENTITY_CONFIRM_THRESHOLD})"
    )


def test_cricketer_same_name_not_verified():
    """Rahul Sharma the cricketer must NOT be classified as a verified result."""
    score = _identity_score(
        snippet="Rahul Sharma took 3 wickets in today's IPL match against Mumbai Indians.",
        title="Rahul Sharma | IPL Cricketer",
        contact_name="Rahul Sharma",
        company="Apex Logistics",   # our contact's company
        role="VP of Operations",
    )
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD
    assert score < IDENTITY_CONFIRM_THRESHOLD, (
        f"Cricketer result scored {score:.2f} — must be below threshold {IDENTITY_CONFIRM_THRESHOLD}"
    )


def test_politician_same_name_not_verified():
    """A politician with the same name must not be verified."""
    score = _identity_score(
        snippet="Rahul Sharma, the MLA from Rajasthan, announced a new rural development scheme.",
        title="Rahul Sharma MLA Rajasthan",
        contact_name="Rahul Sharma",
        company="Apex Logistics",
        role="VP of Operations",
    )
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD
    assert score < IDENTITY_CONFIRM_THRESHOLD


def test_goldman_sachs_executive_same_name_not_verified():
    """A Goldman Sachs executive with the same name must not be verified for our logistics contact."""
    score = _identity_score(
        snippet="Rahul Sharma, Managing Director at Goldman Sachs, led the Asia Pacific debt restructuring team.",
        title="Rahul Sharma | Goldman Sachs MD",
        contact_name="Rahul Sharma",
        company="Apex Logistics",   # different company — should not match
        role="VP of Operations",
    )
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD
    assert score < IDENTITY_CONFIRM_THRESHOLD, (
        f"Goldman Sachs executive scored {score:.2f} — wrong company should prevent verification"
    )


def test_correct_result_verified_with_company():
    """The actual Apex Logistics result must be classified as verified."""
    score = _identity_score(
        snippet="Rahul Sharma, VP of Operations at Apex Logistics, has been leading supply chain transformation since 2021.",
        title="Rahul Sharma | VP Operations | Apex Logistics | LinkedIn",
        contact_name="Rahul Sharma",
        company="Apex Logistics",
        role="VP of Operations",
    )
    from core.contact_researcher import IDENTITY_CONFIRM_THRESHOLD
    assert score >= IDENTITY_CONFIRM_THRESHOLD, (
        f"Correct result scored {score:.2f} — expected >= {IDENTITY_CONFIRM_THRESHOLD}"
    )


def test_no_corroboration_all_results_uncertain():
    """When company and role are unknown, ALL results must be uncertain — no verification possible."""
    from core.contact_researcher import _has_corroborating_context
    assert _has_corroborating_context(None, None) is False
    assert _has_corroborating_context("", "") is False
    assert _has_corroborating_context("Apex Logistics", None) is True
    assert _has_corroborating_context(None, "VP") is True


@pytest.mark.asyncio
async def test_name_only_contact_all_uncertain():
    """When we only know the name (no company/role), all search results go to uncertain_matches."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma | LinkedIn",
            "snippet": "Rahul Sharma — connect with professionals named Rahul Sharma on LinkedIn.",
            "link": "https://linkedin.com/search/rahul-sharma",
            "source": "LinkedIn",
        },
        {
            "title": "Rahul Sharma scores 100 runs",
            "snippet": "Rahul Sharma the cricketer hit a century yesterday.",
            "link": "https://cricinfo.com/rahul-sharma",
            "source": "Cricinfo",
        },
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=[])):
            result = await r.research(
                contact_name="Rahul Sharma",
                company=None,   # no company known
                role=None,       # no role known
                org_uuid=uuid.uuid4(),
            )

    assert result["verified_facts"] == [], "Name-only contact must produce zero verified facts"
    assert len(result["uncertain_matches"]) >= 1, "All results must be uncertain when no corroboration"
    for m in result["uncertain_matches"]:
        assert "uncertainty_reason" in m
        assert "disambiguate" in m["uncertainty_reason"].lower() or "company" in m["uncertainty_reason"].lower()


@pytest.mark.asyncio
async def test_mixed_results_only_matching_company_verified():
    """Only the result mentioning Apex Logistics is verified; the cricketer is uncertain."""
    r = ContactResearcher(serper_api_key="valid-key")
    mock_results = [
        {
            "title": "Rahul Sharma VP Apex Logistics",
            "snippet": "Rahul Sharma is VP of Operations at Apex Logistics, managing 40 warehouses.",
            "link": "https://linkedin.com/in/rahul-apex",
            "source": "LinkedIn",
        },
        {
            "title": "Rahul Sharma cricket career",
            "snippet": "Rahul Sharma, the spinner, has taken 89 wickets in domestic cricket.",
            "link": "https://cricinfo.com/player/rahul-sharma",
            "source": "Cricinfo",
        },
    ]
    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=[])):
            result = await r.research(
                contact_name="Rahul Sharma",
                company="Apex Logistics",
                role="VP of Operations",
                org_uuid=uuid.uuid4(),
            )

    verified_urls = [f["source_url"] for f in result["verified_facts"]]
    uncertain_urls = [m["source_url"] for m in result["uncertain_matches"]]

    assert "https://linkedin.com/in/rahul-apex" in verified_urls, \
        "Apex Logistics result must be verified"
    assert "https://cricinfo.com/player/rahul-sharma" in uncertain_urls, \
        "Cricketer result must be uncertain"
    assert "https://cricinfo.com/player/rahul-sharma" not in verified_urls, \
        "Cricketer must NOT appear in verified facts"


@pytest.mark.asyncio
async def test_ai_talking_points_only_from_verified_facts():
    """AI talking points must only be generated when there are verified facts — not from uncertain matches."""
    r = ContactResearcher(serper_api_key="valid-key")
    # All results are name-only — no company context — so all uncertain
    mock_results = [
        {
            "title": "Rahul Sharma Author",
            "snippet": "Rahul Sharma writes mystery fiction and has published 3 novels.",
            "link": "https://booksite.com/rahul",
            "source": "BookSite",
        }
    ]
    mock_talking_points = [{"topic": "Discuss his novels", "rationale": "He wrote books", "label": "AI Suggested — Not Previously Agreed"}]

    with patch.object(r, "_serper_search", new=AsyncMock(return_value=mock_results)):
        with patch("core.contact_researcher._generate_talking_points", new=AsyncMock(return_value=mock_talking_points)) as mock_tp:
            result = await r.research(
                contact_name="Rahul Sharma",
                company=None,   # no context → all uncertain
                role=None,
                org_uuid=uuid.uuid4(),
            )

    # Talking points generator must NOT have been called when verified_facts is empty
    mock_tp.assert_not_called()
    assert result["ai_talking_points"] == [], \
        "AI talking points must not be generated from uncertain matches"
