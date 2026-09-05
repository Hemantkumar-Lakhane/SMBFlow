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
        id=run_id,
        tenant_id=tenant_id,
        # definition_id=uuid.uuid4(),  # placeholder; real DAG lookup optional
        workflow_name=workflow_name,
        status=WorkflowStatus.PENDING,
        trigger_signal=trigger_signal,
        context={
            "trigger_signal": trigger_signal,
            "tenant_id": str(tenant_id),
            "workflow_name": workflow_name,
            "started_at": datetime.utcnow().isoformat(),
            "patterns": [],
        },
        tenant_config=tenant_config,
        triggered_by=triggered_by,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return inst


async def get_workflow_instance(db: AsyncSession, run_id: str) -> Optional[WorkflowInstance]:
    result = await db.execute(select(WorkflowInstance).where(WorkflowInstance.id == run_id))
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
    return {
        "run_id": str(inst.id),
        "tenant_id": str(inst.tenant_id),
        "workflow_name": inst.workflow_name,
        "status": inst.status,
        "current_node": inst.current_node,
        "started_at": inst.started_at.isoformat() if inst.started_at else None,
        "completed_at": inst.completed_at.isoformat() if inst.completed_at else None,
        "total_cost_usd": inst.total_cost_usd or 0.0,
        "total_tokens_in": inst.total_tokens_in or 0,
        "total_tokens_out": inst.total_tokens_out or 0,
        "agent_runs": inst.agent_runs or [],
        "outcome": inst.outcome,
        "trigger_signal": inst.trigger_signal,
        "error": inst.error_log,
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
