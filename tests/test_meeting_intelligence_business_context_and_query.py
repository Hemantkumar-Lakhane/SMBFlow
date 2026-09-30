"""
tests/test_meeting_intelligence_business_context_and_query.py
============================================================
Comprehensive automated test suite for Meeting Intelligence & Follow-up:
A. BUSINESS CONTEXT PACK
B. NATURAL-LANGUAGE CENTRAL MEMORY QUERY

Verifies:
1. Tenant isolation for Business Context Pack: Org A and Org B configs remain strictly isolated.
2. Empty Business Context: valid, returns defaults, format helper returns empty string, no crashes.
3. Context persistence & update: updates saved to Organization.profile_config["business_context"], returns timestamp and user.
4. Grounded memory answers: natural-language questions ("What did Rahul commit to?", "What opportunities have we discussed with Rahul?") return grounded answers.
5. No-result queries: queries with no matching contact/topic return clean insufficient-evidence messages without fabricating facts.
6. Source conversation references: every factual answer cites source conversation ID, title, date, contact name, and workflow instance.
7. Exclusion of unrelated / uncertain research: uncertain contact research is excluded from conversation memory citations.
8. Repeated queries without data mutation: pure read-only execution, 0 database mutations across repeated queries.
9. Tenant isolation for Central Memory Query: Org B cannot see or query Org A's relationship data or conversations.
10. Timing / recency query: "When did we last discuss the AI pilot?" identifies latest conversation date and source.
11. Organization-wide commitments query: "What are my pending commitments?" aggregates across contacts.
12. API endpoints: GET / PUT /business-context, POST /central-memory/query, POST /memory/query.
"""

import uuid
import pytest
from datetime import datetime
from unittest.mock import MagicMock

from api.auth import TokenData
from api.routers.meeting_intelligence import (
    BusinessContextResponse,
    BusinessContextUpdateRequest,
    CentralMemoryQueryRequest,
    CentralMemoryQueryResponse,
    get_business_context_endpoint,
    update_business_context_endpoint,
    query_central_memory_endpoint,
    query_memory_alias_endpoint,
)
from core.business_context import (
    DEFAULT_BUSINESS_CONTEXT,
    format_business_context_for_prompt,
    get_business_context,
    update_business_context,
)
from core.central_memory_query import query_central_memory
from db.models.core import (
    Organization,
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
)

ORG_A_ID = "11111111-1111-1111-1111-111111111111"
ORG_B_ID = "22222222-2222-2222-2222-222222222222"

USER_A = TokenData(
    user_id=str(uuid.uuid4()),
    email="alice@company-a.com",
    role="org_admin",
    organization_id=ORG_A_ID,
    tenant_id=ORG_A_ID,
)

USER_B = TokenData(
    user_id=str(uuid.uuid4()),
    email="bob@company-b.com",
    role="org_admin",
    organization_id=ORG_B_ID,
    tenant_id=ORG_B_ID,
)


class MockDatabaseSession:
    """In-memory mock SQLAlchemy AsyncSession for Business Context & Central Memory Query tests."""

    def __init__(self):
        self.organizations: dict = {}
        self.contacts: dict = {}
        self.conversations: dict = {}
        self.memory_items: list = []

    def add(self, obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, Organization):
            self.organizations[str(obj.id)] = obj
        elif isinstance(obj, RelationshipContact):
            self.contacts[str(obj.id)] = obj
        elif isinstance(obj, RelationshipConversation):
            self.conversations[str(obj.id)] = obj
        elif isinstance(obj, RelationshipMemoryItem):
            self.memory_items.append(obj)

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

        if "organizations" in stmt_str:
            matched = list(self.organizations.values())
            for org_id, org in self.organizations.items():
                if org_id.lower() in param_vals:
                    matched = [org]
                    break
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_contacts" in stmt_str:
            matched = list(self.contacts.values())
            # filter by organization_id
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [c for c in matched if str(c.organization_id).lower() == p]
            # filter by contact id
            for cid in self.contacts.keys():
                if cid.lower() in param_vals:
                    matched = [c for c in matched if str(c.id).lower() == cid.lower()]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_conversations" in stmt_str:
            matched = list(self.conversations.values())
            # filter by org
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [c for c in matched if str(c.organization_id).lower() == p]
            # filter by contact_id if in params
            for cid in self.contacts.keys():
                if cid.lower() in param_vals:
                    matched = [c for c in matched if str(c.contact_id).lower() == cid.lower()]
            if "desc" in stmt_str:
                matched = sorted(matched, key=lambda x: getattr(x, "created_at", None) or datetime.min, reverse=True)
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        elif "relationship_memory_items" in stmt_str:
            matched = list(self.memory_items)
            # filter by org
            for p in [ORG_A_ID.lower(), ORG_B_ID.lower()]:
                if p in param_vals:
                    matched = [m for m in matched if str(m.organization_id).lower() == p]
            # filter by contact_id if in params
            for cid in self.contacts.keys():
                if cid.lower() in param_vals:
                    matched = [m for m in matched if str(m.contact_id).lower() == cid.lower()]
            # filter by category if in params
            for cat in ["commitment", "opportunity", "need", "interest", "fact", "suggested_action", "open_question"]:
                if cat in param_vals:
                    matched = [m for m in matched if m.category == cat]
            mock.scalars = lambda: MagicMock(first=lambda: matched[0] if matched else None, all=lambda: matched)

        else:
            mock.scalars = lambda: MagicMock(first=lambda: None, all=lambda: [])

        return mock


def _seed_sample_relationship_data(session: MockDatabaseSession):
    """Seed test contacts, conversations, and granular memory items for Org A."""
    # Org A & Org B organizations
    org_a = Organization(
        id=uuid.UUID(ORG_A_ID),
        name="Acme Solutions Inc",
        industry="saas",
        active=True,
        profile_config={},
    )
    org_b = Organization(
        id=uuid.UUID(ORG_B_ID),
        name="Beta Logistics Corp",
        industry="logistics",
        active=True,
        profile_config={},
    )
    session.add(org_a)
    session.add(org_b)

    # Contact: Rahul Sharma (Org A)
    # Includes uncertain contact research in metadata to test exclusion
    contact_rahul = RelationshipContact(
        id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
        organization_id=uuid.UUID(ORG_A_ID),
        name="Rahul Sharma",
        normalized_name="rahul sharma",
        role="VP Engineering",
        company="TechCorp Enterprises",
        metadata_={
            "contact_research": {
                "status": "completed",
                "notes": "Unverified public web summary: May have worked at Oracle prior to 2020.",
                "confidence": "uncertain",
            }
        },
    )
    session.add(contact_rahul)

    # Conversation 1: Strategy Sync (Org A)
    wf_inst_1 = uuid.uuid4()
    conv1 = RelationshipConversation(
        id=uuid.UUID("44444444-4444-4444-4444-444444444444"),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        workflow_instance_id=wf_inst_1,
        title="Q1 Strategy Sync with Rahul",
        conversation_type="Online Meeting",
        conversation_date="2026-03-15",
        transcript="Discussed API pilot and upcoming expansion. Rahul agreed to share security audit by Friday.",
        summary="Strategic alignment on enterprise pilot and security prerequisites.",
    )
    session.add(conv1)

    # Memory items for Conv 1
    session.add(RelationshipMemoryItem(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        conversation_id=conv1.id,
        workflow_instance_id=wf_inst_1,
        category="commitment",
        content="Share security audit documentation by Friday",
        details={"owner": "Rahul", "due_date": "2026-03-20"},
        source_date="2026-03-15",
        is_ai_generated=False,
    ))
    session.add(RelationshipMemoryItem(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        conversation_id=conv1.id,
        workflow_instance_id=wf_inst_1,
        category="opportunity",
        content="Enterprise pilot deployment for 50 engineer seats",
        details={"person": "Rahul"},
        source_date="2026-03-15",
        is_ai_generated=False,
    ))

    # Conversation 2: AI Pilot Technical Review (Org A - later date)
    wf_inst_2 = uuid.uuid4()
    conv2 = RelationshipConversation(
        id=uuid.UUID("55555555-5555-5555-5555-555555555555"),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        workflow_instance_id=wf_inst_2,
        title="AI Pilot Architecture Review",
        conversation_type="Online Meeting",
        conversation_date="2026-03-22",
        transcript="Reviewed the AI pilot integration roadmap. Rahul committed to provide sample test data next Tuesday.",
        summary="Architecture review for the AI pilot.",
    )
    session.add(conv2)

    session.add(RelationshipMemoryItem(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        conversation_id=conv2.id,
        workflow_instance_id=wf_inst_2,
        category="commitment",
        content="Provide sample test datasets for AI pilot benchmarking",
        details={"owner": "Rahul", "due_date": "2026-03-25"},
        source_date="2026-03-22",
        is_ai_generated=False,
    ))
    session.add(RelationshipMemoryItem(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(ORG_A_ID),
        contact_id=contact_rahul.id,
        conversation_id=conv2.id,
        workflow_instance_id=wf_inst_2,
        category="need",
        content="Requires SOC2-compliant data handling for all pilot logs",
        details={"person": "Rahul"},
        source_date="2026-03-22",
        is_ai_generated=False,
    ))


# =============================================================================
# PART A: BUSINESS CONTEXT PACK TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_empty_business_context():
    """Verify empty business context returns valid defaults and does not crash."""
    session = MockDatabaseSession()
    org_a = Organization(
        id=uuid.UUID(ORG_A_ID),
        name="Acme Solutions Inc",
        industry="saas",
        profile_config={},
    )
    session.add(org_a)

    ctx = await get_business_context(session, uuid.UUID(ORG_A_ID))
    assert isinstance(ctx, dict)
    assert ctx["services_offerings"] == ""
    assert ctx["target_market"] == ""
    assert ctx["business_priorities"] == ""
    assert ctx["additional_context"] == ""
    assert ctx["updated_at"] is None

    # Prompt formatter returns empty string when context is empty
    formatted = format_business_context_for_prompt(ctx)
    assert formatted == ""
    assert format_business_context_for_prompt({}) == ""
    assert format_business_context_for_prompt(None) == ""


@pytest.mark.asyncio
async def test_business_context_persistence_and_update():
    """Verify context can be updated, persisted to profile_config, and retrieved."""
    session = MockDatabaseSession()
    org_a = Organization(
        id=uuid.UUID(ORG_A_ID),
        name="Acme Solutions Inc",
        industry="saas",
        profile_config={},
    )
    session.add(org_a)

    update_data = {
        "services_offerings": "SMB workflow automation, Meeting Intelligence, AI Agent orchestration",
        "target_market": "B2B SaaS companies with 10-200 employees",
        "business_priorities": "Q1 Pilot conversions, Security hardening",
        "additional_context": "Strict enterprise SLAs; 99.9% uptime requirement",
    }

    updated = await update_business_context(
        session,
        uuid.UUID(ORG_A_ID),
        update_data,
        updated_by="alice@company-a.com",
    )
    assert updated["services_offerings"] == update_data["services_offerings"]
    assert updated["target_market"] == update_data["target_market"]
    assert updated["business_priorities"] == update_data["business_priorities"]
    assert updated["additional_context"] == update_data["additional_context"]
    assert updated["updated_by"] == "alice@company-a.com"
    assert updated["updated_at"] is not None

    # Re-retrieve from DB
    retrieved = await get_business_context(session, uuid.UUID(ORG_A_ID))
    assert retrieved["services_offerings"] == update_data["services_offerings"]
    assert retrieved["business_priorities"] == update_data["business_priorities"]

    # Verify prompt formatting includes all sections
    prompt_text = format_business_context_for_prompt(retrieved)
    assert "ORGANIZATION BUSINESS CONTEXT:" in prompt_text
    assert "SMB workflow automation" in prompt_text
    assert "B2B SaaS companies" in prompt_text
    assert "Q1 Pilot conversions" in prompt_text


@pytest.mark.asyncio
async def test_business_context_tenant_isolation():
    """Verify Org A's business context is strictly invisible to Org B."""
    session = MockDatabaseSession()
    org_a = Organization(
        id=uuid.UUID(ORG_A_ID),
        name="Acme Solutions Inc",
        profile_config={},
    )
    org_b = Organization(
        id=uuid.UUID(ORG_B_ID),
        name="Beta Logistics Corp",
        profile_config={},
    )
    session.add(org_a)
    session.add(org_b)

    # Configure Org A
    await update_business_context(
        session,
        uuid.UUID(ORG_A_ID),
        {"services_offerings": "Proprietary Acme Engine"},
        updated_by="alice@company-a.com",
    )

    # Org B retrieves context -> must be empty default
    ctx_b = await get_business_context(session, uuid.UUID(ORG_B_ID))
    assert ctx_b["services_offerings"] == ""
    assert "Proprietary Acme Engine" not in str(ctx_b)


@pytest.mark.asyncio
async def test_business_context_api_endpoints():
    """Verify GET and PUT /business-context API endpoints."""
    session = MockDatabaseSession()
    org_a = Organization(
        id=uuid.UUID(ORG_A_ID),
        name="Acme Solutions Inc",
        profile_config={},
    )
    session.add(org_a)

    # GET default
    resp_get = await get_business_context_endpoint(db=session, current_user=USER_A)
    assert resp_get.services_offerings == ""

    # PUT update
    req_update = BusinessContextUpdateRequest(
        services_offerings="AI Legal Summaries",
        target_market="Law firms and corporate legal departments",
        business_priorities="Achieve SOC2 certification",
        additional_context="Pricing: $499/mo standard tier",
    )
    resp_put = await update_business_context_endpoint(req=req_update, db=session, current_user=USER_A)
    assert resp_put.services_offerings == "AI Legal Summaries"
    assert resp_put.target_market == "Law firms and corporate legal departments"
    assert resp_put.message is not None

    # Re-GET
    resp_get2 = await get_business_context_endpoint(db=session, current_user=USER_A)
    assert resp_get2.services_offerings == "AI Legal Summaries"


# =============================================================================
# PART B: NATURAL-LANGUAGE CENTRAL MEMORY QUERY TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_grounded_memory_commitments_query():
    """Verify 'What did Rahul commit to?' returns grounded answers with source citations."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    res = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What did Rahul commit to?",
        use_llm=False,  # Test deterministic path directly
    )

    assert res["has_results"] is True
    assert res["confidence"] == "high"
    assert "Rahul Sharma" in res["answer"]
    assert "Share security audit documentation by Friday" in res["answer"]
    assert "Provide sample test datasets" in res["answer"]

    # Verify source conversation provenance
    assert len(res["sources"]) >= 2
    source_titles = [s["title"] for s in res["sources"]]
    assert "Q1 Strategy Sync with Rahul" in source_titles
    assert "AI Pilot Architecture Review" in source_titles

    # Verify cited items details
    assert len(res["cited_items"]) >= 2
    for item in res["cited_items"]:
        assert item["category"] == "commitment"
        assert item["source_conversation_id"] is not None
        assert item["source_date"] in ("2026-03-15", "2026-03-22")


@pytest.mark.asyncio
async def test_grounded_memory_opportunities_query():
    """Verify 'What opportunities have we discussed with Rahul?' returns grounded opportunity."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    res = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What opportunities have we discussed with Rahul?",
        use_llm=False,
    )

    assert res["has_results"] is True
    assert "Enterprise pilot deployment for 50 engineer seats" in res["answer"]
    assert len(res["sources"]) >= 1
    assert res["sources"][0]["title"] == "Q1 Strategy Sync with Rahul"
    assert res["sources"][0]["date"] == "2026-03-15"


@pytest.mark.asyncio
async def test_recency_query_timing():
    """Verify 'When did we last discuss the AI pilot?' identifies the latest conversation date and source."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    res = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="When did we last discuss the AI pilot?",
        use_llm=False,
    )

    assert res["has_results"] is True
    assert "2026-03-22" in res["answer"]
    assert "AI Pilot Architecture Review" in res["answer"]
    assert len(res["sources"]) >= 1
    assert res["sources"][0]["date"] == "2026-03-22"


@pytest.mark.asyncio
async def test_all_pending_commitments_query():
    """Verify 'What are my pending commitments?' queries across contacts."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    res = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What are my pending commitments?",
        use_llm=False,
    )

    assert res["has_results"] is True
    assert "Share security audit" in res["answer"]
    assert len(res["cited_items"]) >= 2


@pytest.mark.asyncio
async def test_no_result_query_no_hallucination():
    """Verify questions with no matching memory return clear insufficient-evidence message."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    # 1. Non-existent topic for existing contact
    res1 = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What did Rahul say about quantum cryptography?",
        use_llm=False,
    )
    assert res1["has_results"] is False
    assert res1["confidence"] == "none"
    assert len(res1["sources"]) == 0
    assert len(res1["cited_items"]) == 0
    assert "No relationship memory" in res1["answer"] or "not contain" in res1["answer"]

    # 2. Non-existent contact
    res2 = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What did Elena Rostova commit to?",
        use_llm=False,
    )
    assert res2["has_results"] is False
    assert res2["confidence"] == "none"
    assert len(res2["sources"]) == 0
    assert "not contain information" in res2["answer"] or "No relationship memory" in res2["answer"]


@pytest.mark.asyncio
async def test_exclusion_of_uncertain_contact_research():
    """Verify uncertain contact research in contact.metadata_ is NOT treated as conversation memory facts."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    res = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_A_ID),
        query_text="What do we know about Rahul?",
        use_llm=False,
    )

    # Must NOT include the unverified Oracle research note as a conversation fact
    assert "worked at Oracle prior to 2020" not in res["answer"]

    # All cited sources must be from actual RelationshipConversation records
    for s in res["sources"]:
        assert s["conversation_id"] in (
            "44444444-4444-4444-4444-444444444444",
            "55555555-5555-5555-5555-555555555555",
        )


@pytest.mark.asyncio
async def test_repeated_queries_without_data_mutation():
    """Verify repeated queries are idempotent and do NOT mutate or insert any database rows."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    init_contacts_count = len(session.contacts)
    init_convs_count = len(session.conversations)
    init_items_count = len(session.memory_items)

    # Run query 5 times
    for _ in range(5):
        res = await query_central_memory(
            db=session,
            org_uuid=uuid.UUID(ORG_A_ID),
            query_text="What did Rahul commit to?",
            use_llm=False,
        )
        assert res["has_results"] is True

    # Counts must remain completely unchanged
    assert len(session.contacts) == init_contacts_count
    assert len(session.conversations) == init_convs_count
    assert len(session.memory_items) == init_items_count


@pytest.mark.asyncio
async def test_central_memory_query_tenant_isolation():
    """Verify Org B cannot access Org A's relationship data, contacts, or conversations."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    # Org B queries about Rahul (who only exists in Org A)
    res_b = await query_central_memory(
        db=session,
        org_uuid=uuid.UUID(ORG_B_ID),
        query_text="What did Rahul commit to?",
        use_llm=False,
    )

    assert res_b["has_results"] is False
    assert len(res_b["sources"]) == 0
    assert len(res_b["cited_items"]) == 0
    assert "Share security audit" not in res_b["answer"]
    assert "Provide sample test datasets" not in res_b["answer"]


@pytest.mark.asyncio
async def test_central_memory_query_api_endpoint():
    """Verify POST /central-memory/query and /memory/query API endpoints."""
    session = MockDatabaseSession()
    _seed_sample_relationship_data(session)

    req = CentralMemoryQueryRequest(
        query="What did Rahul commit to?",
        use_llm=False,
    )

    # Standard endpoint
    resp = await query_central_memory_endpoint(req=req, db=session, current_user=USER_A)
    assert resp.has_results is True
    assert len(resp.sources) >= 2
    assert resp.sources[0].title is not None
    assert resp.confidence == "high"

    # Alias endpoint /memory/query
    resp_alias = await query_memory_alias_endpoint(req=req, db=session, current_user=USER_A)
    assert resp_alias.has_results is True
    assert resp_alias.query == req.query
