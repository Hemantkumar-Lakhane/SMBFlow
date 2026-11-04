"""
core/daily_briefing_generator.py
==================================
Daily Briefing generator for SMBFlow Meeting Intelligence.

Aggregates persisted Meeting Intelligence state for a given organization
into a structured daily briefing. Never fabricates meetings, contacts,
commitments, or news — only surfaces data already stored in the database.

Data sources (all tenant-scoped):
  - RelationshipContact          → contacts to follow up with
  - RelationshipConversation     → recent conversations
  - RelationshipMemoryItem       → commitments, interests, open questions
  - ApprovalItem (n4)            → pending / waiting commitments
  - ApprovalItem (followup_email_draft) → drafts awaiting human review
  - WorkflowInstance.context     → meeting prep blocks scheduled for today
  - WorkflowInstance.context     → verified contact research highlights

Output persisted in:
  - DailyBriefing.content JSONB (daily_briefings table)

LLM usage:
  - Mini tier, optional. Generates a brief narrative summary paragraph only.
  - On failure → summary_text is set to a deterministic bullet list instead.
  - All structured data sections are always built without LLM.

Idempotency:
  - One DailyBriefing per (organization_id, briefing_date).
  - Repeated calls update the existing row rather than inserting a duplicate.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.core import (
    ApprovalItem,
    DailyBriefing,
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
    WorkflowInstance,
)

log = structlog.get_logger()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _today_str() -> str:
    return date.today().isoformat()   # "YYYY-MM-DD"


def _idempotency_key(org_uuid: uuid.UUID, briefing_date: str) -> str:
    return f"{org_uuid}:{briefing_date}"


# ─────────────────────────────────────────────────────────────────────────────
# Data aggregation helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _gather_pending_commitments(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> List[Dict[str, Any]]:
    """
    Our pending commitments — ApprovalItems with action_type=our_commitment
    and status in (pending, suggested).
    Deduplicated by normalized (action, contact_name, due_date) keeping the newest record.
    """
    stmt = select(ApprovalItem).where(
        ApprovalItem.organization_id == org_uuid,
        ApprovalItem.node_id == "n4",
        ApprovalItem.status.in_(["pending", "suggested"]),
    ).order_by(ApprovalItem.created_at.desc())
    res = await db.execute(stmt)
    items = res.scalars().all()

    result = []
    seen = set()
    for item in items:
        p = item.payload or {}
        if p.get("action_type") != "our_commitment":
            continue
        act = (p.get("action") or item.reason or "").strip()
        c_name = (p.get("contact_name") or "").strip()
        due = (p.get("due_date") or "").strip()
        norm_key = (act.lower(), c_name.lower(), due.lower())
        if norm_key in seen:
            continue
        seen.add(norm_key)
        result.append({
            "action": p.get("action") or item.reason,
            "due_date": p.get("due_date"),
            "due_date_display": p.get("due_date_display") or p.get("due_date") or "No due date",
            "contact_name": p.get("contact_name"),
            "conversation_title": p.get("conversation_title"),
            "approval_id": str(item.id),
        })
    return result


async def _gather_contacts_waiting(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> List[Dict[str, Any]]:
    """
    Commitments waiting on contacts — ApprovalItems action_type=contact_commitment,
    status=waiting or pending.
    Deduplicated by normalized (contact_name, action) keeping the newest record.
    """
    stmt = select(ApprovalItem).where(
        ApprovalItem.organization_id == org_uuid,
        ApprovalItem.node_id == "n4",
        ApprovalItem.status.in_(["waiting", "pending", "suggested"]),
    ).order_by(ApprovalItem.created_at.desc())
    res = await db.execute(stmt)
    items = res.scalars().all()

    result = []
    seen = set()
    for item in items:
        p = item.payload or {}
        if p.get("action_type") != "contact_commitment":
            continue
        act = (p.get("action") or item.reason or "").strip()
        c_name = (p.get("contact_name") or p.get("owner_display") or "").strip()
        norm_key = (c_name.lower(), act.lower())
        if norm_key in seen:
            continue
        seen.add(norm_key)
        result.append({
            "action": p.get("action") or item.reason,
            "due_date": p.get("due_date"),
            "due_date_display": p.get("due_date_display") or p.get("due_date") or "No due date",
            "contact_name": p.get("contact_name") or p.get("owner_display"),
            "conversation_title": p.get("conversation_title"),
            "approval_id": str(item.id),
        })
    return result


async def _gather_drafts_awaiting_review(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> List[Dict[str, Any]]:
    """
    Follow-up email drafts with status=awaiting_review.
    Deduplicated by normalized (recipient_name, subject) keeping the newest draft.
    """
    stmt = select(ApprovalItem).where(
        ApprovalItem.organization_id == org_uuid,
        ApprovalItem.review_type == "followup_email_draft",
        ApprovalItem.status == "awaiting_review",
    ).order_by(ApprovalItem.created_at.desc())
    res = await db.execute(stmt)
    items = res.scalars().all()

    result = []
    seen = set()
    for item in items:
        if getattr(item, "review_type", None) != "followup_email_draft":
            continue
        if getattr(item, "status", None) != "awaiting_review":
            continue
        p = item.payload or {}
        recip = (p.get("recipient_name") or "").strip()
        subj = (p.get("subject") or "Follow-up Draft").strip()
        norm_key = (recip.lower(), subj.lower())
        if norm_key in seen:
            continue
        seen.add(norm_key)
        result.append({
            "subject": p.get("subject", "Follow-up Draft"),
            "recipient_name": p.get("recipient_name"),
            "recipient_email": p.get("recipient_email"),
            "recipient_email_available": bool(p.get("recipient_email_available", False)),
            "conversation_title": p.get("conversation_title"),
            "approval_id": str(item.id),
            "instance_id": str(item.instance_id) if item.instance_id else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })
    return result


async def _gather_suggested_followups(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> List[Dict[str, Any]]:
    """
    Contacts with the most recent conversation older than 7 days —
    surface as suggested follow-ups. Grounded in actual DB data only.
    """
    # Get contacts with their most recent conversation date
    stmt = select(
        RelationshipContact,
    ).where(
        RelationshipContact.organization_id == org_uuid,
    ).order_by(RelationshipContact.updated_at.desc()).limit(20)
    res = await db.execute(stmt)
    contacts = res.scalars().all()

    result = []
    today = date.today()
    for contact in contacts:
        # Find most recent conversation
        stmt_c = select(RelationshipConversation).where(
            RelationshipConversation.organization_id == org_uuid,
            RelationshipConversation.contact_id == contact.id,
        ).order_by(RelationshipConversation.created_at.desc()).limit(1)
        res_c = await db.execute(stmt_c)
        last_conv = res_c.scalars().first()
        if not last_conv:
            continue

        # Only suggest follow-up if last conversation ≥ 7 days ago
        last_date_str = last_conv.conversation_date or (
            last_conv.created_at.date().isoformat() if last_conv.created_at else None
        )
        if not last_date_str:
            continue
        try:
            last_date = date.fromisoformat(last_date_str[:10])
            days_since = (today - last_date).days
        except Exception:
            continue

        if days_since >= 7:
            c_meta = getattr(contact, "metadata_", {}) or {}
            result.append({
                "contact_name": contact.name,
                "contact_role": contact.role,
                "contact_company": contact.company or c_meta.get("company"),
                "last_conversation_title": last_conv.title,
                "last_conversation_date": last_date_str,
                "days_since_last_contact": days_since,
                "contact_id": str(contact.id),
            })

    # Sort by most overdue first
    result.sort(key=lambda x: x["days_since_last_contact"], reverse=True)
    return result[:5]


async def _gather_meetings_today(
    db: AsyncSession,
    org_uuid: uuid.UUID,
    briefing_date: str,
) -> List[Dict[str, Any]]:
    """
    Meetings scheduled for today — from workflow instances where
    context["node5b_meeting_prep"]["meeting_start"] starts with briefing_date.
    """
    stmt = select(WorkflowInstance).where(
        WorkflowInstance.organization_id == org_uuid,
        WorkflowInstance.workflow_name == "meeting_intelligence_followup",
        WorkflowInstance.status.in_(["processed", "completed", "capture_completed"]),
    ).order_by(WorkflowInstance.started_at.desc()).limit(50)
    res = await db.execute(stmt)
    instances = res.scalars().all()

    result = []
    for inst in instances:
        ctx = inst.context or {}
        prep = ctx.get("node5b_meeting_prep") or {}
        meeting_start = prep.get("meeting_start") or ""
        if not meeting_start.startswith(briefing_date):
            continue
        if prep.get("status") in ("cancelled", None):
            continue
        capture = ctx.get("conversation_capture") or {}
        result.append({
            "meeting_title": prep.get("meeting_title"),
            "contact_name": capture.get("contact_name"),
            "meeting_start": prep.get("meeting_start"),
            "meeting_end": prep.get("meeting_end"),
            "prep_block_status": prep.get("status"),
            "prep_start": prep.get("prep_start"),
            "prep_end": prep.get("prep_end"),
            "instance_id": str(inst.id),
        })
    return result


async def _gather_upcoming_meetings(
    db: AsyncSession,
    org_uuid: uuid.UUID,
    briefing_date: str,
) -> List[Dict[str, Any]]:
    """
    Upcoming meetings scheduled after briefing_date (within the next 7 days).
    """
    stmt = select(WorkflowInstance).where(
        WorkflowInstance.organization_id == org_uuid,
        WorkflowInstance.workflow_name == "meeting_intelligence_followup",
        WorkflowInstance.status.in_(["processed", "completed", "capture_completed"]),
    ).order_by(WorkflowInstance.started_at.desc()).limit(50)
    res = await db.execute(stmt)
    instances = res.scalars().all()

    result = []
    for inst in instances:
        ctx = inst.context or {}
        prep = ctx.get("node5b_meeting_prep") or {}
        meeting_start = prep.get("meeting_start") or ""
        if not meeting_start or meeting_start.startswith(briefing_date) or meeting_start < briefing_date:
            continue
        if prep.get("status") in ("cancelled", None):
            continue
        capture = ctx.get("conversation_capture") or {}
        result.append({
            "meeting_title": prep.get("meeting_title"),
            "contact_name": capture.get("contact_name"),
            "meeting_start": meeting_start,
            "meeting_end": prep.get("meeting_end"),
            "prep_block_status": prep.get("status"),
            "prep_start": prep.get("prep_start"),
            "prep_end": prep.get("prep_end"),
            "instance_id": str(inst.id),
        })
    result.sort(key=lambda x: x.get("meeting_start", ""))
    return result[:5]


def _assemble_priorities(
    meetings_today: List[Dict[str, Any]],
    pending_commitments: List[Dict[str, Any]],
    drafts_awaiting_review: List[Dict[str, Any]],
    contacts_waiting: List[Dict[str, Any]],
    upcoming_meetings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Synthesize high-priority actionable items grounded purely in database state.
    Never fabricates priorities.
    """
    priorities = []
    # 1. Today's meetings (high priority preparation)
    for m in meetings_today[:2]:
        priorities.append({
            "title": f"Meeting: {m.get('meeting_title', 'Scheduled Meeting')}",
            "subtitle": f"Starts at {m.get('meeting_start', '')[:16].replace('T', ' ')} (Contact: {m.get('contact_name', 'Contact')})",
            "category": "meeting",
            "urgency": "high",
            "action_hint": "Review prep brief & calendar prep block",
        })

    # 2. Drafts awaiting review in Action Center
    for d in drafts_awaiting_review[:2]:
        priorities.append({
            "title": f"Review Draft: {d.get('subject', 'Follow-up Email Draft')}",
            "subtitle": f"Recipient: {d.get('recipient_name', 'Contact')} • Awaiting review",
            "category": "draft_review",
            "urgency": "high",
            "action_hint": "Approve or edit in Action Center",
        })

    # 3. Pending commitments on our side
    for c in pending_commitments[:2]:
        priorities.append({
            "title": f"Commitment: {c.get('action', 'Internal Task')}",
            "subtitle": f"Due: {c.get('due_date_display', 'No due date')} • Contact: {c.get('contact_name', 'Contact')}",
            "category": "commitment",
            "urgency": "medium",
            "action_hint": "Fulfill commitment and mark resolved",
        })

    # 4. Contacts waiting on deliverables
    for w in contacts_waiting[:2]:
        priorities.append({
            "title": f"Waiting on: {w.get('contact_name', 'Contact')}",
            "subtitle": f"Item: {w.get('action', 'Agreed Deliverable')}",
            "category": "waiting",
            "urgency": "medium",
            "action_hint": "Follow up if overdue",
        })

    return priorities


async def _gather_research_highlights(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> List[Dict[str, Any]]:
    """
    Verified facts from contact research — surfaces when research has been run.
    Only includes verified_facts (not uncertain_matches).
    """
    stmt = select(WorkflowInstance).where(
        WorkflowInstance.organization_id == org_uuid,
        WorkflowInstance.workflow_name == "meeting_intelligence_followup",
        WorkflowInstance.status.in_(["processed", "completed", "capture_completed"]),
    ).order_by(WorkflowInstance.started_at.desc()).limit(20)
    res = await db.execute(stmt)
    instances = res.scalars().all()

    result = []
    seen_contacts: set[str] = set()

    for inst in instances:
        ctx = inst.context or {}
        research = ctx.get("contact_research") or {}
        if research.get("status") != "completed":
            continue
        contact_name = research.get("contact_name", "")
        if contact_name in seen_contacts:
            continue
        seen_contacts.add(contact_name)

        verified = research.get("verified_facts") or []
        if not verified:
            continue

        result.append({
            "contact_name": contact_name,
            "company": research.get("company"),
            "facts": verified[:3],   # top 3 verified facts per contact
            "retrieved_at": research.get("retrieved_at"),
        })

    return result[:5]


# ─────────────────────────────────────────────────────────────────────────────
# LLM summary generator
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_summary_text(
    briefing_date: str,
    meetings_today: List[Dict],
    upcoming_meetings: List[Dict],
    pending_commitments: List[Dict],
    contacts_waiting: List[Dict],
    drafts_awaiting_review: List[Dict],
    suggested_followups: List[Dict],
) -> str:
    """
    Use LLMRouter mini tier to generate a short narrative summary paragraph.
    Falls back to a deterministic bullet list on any error.
    Zero fabrication — only references data passed in.
    """
    def _deterministic() -> str:
        lines = [f"Daily Briefing — {briefing_date}"]
        if meetings_today:
            lines.append(f"• {len(meetings_today)} meeting(s) scheduled today.")
        if upcoming_meetings:
            lines.append(f"• {len(upcoming_meetings)} upcoming meeting(s) this week.")
        if pending_commitments:
            lines.append(f"• {len(pending_commitments)} outstanding commitment(s) pending.")
        if contacts_waiting:
            lines.append(f"• Waiting on {len(contacts_waiting)} contact(s) to fulfill their commitment(s).")
        if drafts_awaiting_review:
            lines.append(f"• {len(drafts_awaiting_review)} follow-up draft(s) awaiting review.")
        if suggested_followups:
            lines.append(f"• {len(suggested_followups)} contact(s) overdue for follow-up.")
        if not any([meetings_today, upcoming_meetings, pending_commitments, contacts_waiting, drafts_awaiting_review, suggested_followups]):
            lines.append("• No active items today. All commitments are up to date.")
        return "\n".join(lines)

    try:
        # Build context for LLM
        parts = []
        if meetings_today:
            parts.append(f"{len(meetings_today)} meeting(s) scheduled today: " +
                         ", ".join(m.get("meeting_title") or "Untitled" for m in meetings_today[:3]))
        if upcoming_meetings:
            parts.append(f"{len(upcoming_meetings)} upcoming meeting(s) in next few days")
        if pending_commitments:
            parts.append(f"{len(pending_commitments)} pending commitment(s) on our side")
        if contacts_waiting:
            parts.append(f"waiting on {len(contacts_waiting)} contact(s)")
        if drafts_awaiting_review:
            parts.append(f"{len(drafts_awaiting_review)} email draft(s) need review")
        if suggested_followups:
            names = ", ".join((s.get("contact_name") or "") for s in suggested_followups[:3] if (s.get("contact_name") or ""))
            if names:
                parts.append(f"suggested follow-ups: {names}")

        if not parts:
            return _deterministic()

        context_str = "; ".join(parts)
        system = (
            "You are a concise executive assistant. Write a single short paragraph (2–3 sentences max) "
            "summarizing the user's day ahead based on the data provided. Be specific, professional, and direct. "
            "Do NOT invent meetings, contacts, or commitments not in the data. Output plain text only."
        )
        user = f"Date: {briefing_date}\nData: {context_str}"

        # Daily Briefing must NOT require a new external API key just to generate.
        # If no LLM API key is configured in the environment, use the deterministic fallback immediately.
        has_llm_key = any(
            os.getenv(k) for k in (
                "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                "OPENROUTER_API_KEY", "GROQ_API_KEY"
            )
        )
        if not has_llm_key:
            return _deterministic()

        try:
            import asyncio
            from core.llm_router import LLMRouter, LLMMessage
            llm = LLMRouter()
            # Bound LLM call to 8 seconds so it never hangs briefing generation or client requests
            call_coro = llm.call(
                agent_name="drafting_agent",
                messages=[LLMMessage(role="system", content=system), LLMMessage(role="user", content=user)],
                tier_override="mini",
            )
            raw, _ = await asyncio.wait_for(call_coro, timeout=8.0)
            summary = (raw or "").strip()
            if summary and len(summary) > 20:
                return summary
        except Exception as e:
            log.warning("Daily briefing LLM summary failed, using deterministic fallback", error=str(e))

    except Exception as e:
        log.warning("Daily briefing summary context building failed, using deterministic fallback", error=str(e))

    return _deterministic()


# ─────────────────────────────────────────────────────────────────────────────
# Main generator
# ─────────────────────────────────────────────────────────────────────────────

async def generate_daily_briefing(
    db: AsyncSession,
    org_uuid: uuid.UUID,
    briefing_date: Optional[str] = None,
    generated_by: str = "manual",
    scheduled_time_utc: Optional[str] = None,
    org_timezone: Optional[str] = None,
    force: bool = True,
) -> DailyBriefing:
    """
    Generate (or regenerate) the daily briefing for an organization on a given date.

    Idempotent: if a DailyBriefing already exists for this org+date, updates
    its content rather than inserting a duplicate.

    Args:
        db:                 Async DB session
        org_uuid:           Organization UUID (tenant-scoped)
        briefing_date:      "YYYY-MM-DD" (defaults to today in org_timezone or UTC)
        generated_by:       "scheduler" | "manual"
        scheduled_time_utc: HH:MM if fired by scheduler
        org_timezone:       IANA timezone string (e.g. "America/New_York", "UTC")
        force:              If True, forces regeneration even if status is generating

    Returns:
        The DailyBriefing ORM instance (committed).
    """
    if not briefing_date:
        if org_timezone:
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo(org_timezone)
                briefing_date = datetime.now(tz).date().isoformat()
            except Exception:
                briefing_date = _today_str()
        else:
            briefing_date = _today_str()

    ikey = _idempotency_key(org_uuid, briefing_date)

    # ── Idempotency: find existing row ────────────────────────────────────────
    stmt = select(DailyBriefing).where(DailyBriefing.idempotency_key == ikey)
    res = await db.execute(stmt)
    existing = res.scalars().first()

    if existing and existing.status == "generating" and not force and generated_by != "manual":
        # Already in progress from automated scheduler — return current state without re-running
        log.info("Daily briefing already generating", org=str(org_uuid), date=briefing_date)
        return existing

    # Mark as generating (prevents concurrent duplicate generation)
    if existing:
        existing.status = "generating"
        await db.flush()
        briefing_row = existing
    else:
        briefing_row = DailyBriefing(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            briefing_date=briefing_date,
            status="generating",
            content={},
            idempotency_key=ikey,
            scheduled_time_utc=scheduled_time_utc,
            created_at=datetime.utcnow(),
        )
        db.add(briefing_row)
        await db.flush()

    try:
        log.info("Generating daily briefing", org=str(org_uuid), date=briefing_date, by=generated_by)

        # ── Gather all data in parallel-style sequential calls ────────────────
        meetings_today = await _gather_meetings_today(db, org_uuid, briefing_date)
        upcoming_meetings = await _gather_upcoming_meetings(db, org_uuid, briefing_date)
        pending_commitments = await _gather_pending_commitments(db, org_uuid)
        contacts_waiting = await _gather_contacts_waiting(db, org_uuid)
        drafts_awaiting_review = await _gather_drafts_awaiting_review(db, org_uuid)
        suggested_followups = await _gather_suggested_followups(db, org_uuid)
        research_highlights = await _gather_research_highlights(db, org_uuid)

        # ── Assemble structured priorities ────────────────────────────────────
        priorities = _assemble_priorities(
            meetings_today=meetings_today,
            pending_commitments=pending_commitments,
            drafts_awaiting_review=drafts_awaiting_review,
            contacts_waiting=contacts_waiting,
            upcoming_meetings=upcoming_meetings,
        )

        # ── LLM summary ───────────────────────────────────────────────────────
        summary_text = await _generate_summary_text(
            briefing_date=briefing_date,
            meetings_today=meetings_today,
            upcoming_meetings=upcoming_meetings,
            pending_commitments=pending_commitments,
            contacts_waiting=contacts_waiting,
            drafts_awaiting_review=drafts_awaiting_review,
            suggested_followups=suggested_followups,
        )

        content = {
            "briefing_date": briefing_date,
            "generated_by": generated_by,
            "timezone": org_timezone or "UTC",
            "summary_text": summary_text,
            "meetings_today": meetings_today,
            "upcoming_meetings": upcoming_meetings,
            "priorities": priorities,
            "pending_commitments": pending_commitments,
            "contacts_waiting": contacts_waiting,
            "drafts_awaiting_review": drafts_awaiting_review,
            "suggested_followups": suggested_followups,
            "research_highlights": research_highlights,
            "totals": {
                "meetings_today": len(meetings_today),
                "upcoming_meetings": len(upcoming_meetings),
                "priorities": len(priorities),
                "pending_commitments": len(pending_commitments),
                "our_commitments": len(pending_commitments),
                "contacts_waiting": len(contacts_waiting),
                "waiting_on_contacts": len(contacts_waiting),
                "drafts": len(drafts_awaiting_review),
                "drafts_awaiting_review": len(drafts_awaiting_review),
                "drafts_review": len(drafts_awaiting_review),
                "suggested_followups": len(suggested_followups),
                "research_highlights": len(research_highlights),
                "verified_research": len(research_highlights),
            },
        }

        briefing_row.content = content
        briefing_row.status = "ready"
        briefing_row.generated_at = datetime.utcnow()
        briefing_row.error = None
        if scheduled_time_utc:
            briefing_row.scheduled_time_utc = scheduled_time_utc

        await db.commit()
        await db.refresh(briefing_row)

        log.info(
            "Daily briefing generated",
            org=str(org_uuid),
            date=briefing_date,
            meetings=len(meetings_today),
            commitments=len(pending_commitments),
            drafts=len(drafts_awaiting_review),
        )

    except Exception as e:
        log.error("Daily briefing generation failed", org=str(org_uuid), error=str(e))
        briefing_row.status = "error"
        briefing_row.error = str(e)
        await db.commit()

    return briefing_row

