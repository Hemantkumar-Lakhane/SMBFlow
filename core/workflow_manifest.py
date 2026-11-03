"""
core/workflow_manifest.py
==========================
Single Source of Truth implementation manifest for all SMBFlow workflows.
Audits and reconciles all 53 DAG definitions from workflows/dags/, defines
exact input/output schemas, node dependencies, required capabilities, tool integrations,
side-effect declarations, and release requirements.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

_DAGS_DIR = Path(__file__).parent.parent / "workflows" / "dags"

# Reconciled deprecated / duplicate keys
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
    "meeting_intelligence": {
        "action": "consolidate",
        "canonical_key": "meeting_intelligence_followup",
        "reason": "Alias to canonical meeting_intelligence_followup",
    },
    "product_launch": {
        "action": "consolidate",
        "canonical_key": "product_launch_sprint",
        "reason": "Alias to canonical product_launch_sprint",
    },
    "invoice_extractor": {
        "action": "consolidate",
        "canonical_key": "invoice_processing",
        "reason": "Alias to canonical invoice_processing",
    },
}

# Rich workflow manifests for primary production workflows
_PRIMARY_MANIFESTS: dict[str, dict] = {
    "meeting_intelligence_followup": {
        "name": "Meeting Intelligence & Follow-up",
        "version": "1.0.0",
        "category": "productivity",
        "scope": "GLOBAL",
        "industry": None,
        "description": "Multi-agent meeting analysis: ingests Google Meet URL, audio recording, or user transcript, extracts executive summary, agreements, commitments, and drafts follow-up communications.",
        "implementation_status": "implemented",
        "execution_handler": "api.routers.meeting_intelligence:run_meeting_intelligence_from_meet",
        "required_capabilities": ["meet_transcript", "audio_transcription", "llm_analysis", "memory_extraction"],
        "required_integrations": ["google_workspace"],
        "side_effects": ["email_dispatch", "calendar_mutation"],
        "approval_requirements": ["safe_preview_enforced", "hitl_email_approval"],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": {
            "type": "object",
            "properties": {
                "meet_url": {
                    "type": "string",
                    "title": "Google Meet URL",
                    "description": "Google Meet session URL (e.g. https://meet.google.com/abc-defg-hij) or meeting code"
                },
                "audio_file": {
                    "type": "string",
                    "title": "Audio File Path",
                    "description": "Path to uploaded audio file (.mp3, .wav, .m4a)"
                },
                "transcript": {
                    "type": "string",
                    "title": "Meeting Transcript Text",
                    "description": "User-provided or pasted meeting transcript text"
                },
                "meeting_title": {
                    "type": "string",
                    "title": "Meeting Topic / Title",
                    "default": "Executive Alignment Review"
                }
            }
        },
        "sample_inputs": {
            "transcript": "Alice: We need to finalize the quarterly launch plan.\nBob: I will complete the security review by Friday October 24.\nAlice: Approved, release date is set for October 30.",
            "meeting_title": "Q4 Release Planning"
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "title": "Executive Summary"},
                "key_discussion_points": {"type": "array", "title": "Key Discussion Points"},
                "decisions": {"type": "array", "title": "Agreed Decisions"},
                "commitments": {"type": "array", "title": "Explicit Commitments & Owners"},
                "suggested_followups": {"type": "array", "title": "Action Items"},
                "followup_email": {"type": "string", "title": "Draft Follow-up Email"}
            }
        }
    },
    "product_launch_sprint": {
        "name": "Product Launch Campaign Sprint",
        "version": "1.0.0",
        "category": "marketing",
        "scope": "GLOBAL",
        "industry": None,
        "description": "Cross-channel promotional engine: multi-agent campaign synthesis, targeted value props, email sequences, social posts, visual briefs, and budget allocation.",
        "implementation_status": "implemented",
        "execution_handler": "api.routers.product_launch:execute_product_launch_sprint",
        "required_capabilities": ["llm_analysis", "drafting", "image_generation", "market_research"],
        "required_integrations": [],
        "side_effects": ["social_publish", "email_dispatch"],
        "approval_requirements": ["safe_preview_enforced", "hitl_visual_approval"],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": {
            "type": "object",
            "required": ["product_name", "target_audience", "core_value_prop"],
            "properties": {
                "product_name": {"type": "string", "title": "Product Name", "default": "OpsGrid AI Cloud"},
                "target_audience": {"type": "string", "title": "Target Audience", "default": "SMB Operations Leaders & Tech Founders"},
                "core_value_prop": {"type": "string", "title": "Core Value Proposition", "default": "Automates multi-agent operations and slashes coordination overhead by 80%."},
                "campaign_goals": {"type": "string", "title": "Campaign Goals", "default": "Acquire 50 qualified trial signups in 30 days."},
                "channels": {"type": "array", "title": "Channels", "default": ["email", "linkedin", "x", "blog"]}
            }
        },
        "sample_inputs": {
            "product_name": "OpsGrid Flow",
            "target_audience": "Mid-market CTOs and Operations Directors",
            "core_value_prop": "Autonomous multi-agent workflow orchestration with deterministic safety gates.",
            "campaign_goals": "Drive 100 enterprise demo requests."
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "title": "Campaign Identifier"},
                "positioning_brief": {"type": "string", "title": "Executive Positioning Brief"},
                "email_sequence": {"type": "array", "title": "Outreach Email Sequence"},
                "social_posts": {"type": "array", "title": "Multi-Channel Social Copy"},
                "visual_concepts": {"type": "array", "title": "AI Image Generation Prompts"},
                "budget_breakdown": {"type": "object", "title": "Recommended Channel Budget"}
            }
        }
    },
    "football_agent_os": {
        "name": "Football Agent AI Operating System",
        "version": "1.0.0",
        "category": "sports",
        "scope": "INDUSTRY",
        "industry": "sports",
        "description": "Multi-country scouting & representation intelligence: contract expiry evaluation, squad tactical fit matching across Europe and Asia, and executive WhatsApp/dossier pitch drafting.",
        "implementation_status": "implemented",
        "execution_handler": "api.routers.industry_workflows:execute_football_agent_os",
        "required_capabilities": ["llm_analysis", "scouting_matching", "contract_valuation"],
        "required_integrations": ["airtable"],
        "side_effects": ["whatsapp_dispatch", "airtable_mutation"],
        "approval_requirements": ["hitl_pitch_approval"],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": {
            "type": "object",
            "required": ["playerName", "position", "contractSalary", "targetMarkets"],
            "properties": {
                "playerName": {"type": "string", "title": "Player Name & Age", "default": "Lucas Silva (24)"},
                "position": {"type": "string", "title": "Tactical Position", "default": "Box-to-box Central Midfielder (No. 8)"},
                "contractSalary": {"type": "string", "title": "Contract Status & Wage", "default": "Expires June 2026, €20,000 / month"},
                "targetMarkets": {"type": "string", "title": "Target Leagues", "default": "Malaysia Super League, Thai League 1, India ISL, Spain Segunda"},
                "scoutingNotes": {"type": "string", "title": "Scouting Notes & Stats", "default": "89% pass completion, high interception rate, Brazilian Serie B experience."}
            }
        },
        "sample_inputs": {
            "playerName": "Mateo Kovac (26)",
            "position": "Attacking Midfielder (No. 10)",
            "contractSalary": "Free Agent, €25,000 / month",
            "targetMarkets": "Malaysia, Indonesia, Thailand",
            "scoutingNotes": "Proven goal contributor in Croatia HNL."
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "player_profile": {"type": "object", "title": "Player Valuation Profile"},
                "club_matches": {"type": "array", "title": "Target Club Tactical Fits"},
                "scouting_dossier": {"type": "string", "title": "Executive Scouting Dossier"},
                "whatsapp_pitch": {"type": "string", "title": "Sporting Director WhatsApp Pitch"}
            }
        }
    },
    "legal_personal_injury": {
        "name": "Personal Injury Legal Ops Suite",
        "version": "1.0.0",
        "category": "legal",
        "scope": "INDUSTRY",
        "industry": "legal",
        "description": "Multilingual legal intake and demand package builder: medical treatment chronologies, economic damages calculator, and policy-limits settlement brochures.",
        "implementation_status": "implemented",
        "execution_handler": "api.routers.industry_workflows:execute_personal_injury_legal_ops",
        "required_capabilities": ["llm_analysis", "medical_chronology", "damages_calculation"],
        "required_integrations": ["document_vault"],
        "side_effects": ["demand_letter_dispatch"],
        "approval_requirements": ["attorney_signoff_gate"],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": {
            "type": "object",
            "required": ["claimantName", "incidentDate", "incidentType", "injuriesDescription", "medicalSpecialExpenses"],
            "properties": {
                "claimantName": {"type": "string", "title": "Claimant Full Name", "default": "Carlos Mendoza"},
                "incidentDate": {"type": "string", "title": "Date of Incident", "default": "2026-03-15"},
                "incidentType": {"type": "string", "title": "Incident Type", "default": "Motor Vehicle Collision (Rear-End)"},
                "injuriesDescription": {"type": "string", "title": "Injuries & Diagnosis", "default": "Cervical radiculopathy, L4-L5 disc herniation, post-concussive syndrome."},
                "medicalSpecialExpenses": {"type": "number", "title": "Medical Specials Total ($)", "default": 48500},
                "wageLossAmount": {"type": "number", "title": "Lost Wages ($)", "default": 12000},
                "policyLimits": {"type": "string", "title": "Insurer Policy Limits", "default": "$100,000 / $300,000"}
            }
        },
        "sample_inputs": {
            "claimantName": "Elena Rostova",
            "incidentDate": "2026-02-10",
            "incidentType": "Premises Liability / Slip & Fall",
            "injuriesDescription": "Fractured distal radius requiring ORIF surgery.",
            "medicalSpecialExpenses": 65000,
            "wageLossAmount": 18000,
            "policyLimits": "$250,000"
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "case_file_id": {"type": "string", "title": "Case File Reference"},
                "chronology": {"type": "array", "title": "Medical Treatment Chronology"},
                "damages_summary": {"type": "object", "title": "Special & General Damages Calculation"},
                "settlement_demand_letter": {"type": "string", "title": "Comprehensive Policy-Limits Demand Package"}
            }
        }
    },
    "email_summarizer": {
        "name": "Executive Email Digest & Triage",
        "version": "1.0.0",
        "category": "productivity",
        "scope": "GLOBAL",
        "industry": None,
        "description": "Inbound communication triage: pulls unread threads from Gmail, summarizes urgency, tags key stakeholders, and stages high-priority responses.",
        "implementation_status": "implemented",
        "execution_handler": "core.orchestrator:WorkflowOrchestrator",
        "required_capabilities": ["gmail_read", "email_triage", "llm_analysis"],
        "required_integrations": ["gmail"],
        "side_effects": ["email_draft_save"],
        "approval_requirements": ["safe_preview_enforced"],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": {
            "type": "object",
            "properties": {
                "days_back": {"type": "integer", "title": "Days to Ingest", "default": 7},
                "max_emails": {"type": "integer", "title": "Max Thread Count", "default": 20},
                "category_filter": {"type": "string", "title": "Category Filter", "default": "all"}
            }
        },
        "sample_inputs": {"days_back": 3, "max_emails": 15, "category_filter": "urgent"},
        "output_schema": {
            "type": "object",
            "properties": {
                "digests": {"type": "array", "title": "Summarized Email Batches"},
                "action_items": {"type": "array", "title": "Action Items Extracted"},
                "high_priority_count": {"type": "integer", "title": "Urgent Threads Count"}
            }
        }
    }
}


def _infer_category_and_scope(key: str, meta: dict) -> tuple[str, str, Optional[str]]:
    """Determine category, scope, and industry for any arbitrary DAG."""
    industry = meta.get("industry")
    scope = "INDUSTRY" if industry else "GLOBAL"
    category = meta.get("category") or "operations"

    if "healthcare" in key or "patient" in key or "clinic" in key:
        return "healthcare", "INDUSTRY", "healthcare"
    if "finance" in key or "fpa" in key or "billing" in key or "invoice" in key or "expense" in key:
        return "finance", "INDUSTRY", "finance"
    if "re_" in key or "real_estate" in key:
        return "operations", "INDUSTRY", "real_estate"
    if "retail" in key or "inventory" in key:
        return "operations", "INDUSTRY", "retail"
    if "legal" in key:
        return "compliance", "INDUSTRY", "legal"
    if "saas" in key or "lead" in key or "churn" in key or "demo" in key or "campaign" in key:
        return "sales", "INDUSTRY", "saas"

    return category, scope, industry


def _build_default_schema_for_dag(key: str, dag_data: dict) -> tuple[dict, dict]:
    """Dynamically construct input and output schema for any DAG based on its nodes."""
    nodes = dag_data.get("nodes", [])
    required_fields = []
    properties = {}

    # Inspect trigger node or first node
    has_email = any("email" in n.get("agent", "").lower() or "mail" in n.get("id", "").lower() for n in nodes)
    has_lead = any("lead" in n.get("id", "").lower() or "customer" in n.get("id", "").lower() for n in nodes)
    has_finance = any(w in key for w in ("finance", "invoice", "expense"))

    if has_lead:
        properties["company_name"] = {"type": "string", "title": "Company / Account Name", "default": "Acme Innovations"}
        properties["contact_email"] = {"type": "string", "title": "Contact Email", "default": "decision.maker@acme.com"}
        properties["lead_source"] = {"type": "string", "title": "Lead Channel", "default": "Website Inbound"}
        properties["notes"] = {"type": "string", "title": "Lead Qualification Notes", "default": "Exploring enterprise migration."}
        required_fields.append("company_name")
    elif has_finance:
        properties["document_reference"] = {"type": "string", "title": "Invoice / Document Ref", "default": "INV-2026-9041"}
        properties["amount_usd"] = {"type": "number", "title": "Total Amount ($)", "default": 14500.0}
        properties["department"] = {"type": "string", "title": "Cost Center / Dept", "default": "Engineering Operations"}
        required_fields.append("document_reference")
    else:
        properties["query_or_context"] = {"type": "string", "title": "Input Subject / Context", "default": f"Operational request for {key}"}
        properties["target_goal"] = {"type": "string", "title": "Target Goal / Outcome", "default": "Standard processing and multi-agent synthesis."}
        required_fields.append("query_or_context")

    input_schema = {
        "type": "object",
        "required": required_fields,
        "properties": properties
    }

    output_schema = {
        "type": "object",
        "properties": {
            "execution_status": {"type": "string", "title": "Status"},
            "result_summary": {"type": "string", "title": "Node Pipeline Outcome"},
            "artifacts_generated": {"type": "array", "title": "Generated Artifacts"}
        }
    }

    return input_schema, output_schema


def get_workflow_manifest(workflow_key: str) -> Optional[dict]:
    """Retrieve the complete manifest for a given workflow key."""
    # Check if duplicate or deprecated
    dep = _DEPRECATED_OR_DUPLICATE_KEYS.get(workflow_key)
    if dep and dep["action"] == "consolidate":
        workflow_key = dep["canonical_key"]

    # Check primary curated manifests
    if workflow_key in _PRIMARY_MANIFESTS:
        base = dict(_PRIMARY_MANIFESTS[workflow_key])
        base["workflow_key"] = workflow_key
        base["workflow_id"] = workflow_key
        # Check DAG file nodes if exists
        dag_file = _DAGS_DIR / f"{workflow_key}.json"
        if dag_file.exists():
            try:
                with open(dag_file, "r", encoding="utf-8") as f:
                    dag_data = json.load(f)
                    base["nodes"] = dag_data.get("nodes", [])
                    base["edges"] = dag_data.get("edges", [])
            except Exception:
                pass
        return base

    # Discover from DAG file
    dag_file = _DAGS_DIR / f"{workflow_key}.json"
    if not dag_file.exists():
        return None

    try:
        with open(dag_file, "r", encoding="utf-8") as f:
            dag_data = json.load(f)
    except Exception:
        return None

    meta = dag_data.get("_meta", {})
    name = meta.get("name") or workflow_key.replace("_", " ").title()
    desc = meta.get("description") or f"Automated DAG workflow for {name}."
    category, scope, industry = _infer_category_and_scope(workflow_key, meta)

    # Collect tools and capabilities from nodes
    nodes = dag_data.get("nodes", [])
    required_tools = set()
    required_caps = set(["llm_analysis"])
    side_effects = []

    for n in nodes:
        tools = n.get("tools", [])
        for t in tools:
            required_tools.add(t)
            if "email" in t:
                side_effects.append("email_dispatch")
            if "calendar" in t:
                side_effects.append("calendar_mutation")
            if "charge" in t or "payment" in t:
                side_effects.append("payment_charge")
            if "slack" in t or "notify" in t:
                side_effects.append("slack_notify")

    input_schema, output_schema = _build_default_schema_for_dag(workflow_key, dag_data)

    return {
        "workflow_id": workflow_key,
        "workflow_key": workflow_key,
        "name": name,
        "version": "1.0.0",
        "category": category,
        "scope": scope,
        "industry": industry,
        "description": desc,
        "implementation_status": "implemented" if nodes else "partial",
        "execution_handler": "core.orchestrator:WorkflowOrchestrator",
        "required_capabilities": list(required_caps),
        "required_integrations": list(required_tools),
        "side_effects": list(set(side_effects)) if side_effects else ["none"],
        "approval_requirements": ["safe_preview_enforced"] if side_effects else [],
        "supported_test_modes": ["unit", "integration", "real_provider"],
        "input_schema": input_schema,
        "sample_inputs": {k: v.get("default", "") for k, v in input_schema.get("properties", {}).items()},
        "output_schema": output_schema,
        "nodes": nodes,
        "edges": dag_data.get("edges", []),
    }


def get_all_workflow_manifests() -> List[dict]:
    """Discover all workflow files in workflows/dags/ and return their canonical manifests."""
    manifests = []
    seen_keys = set()

    # 1. Add primary manifests first
    for key in _PRIMARY_MANIFESTS:
        m = get_workflow_manifest(key)
        if m and key not in seen_keys:
            manifests.append(m)
            seen_keys.add(key)

    # 2. Iterate through all DAG files in workflows/dags/
    if _DAGS_DIR.exists():
        for f in sorted(_DAGS_DIR.glob("*.json")):
            key = f.stem
            if key in _DEPRECATED_OR_DUPLICATE_KEYS:
                continue
            if key not in seen_keys:
                m = get_workflow_manifest(key)
                if m:
                    manifests.append(m)
                    seen_keys.add(key)

    return manifests
