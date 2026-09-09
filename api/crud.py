"""
api/crud.py
===========
All PostgreSQL CRUD operations for the SMBFlow API.
Each function receives an AsyncSession and returns ORM objects or plain dicts.
No business logic here — just data access.

CONSTANT — do not modify for business customization.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import structlog
from sqlalchemy import delete, func, select, update, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from core.state_manager import (
    A2ARequest,
    AgentRun,
    BudgetSettings,
    CustomTool,
    Escalation,
    IntegrationCredential,
    PatternMemory,
    SystemEvent,
    Tenant,
    User,
    WorkflowInstance,
    WorkflowStatus,
)
from db.models.core import Organization, OrganizationUser

log = structlog.get_logger()


# ─────────────────────────────────────────────────────────────────────────────
# Tenants
# ─────────────────────────────────────────────────────────────────────────────

async def create_tenant(
    db: AsyncSession,
    name: str,
    industry: str,
    config: dict,
) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name=name,
        industry=industry,
        config={
            **config,
            "client_id": str(uuid.uuid4()),
            "client_name": name,
            "industry": industry,
            "active_workflows": [],
            "integrations": {},
            "business_rules": {},
            "tone_profile": {},
            "action_library": {},
            "llm_overrides": {},
        },
        active=True,
    )
    # Merge provided config on top of defaults
    if config:
        t.config.update(config)
    t.config["client_id"] = str(t.id)
    db.add(t)
    await db.flush()
    await db.refresh(t)

    # Create default budget settings
    bs = BudgetSettings(
        id=uuid.uuid4(),
        tenant_id=t.id,
        optimization_level=1,
        strategy="balanced",
    )
    db.add(bs)
    await db.commit()
    return t


async def get_tenant(db: AsyncSession, tenant_id: str) -> Optional[Tenant]:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalar_one_or_none()


async def list_tenants(db: AsyncSession, tenant_id_filter: Optional[str] = None) -> list[Tenant]:
    q = select(Tenant).where(Tenant.active.is_(True))
    if tenant_id_filter:
        q = q.where(Tenant.id == tenant_id_filter)
    result = await db.execute(q.order_by(Tenant.created_at))
    return list(result.scalars().all())


async def update_tenant_config(
    db: AsyncSession, tenant_id: str, partial_config: dict
) -> Optional[Tenant]:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    t = result.scalar_one_or_none()
    if not t:
        return None
    merged = {**(t.config or {}), **partial_config}
    await db.execute(
        update(Tenant).where(Tenant.id == tenant_id).values(config=merged)
    )
    await db.commit()
    return await get_tenant(db, tenant_id)


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def create_user(
    db: AsyncSession,
    email: str,
    password_hash: str,
    full_name: Optional[str] = None,
    role: str = "tenant_user",
    tenant_id: Optional[str] = None,
) -> User:
    u = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=password_hash,
        full_name=full_name,
        role=role,
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def update_user_last_login(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        update(User).where(User.id == user_id).values(last_login=datetime.utcnow())
    )
    await db.commit()


async def deactivate_user(db: AsyncSession, user_id: str) -> None:
    await db.execute(update(User).where(User.id == user_id).values(is_active=False))
    await db.commit()


def user_to_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "tenant_id": str(u.tenant_id) if u.tenant_id else None,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


async def update_user_password(db: AsyncSession, user_id: str, password_hash: str) -> None:
    await db.execute(
        update(User).where(User.id == user_id).values(password_hash=password_hash)
    )
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Password Reset Tokens
#
# Security: callers store only a SHA-256 hash of the raw token. These helpers
# never receive, return, or log the raw token — they operate on the hash.
# ─────────────────────────────────────────────────────────────────────────────

async def create_password_reset_token(
    db: AsyncSession,
    user_id: str,
    token_hash: str,
    expires_at: datetime,
):
    from core.state_manager import PasswordResetToken
    row = PasswordResetToken(
        id=uuid.uuid4(),
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_valid_reset_token(db: AsyncSession, token_hash: str):
    """Return an unused, unexpired token row for this hash, else None."""
    from core.state_manager import PasswordResetToken
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    )
    return result.scalar_one_or_none()


async def mark_reset_token_used(db: AsyncSession, token_id: str) -> None:
    from core.state_manager import PasswordResetToken
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.id == token_id)
        .values(used_at=datetime.utcnow())
    )
    await db.commit()


async def invalidate_user_reset_tokens(db: AsyncSession, user_id: str) -> None:
    """Mark all outstanding (unused) reset tokens for a user as used."""
    from core.state_manager import PasswordResetToken
    await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=datetime.utcnow())
    )
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Workflow Instances
# ─────────────────────────────────────────────────────────────────────────────

async def create_workflow_instance(
    db: AsyncSession,
    run_id: str,
    tenant_id: str,
    workflow_name: str,
    trigger_signal: dict,
    triggered_by: Optional[str] = None,
    tenant_config: Optional[dict] = None,
) -> WorkflowInstance:
    inst = WorkflowInstance(
        id=uuid.UUID(run_id) if isinstance(run_id, str) else run_id,
        tenant_id=uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id,
        workflow_name=workflow_name,
        status=WorkflowStatus.PENDING,
        trigger_signal=trigger_signal,
        context={
            "trigger_signal": trigger_signal,
            "tenant_id": str(tenant_id),
            "workflow_name": workflow_name,
            "started_at": datetime.utcnow().isoformat(),
            "patterns": [],
            "tenant_config": tenant_config or {},
            "triggered_by": triggered_by,
        },
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return inst


async def get_workflow_instance(db: AsyncSession, run_id: str) -> Optional[WorkflowInstance]:
    u_id = uuid.UUID(run_id) if isinstance(run_id, str) else run_id
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == u_id))
    return result.scalar_one_or_none()


async def list_workflow_instances(
    db: AsyncSession,
    tenant_id: Optional[str] = None,
    limit: int = 100,
) -> list[WorkflowInstance]:
    q = select(WorkflowInstance)
    if tenant_id:
        q = q.where(WorkflowInstance.tenant_id == tenant_id)
    q = q.order_by(WorkflowInstance.started_at.desc()).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


async def list_agent_run_records(
    db: AsyncSession,
    instance_id: str,
) -> list:
    """Return full agent run history for a workflow instance from the normalised table."""
    from core.state_manager import AgentRunRecord
    result = await db.execute(
        select(AgentRunRecord)
        .where(AgentRunRecord.instance_id == instance_id)
        .order_by(AgentRunRecord.completed_at)
    )
    return list(result.scalars().all())
 
 
def agent_run_record_to_dict(r) -> dict:
    return {
        "node_id":            r.node_id,
        "agent_type":         r.agent_type,
        "status":             r.status,
        "cost_usd":           r.cost_usd or 0.0,
        "tokens_in":          r.tokens_in or 0,
        "tokens_out":         r.tokens_out or 0,
        "model_used":         r.model_used,
        "confidence":         r.confidence,
        "duration_ms":        r.duration_ms,
        "error":              r.error,
        "tools_used":         r.tools_used or [],
        "_prosecutor_issues": r.prosecutor_issues,
        "_judge_verdict":     r.judge_verdict,
        "delta_vs_history":   r.delta_vs_history,
        "delta_trend":        r.delta_trend,
        "delta_analysis":     r.delta_analysis,
        "completed_at":       r.completed_at.isoformat() if r.completed_at else None,
    }

async def update_workflow_status(
    db: AsyncSession,
    run_id: str,
    status: str,
    current_node: Optional[str] = None,
    outcome: Optional[dict] = None,
    error: Optional[str] = None,
    agent_run_data: Optional[dict] = None,
    cost_delta: float = 0.0,
    tokens_in_delta: int = 0,
    tokens_out_delta: int = 0,
) -> None:
    updates: dict[str, Any] = {"status": status}
    if current_node is not None:
        updates["current_node"] = current_node
    if outcome is not None:
        updates["outcome"] = outcome
    if error is not None:
        updates["error_log"] = error
    if status in ("completed", "failed", "stopped"):
        updates["completed_at"] = datetime.utcnow()
    if cost_delta or tokens_in_delta or tokens_out_delta or agent_run_data:
        result = await db.execute(
            select(
                WorkflowInstance.total_cost_usd,
                WorkflowInstance.total_tokens_in,
                WorkflowInstance.total_tokens_out,
                WorkflowInstance.agent_runs,
            ).where(WorkflowInstance.id == run_id)
        )
        row = result.one_or_none()
        if row:
            if cost_delta or tokens_in_delta or tokens_out_delta:
                updates["total_cost_usd"] = (row[0] or 0.0) + cost_delta
                updates["total_tokens_in"] = (row[1] or 0) + tokens_in_delta
                updates["total_tokens_out"] = (row[2] or 0) + tokens_out_delta
            if agent_run_data:
                existing_runs = list(row[3] or [])
                node_id = agent_run_data.get("node_id")
                if node_id:
                    # Deduplicate: replace existing entry for this node_id
                    existing_runs = [r for r in existing_runs if r.get("node_id") != node_id]
                existing_runs.append(agent_run_data)
                updates["agent_runs"] = existing_runs

    await db.execute(
        update(WorkflowInstance).where(WorkflowInstance.id == run_id).values(**updates)
    )
    await db.commit()


def workflow_to_dict(inst: WorkflowInstance) -> dict:
    """Serialise a WorkflowInstance to a plain API-friendly dict."""
    signal = getattr(inst, "trigger_signal", None)
    if signal is None:
        signal = getattr(inst, "trigger_payload", None)
    if not isinstance(signal, dict):
        signal = {}

    # Distinguish manual vs new email / automatic trigger
    raw_source = signal.get("source", "manual")
    if raw_source in ("manual_ui", "manual", "ui", "user_trigger"):
        trigger_type = "Manual"
    elif raw_source in ("email_event_detector", "synthetic_fixture", "new_email", "email_inbox", "synthetic_inbox"):
        trigger_type = "New Email"
    elif raw_source in ("scheduled", "cron"):
        trigger_type = "Scheduled"
    elif raw_source in ("webhook", "api_event"):
        trigger_type = "Webhook"
    else:
        trigger_type = str(raw_source).replace("_", " ").title()

    msg_ids = signal.get("message_ids")
    msg_limit = signal.get("limit")
    if isinstance(msg_ids, list):
        message_count = len(msg_ids)
    elif msg_limit is not None:
        message_count = int(msg_limit)
    elif isinstance(inst.outcome, dict) and "emails_processed" in inst.outcome:
        message_count = inst.outcome.get("emails_processed")
    else:
        message_count = None

    tenant_val = getattr(inst, "tenant_id", None) or getattr(inst, "organization_id", None)

    return {
        "run_id": str(inst.id),
        "id": str(inst.id),
        "tenant_id": str(tenant_val) if tenant_val else "",
        "organization_id": str(tenant_val) if tenant_val else "",
        "workflow_name": inst.workflow_name,
        "name": inst.workflow_name,
        "status": inst.status,
        "current_node": inst.current_node,
        "started_at": inst.started_at.isoformat() if inst.started_at else None,
        "completed_at": inst.completed_at.isoformat() if inst.completed_at else None,
        "total_cost_usd": inst.total_cost_usd or 0.0,
        "total_tokens_in": inst.total_tokens_in or 0,
        "total_tokens_out": inst.total_tokens_out or 0,
        "agent_runs": getattr(inst, "agent_runs", []) or [],
        "outcome": inst.outcome,
        "trigger_signal": signal,
        "trigger_payload": signal,
        "trigger_source": raw_source,
        "trigger_type": trigger_type,
        "message_count": message_count,
        "error": getattr(inst, "error_log", None),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Escalations
# ─────────────────────────────────────────────────────────────────────────────

async def get_escalation(db: AsyncSession, esc_id: str) -> Optional[Escalation]:
    result = await db.execute(select(Escalation).where(Escalation.id == esc_id))
    return result.scalar_one_or_none()


async def list_escalations(
    db: AsyncSession,
    status: str = "pending",
    tenant_id: Optional[str] = None,
) -> list[Escalation]:
    q = select(Escalation).where(Escalation.status == status)
    if tenant_id:
        q = q.where(Escalation.tenant_id == tenant_id)
    result = await db.execute(q.order_by(Escalation.created_at.desc()))
    return list(result.scalars().all())


def escalation_to_dict(e: Escalation) -> dict:
    return {
        "id": str(e.id),
        "escalation_id": str(e.id),
        "instance_id": str(e.instance_id),
        "tenant_id": str(e.tenant_id),
        "node_id": e.node_id,
        "reason": e.reason,
        "context_brief": e.context_brief,
        "recommended_action": e.recommended_action,
        "status": e.status,
        "decision": e.decision,
        "decided_by": e.decided_by,
        "decided_at": e.decided_at.isoformat() if e.decided_at else None,
        "action_chosen": getattr(e, "action_chosen", None),
        "required_signatures": getattr(e, "required_signatures", 1),
        "signatures": getattr(e, "signatures", []),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# A2A Requests
# ─────────────────────────────────────────────────────────────────────────────

async def get_a2a_request(db: AsyncSession, a2a_id: str) -> Optional[A2ARequest]:
    result = await db.execute(select(A2ARequest).where(A2ARequest.id == a2a_id))
    return result.scalar_one_or_none()


async def list_pending_a2a(
    db: AsyncSession, tenant_id: Optional[str] = None
) -> list[A2ARequest]:
    q = select(A2ARequest).where(A2ARequest.status == "pending_permission")
    if tenant_id:
        q = q.where(A2ARequest.tenant_id == tenant_id)
    result = await db.execute(q.order_by(A2ARequest.created_at.desc()))
    return list(result.scalars().all())


def a2a_to_dict(a: A2ARequest) -> dict:
    return {
        "a2a_id": str(a.id),
        "run_id": str(a.instance_id),
        "tenant_id": str(a.tenant_id),
        "requesting_agent": a.requesting_agent,
        "target_agent": a.target_agent,
        "target_node_id": a.target_node_id,
        "reason": a.reason,
        "refinement_note": a.refinement_note,
        "new_tools": list(a.new_tools or []),   # Feature 1
        "estimated_cost_usd": a.estimated_cost_usd,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Credentials
# ─────────────────────────────────────────────────────────────────────────────

async def create_credential(
    db: AsyncSession,
    tenant_id: str,
    tool_name: str,
    display_name: str,
    encrypted_data: str,
) -> IntegrationCredential:
    cred = IntegrationCredential(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        tool_name=tool_name,
        display_name=display_name or tool_name,
        credentials={"encrypted": encrypted_data},
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return cred


async def list_credentials(
    db: AsyncSession, tenant_id: Optional[str] = None
) -> list[IntegrationCredential]:
    q = select(IntegrationCredential)
    if tenant_id:
        q = q.where(IntegrationCredential.tenant_id == tenant_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_credential(db: AsyncSession, cred_id: str) -> Optional[IntegrationCredential]:
    result = await db.execute(
        select(IntegrationCredential).where(IntegrationCredential.id == cred_id)
    )
    return result.scalar_one_or_none()


async def delete_credential(db: AsyncSession, cred_id: str) -> None:
    await db.execute(
        delete(IntegrationCredential).where(IntegrationCredential.id == cred_id)
    )
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Custom Tools
# ─────────────────────────────────────────────────────────────────────────────

async def create_custom_tool(db: AsyncSession, data: dict) -> CustomTool:
    tool = CustomTool(id=uuid.uuid4(), **data)
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool


async def list_custom_tools(
    db: AsyncSession, tenant_id: Optional[str] = None
) -> list[CustomTool]:
    q = select(CustomTool).where(CustomTool.is_active.is_(True))
    if tenant_id:
        q = q.where(CustomTool.tenant_id == tenant_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_custom_tool(db: AsyncSession, tool_id: str) -> Optional[CustomTool]:
    result = await db.execute(select(CustomTool).where(CustomTool.id == tool_id))
    return result.scalar_one_or_none()


async def delete_custom_tool(db: AsyncSession, tool_id: str) -> None:
    await db.execute(delete(CustomTool).where(CustomTool.id == tool_id))
    await db.commit()


def custom_tool_to_dict(t: CustomTool) -> dict:
    return {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id),
        "tool_name": t.tool_name,
        "display_name": t.display_name,
        "description": t.description,
        "base_url": t.base_url,
        "http_method": t.http_method,
        "auth_type": t.auth_type,
        "credential_id": str(t.credential_id) if t.credential_id else None,
        "response_path": t.response_path,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Budget Settings
# ─────────────────────────────────────────────────────────────────────────────

async def get_budget_settings(db: AsyncSession, tenant_id: str) -> Optional[dict]:
    result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.tenant_id == tenant_id)
    )
    bs = result.scalar_one_or_none()
    if not bs:
        return None
    return {
        "tenant_id": str(bs.tenant_id),
        "optimization_level": bs.optimization_level,
        "strategy": bs.strategy,
        "enable_caching": bs.enable_caching,
        "cache_ttl_seconds": bs.cache_ttl_seconds,
        "max_context_tokens": bs.max_context_tokens,
        "a2a_enabled": bs.a2a_enabled,
        "auto_retry_on_low_confidence": bs.auto_retry_on_low_confidence,
        "confidence_retry_threshold": bs.confidence_retry_threshold,
        "enable_map_reduce_summarization": bs.enable_map_reduce_summarization or False,
        "max_spend_per_run_usd": bs.max_spend_per_run_usd,
    }


async def upsert_budget_settings(db: AsyncSession, tenant_id: str, data: dict) -> dict:
    result = await db.execute(
        select(BudgetSettings).where(BudgetSettings.tenant_id == tenant_id)
    )
    bs = result.scalar_one_or_none()
    if bs:
        await db.execute(
            update(BudgetSettings)
            .where(BudgetSettings.tenant_id == tenant_id)
            .values(**{k: v for k, v in data.items() if k != "tenant_id"})
        )
    else:
        db.add(BudgetSettings(id=uuid.uuid4(), tenant_id=tenant_id, **data))
    await db.commit()
    return await get_budget_settings(db, tenant_id)


# ─────────────────────────────────────────────────────────────────────────────
# System Events
# ─────────────────────────────────────────────────────────────────────────────

async def log_event(
    db: AsyncSession,
    event_type: str,
    tenant_id: Optional[str],
    instance_id: Optional[str],
    message: str,
    metadata: Optional[dict] = None,
) -> None:
    ev = SystemEvent(
        id=uuid.uuid4(),
        event_type=event_type,
        tenant_id=tenant_id,
        instance_id=instance_id,
        message=message[:1000],
        metadata_=metadata or {},
    )
    db.add(ev)
    # Don't commit here — let the parent transaction handle it
    # (or use flush so it's visible without committing)
    await db.flush()


async def list_events(db: AsyncSession, limit: int = 100) -> list[dict]:
    result = await db.execute(
        select(SystemEvent).order_by(SystemEvent.created_at.desc()).limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "event_type": e.event_type,
            "tenant_id": str(e.tenant_id) if e.tenant_id else None,
            "instance_id": str(e.instance_id) if e.instance_id else None,
            "message": e.message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Analytics helpers
# ─────────────────────────────────────────────────────────────────────────────

async def get_fleet_analytics(db: AsyncSession) -> dict:
    result = await db.execute(
        select(
            WorkflowInstance.tenant_id,
            func.count(WorkflowInstance.id).label("runs"),
            func.sum(WorkflowInstance.total_cost_usd).label("cost"),
            func.sum(WorkflowInstance.total_tokens_in).label("tokens"),
            func.sum(
                (WorkflowInstance.status == WorkflowStatus.COMPLETED).cast(Integer)
            ).label("completed"),
        ).group_by(WorkflowInstance.tenant_id)
    )
    rows = result.all()
    by_tenant = {}
    for row in rows:
        tid = str(row[0])
        by_tenant[tid] = {
            "runs": row[1],
            "cost": float(row[2] or 0),
            "tokens": int(row[3] or 0),
            "completed": int(row[4] or 0),
        }
    return {
        "total_cost_usd": sum(v["cost"] for v in by_tenant.values()),
        "total_runs": sum(v["runs"] for v in by_tenant.values()),
        "by_tenant": by_tenant,
    }
    
# ─────────────────────────────────────────────────────────────────────────────
# Email Queue
# ─────────────────────────────────────────────────────────────────────────────

async def list_email_queue(
    db: AsyncSession,
    tenant_id: Optional[str] = None,
    status: str = "pending",
) -> list:
    from core.state_manager import EmailQueue
    q = select(EmailQueue)
    if tenant_id:
        q = q.where(EmailQueue.tenant_id == tenant_id)
    if status != "all":
        q = q.where(EmailQueue.status == status)
    q = q.order_by(EmailQueue.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_email_queue_item(db: AsyncSession, item_id: str):
    from core.state_manager import EmailQueue
    result = await db.execute(select(EmailQueue).where(EmailQueue.id == item_id))
    return result.scalar_one_or_none()


async def update_email_queue_item(
    db: AsyncSession,
    item_id: str,
    updates: dict,
) -> None:
    from core.state_manager import EmailQueue
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(EmailQueue).where(EmailQueue.id == item_id).values(**updates)
    )
    await db.commit()


def email_queue_to_dict(item) -> dict:
    return {
        "id":               str(item.id),
        "tenant_id":        str(item.tenant_id),
        "run_id":           str(item.run_id) if item.run_id else None,
        "account_id":       item.account_id,
        "recipient_email":  item.recipient_email,
        "recipient_name":   item.recipient_name,
        "subject":          item.subject,
        "body":             item.body,
        "email_type":       item.email_type,
        "csm_name":         item.csm_name,
        "workflow_name":    item.workflow_name,
        "status":           item.status,
        "rejection_reason": item.rejection_reason,
        "reviewed_at":      item.reviewed_at.isoformat() if item.reviewed_at else None,
        "reviewed_by":      item.reviewed_by,
        "created_at":       item.created_at.isoformat() if item.created_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Pattern Memory (tenant-facing CRUD)
# ─────────────────────────────────────────────────────────────────────────────

async def list_patterns(
    db: AsyncSession,
    tenant_id: str,
    status_filter: Optional[str] = None,
) -> list:
    q = select(PatternMemory).where(PatternMemory.tenant_id == tenant_id)
    if status_filter:
        q = q.where(PatternMemory.pattern_status == status_filter)
    q = q.order_by(PatternMemory.last_updated.desc()).limit(100)
    result = await db.execute(q)
    return list(result.scalars().all())


def pattern_to_dict(p: PatternMemory) -> dict:
    return {
        "id":             str(p.id),
        "tenant_id":      str(p.tenant_id),
        "pattern_key":    p.pattern_key,
        "pattern_data":   p.pattern_data,
        "success_rate":   p.success_rate,
        "sample_size":    p.sample_size,
        "pattern_status": p.pattern_status,
        "last_updated":   p.last_updated.isoformat() if p.last_updated else None,
    }

async def get_dashboard_data(db: AsyncSession, tenant_id: str) -> dict:
    from sqlalchemy import select, func, and_, desc, text
    from datetime import datetime, timezone, timedelta
    from core.state_manager import WorkflowInstance, Escalation, A2ARequest, AgentRunRecord

    # NOTE: DB DateTime columns are naive UTC (Column(DateTime), default=datetime.utcnow)
    # throughout this schema. Use naive UTC here so comparisons/date_trunc against
    # started_at/completed_at don't raise "can't subtract offset-naive and offset-aware".
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    ten_days_ago = today - timedelta(days=9)
    seven_days_ago = today - timedelta(days=6)

    # 1. Active Runs
    active_runs_res = await db.execute(
        select(
            func.count().filter(WorkflowInstance.status == 'running'),
            func.count().filter(WorkflowInstance.started_at >= today)
        ).where(WorkflowInstance.tenant_id == tenant_id)
    )
    active_count, initiated_today = active_runs_res.first()

    # 2. Pending Approvals
    pending_esc_res = await db.execute(
        select(func.count(Escalation.id)).where(
            and_(Escalation.tenant_id == tenant_id, Escalation.status == 'pending')
        )
    )
    pending_a2a_res = await db.execute(
        select(func.count(A2ARequest.id)).where(
            and_(A2ARequest.tenant_id == tenant_id, A2ARequest.status == 'pending_permission')
        )
    )
    pending_approvals = (pending_esc_res.scalar() or 0) + (pending_a2a_res.scalar() or 0)

    # 3. Tasks Completed
    tasks_res = await db.execute(
        select(func.count(AgentRunRecord.id))
        .join(WorkflowInstance, AgentRunRecord.instance_id == WorkflowInstance.id)
        .where(
            and_(
                WorkflowInstance.tenant_id == tenant_id,
                AgentRunRecord.status.in_(['success', 'completed'])
            )
        )
    )
    tasks_total = tasks_res.scalar() or 0

    # Sparkline trend (last 7 days)
    sparkline_res = await db.execute(
        select(
            func.date_trunc('day', AgentRunRecord.completed_at).label('day'),
            func.count(AgentRunRecord.id)
        )
        .join(WorkflowInstance, AgentRunRecord.instance_id == WorkflowInstance.id)
        .where(
            and_(
                WorkflowInstance.tenant_id == tenant_id,
                AgentRunRecord.status.in_(['success', 'completed']),
                AgentRunRecord.completed_at >= seven_days_ago
            )
        )
        .group_by('day')
    )
    trend_dict = {str(row[0].date()) if row[0] else '': row[1] for row in sparkline_res.all()}
    
    tasks_trend = []
    for i in range(7):
        d = (seven_days_ago + timedelta(days=i)).date()
        tasks_trend.append(trend_dict.get(str(d), 0))

    # 4. Recent Activity
    recent_res = await db.execute(
        select(
            WorkflowInstance.id, 
            WorkflowInstance.workflow_name, 
            WorkflowInstance.status, 
            WorkflowInstance.started_at,
            WorkflowInstance.current_node
        )
        .where(WorkflowInstance.tenant_id == tenant_id)
        .order_by(desc(WorkflowInstance.started_at))
        .limit(5)
    )
    recent_activity = []
    for r in recent_res.all():
        desc_text = 'Workflow is running'
        if r.status in ['completed', 'WorkflowStatus.COMPLETED']:
            desc_text = 'Workflow completed'
        elif r.status in ['failed', 'stopped']:
            desc_text = 'Workflow failed'
        elif r.status in ['escalated', 'pending_a2a']:
            desc_text = 'Awaiting approval'
        
        recent_activity.append({
            'id': str(r.id),
            'name': r.workflow_name or 'Workflow Run',
            'status': r.status,
            'timestamp': r.started_at.isoformat() if r.started_at else None,
            'description': desc_text
        })

    # 5. Workflow Performance
    perf_res = await db.execute(
        select(
            WorkflowInstance.workflow_name,
            func.count().filter(WorkflowInstance.status.in_(['completed', 'WorkflowStatus.COMPLETED'])).label('completed'),
            func.count().filter(WorkflowInstance.status.in_(['failed', 'stopped'])).label('failed')
        )
        .where(WorkflowInstance.tenant_id == tenant_id)
        .group_by(WorkflowInstance.workflow_name)
    )
    performance = []
    for row in perf_res.all():
        comp = row.completed or 0
        fail = row.failed or 0
        total = comp + fail
        if total > 0:
            rate = round((comp / total) * 100)
            performance.append({
                'name': row.workflow_name or 'Unknown',
                'success_rate': rate,
                'runs': comp + fail
            })
    performance.sort(key=lambda x: x['runs'], reverse=True)
    performance = performance[:5]

    # 6. Cost Overview
    cost_res = await db.execute(
        select(
            func.sum(WorkflowInstance.total_cost_usd),
            func.count(WorkflowInstance.id)
        )
        .where(
            and_(
                WorkflowInstance.tenant_id == tenant_id,
                WorkflowInstance.started_at >= first_of_month
            )
        )
    )
    cost_row = cost_res.first()
    mtd_spend = cost_row[0] or 0.0
    mtd_runs = cost_row[1] or 0
    avg_cost = (mtd_spend / mtd_runs) if mtd_runs > 0 else 0.0

    daily_cost_res = await db.execute(
        select(
            func.date_trunc('day', WorkflowInstance.started_at).label('day'),
            func.sum(WorkflowInstance.total_cost_usd)
        )
        .where(
            and_(
                WorkflowInstance.tenant_id == tenant_id,
                WorkflowInstance.started_at >= ten_days_ago
            )
        )
        .group_by('day')
    )
    daily_cost_dict = {str(row[0].date()) if row[0] else '': (row[1] or 0.0) for row in daily_cost_res.all()}
    
    daily_trend = []
    for i in range(10):
        d = (ten_days_ago + timedelta(days=i)).date()
        daily_trend.append({
            'date': str(d),
            'cost': daily_cost_dict.get(str(d), 0.0)
        })

    return {
        'active_runs': {'current': active_count or 0, 'initiated_today': initiated_today or 0},
        'pending_approvals': {'total': pending_approvals},
        'tasks_completed': {'total': tasks_total, 'trend': tasks_trend},
        'net_savings': {'value': None, 'status': 'not_measured'},
        'recent_activity': recent_activity,
        'workflow_performance': performance,
        'cost_overview': {
            'mtd_spend': round(mtd_spend, 6),
            'avg_cost_per_run': round(avg_cost, 6),
            'daily_trend': daily_trend
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# Organization & User Auto-Provisioning (Supabase Managed PostgreSQL)
# ─────────────────────────────────────────────────────────────────────────────

async def ensure_user_organization_provisioned(
    db: AsyncSession,
    user_id: str,
    email: str,
    full_name: Optional[str] = None,
    workspace_name: Optional[str] = None,
    industry: Optional[str] = None,
) -> tuple[Optional[OrganizationUser], Optional[Organization]]:
    """
    Deterministically resolves or auto-provisions an SMBFlow organization_users
    and Organization record for a valid Supabase Auth user.
    Enforces server-side authority:
      - Uses stable auth.users.id (user_id)
      - Never allows client-supplied role self-assignment
      - New users receive default 'org_user' role
      - Reuses existing organization if present to prevent duplicate org creation
    """
    try:
        u_uuid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        u_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, user_id)

    # 1. Query existing OrganizationUser by user_id
    res = await db.execute(select(OrganizationUser).where(OrganizationUser.user_id == u_uuid))
    org_user = res.scalar_one_or_none()

    if not org_user and email:
        # Fallback check by email to prevent duplicate entries for existing users
        res_email = await db.execute(select(OrganizationUser).where(OrganizationUser.email == email))
        org_user = res_email.scalar_one_or_none()
        if org_user and org_user.user_id != u_uuid:
            org_user.user_id = u_uuid
            await db.flush()

    # Check if this email is a legacy platform admin or admin@smbflow.com
    is_bootstrap_admin = False
    if email:
        if email.lower() == "admin@smbflow.com":
            is_bootstrap_admin = True
        else:
            legacy_u = await get_user_by_email(db, email)
            if legacy_u and legacy_u.role in ("super_admin", "platform_admin"):
                is_bootstrap_admin = True

    if org_user:
        # Fetch organization
        org_res = await db.execute(select(Organization).where(Organization.id == org_user.organization_id))
        org = org_res.scalar_one_or_none()

        updated = False
        if is_bootstrap_admin and org_user.role != "platform_admin":
            org_user.role = "platform_admin"
            updated = True

        if org:
            if workspace_name and org.name != workspace_name:
                org.name = workspace_name
                updated = True
            if industry and org.industry != industry:
                org.industry = industry
                org.enabled_modules = [industry]
                updated = True
            if workspace_name:
                cfg = dict(org.profile_config or {})
                if cfg.get("requires_onboarding") != False:
                    cfg["requires_onboarding"] = False
                    org.profile_config = cfg
                    updated = True
        else:
            org = Organization(
                id=org_user.organization_id,
                name=workspace_name or "Pending Workspace Setup",
                industry=industry or "saas",
                enabled_modules=[industry] if industry else ["saas"],
                profile_config={"requires_onboarding": False if workspace_name else True},
                active=True,
            )
            db.add(org)
            updated = True

        if full_name and org_user.full_name != full_name:
            org_user.full_name = full_name
            updated = True

        if updated:
            await db.commit()
            await db.refresh(org)
            await db.refresh(org_user)

        return org_user, org

    # 2. No organization_user record found — check if user provided workspace_name
    if workspace_name:
        org = Organization(
            id=uuid.uuid4(),
            name=workspace_name,
            industry=industry or "saas",
            enabled_modules=[industry] if industry else ["saas"],
            profile_config={"requires_onboarding": False},
            active=True,
        )
        db.add(org)
        await db.flush()
        await db.refresh(org)
    else:
        # New user without workspace_name gets a dedicated pending workspace requiring onboarding
        org = Organization(
            id=uuid.uuid4(),
            name="Pending Workspace Setup",
            industry=industry or "saas",
            enabled_modules=[industry] if industry else ["saas"],
            profile_config={"requires_onboarding": True},
            active=True,
        )
        db.add(org)
        await db.flush()
        await db.refresh(org)

    # 3. Create OrganizationUser record for new user (enforces org_user role unless bootstrap admin)
    name_display = full_name or (email.split("@")[0].replace(".", " ").title() if email else "User")
    assigned_role = "platform_admin" if is_bootstrap_admin else "org_user"
    org_user = OrganizationUser(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=u_uuid,
        email=email or f"{user_id}@smbflow.com",
        full_name=name_display,
        role=assigned_role,
        created_at=datetime.utcnow(),
    )
    db.add(org_user)
    await db.commit()
    await db.refresh(org_user)

    return org_user, org


# ─────────────────────────────────────────────────────────────────────────────
# Organizations (new auth-layer table — distinct from legacy tenants table)
# ─────────────────────────────────────────────────────────────────────────────

async def get_organization_by_id(
    db: AsyncSession, org_id: str
) -> Optional[Organization]:
    """Query organizations table by id (UUID string)."""
    try:
        result = await db.execute(
            select(Organization).where(Organization.id == org_id)
        )
        return result.scalar_one_or_none()
    except Exception:
        return None


async def update_organization_config(
    db: AsyncSession, org_id: str, partial_config: dict
) -> Optional[Organization]:
    """Merge partial_config into organizations.profile_config."""
    org = await get_organization_by_id(db, org_id)
    if not org:
        return None
    merged = {**(org.profile_config or {}), **partial_config}
    await db.execute(
        update(Organization)
        .where(Organization.id == org_id)
        .values(profile_config=merged, updated_at=datetime.utcnow())
    )
    await db.commit()
    return await get_organization_by_id(db, org_id)


async def update_organization_profile(
    db: AsyncSession,
    org_id: str,
    name: Optional[str] = None,
    industry: Optional[str] = None,
    profile_config: Optional[dict] = None,
) -> Optional[Organization]:
    """Update organization name, industry and/or profile_config."""
    org = await get_organization_by_id(db, org_id)
    if not org:
        return None
    values: dict = {"updated_at": datetime.utcnow()}
    if name is not None:
        values["name"] = name
    if industry is not None:
        values["industry"] = industry
    if profile_config is not None:
        values["profile_config"] = {**(org.profile_config or {}), **profile_config}
    await db.execute(
        update(Organization).where(Organization.id == org_id).values(**values)
    )
    await db.commit()
    return await get_organization_by_id(db, org_id)


async def resolve_tenant_config_bridge(
    db: AsyncSession,
    org_id: str,
) -> tuple:
    """
    Option B Tenant Bridge — Phase 0.

    The workflow orchestrator needs a Tenant record + config (from the legacy
    ``tenants`` table).  The authenticated user's identity is anchored to the
    ``organizations`` table.  These share the same physical DB but are separate
    tables with different UUIDs.

    Resolution strategy:
      1. Try org_id directly against the ``tenants`` table (covers the case where
         a Tenant was created with the same UUID during prior onboarding).
      2. If not found, synthesize a minimal config dict from the Organization
         record so the orchestrator can still run without modification.

    Returns: (effective_tenant_id: str, config: dict)
    """
    # Step 1 — try legacy tenants table directly
    legacy = await get_tenant(db, org_id)
    if legacy:
        return str(legacy.id), legacy.config or {}

    # Step 2 — fall back to synthesizing from the organizations record
    org = await get_organization_by_id(db, org_id)
    if not org:
        return org_id, {}

    merged_profile = dict(org.profile_config or {})
    synthesized_config: dict = {
        "client_id":        str(org.id),
        "client_name":      org.name or "SMBFlow Organization",
        "industry":         org.industry or "saas",
        "enabled_modules":  org.enabled_modules or [org.industry or "saas"],
        "active_workflows": ["email_summarizer"],
        "integrations":     {},
        "business_rules":   merged_profile.get("business_rules") or {
            "high_value_deal_threshold": 50000,
            "sla_warning_threshold_hours": 24,
            "escalate_urgency_level": "high",
        },
        "tone_profile":     merged_profile.get("tone_profile") or {
            "brand_voice": "Professional, empathetic, and action-oriented",
            "formality": "high",
        },
        "action_library":   merged_profile.get("action_library") or {
            "actions": [
                {
                    "id": "action_sla_urgent_response",
                    "action_type": "send_email",
                    "description": "Send urgent SLA response to client",
                    "required_approval": True,
                },
                {
                    "id": "action_log_summary",
                    "action_type": "log_event",
                    "description": "Log email summary into audit records",
                    "required_approval": False,
                }
            ]
        },
        "llm_overrides":    merged_profile.get("llm_overrides") or {},
        **merged_profile,
    }
    # Strip internal onboarding flags that the orchestrator does not need
    synthesized_config.pop("requires_onboarding", None)
    synthesized_config.pop("_is_test_artifact", None)

    return str(org.id), synthesized_config


# ─────────────────────────────────────────────────────────────────────────────
# Workflow Definitions (organization-scoped, separate from filesystem DAGs)
# ─────────────────────────────────────────────────────────────────────────────

async def list_workflow_definitions(
    db: AsyncSession,
    organization_id: Optional[str] = None,
    include_templates: bool = False,
) -> list:
    """
    List WorkflowDefinitions scoped to an organization.

    - organization_id: filter to this org's definitions.
    - include_templates: also return platform templates
      (organization_id IS NULL and is_template=True).
    """
    from db.models.core import WorkflowDefinition as WFDef
    from sqlalchemy import or_

    q = select(WFDef).where(WFDef.active.is_(True))

    if organization_id and include_templates:
        q = q.where(
            or_(
                WFDef.organization_id == organization_id,
                WFDef.is_template.is_(True),
            )
        )
    elif organization_id:
        q = q.where(WFDef.organization_id == organization_id)
    elif include_templates:
        q = q.where(WFDef.is_template.is_(True))

    q = q.order_by(WFDef.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def create_workflow_definition(
    db: AsyncSession,
    organization_id: str,
    name: str,
    industry: str,
    dag_definition: dict,
    version: str = "1.0.0",
    is_template: bool = False,
) -> object:
    """Create a new WorkflowDefinition owned by an organization."""
    from db.models.core import WorkflowDefinition as WFDef

    wf = WFDef(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=name,
        industry=industry,
        version=version,
        dag_definition=dag_definition,
        is_template=is_template,
        active=True,
        created_at=datetime.utcnow(),
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf


# ─────────────────────────────────────────────────────────────────────────────
# Approval Items & Processed Email Events (HITL & Idempotency)
# ─────────────────────────────────────────────────────────────────────────────

async def create_approval_item(
    db: AsyncSession,
    organization_id: str,
    node_id: str = "evaluate_actions",
    review_type: str = "approval",
    reason: str = "Action requires human approval",
    context_brief: str = "",
    payload: Optional[dict] = None,
    instance_id: Optional[str] = None,
    required_signatures: int = 1,
) -> object:
    from db.models.core import ApprovalItem
    org_uuid = uuid.UUID(organization_id) if isinstance(organization_id, str) else organization_id
    inst_uuid = uuid.UUID(instance_id) if isinstance(instance_id, str) and instance_id else None
    item = ApprovalItem(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        instance_id=inst_uuid,
        node_id=node_id,
        review_type=review_type,
        reason=reason,
        context_brief=context_brief,
        payload=payload or {},
        status="pending",
        required_signatures=required_signatures,
        signatures=[],
        created_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_approval_items(
    db: AsyncSession,
    organization_id: Optional[str] = None,
    status: Optional[str] = "pending",
) -> list:
    from db.models.core import ApprovalItem
    q = select(ApprovalItem)
    if organization_id:
        org_uuid = uuid.UUID(organization_id) if isinstance(organization_id, str) else organization_id
        q = q.where(ApprovalItem.organization_id == org_uuid)
    if status and status != "all":
        q = q.where(ApprovalItem.status == status)
    q = q.order_by(ApprovalItem.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_approval_item(db: AsyncSession, approval_id: str) -> Optional[object]:
    from db.models.core import ApprovalItem
    appr_uuid = uuid.UUID(approval_id) if isinstance(approval_id, str) else approval_id
    result = await db.execute(select(ApprovalItem).where(ApprovalItem.id == appr_uuid))
    return result.scalar_one_or_none()


async def decide_approval_item(
    db: AsyncSession,
    approval_id: str,
    decision_status: str,
    decided_by: Optional[str] = "human_reviewer",
    patch_payload: Optional[dict] = None,
) -> Optional[object]:
    from db.models.core import ApprovalItem
    appr_uuid = uuid.UUID(approval_id) if isinstance(approval_id, str) else approval_id
    result = await db.execute(select(ApprovalItem).where(ApprovalItem.id == appr_uuid))
    item = result.scalar_one_or_none()
    if not item:
        return None
    item.status = decision_status
    item.decided_by = decided_by
    item.decided_at = datetime.utcnow()
    if patch_payload and isinstance(item.payload, dict):
        item.payload = {**item.payload, **patch_payload}
    await db.commit()
    await db.refresh(item)
    return item


async def approval_item_to_dict(item) -> dict:
    return {
        "id": str(item.id),
        "escalation_id": str(item.id),
        "instance_id": str(item.instance_id) if item.instance_id else None,
        "run_id": str(item.instance_id) if item.instance_id else None,
        "node_id": item.node_id or "evaluate_actions",
        "review_type": item.review_type or "approval",
        "reason": item.reason or "Action requires human approval",
        "recommended_action": (item.payload or {}).get("action_type") or "approve_draft",
        "context_brief": item.context_brief or "",
        "payload": item.payload or {},
        "status": item.status,
        "required_signatures": item.required_signatures or 1,
        "signatures": item.signatures or [],
        "decided_by": item.decided_by,
        "decided_at": item.decided_at.isoformat() if item.decided_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


async def get_processed_email_ids(db: AsyncSession, source: Optional[str] = None) -> set[str]:
    from db.models.core import ProcessedEmailEvent
    q = select(ProcessedEmailEvent.message_id)
    if source:
        q = q.where(ProcessedEmailEvent.source == source)
    result = await db.execute(q)
    return set(result.scalars().all())


async def record_processed_emails(
    db: AsyncSession,
    message_ids: list[str],
    batch_id: Optional[str] = None,
    instance_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    source: str = "synthetic_fixture",
) -> int:
    from db.models.core import ProcessedEmailEvent
    count = 0
    org_uuid = uuid.UUID(organization_id) if isinstance(organization_id, str) and organization_id else None
    inst_uuid = uuid.UUID(instance_id) if isinstance(instance_id, str) and instance_id else None
    for mid in message_ids:
        if not mid:
            continue
        evt = ProcessedEmailEvent(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            message_id=mid,
            batch_id=batch_id,
            instance_id=inst_uuid,
            source=source,
            processed_at=datetime.utcnow(),
        )
        db.add(evt)
        count += 1
    await db.commit()
    return count


