"""
core/central_memory_query.py
============================
Natural-Language Query Engine for Central Memory & Relationship Intelligence.

Queries ONLY persisted Central Memory & relationship data belonging to the current organization.
Returns concise, grounded answers with complete source conversation provenance (ID, title, date, contact).
Never hallucinates or invents facts when memory does not contain an answer.
Excludes uncertain contact research from factual memory grounding.
Maintains pure read-only idempotency without mutating database state.
Supports both deterministic extraction and LLM-assisted grounded synthesis.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple


import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.core import (
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
)

log = structlog.get_logger()

# Category keywords mapping natural language phrases to RelationshipMemoryItem categories
CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "commitment": [
        "commit", "commits", "committed", "commitment", "commitments",
        "promise", "promised", "action item", "action items", "todo", "todos",
        "pending", "deliverable", "agreed to", "task", "assigned"
    ],
    "opportunity": [
        "opportunity", "opportunities", "deal", "deals", "pilot", "pilots",
        "pipeline", "upsell", "expansion", "contract", "proposal"
    ],
    "need": [
        "need", "needs", "pain", "pain point", "pain points", "struggle",
        "struggling", "challenge", "challenges", "requirement", "requirements",
        "blocker", "problem"
    ],
    "interest": [
        "interest", "interests", "interested", "keen", "focus", "curious",
        "enthusiastic", "preference"
    ],
    "fact": [
        "fact", "facts", "background", "role", "title", "company", "budget",
        "stack", "team", "who is", "what is"
    ],
    "open_question": [
        "question", "questions", "open question", "unresolved", "clarification"
    ],
}

# Stop words to ignore during query token extraction
STOP_WORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "about", "into", "through", "after", "before", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "shall", "should", "may", "might", "can", "could", "must",
    "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
    "we", "us", "our", "ours", "my", "mine", "me", "i", "you", "your",
    "they", "them", "their", "he", "him", "his", "she", "her", "it", "its",
    "any", "some", "all", "last", "latest", "discuss", "discussed", "tell",
    "say", "says", "said", "mention", "mentioned", "know", "think", "thought",
    "share", "shared", "give", "given", "take", "taken",
}



def _extract_query_tokens(query: str) -> List[str]:
    """Tokenize query into clean non-stopword tokens."""
    tokens = re.findall(r"\b[a-zA-Z0-9_\-]+\b", query.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]


def _detect_query_intent(query_lower: str) -> Tuple[Optional[str], bool]:
    """
    Detect target category (if any) and whether the user is asking about timing/recency.
    Returns: (target_category or None, is_recency_query)
    """
    is_recency = bool(re.search(r"\b(when|last|latest|recent|date|time)\b", query_lower))

    # Check for category keywords
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if re.search(r"\b" + re.escape(kw) + r"\b", query_lower):
                return cat, is_recency

    return None, is_recency


def _match_contact(
    query_lower: str,
    contacts: List[RelationshipContact],
) -> Optional[RelationshipContact]:
    """
    Find a contact matching names in the query.
    Performs normalized substring and token matching.
    """
    if not contacts:
        return None

    # Sort contacts by length of name descending (longest match first)
    sorted_contacts = sorted(contacts, key=lambda c: len(c.name or ""), reverse=True)

    for c in sorted_contacts:
        c_norm = (c.normalized_name or c.name or "").lower().strip()
        if not c_norm:
            continue
        # Direct word boundary match of full normalized name
        if re.search(r"\b" + re.escape(c_norm) + r"\b", query_lower):
            return c
        # Match individual parts (e.g. first name "Rahul" from "Rahul Sharma")
        parts = c_norm.split()
        for p in parts:
            if len(p) >= 3 and re.search(r"\b" + re.escape(p) + r"\b", query_lower):
                return c

    return None


async def query_central_memory(
    db: AsyncSession,
    org_uuid: uuid.UUID,
    query_text: str,
    contact_name_filter: Optional[str] = None,
    contact_id_filter: Optional[str] = None,
    use_llm: bool = True,
) -> Dict[str, Any]:
    """
    Execute a natural-language query over an organization's persisted Central Memory.
    Enforces strict tenant isolation (org_uuid).
    Pure read-only operation: no database mutation occurs.
    """
    query_clean = query_text.strip()
    query_lower = query_clean.lower()
    tokens = _extract_query_tokens(query_clean)
    target_category, is_recency = _detect_query_intent(query_lower)

    # 1. Fetch organization's contacts (Strict Tenant Isolation)
    stmt_contacts = select(RelationshipContact).where(
        RelationshipContact.organization_id == org_uuid
    )
    res_contacts = await db.execute(stmt_contacts)
    org_contacts = res_contacts.scalars().all()
    contacts_by_id = {c.id: c for c in org_contacts}

    # Identify contact if applicable
    matched_contact: Optional[RelationshipContact] = None
    if contact_id_filter:
        try:
            cid = uuid.UUID(str(contact_id_filter))
            matched_contact = contacts_by_id.get(cid)
        except Exception:
            pass
    elif contact_name_filter:
        c_norm = contact_name_filter.lower().strip()
        for c in org_contacts:
            if c.normalized_name == c_norm or c_norm in (c.name or "").lower():
                matched_contact = c
                break
    else:
        matched_contact = _match_contact(query_lower, org_contacts)

    # 2. Fetch conversations for this organization
    stmt_convs = (
        select(RelationshipConversation)
        .where(RelationshipConversation.organization_id == org_uuid)
        .order_by(RelationshipConversation.created_at.desc())
    )
    if matched_contact:
        stmt_convs = stmt_convs.where(RelationshipConversation.contact_id == matched_contact.id)

    res_convs = await db.execute(stmt_convs)
    conversations = res_convs.scalars().all()
    # Sort conversations latest first by conversation_date then created_at
    conversations = sorted(
        conversations,
        key=lambda c: (str(c.conversation_date or ""), getattr(c, "created_at", None) or datetime.min),
        reverse=True,
    )
    convs_by_id = {c.id: c for c in conversations}

    # 3. Fetch memory items for this organization
    # Note: Uncertain contact research is EXCLUDED from RelationshipMemoryItem,
    # as items only originate from actual conversation extractions.
    stmt_items = select(RelationshipMemoryItem).where(
        RelationshipMemoryItem.organization_id == org_uuid
    )
    if matched_contact:
        stmt_items = stmt_items.where(RelationshipMemoryItem.contact_id == matched_contact.id)
    if target_category:
        stmt_items = stmt_items.where(RelationshipMemoryItem.category == target_category)

    res_items = await db.execute(stmt_items)
    all_items = res_items.scalars().all()

    # 4. Extract topic tokens separate from contact entity tokens
    contact_name_tokens = set()
    if matched_contact:
        contact_name_tokens.update(re.findall(r"\b[a-zA-Z0-9_\-]+\b", (matched_contact.name or "").lower()))
        contact_name_tokens.update(re.findall(r"\b[a-zA-Z0-9_\-]+\b", (matched_contact.normalized_name or "").lower()))
    topic_tokens = [t for t in tokens if t not in contact_name_tokens]

    # Filter items and conversations based on query keywords and intent
    matched_items: List[RelationshipMemoryItem] = []
    matched_convs: List[RelationshipConversation] = []

    # If target category was detected (e.g. commitments or opportunities)
    if target_category:
        cat_kws = set(CATEGORY_KEYWORDS.get(target_category, []))
        remaining_topic_tokens = [t for t in topic_tokens if t not in cat_kws]
        if not remaining_topic_tokens:
            # e.g. "What did Rahul commit to?" -> all commitments for Rahul
            matched_items = list(all_items)
        else:
            # Further filter by topic keywords
            for item in all_items:
                content_lower = (item.content or "").lower()
                if any(t in content_lower for t in remaining_topic_tokens):
                    matched_items.append(item)
    else:
        # General topic / keyword search
        if topic_tokens:
            for item in all_items:
                content_lower = (item.content or "").lower()
                if any(t in content_lower for t in topic_tokens):
                    matched_items.append(item)

            for conv in conversations:
                title_lower = (conv.title or "").lower()
                summary_lower = (conv.summary or "").lower()
                transcript_lower = (conv.transcript or "").lower()
                if any(t in title_lower or t in summary_lower or t in transcript_lower for t in topic_tokens):
                    matched_convs.append(conv)
        elif matched_contact:
            # User asked about the contact in general (e.g. "Tell me about Rahul")
            matched_items = list(all_items)
            matched_convs = list(conversations)

    # If recency query ("When did we last discuss..."), check conversations
    if is_recency and not matched_convs and topic_tokens:
        for conv in conversations:
            title_lower = (conv.title or "").lower()
            summary_lower = (conv.summary or "").lower()
            transcript_lower = (conv.transcript or "").lower()
            if any(t in title_lower or t in summary_lower or t in transcript_lower for t in topic_tokens):
                matched_convs.append(conv)

    # Ensure matched_convs is sorted latest first
    matched_convs = sorted(
        matched_convs,
        key=lambda c: (str(c.conversation_date or ""), getattr(c, "created_at", None) or datetime.min),
        reverse=True,
    )

    # Deduplicate and sort items
    matched_items = list({item.id: item for item in matched_items}.values())


    # Build unique source conversation references
    sources_dict: Dict[uuid.UUID, Dict[str, Any]] = {}
    for item in matched_items:
        c_id = item.conversation_id
        if c_id and c_id in convs_by_id and c_id not in sources_dict:
            c = convs_by_id[c_id]
            contact_obj = contacts_by_id.get(c.contact_id)
            sources_dict[c_id] = {
                "conversation_id": str(c.id),
                "title": c.title,
                "date": c.conversation_date or (c.created_at.strftime("%Y-%m-%d") if c.created_at else None),
                "contact_name": contact_obj.name if contact_obj else (matched_contact.name if matched_contact else None),
                "workflow_instance_id": str(c.workflow_instance_id),
            }

    for c in matched_convs:
        if c.id not in sources_dict:
            contact_obj = contacts_by_id.get(c.contact_id)
            sources_dict[c.id] = {
                "conversation_id": str(c.id),
                "title": c.title,
                "date": c.conversation_date or (c.created_at.strftime("%Y-%m-%d") if c.created_at else None),
                "contact_name": contact_obj.name if contact_obj else (matched_contact.name if matched_contact else None),
                "workflow_instance_id": str(c.workflow_instance_id),
            }

    sources_list = list(sources_dict.values())

    # Build cited items list with exact provenance
    cited_items: List[Dict[str, Any]] = []
    for item in matched_items:
        conv_title = convs_by_id[item.conversation_id].title if item.conversation_id in convs_by_id else "Conversation"
        contact_obj = contacts_by_id.get(item.contact_id)
        cited_items.append({
            "item_id": str(item.id),
            "category": item.category,
            "content": item.content,
            "is_ai_generated": item.is_ai_generated,
            "source_conversation_id": str(item.conversation_id),
            "source_conversation_title": conv_title,
            "source_date": item.source_date,
            "contact_name": contact_obj.name if contact_obj else (matched_contact.name if matched_contact else None),
        })

    # 5. Handle No-Result / Insufficient Evidence Case
    if not matched_items and not matched_convs:
        if matched_contact:
            if target_category == "commitment":
                answer = f"No recorded commitments found for {matched_contact.name} in your organization's memory."
            elif target_category == "opportunity":
                answer = f"No recorded opportunities found for {matched_contact.name} in your organization's memory."
            else:
                answer = f"No relationship memory items found for {matched_contact.name} matching your query."
        else:
            answer = "The stored relationship memory does not contain information to answer this question. Insufficient evidence found in your organization's records."

        return {
            "query": query_clean,
            "answer": answer,
            "has_results": False,
            "confidence": "none",
            "sources": [],
            "cited_items": [],
            "execution_strategy": "no_results",
            "matched_contact": matched_contact.name if matched_contact else None,
        }

    # 6. Generate Concise Grounded Answer
    # We first prepare the deterministic grounded answer.
    deterministic_answer = _build_deterministic_answer(
        query=query_clean,
        matched_contact=matched_contact,
        target_category=target_category,
        is_recency=is_recency,
        items=matched_items,
        conversations=matched_convs,
        convs_by_id=convs_by_id,
        contacts_by_id=contacts_by_id,
    )

    final_answer = deterministic_answer
    strategy = "deterministic"

    # 7. Optional LLM Grounding Path via existing LLMRouter (if enabled)
    if use_llm:
        try:
            from core.llm_router import LLMMessage, LLMRouter

            # Assemble clean memory context for LLM
            context_blocks = []
            for item in matched_items[:12]:
                c_title = convs_by_id[item.conversation_id].title if item.conversation_id in convs_by_id else "Conversation"
                c_date = item.source_date or "Unknown Date"
                c_name = contacts_by_id.get(item.contact_id).name if item.contact_id in contacts_by_id else "Contact"
                context_blocks.append(
                    f"- [{item.category.upper()}] {item.content} (Contact: {c_name}, Source: '{c_title}', Date: {c_date})"
                )

            for conv in matched_convs[:5]:
                c_name = contacts_by_id.get(conv.contact_id).name if conv.contact_id in contacts_by_id else "Contact"
                context_blocks.append(
                    f"- [CONVERSATION] Title: '{conv.title}' with {c_name} on {conv.conversation_date or 'Recent'}. Summary: {conv.summary or 'N/A'}"
                )

            grounding_context = "\n".join(context_blocks)

            system_prompt = (
                "You are the SMBFlow Central Memory Intelligence assistant. "
                "Answer the user question concisely, accurately, and strictly using ONLY the provided memory facts. "
                "Rules:\n"
                "1. Every factual statement must cite the source conversation title and date.\n"
                "2. Do not invent, extrapolate, or assume any facts not in the context.\n"
                "3. If evidence is insufficient, clearly say so.\n"
                "4. Keep the answer direct, concise, and professional."
            )
            user_prompt = f"MEMORY CONTEXT:\n{grounding_context}\n\nQUESTION: {query_clean}"

            router = LLMRouter()
            llm_resp, _ = await router.call(
                agent_name="reasoning_agent",
                messages=[
                    LLMMessage(role="system", content=system_prompt),
                    LLMMessage(role="user", content=user_prompt),
                ],
                tier_override="mini",
            )
            if llm_resp and len(llm_resp.strip()) > 10:
                final_answer = llm_resp.strip()
                strategy = "llm_grounded"
        except Exception as llm_err:
            log.info("LLMRouter grounding bypassed, using deterministic grounded answer", error=str(llm_err))
            final_answer = deterministic_answer
            strategy = "deterministic"

    return {
        "query": query_clean,
        "answer": final_answer,
        "has_results": True,
        "confidence": "high",
        "sources": sources_list,
        "cited_items": cited_items,
        "execution_strategy": strategy,
        "matched_contact": matched_contact.name if matched_contact else None,
    }


def _build_deterministic_answer(
    query: str,
    matched_contact: Optional[RelationshipContact],
    target_category: Optional[str],
    is_recency: bool,
    items: List[RelationshipMemoryItem],
    conversations: List[RelationshipConversation],
    convs_by_id: Dict[uuid.UUID, RelationshipConversation],
    contacts_by_id: Dict[uuid.UUID, RelationshipContact],
) -> str:
    """
    Format deterministic, factual, concise answer referencing source conversations.
    Guaranteed zero hallucination.
    """
    lines = []

    if is_recency and conversations:
        latest = conversations[0]
        c_name = contacts_by_id.get(latest.contact_id).name if latest.contact_id in contacts_by_id else "the contact"
        lines.append(
            f"The discussion took place on {latest.conversation_date or 'recent record'} during the conversation '{latest.title}' with {c_name}."
        )
        if latest.summary:
            lines.append(f"Summary: {latest.summary}")
        return "\n".join(lines)

    if target_category == "commitment":
        contact_label = matched_contact.name if matched_contact else "contacts across your organization"
        lines.append(f"Commitments recorded for {contact_label}:")
        for it in items:
            c = convs_by_id.get(it.conversation_id)
            c_title = c.title if c else "Conversation"
            c_date = it.source_date or (c.conversation_date if c else "Recent")
            owner_info = f" (Owner: {it.details.get('owner')})" if (it.details and it.details.get("owner")) else ""
            due_info = f" [Due: {it.details.get('due_date')}]" if (it.details and it.details.get("due_date")) else ""
            lines.append(f"• {it.content}{owner_info}{due_info} — (Source: '{c_title}', {c_date})")
        return "\n".join(lines)

    if target_category == "opportunity":
        contact_label = matched_contact.name if matched_contact else "contacts across your organization"
        lines.append(f"Opportunities discussed with {contact_label}:")
        for it in items:
            c = convs_by_id.get(it.conversation_id)
            c_title = c.title if c else "Conversation"
            c_date = it.source_date or (c.conversation_date if c else "Recent")
            lines.append(f"• {it.content} — (Source: '{c_title}', {c_date})")
        return "\n".join(lines)

    if target_category in ("need", "interest", "fact"):
        contact_label = matched_contact.name if matched_contact else "your organization"
        category_title = target_category.capitalize() + "s"
        lines.append(f"{category_title} recorded for {contact_label}:")
        for it in items:
            c = convs_by_id.get(it.conversation_id)
            c_title = c.title if c else "Conversation"
            c_date = it.source_date or (c.conversation_date if c else "Recent")
            lines.append(f"• {it.content} — (Source: '{c_title}', {c_date})")
        return "\n".join(lines)

    # General answer assembling matching items
    if items:
        lines.append("Relevant relationship memory found:")
        for it in items[:8]:
            c = convs_by_id.get(it.conversation_id)
            c_title = c.title if c else "Conversation"
            c_date = it.source_date or (c.conversation_date if c else "Recent")
            lines.append(f"• [{it.category.upper()}] {it.content} — (Source: '{c_title}', {c_date})")

    if conversations and not items:
        lines.append("Relevant conversation records found:")
        for c in conversations[:4]:
            c_name = contacts_by_id.get(c.contact_id).name if c.contact_id in contacts_by_id else "Contact"
            lines.append(f"• '{c.title}' with {c_name} on {c.conversation_date or 'Recent'}: {c.summary or 'Recorded conversation'}")

    return "\n".join(lines) if lines else "No conclusive relationship memory found."
