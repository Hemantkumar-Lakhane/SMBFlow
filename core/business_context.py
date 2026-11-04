"""
core/business_context.py
========================
Organization-level configurable Business Context Pack.
Allows organizations to define:
- services_offerings: Core services, products, capabilities
- target_market: Ideal customer profile (ICP), industries, company size
- business_priorities: Current strategic focus, quarterly goals, pilot criteria
- additional_context: Guidance notes, constraints, pricing philosophy

Stored as JSON in Organization.profile_config["business_context"].
Empty context is valid. Multi-tenant isolated.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.core import Organization

log = structlog.get_logger()

DEFAULT_BUSINESS_CONTEXT: Dict[str, Any] = {
    "services_offerings": "",
    "target_market": "",
    "business_priorities": "",
    "additional_context": "",
    "updated_at": None,
    "updated_by": None,
}


async def get_business_context(
    db: AsyncSession,
    org_uuid: uuid.UUID,
) -> Dict[str, Any]:
    """
    Retrieve the Business Context Pack for an organization.
    Returns default empty structure if none has been configured yet.
    Safe for Meeting Intelligence to call without crashing.
    """
    stmt = select(Organization).where(Organization.id == org_uuid)
    res = await db.execute(stmt)
    org = res.scalars().first()
    if not org:
        return dict(DEFAULT_BUSINESS_CONTEXT)

    p_cfg = org.profile_config or {}
    b_ctx = p_cfg.get("business_context")
    if not isinstance(b_ctx, dict):
        return dict(DEFAULT_BUSINESS_CONTEXT)

    return {
        "services_offerings": str(b_ctx.get("services_offerings") or ""),
        "target_market": str(b_ctx.get("target_market") or ""),
        "business_priorities": str(b_ctx.get("business_priorities") or ""),
        "additional_context": str(b_ctx.get("additional_context") or ""),
        "updated_at": b_ctx.get("updated_at"),
        "updated_by": b_ctx.get("updated_by"),
    }


async def update_business_context(
    db: AsyncSession,
    org_uuid: uuid.UUID,
    data: Dict[str, Any],
    updated_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Persist updated Business Context Pack in Organization.profile_config.
    Enforces strict tenant isolation and updates timestamp.
    """
    stmt = select(Organization).where(Organization.id == org_uuid)
    res = await db.execute(stmt)
    org = res.scalars().first()
    if not org:
        raise ValueError(f"Organization '{org_uuid}' not found.")

    p_cfg = dict(org.profile_config or {})
    b_ctx = {
        "services_offerings": str(data.get("services_offerings") or "").strip(),
        "target_market": str(data.get("target_market") or "").strip(),
        "business_priorities": str(data.get("business_priorities") or "").strip(),
        "additional_context": str(data.get("additional_context") or "").strip(),
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": str(updated_by or "admin"),
    }
    p_cfg["business_context"] = b_ctx
    org.profile_config = p_cfg

    await db.commit()
    await db.refresh(org)
    log.info("Business context updated", org_id=str(org_uuid), updated_by=updated_by)
    return b_ctx


def format_business_context_for_prompt(b_ctx: Optional[Dict[str, Any]]) -> str:
    """
    Format business context into clean text suitable for LLM prompts.
    Returns empty string if context is empty or unconfigured.
    Meeting Intelligence reads this without hardcoding business-specific assumptions.
    """
    if not b_ctx or not isinstance(b_ctx, dict):
        return ""

    sections = []
    if b_ctx.get("services_offerings") and str(b_ctx["services_offerings"]).strip():
        sections.append(f"• Services & Offerings: {str(b_ctx['services_offerings']).strip()}")
    if b_ctx.get("target_market") and str(b_ctx["target_market"]).strip():
        sections.append(f"• Target Market & Customer Profile: {str(b_ctx['target_market']).strip()}")
    if b_ctx.get("business_priorities") and str(b_ctx["business_priorities"]).strip():
        sections.append(f"• Current Business Priorities: {str(b_ctx['business_priorities']).strip()}")
    if b_ctx.get("additional_context") and str(b_ctx["additional_context"]).strip():
        sections.append(f"• Additional Context: {str(b_ctx['additional_context']).strip()}")

    if not sections:
        return ""

    return "ORGANIZATION BUSINESS CONTEXT:\n" + "\n".join(sections)

