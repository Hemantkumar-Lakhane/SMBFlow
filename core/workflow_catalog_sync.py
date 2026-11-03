"""
core/workflow_catalog_sync.py
==============================
Idempotent sync of all workflow DAG JSON files into the workflow_catalog table.

Called once at startup from api/main.py lifespan.
Never overwrites manually-edited catalog fields — only inserts missing entries.

Industry → category mapping keeps the catalog consistent with how the platform
classifies vertical workflows.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

# DAGs directory (relative to repo root — resolved at runtime)
_DAGS_DIR = Path(__file__).parent.parent / "workflows" / "dags"

# Industry → catalog category mapping
_INDUSTRY_TO_CATEGORY: dict[str, str] = {
    "general":    "productivity",
    "saas":       "sales",
    "startup":    "marketing",
    "growth":     "operations",
    "healthcare": "healthcare",
    "finance":    "finance",
    "real_estate":"operations",
    "retail":     "operations",
    "hr":         "hr",
    "legal":      "compliance",
    "medical":    "healthcare",
}

# ── Industry applicability mapping ────────────────────────────────────────────
# scope: 'GLOBAL' or 'INDUSTRY'
# industry: matches organizations.industry value (lowercase)
_WORKFLOW_APPLICABILITY: dict[str, dict] = {
    # ── Healthcare / Medical Tourism ─────────────────────────────────────────
    "patient_intake_triage":               {"scope": "INDUSTRY", "industry": "healthcare"},
    "provider_evidence_verification":      {"scope": "INDUSTRY", "industry": "healthcare"},
    "case_brief_summarization":            {"scope": "INDUSTRY", "industry": "healthcare"},
    "coordinator_communication_copilot":   {"scope": "INDUSTRY", "industry": "healthcare"},
    "healthcare_patient_engagement":       {"scope": "INDUSTRY", "industry": "healthcare"},
    # ── Finance ──────────────────────────────────────────────────────────────
    "finance_expense_monitoring":          {"scope": "INDUSTRY", "industry": "finance"},
    "finance_operations_pack":             {"scope": "INDUSTRY", "industry": "finance"},
    "fpa_copilot":                         {"scope": "INDUSTRY", "industry": "finance"},
    "quote_normalization_comparison":      {"scope": "INDUSTRY", "industry": "finance"},
    "billing_agent":                       {"scope": "INDUSTRY", "industry": "finance"},
    # ── Real Estate ──────────────────────────────────────────────────────────
    "re_listing_health_monitor":           {"scope": "INDUSTRY", "industry": "real_estate"},
    "re_tenant_flight_risk":               {"scope": "INDUSTRY", "industry": "real_estate"},
    # ── Retail ───────────────────────────────────────────────────────────────
    "retail_inventory_health":             {"scope": "INDUSTRY", "industry": "retail"},
    # ── SaaS / Growth ────────────────────────────────────────────────────────
    "saas_churn_prevention":               {"scope": "INDUSTRY", "industry": "saas"},
    "saas_pipeline_velocity":              {"scope": "INDUSTRY", "industry": "saas"},
    "inbound_lead_to_demo":                {"scope": "INDUSTRY", "industry": "saas"},
    "lead_qualification_and_routing":      {"scope": "INDUSTRY", "industry": "saas"},
    "lead_qualifier":                      {"scope": "INDUSTRY", "industry": "saas"},
    "demo_booker":                         {"scope": "INDUSTRY", "industry": "saas"},
    "account_based_campaign_coordinator":  {"scope": "INDUSTRY", "industry": "saas"},
    "campaign_orchestrator":               {"scope": "INDUSTRY", "industry": "saas"},
    "performance_engine":                  {"scope": "INDUSTRY", "industry": "saas"},
    "founder_content_to_demand":           {"scope": "INDUSTRY", "industry": "saas"},
    "weekly_founder_growth_brief":         {"scope": "INDUSTRY", "industry": "saas"},
    "social_campaign":                     {"scope": "INDUSTRY", "industry": "saas"},
    "persona_builder":                     {"scope": "INDUSTRY", "industry": "saas"},
    "pipeline_content_operations":         {"scope": "INDUSTRY", "industry": "saas"},
    "journey_task_orchestration":          {"scope": "INDUSTRY", "industry": "saas"},
    "ai_account_manager":                  {"scope": "INDUSTRY", "industry": "saas"},
    "account_signal_expansion":            {"scope": "INDUSTRY", "industry": "saas"},
    "marketing_to_sales_sla_monitor":      {"scope": "INDUSTRY", "industry": "saas"},
    "investor_partnership_update":         {"scope": "INDUSTRY", "industry": "saas"},
    # ── Global ────────────────────────────────────────────────────────────────
    # Available to all industries subject to plan + assignment
    "product_launch_sprint":               {"scope": "GLOBAL",   "industry": None},
    "email_summarizer":                    {"scope": "GLOBAL",   "industry": None},
    "compliance_monitor":                  {"scope": "GLOBAL",   "industry": None},
    "document_intake_extraction":          {"scope": "GLOBAL",   "industry": None},
    "content_factory":                     {"scope": "GLOBAL",   "industry": None},
    "ops_playbook":                        {"scope": "GLOBAL",   "industry": None},
    "meeting_intelligence_followup":       {"scope": "GLOBAL",   "industry": None},
}

# ── Deprecated or Duplicate Workflow Keys to be Consolidated or Removed ───────
_DEPRECATED_OR_DUPLICATE_KEYS: dict[str, dict] = {
    "demo_workflow": {
        "action": "consolidate",
        "canonical_key": "meeting_intelligence_followup",
        "reason": "Duplicate Meeting Intelligence implementation consolidated into canonical meeting_intelligence_followup",
    },
    "demo_meeting_summery": {
        "action": "consolidate",
        "canonical_key": "meeting_intelligence_followup",
        "reason": "Duplicate scratch meeting summary consolidated into canonical meeting_intelligence_followup",
    },
    "email_summerizor_demo": {
        "action": "consolidate",
        "canonical_key": "email_summarizer",
        "reason": "Duplicate demo email summarizer consolidated into canonical email_summarizer",
    },
    "workflow_for_summerizing_the_emails": {
        "action": "consolidate",
        "canonical_key": "email_summarizer",
        "reason": "Duplicate email summarizer DAG consolidated into canonical email_summarizer",
    },
    "demo": {
        "action": "delete",
        "canonical_key": None,
        "reason": "Scratch demo workflow deleted",
    },
    "demo_counsil_connect": {
        "action": "delete",
        "canonical_key": None,
        "reason": "Scratch demo workflow deleted",
    },
}

# Manually curated metadata for workflows where the DAG _meta is sparse
_CATALOG_OVERRIDES: dict[str, dict] = {
    "meeting_intelligence_followup": {
        "category": "productivity",
        "status": "active",
        "requires_explicit_assignment": True,
        "supported_modules": ["meetings", "productivity"],
        "required_integrations": ["google_workspace"],
        "required_capabilities": ["meet_transcript", "audio_transcription", "llm_analysis"],
        "execution_handler": "meeting_intelligence_router",
        "input_schema": {
            "type": "object",
            "properties": {
                "meet_url": {
                    "type": "string",
                    "title": "Google Meet URL",
                    "description": "Google Meet link (e.g., https://meet.google.com/abc-defg-hij) or meeting code"
                },
                "audio_file": {
                    "type": "string",
                    "title": "Audio File",
                    "description": "Path or upload of meeting audio recording (.mp3, .wav, .m4a)"
                },
                "transcript": {
                    "type": "string",
                    "title": "Meeting Transcript",
                    "description": "User-provided or pasted conversation transcript text"
                }
            }
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "title": "Executive Summary"},
                "key_points": {"type": "array", "title": "Key Discussion Points"},
                "decisions": {"type": "array", "title": "Agreed Decisions"},
                "commitments": {"type": "array", "title": "Explicit Commitments & Owners"},
                "suggested_followups": {"type": "array", "title": "Suggested Follow-up Actions"},
                "open_questions": {"type": "array", "title": "Open Questions & Unresolved Issues"},
                "followup_email": {"type": "string", "title": "Draft Follow-up Email"}
            }
        }
    },
    "email_summarizer": {
        "category": "productivity",
        "status": "active",
        "required_integrations": ["gmail"],
        "supported_modules": ["email"],
        "required_capabilities": ["gmail_read", "email_triage", "llm_analysis"],
        "execution_handler": "email_summarizer_router",
        "input_schema": {
            "type": "object",
            "properties": {
                "days_back": {"type": "integer", "title": "Days to Look Back", "default": 7},
                "max_emails": {"type": "integer", "title": "Max Emails to Ingest", "default": 20},
                "category_filter": {"type": "string", "title": "Category Filter", "default": "all"}
            }
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "digests": {"type": "array", "title": "Summarized Email Batches"},
                "action_items": {"type": "array", "title": "Extracted Action Items"},
                "high_priority_count": {"type": "integer", "title": "Urgent Threads"}
            }
        }
    },
    "product_launch_sprint": {
        "category": "marketing",
        "status": "active",
        "required_integrations": [],
        "supported_modules": ["product_launch"],
    },
    "saas_churn_prevention": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm", "saas"],
    },
    "saas_pipeline_velocity": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm", "saas"],
    },
    "inbound_lead_to_demo": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "lead_qualification_and_routing": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "lead_qualifier": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "demo_booker": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "account_based_campaign_coordinator": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["crm", "marketing"],
    },
    "campaign_orchestrator": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["marketing"],
    },
    "performance_engine": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["marketing"],
    },
    "founder_content_to_demand": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["content", "marketing"],
    },
    "weekly_founder_growth_brief": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["analytics"],
    },
    "social_campaign": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["social", "marketing"],
    },
    "persona_builder": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["marketing"],
    },
    "pipeline_content_operations": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["content", "crm"],
    },
    "journey_task_orchestration": {
        "category": "operations",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "finance_expense_monitoring": {
        "category": "finance",
        "status": "active",
        "supported_modules": ["finance"],
    },
    "finance_operations_pack": {
        "category": "finance",
        "status": "active",
        "supported_modules": ["finance"],
    },
    "fpa_copilot": {
        "category": "finance",
        "status": "beta",
        "supported_modules": ["finance"],
    },
    "quote_normalization_comparison": {
        "category": "finance",
        "status": "active",
        "supported_modules": ["finance"],
    },
    "billing_agent": {
        "category": "finance",
        "status": "active",
        "supported_modules": ["finance"],
    },
    "healthcare_patient_engagement": {
        "category": "healthcare",
        "status": "active",
        "supported_modules": ["medical_tourism"],
    },
    "patient_intake_triage": {
        "category": "healthcare",
        "status": "active",
        "supported_modules": ["medical_tourism"],
    },
    "provider_evidence_verification": {
        "category": "healthcare",
        "status": "active",
        "supported_modules": ["medical_tourism"],
    },
    "case_brief_summarization": {
        "category": "healthcare",
        "status": "active",
        "supported_modules": ["medical_tourism"],
    },
    "coordinator_communication_copilot": {
        "category": "healthcare",
        "status": "active",
        "supported_modules": ["medical_tourism"],
    },
    "re_listing_health_monitor": {
        "category": "real_estate",
        "status": "active",
        "supported_modules": ["real_estate"],
    },
    "re_tenant_flight_risk": {
        "category": "real_estate",
        "status": "active",
        "supported_modules": ["real_estate"],
    },
    "retail_inventory_health": {
        "category": "retail",
        "status": "active",
        "supported_modules": ["retail"],
    },
    "content_factory": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["content"],
    },
    "ops_playbook": {
        "category": "operations",
        "status": "active",
        "supported_modules": ["operations"],
    },
    "compliance_monitor": {
        "category": "compliance",
        "status": "active",
        "supported_modules": ["compliance"],
    },
    "document_intake_extraction": {
        "category": "productivity",
        "status": "active",
        "supported_modules": ["documents"],
    },
    "freshness_publishing_review": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["content"],
    },
    "case_study_repursposer": {
        "category": "marketing",
        "status": "active",
        "supported_modules": ["content"],
    },
    "ai_account_manager": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "account_signal_expansion": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm"],
    },
    "marketing_to_sales_sla_monitor": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["crm", "marketing"],
    },
    "investor_partnership_update": {
        "category": "sales",
        "status": "active",
        "supported_modules": ["communications"],
    },
}


def _dag_to_catalog_entry(dag_file: Path) -> Optional[dict]:
    """Parse a DAG JSON file and produce a catalog entry dict."""
    try:
        with open(dag_file, "r", encoding="utf-8") as f:
            dag = json.load(f)
    except Exception as e:
        log.warning("workflow_catalog_sync: failed to parse DAG", file=str(dag_file), error=str(e))
        return None

    meta = dag.get("_meta", {})
    key = meta.get("workflow_id") or dag_file.stem
    name = meta.get("name") or key.replace("_", " ").title()
    industry = meta.get("industry", "general")
    description = meta.get("description", "")
    version = meta.get("version", "1.0.0")

    # Gather tool names from all nodes
    tools: list[str] = []
    for node in dag.get("nodes", []):
        tools.extend(node.get("tools", []))
    # Deduplicate + filter internal tools
    required_tools = list({
        t for t in tools
        if t and not t.startswith("db_") and "_get_synthetic" not in t
    })

    override = _CATALOG_OVERRIDES.get(key, {})
    category = override.get("category") or _INDUSTRY_TO_CATEGORY.get(industry, "productivity")
    status = override.get("status", "active")
    supported_modules = override.get("supported_modules", [industry] if industry != "general" else [])
    required_integrations = override.get("required_integrations", required_tools[:3])

    # Industry applicability — derived from _WORKFLOW_APPLICABILITY map
    applicability = _WORKFLOW_APPLICABILITY.get(key, {"scope": "GLOBAL", "industry": None})
    wf_scope    = applicability["scope"]
    wf_industry = applicability["industry"]

    requires_explicit = bool(
        override.get("requires_explicit_assignment", meta.get("requires_explicit_assignment", False))
    )
    metadata_ = dict(meta)
    metadata_["requires_explicit_assignment"] = requires_explicit

    return {
        "key":                    key,
        "name":                   name,
        "description":            description,
        "category":               category,
        "status":                 status,
        "version":                version,
        "pricing_model":          "included",
        "required_integrations":  required_integrations,
        "supported_modules":      supported_modules,
        "active":                 True,
        "scope":                  wf_scope,
        "industry":               wf_industry,
        "metadata_":              metadata_,
    }


async def sync_workflow_catalog(db: AsyncSession) -> dict:
    """
    Idempotently sync all DAG files into workflow_catalog.
    Inserts missing entries; never modifies existing rows.
    Returns { inserted: int, skipped: int, errors: int }.
    """
    from db.models.core import WorkflowCatalog
    from sqlalchemy import select

    if not _DAGS_DIR.exists():
        log.warning("workflow_catalog_sync: DAGs directory not found", path=str(_DAGS_DIR))
        return {"inserted": 0, "skipped": 0, "errors": 0}

    # Load existing keys
    existing_result = await db.execute(select(WorkflowCatalog.key))
    existing_keys: set[str] = {row[0] for row in existing_result.all()}

    inserted = skipped = errors = 0

    for dag_file in sorted(_DAGS_DIR.glob("*.json")):
        entry = _dag_to_catalog_entry(dag_file)
        if not entry:
            errors += 1
            continue

        key = entry["key"]
        # Skip deprecated, duplicate, or consolidated workflow keys
        if key in _DEPRECATED_OR_DUPLICATE_KEYS:
            skipped += 1
            continue

        if key in existing_keys:
            skipped += 1
            continue

        try:
            wf = WorkflowCatalog(
                name=entry["name"],
                key=key,
                description=entry["description"],
                category=entry["category"],
                status=entry["status"],
                version=entry["version"],
                pricing_model=entry["pricing_model"],
                required_integrations=entry["required_integrations"],
                supported_modules=entry["supported_modules"],
                active=entry["active"],
                scope=entry.get("scope", "GLOBAL"),
                industry=entry.get("industry"),
                metadata_=entry.get("metadata_", {}),
            )
            db.add(wf)
            await db.flush()
            existing_keys.add(key)
            inserted += 1
        except Exception as e:
            log.error("workflow_catalog_sync: failed to insert entry", key=key, error=str(e))
            await db.rollback()
            errors += 1

    if inserted > 0:
        await db.commit()

    # ── 1. Reconcile Deprecated / Duplicate Workflows ─────────────────────────
    # Safely mark duplicates as inactive / deleted with provenance metadata
    reconciled = 0
    try:
        for dep_key, dep_info in _DEPRECATED_OR_DUPLICATE_KEYS.items():
            wf_res = await db.execute(
                select(WorkflowCatalog).where(WorkflowCatalog.key == dep_key)
            )
            dup_wf = wf_res.scalar_one_or_none()
            if dup_wf and (dup_wf.active or dup_wf.status != "deleted"):
                dup_wf.active = False
                dup_wf.status = "deleted"
                curr_meta = dict(getattr(dup_wf, "metadata_", {}) or {})
                curr_meta["deleted_at"] = datetime.now(timezone.utc).isoformat()
                curr_meta["deleted_reason"] = dep_info["reason"]
                if dep_info.get("canonical_key"):
                    curr_meta["canonical_key"] = dep_info["canonical_key"]
                dup_wf.metadata_ = curr_meta
                reconciled += 1
        if reconciled > 0:
            await db.commit()
            log.info("workflow_catalog_sync: reconciled duplicate workflows", count=reconciled)
    except Exception as rec_err:
        log.warning("workflow_catalog_sync: duplicate reconciliation failed (non-fatal)", error=str(rec_err))
        try:
            await db.rollback()
        except Exception:
            pass

    # ── 2. Back-fill metadata, schemas, and capabilities on existing rows ─────
    backfilled = 0
    try:
        for wf_key, override in _CATALOG_OVERRIDES.items():
            wf_result = await db.execute(
                select(WorkflowCatalog).where(WorkflowCatalog.key == wf_key)
            )
            existing_wf = wf_result.scalar_one_or_none()
            if existing_wf is None:
                continue

            applicability = _WORKFLOW_APPLICABILITY.get(wf_key, {"scope": "GLOBAL", "industry": None})
            correct_category = override.get("category")
            correct_scope    = applicability["scope"]
            correct_industry = applicability["industry"]
            correct_explicit = bool(override.get("requires_explicit_assignment", False))

            needs_update = False
            if correct_category and existing_wf.category != correct_category:
                existing_wf.category = correct_category
                needs_update = True
            if getattr(existing_wf, "scope", "GLOBAL") != correct_scope:
                existing_wf.scope    = correct_scope
                needs_update = True
            if getattr(existing_wf, "industry", None) != correct_industry:
                existing_wf.industry = correct_industry
                needs_update = True
            if override.get("required_integrations") and existing_wf.required_integrations != override.get("required_integrations"):
                existing_wf.required_integrations = override.get("required_integrations")
                needs_update = True
            
            current_meta = dict(getattr(existing_wf, "metadata_", {}) or {})
            if current_meta.get("requires_explicit_assignment") != correct_explicit:
                current_meta["requires_explicit_assignment"] = correct_explicit
                needs_update = True

            # Sync schema and capability declarations
            for meta_field in ("input_schema", "output_schema", "required_capabilities", "execution_handler"):
                if meta_field in override and current_meta.get(meta_field) != override[meta_field]:
                    current_meta[meta_field] = override[meta_field]
                    needs_update = True

            if needs_update:
                existing_wf.metadata_ = current_meta
                backfilled += 1

        if backfilled > 0:
            await db.commit()
    except Exception as bf_err:
        log.warning("workflow_catalog_sync: back-fill failed (non-fatal)", error=str(bf_err))
        try:
            await db.rollback()
        except Exception:
            pass

    log.info(
        "workflow_catalog_sync: complete",
        inserted=inserted,
        skipped=skipped,
        errors=errors,
        backfilled=backfilled,
    )
    return {"inserted": inserted, "skipped": skipped, "errors": errors, "backfilled": backfilled}


async def sync_plan_entitlements_for_new_workflows(db: AsyncSession) -> None:
    """
    After catalog sync, assign newly-added workflows to Growth and Enterprise plans.
    Starter gets productivity + sales workflows only.
    """
    from db.models.core import WorkflowCatalog, BillingPlan, PlanWorkflowEntitlement
    from sqlalchemy import select, delete as sa_delete

    growth_result = await db.execute(select(BillingPlan).where(BillingPlan.slug == "growth"))
    growth = growth_result.scalar_one_or_none()

    enterprise_result = await db.execute(select(BillingPlan).where(BillingPlan.slug == "enterprise"))
    enterprise = enterprise_result.scalar_one_or_none()

    starter_result = await db.execute(select(BillingPlan).where(BillingPlan.slug == "starter"))
    starter = starter_result.scalar_one_or_none()

    free_result = await db.execute(select(BillingPlan).where(BillingPlan.slug == "free"))
    free_plan = free_result.scalar_one_or_none()

    # All active catalog entries
    wf_result = await db.execute(select(WorkflowCatalog).where(WorkflowCatalog.active.is_(True)))
    workflows = list(wf_result.scalars().all())

    # Existing entitlements to avoid duplicates
    ent_result = await db.execute(
        select(PlanWorkflowEntitlement.plan_id, PlanWorkflowEntitlement.workflow_id)
    )
    existing_entitlements: set[tuple] = {(str(r[0]), str(r[1])) for r in ent_result.all()}

    starter_categories = {"productivity", "sales", "marketing"}
    free_keys = {"email_summarizer", "product_launch_sprint", "meeting_intelligence_followup"}

    to_add = []
    for wf in workflows:
        wid = str(wf.id)
        is_global = (getattr(wf, "scope", "GLOBAL") == "GLOBAL")

        if growth and (str(growth.id), wid) not in existing_entitlements:
            to_add.append(PlanWorkflowEntitlement(plan_id=growth.id, workflow_id=wf.id))
            existing_entitlements.add((str(growth.id), wid))
        if enterprise and (str(enterprise.id), wid) not in existing_entitlements:
            to_add.append(PlanWorkflowEntitlement(plan_id=enterprise.id, workflow_id=wf.id))
            existing_entitlements.add((str(enterprise.id), wid))
        if starter and (is_global or wf.category in starter_categories) and (str(starter.id), wid) not in existing_entitlements:
            to_add.append(PlanWorkflowEntitlement(plan_id=starter.id, workflow_id=wf.id))
            existing_entitlements.add((str(starter.id), wid))
        if free_plan and (is_global or wf.key in free_keys) and (str(free_plan.id), wid) not in existing_entitlements:
            to_add.append(PlanWorkflowEntitlement(plan_id=free_plan.id, workflow_id=wf.id))
            existing_entitlements.add((str(free_plan.id), wid))

    if to_add:
        for item in to_add:
            db.add(item)
        await db.commit()
        log.info("workflow_catalog_sync: plan entitlements updated", added=len(to_add))
