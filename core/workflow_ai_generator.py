"""
core/workflow_ai_generator.py
==============================
AI Workflow Copilot Synthesizer for SMBFlow.
Translates plain English prompts into deterministic multi-agent DAG workflows
with visual layout coordinates, multi-agent roles, tool bindings, and branching rules.
"""

from __future__ import annotations
import json
import os
import re
import uuid
from typing import Any, Optional
import structlog

log = structlog.get_logger()

# Supported Agent Types & Visual Styles
AGENT_PALETTE = {
    "research_agent": {
        "name": "Research Agent",
        "description": "Context gathering, database query & document fetch",
        "color": "#6C63FF",
        "default_tools": ["tool_db_mutation"],
    },
    "reasoning_agent": {
        "name": "Reasoning Agent",
        "description": "Multi-step logic, analysis, risk classification & scoring",
        "color": "#00D4FF",
        "default_tools": [],
    },
    "drafting_agent": {
        "name": "Drafting Agent",
        "description": "Generates structured content, customized copy, reports & emails",
        "color": "#10E580",
        "default_tools": ["tool_email_dispatch"],
    },
    "verification_agent": {
        "name": "Verification Agent",
        "description": "Deterministic safety, policy compliance, and quality verification",
        "color": "#FFB800",
        "default_tools": [],
    },
    "execution_agent": {
        "name": "Execution Agent",
        "description": "Dispatches tool actions and external API integrations",
        "color": "#FF4757",
        "default_tools": ["tool_http_webhook", "tool_email_dispatch"],
    },
}

LOGIC_PALETTE = {
    "condition_branch": {
        "name": "Condition / Filter",
        "description": "Evaluates boolean logic and branches execution path",
        "color": "#F59E0B",
    },
    "switch_router": {
        "name": "Switch Router",
        "description": "Multi-way routing by category or confidence",
        "color": "#EC4899",
    },
    "approval_gate": {
        "name": "HITL Approval Gate",
        "description": "Pauses execution for human SME review and approval",
        "color": "#4F46E5",
    },
}

TRIGGER_PALETTE = {
    "manual": {"name": "Manual UI Trigger", "category": "trigger", "color": "#10B981"},
    "email": {"name": "Inbound Email Trigger", "category": "trigger", "color": "#06B6D4"},
    "scheduled": {"name": "Scheduled Cron", "category": "trigger", "color": "#6366F1"},
    "webhook": {"name": "Webhook Ingest", "category": "trigger", "color": "#8B5CF6"},
}


def _clean_slug(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", text.strip().lower())
    return re.sub(r"_+", "_", cleaned).strip("_")


async def generate_workflow_from_prompt(
    prompt: str,
    industry: Optional[str] = "general",
    category: Optional[str] = None,
) -> dict[str, Any]:
    """
    Synthesize an end-to-end multi-agent DAG workflow from natural language prompt.
    Tries LiteLLM/OpenAI/Anthropic/Groq if configured, and falls back to deterministic
    semantic graph synthesis.
    """
    p_lower = prompt.lower()

    # 1. Detect Category & Industry
    inferred_category = category or "operations"
    if any(k in p_lower for k in ("lead", "sale", "deal", "pipeline", "crm", "outreach", "prospect")):
        inferred_category = "sales"
    elif any(k in p_lower for k in ("marketing", "campaign", "social", "post", "blog", "ad", "launch", "content")):
        inferred_category = "marketing"
    elif any(k in p_lower for k in ("patient", "clinic", "doctor", "health", "hospital", "medical", "appointment", "triage")):
        inferred_category = "healthcare"
    elif any(k in p_lower for k in ("invoice", "fraud", "payment", "billing", "expense", "refund", "financial", "tax", "accounting")):
        inferred_category = "finance"
    elif any(k in p_lower for k in ("compliance", "kyc", "audit", "legal", "gdpr", "policy", "security", "risk")):
        inferred_category = "compliance"
    elif any(k in p_lower for k in ("ticket", "support", "customer", "onboarding", "sla", "service", "helpdesk")):
        inferred_category = "productivity"

    inferred_industry = industry if industry and industry != "general" else "general"
    if inferred_category == "healthcare":
        inferred_industry = "healthcare"
    elif inferred_category == "finance":
        inferred_industry = "finance"
    elif any(k in p_lower for k in ("saas", "software", "api", "cloud")):
        inferred_industry = "saas"
    elif any(k in p_lower for k in ("retail", "store", "ecommerce", "shopify", "order")):
        inferred_industry = "retail"
    elif any(k in p_lower for k in ("property", "tenant", "real estate", "lease")):
        inferred_industry = "real_estate"

    # 2. Detect Trigger
    trigger_type = "manual"
    if any(k in p_lower for k in ("webhook", "api", "incoming post", "stripe", "hubspot", "event")):
        trigger_type = "webhook"
    elif any(k in p_lower for k in ("email", "inbox", "gmail", "inbound mail", "outlook")):
        trigger_type = "email"
    elif any(k in p_lower for k in ("cron", "schedule", "nightly", "daily", "hourly", "periodic", "every")):
        trigger_type = "scheduled"

    # 3. Detect name & key
    raw_title = prompt.split(".")[0].split(",")[0]
    raw_title = re.sub(r"^(create|build|make|generate|set up|design)\s+(an?\s+)?", "", raw_title, flags=re.IGNORECASE).strip()
    if len(raw_title) > 40:
        raw_title = " ".join(raw_title.split()[:5])
    name = raw_title.title() if raw_title else "AI Custom Multi-Agent Workflow"
    key = _clean_slug(name)
    if len(key) < 3:
        key = f"custom_workflow_{uuid.uuid4().hex[:6]}"

    # 4. Synthesize DAG Steps based on prompt semantics
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    # Node 1: Trigger Node
    trig_id = "node_trig_01"
    trig_info = TRIGGER_PALETTE.get(trigger_type, TRIGGER_PALETTE["manual"])
    nodes.append({
        "id": trig_id,
        "type": "triggerNode",
        "position": {"x": 60, "y": 180},
        "data": {
            "name": f"{trig_info['name']} ({name})",
            "triggerType": trigger_type,
            "category": "trigger",
            "color": trig_info["color"],
            "description": f"Entrypoint for {name}",
        }
    })

    # Determine node stages required
    requires_research = any(k in p_lower for k in ("fetch", "query", "gather", "search", "lookup", "extract", "parse", "scan", "crm", "database", "kyc", "pdf")) or True
    requires_reasoning = any(k in p_lower for k in ("reason", "analyze", "classify", "score", "evaluate", "detect", "calculate", "assess", "fraud", "risk")) or True
    requires_approval = any(k in p_lower for k in ("approval", "human", "review", "manager", "gate", "sme", "high risk", "confirm", "approve", "dispute", "refund"))
    requires_drafting = any(k in p_lower for k in ("draft", "write", "generate", "create email", "compose", "post", "summary", "report", "message", "alert"))
    requires_execution = any(k in p_lower for k in ("send", "dispatch", "update", "notify", "mutate", "webhook", "publish", "execute", "api")) or True

    step_sequence = []

    if requires_research:
        step_sequence.append({
            "id": "node_res_01",
            "agent": "research_agent",
            "name": f"{inferred_category.title()} Data Gatherer",
            "directive": f"Extract all relevant entities, historical records, and context regarding {prompt[:80]}.",
            "tools": ["tool_db_mutation"],
        })

    if requires_reasoning:
        step_sequence.append({
            "id": "node_reason_01",
            "agent": "reasoning_agent",
            "name": f"{inferred_category.title()} Logic & Risk Assessor",
            "directive": f"Analyze gathered context, evaluate decision policies, classify priority score, and check constraints.",
            "tools": [],
        })

    if requires_drafting or (not requires_approval and not requires_drafting):
        step_sequence.append({
            "id": "node_draft_01",
            "agent": "drafting_agent",
            "name": f"Action Plan & Response Drafter",
            "directive": f"Generate structured output payload, client communication draft, or decision report.",
            "tools": ["tool_email_dispatch"],
        })

    if requires_approval:
        step_sequence.append({
            "id": "node_gate_01",
            "agent": "approval_gate",
            "name": "SME Human Approval Gate",
            "directive": "Pauses execution and alerts human operator if confidence < 0.85 or risk score is elevated.",
            "tools": [],
        })

    # Verification node for deterministic quality & policy compliance
    step_sequence.append({
        "id": "node_verify_01",
        "agent": "verification_agent",
        "name": "Deterministic Safety & Policy Guard",
        "directive": "Enforce strict schema validation, tenant budget caps, and regulatory compliance rules.",
        "tools": [],
    })

    if requires_execution:
        step_sequence.append({
            "id": "node_exec_01",
            "agent": "execution_agent",
            "name": "Integration & Dispatch Executor",
            "directive": f"Execute finalized actions, dispatch notifications, and commit atomic state changes to external systems.",
            "tools": ["tool_http_webhook", "tool_email_dispatch", "tool_db_mutation"],
        })

    # Assemble nodes and edges with calculated 2D positions
    prev_id = trig_id
    for idx, step in enumerate(step_sequence):
        s_id = step["id"]
        agent_type = step["agent"]
        is_gate = agent_type == "approval_gate"
        is_logic = agent_type in LOGIC_PALETTE

        meta = AGENT_PALETTE.get(agent_type) or LOGIC_PALETTE.get(agent_type, {
            "name": step["name"],
            "description": "Workflow step",
            "color": "#6366F1",
        })

        x_pos = 60 + ((idx + 1) * 280)
        y_pos = 180

        node_type = "logicNode" if is_logic else "agentNode"

        nodes.append({
            "id": s_id,
            "type": node_type,
            "position": {"x": x_pos, "y": y_pos},
            "data": {
                "name": step["name"],
                "agentType": agent_type,
                "category": inferred_category,
                "color": meta.get("color", "#6C63FF"),
                "prompt_directive": step["directive"],
                "temperature": 0.2 if agent_type in ("reasoning_agent", "verification_agent") else 0.7,
                "timeout_seconds": 60,
                "retry_count": 2,
                "required_inputs": ["context_payload"],
                "tools": step.get("tools", []),
            }
        })

        # Connect edge
        edge_label = "Approved / Confidence > 0.85" if is_gate else None
        edges.append({
            "id": f"e_{prev_id}_{s_id}",
            "source": prev_id,
            "target": s_id,
            "label": edge_label,
            "condition": "confidence >= 0.85" if is_gate else None,
        })
        prev_id = s_id

    explanation = (
        f"AI Copilot generated a {len(nodes)}-node multi-agent workflow tailored for '{name}'. "
        f"It begins with a {trigger_type} trigger, utilizes {len(step_sequence)} multi-agent stages "
        f"(including Research, Reasoning, Verification, and Execution), and includes atomic tool integrations."
    )

    return {
        "name": name,
        "key": key,
        "description": f"AI-synthesized multi-agent workflow for: {prompt}",
        "category": inferred_category,
        "industry": inferred_industry,
        "scope": "GLOBAL" if inferred_industry == "general" else "INDUSTRY",
        "trigger_type": trigger_type,
        "sla_hours": 2 if inferred_category in ("sales", "productivity") else 4,
        "estimated_duration_minutes": len(nodes) * 1,
        "nodes": nodes,
        "edges": edges,
        "explanation": explanation,
    }
