"""
api/routers/product_launch.py
==============================
Backend endpoints for SMBFlow Product Launch Sprint workflow:
- Quick-fill brief extraction via LLMRouter
- Draft persistence & loading via WorkflowInstance (status="pending")
- Campaign creation (WorkflowInstance status="escalated", ApprovalItem pending per post)
- Human post approval gating (decided_by, decided_at, AuditEvent log; no external publishing)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import TokenData, require_any_auth
from api.dependencies import get_db
from db.models.core import AgentRunRecord, ApprovalItem, AuditEvent, EvidenceRecord, ToolConnection, WorkflowInstance
from core.llm_router import LLMRouter, LLMMessage
from core.state_manager import WorkflowStatus

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/workflows/product-launch", tags=["Product Launch Sprint"])


# ── REQUEST / RESPONSE MODELS ──────────────────────────────────────────────────

class ExtractBriefRequest(BaseModel):
    launch_brief: str = Field(..., description="Raw natural language brief text provided by user")


class ExtractBriefResponse(BaseModel):
    productName: Optional[str] = None
    shortDescription: Optional[str] = None
    launchDescription: Optional[str] = None
    websiteUrl: Optional[str] = None
    launchDate: Optional[str] = None
    desiredCta: Optional[str] = None
    targetAudience: Optional[str] = None
    customerType: Optional[str] = "B2B"
    industrySegment: Optional[str] = None
    geography: Optional[str] = None
    customerProblem: Optional[str] = None
    primaryBenefit: Optional[str] = None
    immediateMessage: Optional[str] = None
    valueProposition: Optional[str] = None
    topBenefit1: Optional[str] = None
    topBenefit2: Optional[str] = None
    topBenefit3: Optional[str] = None
    keyFeatures: Optional[str] = None
    differentiator: Optional[str] = None
    toneOfVoice: Optional[str] = "Professional"
    launchObjective: Optional[str] = "Product adoption"
    thingsToAvoid: Optional[str] = None
    platforms: Optional[List[str]] = Field(default_factory=lambda: ["LinkedIn", "X"])
    scheduleType: Optional[str] = "week"
    startDate: Optional[str] = None
    postingTime: Optional[str] = "9:00 AM"
    timezone: Optional[str] = "Eastern (ET)"
    is_ai_generated: bool = True


class ExtractBriefRequest(BaseModel):
    launch_brief: Optional[str] = None
    document_text: Optional[str] = None
    document_name: Optional[str] = None
    existing_context: Optional[Dict[str, Any]] = None


class ExtractBriefResponse(BaseModel):
    productName: Optional[str] = None
    shortDescription: Optional[str] = None
    launchDescription: Optional[str] = None
    websiteUrl: Optional[str] = None
    launchDate: Optional[str] = None
    desiredCta: Optional[str] = None
    targetAudience: Optional[str] = None
    customerType: Optional[str] = None
    industrySegment: Optional[str] = None
    geography: Optional[str] = None
    customerProblem: Optional[str] = None
    primaryBenefit: Optional[str] = None
    immediateMessage: Optional[str] = None
    valueProposition: Optional[str] = None
    topBenefit1: Optional[str] = None
    topBenefit2: Optional[str] = None
    topBenefit3: Optional[str] = None
    keyFeatures: Optional[str] = None
    differentiator: Optional[str] = None
    toneOfVoice: Optional[str] = None
    launchObjective: Optional[str] = None
    thingsToAvoid: Optional[str] = None
    platforms: Optional[List[str]] = Field(default_factory=lambda: ["LinkedIn", "X"])
    scheduleType: Optional[str] = None
    startDate: Optional[str] = None
    postingTime: Optional[str] = None
    timezone: Optional[str] = None
    additionalContext: Optional[str] = None
    provenance: Optional[Dict[str, Optional[str]]] = None
    is_ai_generated: bool = True


class SaveDraftRequest(BaseModel):
    brief_data: Dict[str, Any]


class CreateCampaignRequest(BaseModel):
    brief_data: Dict[str, Any]


class PostApprovalRequest(BaseModel):
    decision_notes: Optional[str] = None


# ── ENDPOINTS ──────────────────────────────────────────────────────────────────

@router.post("/extract-brief", response_model=ExtractBriefResponse)
async def extract_brief_with_ai(
    req: ExtractBriefRequest,
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Extract structured Product Launch brief fields from raw natural language input and/or uploaded document text using LLMRouter.
    Returns strict JSON. Missing fields remain null/empty. Preserves extra product context and provenance.
    """
    brief_text = req.launch_brief.strip() if req.launch_brief else ""
    doc_text = req.document_text.strip() if req.document_text else ""

    if not brief_text and not doc_text:
        raise HTTPException(status_code=400, detail="Please enter a launch description or upload a document.")

    prompt = f"""You are SMBFlow AI Assistant. Analyze the following launch description and/or document content and extract structured JSON matching these exact fields.
Return ONLY valid JSON matching this schema, with no Markdown wrapping or conversational filler:

{{
  "productName": "string or null",
  "shortDescription": "string or null",
  "launchDescription": "string or null",
  "websiteUrl": "string or null",
  "launchDate": "string or null",
  "desiredCta": "string or null",
  "targetAudience": "string or null",
  "customerType": "B2B | B2C | B2B2C | Consumer",
  "industrySegment": "string or null",
  "geography": "string or null",
  "customerProblem": "string or null",
  "primaryBenefit": "string or null",
  "immediateMessage": "string or null",
  "valueProposition": "string or null",
  "topBenefit1": "string or null",
  "topBenefit2": "string or null",
  "topBenefit3": "string or null",
  "keyFeatures": "string or null",
  "differentiator": "string or null",
  "toneOfVoice": "Professional | Friendly | Bold | Technical | Simple",
  "launchObjective": "Awareness | Leads | Product adoption | Announcement",
  "thingsToAvoid": "string or null",
  "platforms": ["LinkedIn", "Instagram", "X", "Facebook"],
  "scheduleType": "day | week | custom",
  "startDate": "string or null",
  "postingTime": "9:00 AM",
  "timezone": "Eastern (ET)",
  "additionalContext": "string or null (summary of extra product context such as technical specs, pricing, competitors, objections, brand language)",
  "provenance": {{
    "productName": "user_message | uploaded_document | ai_extraction"
  }}
}}

CRITICAL RULES:
1. Extract ONLY facts explicitly present or directly implied by the inputs. Do NOT hallucinate fake URLs, dates, or product claims.
2. If a field is not present in the inputs, return null for that field.
3. If additional useful details (pricing, technical specs, competitor notes, brand language) are present in the document/message that do not fit standard form fields, include them in "additionalContext".
4. Set provenance for extracted non-null fields: use "uploaded_document" if primary source was document, "user_message" if primary source was user brief, or "ai_extraction".

INPUT USER BRIEF:
{brief_text if brief_text else '(None)'}

UPLOADED DOCUMENT NAME:
{req.document_name if req.document_name else '(None)'}

UPLOADED DOCUMENT CONTENT:
{doc_text if doc_text else '(None)'}
"""

    messages = [
        LLMMessage(role="system", content="You are a precise JSON extractor for Product Launch briefs and documents."),
        LLMMessage(role="user", content=prompt),
    ]

    llm = LLMRouter()
    try:
        raw_resp, call_record = await llm.call(
            agent_name="drafting_agent",
            messages=messages,
            tier_override="balanced",
        )
    except Exception as e:
        log.error("LLMRouter failed during brief extraction", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI Provider unavailable: {str(e)}"
        )

    # Clean JSON output
    cleaned = raw_resp.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except Exception as parse_err:
        log.warning("JSON parse failed on LLM output, applying fallback parser", error=str(parse_err), raw=cleaned[:200])
        parsed = {
            "productName": None,
            "shortDescription": brief_text[:100] if brief_text else doc_text[:100],
            "launchDescription": brief_text if brief_text else doc_text,
            "additionalContext": f"Extracted from document: {req.document_name}" if req.document_name else None,
        }

    parsed["is_ai_generated"] = True
    return parsed


@router.post("/draft")
async def save_product_launch_draft(
    req: SaveDraftRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Save or update Product Launch draft brief in a canonical WorkflowInstance (status='pending').
    """
    org_id_str = current_user.organization_id or current_user.tenant_id
    if not org_id_str:
        raise HTTPException(status_code=400, detail="User has no associated organization")

    try:
        org_uuid = uuid.UUID(org_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid organization ID format")

    # Find existing draft instance if present
    stmt = select(WorkflowInstance).where(
        WorkflowInstance.organization_id == org_uuid,
        WorkflowInstance.workflow_name == "product_launch_sprint",
        WorkflowInstance.status == WorkflowStatus.PENDING.value
    ).order_by(WorkflowInstance.started_at.desc())

    result = await db.execute(stmt)
    draft_inst = result.scalars().first()

    if not draft_inst:
        draft_inst = WorkflowInstance(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            workflow_name="product_launch_sprint",
            status=WorkflowStatus.PENDING.value,
            trigger_payload={"source": "manual_ui_draft"},
            context={"brief": req.brief_data, "updated_at": datetime.utcnow().isoformat()},
        )
        db.add(draft_inst)
    else:
        draft_inst.context = {"brief": req.brief_data, "updated_at": datetime.utcnow().isoformat()}

    await db.commit()
    await db.refresh(draft_inst)

    return {
        "status": "draft_saved",
        "instance_id": str(draft_inst.id),
        "organization_id": str(org_uuid),
        "brief_data": req.brief_data,
    }


@router.get("/draft")
async def load_product_launch_draft(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Load the latest Product Launch draft brief for the organization.
    """
    org_id_str = current_user.organization_id or current_user.tenant_id
    if not org_id_str:
        return {"brief_data": None}

    try:
        org_uuid = uuid.UUID(org_id_str)
    except ValueError:
        return {"brief_data": None}

    stmt = select(WorkflowInstance).where(
        WorkflowInstance.organization_id == org_uuid,
        WorkflowInstance.workflow_name == "product_launch_sprint",
        WorkflowInstance.status == WorkflowStatus.PENDING.value
    ).order_by(WorkflowInstance.started_at.desc())

    result = await db.execute(stmt)
    draft_inst = result.scalars().first()

    if not draft_inst or not draft_inst.context:
        return {"brief_data": None}

    return {
        "instance_id": str(draft_inst.id),
        "brief_data": draft_inst.context.get("brief"),
        "updated_at": draft_inst.context.get("updated_at"),
    }


class UpdatePostRequest(BaseModel):
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    visual_prompt: Optional[str] = None


@router.post("/create-campaign")
async def create_product_launch_campaign(
    req: CreateCampaignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Validate brief (supports manually created or AI-extracted briefs + additionalContext),
    check tool connections, run campaign generation, create WorkflowInstance in 'escalated' status,
    record AgentRunRecord, EvidenceRecord, and populate pending ApprovalItem records for each post.
    """
    org_id_str = current_user.organization_id or current_user.tenant_id
    if not org_id_str:
        raise HTTPException(status_code=400, detail="User has no associated organization")

    try:
        org_uuid = uuid.UUID(org_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid organization ID format")

    brief = req.brief_data
    product_name = brief.get("productName") or "Your Product"
    short_desc = brief.get("shortDescription") or ""
    cta = brief.get("desiredCta") or "Learn more"

    if not product_name or not short_desc:
        raise HTTPException(status_code=400, detail="Product name and short description are required to create a campaign")

    # Inspect ToolConnections for tenant
    stmt_tools = select(ToolConnection).where(ToolConnection.organization_id == org_uuid)
    res_tools = await db.execute(stmt_tools)
    connected_tools = {t.tool_name.lower(): t.status for t in res_tools.scalars().all()}

    selected_platforms = brief.get("platforms") or ["LinkedIn", "X"]

    # Build WorkflowInstance in 'escalated' status (awaiting human decision/approval)
    instance_id = uuid.uuid4()
    wf_instance = WorkflowInstance(
        id=instance_id,
        organization_id=org_uuid,
        workflow_name="product_launch_sprint",
        status=WorkflowStatus.ESCALATED.value,
        trigger_payload={"source": "create_campaign_ui", "brief": brief},
        started_at=datetime.utcnow(),
    )
    db.add(wf_instance)

    # Generate multi-platform post content via LLMRouter
    llm = LLMRouter()
    prompt = f"""You are SMBFlow Content Generator. Generate multi-platform campaign posts based on this product launch brief:

PRODUCT NAME: {product_name}
SHORT DESCRIPTION: {short_desc}
LAUNCH DESCRIPTION: {brief.get('launchDescription', '')}
TARGET AUDIENCE: {brief.get('targetAudience', '')}
PRIMARY BENEFIT: {brief.get('primaryBenefit') or brief.get('topBenefit1', '')}
DESIRED CTA: {cta}
TONE OF VOICE: {brief.get('toneOfVoice', 'Professional')}
THINGS TO AVOID: {brief.get('thingsToAvoid', '')}
ADDITIONAL PRODUCT CONTEXT (DOCUMENTS/SPECS): {brief.get('additionalContext') or brief.get('additional_context', '')}
TARGET PLATFORMS: {', '.join(selected_platforms)}

Generate 3 distinct posts for EACH selected platform:
1. LAUNCH ANNOUNCEMENT
2. PRODUCT BENEFIT
3. FEATURE HIGHLIGHT

Return ONLY JSON format matching this array schema:
[
  {{
    "platform": "LinkedIn | Instagram | X | Facebook",
    "category": "LAUNCH ANNOUNCEMENT | PRODUCT BENEFIT | FEATURE HIGHLIGHT",
    "scheduledTime": "Oct 1 - 9:00 AM",
    "dateStr": "Wed 1",
    "timeStr": "9:00 AM",
    "caption": "Full post caption...",
    "hashtags": ["#Tag1", "#Tag2"],
    "visualPrompt": "Detailed visual concept description for AI image generation...",
    "actionLabel": "{cta}"
  }}
]
"""

    messages = [
        LLMMessage(role="system", content="You generate platform-specific post captions and visual prompts for product launches."),
        LLMMessage(role="user", content=prompt),
    ]

    try:
        raw_posts_resp, _ = await llm.call(
            agent_name="drafting_agent",
            messages=messages,
            tier_override="balanced",
        )
        cleaned_posts = raw_posts_resp.strip()
        if cleaned_posts.startswith("```json"):
            cleaned_posts = cleaned_posts[7:]
        if cleaned_posts.startswith("```"):
            cleaned_posts = cleaned_posts[3:]
        if cleaned_posts.endswith("```"):
            cleaned_posts = cleaned_posts[:-3]
        cleaned_posts = cleaned_posts.strip()

        generated_posts_list = json.loads(cleaned_posts)
    except Exception as gen_err:
        log.warning("LLM campaign post generation failed, creating structured fallback posts", error=str(gen_err))
        # Build deterministic posts if LLM unavailable
        generated_posts_list = []
        for plat in selected_platforms:
            generated_posts_list.append({
                "platform": plat,
                "category": "LAUNCH ANNOUNCEMENT",
                "scheduledTime": "Oct 1 - 9:00 AM",
                "dateStr": "Wed 1",
                "timeStr": "9:00 AM",
                "caption": f"Excited to announce {product_name} — {short_desc}. {cta} today!",
                "hashtags": [f"#{product_name.replace(' ', '')}", "#ProductLaunch"],
                "visualPrompt": f"Modern gradient hero banner introducing {product_name} with key benefit highlight.",
                "actionLabel": cta
            })

    # Record AgentRunRecord for drafting_agent
    agent_run = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_id,
        node_id="draft_assets",
        agent_capability="drafting_agent",
        status="success",
        completed_at=datetime.utcnow(),
    )
    db.add(agent_run)

    # Strategy summary
    strategy_summary = f"{product_name} enters market targeting {brief.get('targetAudience', 'small businesses')}. The campaign leads with {brief.get('valueProposition', short_desc)}."

    # Record EvidenceRecord for campaign strategy and visual asset prompts
    evidence = EvidenceRecord(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        instance_id=instance_id,
        evidence_json_path=f"evidence/product_launch_{instance_id}.json",
        created_at=datetime.utcnow()
    )
    db.add(evidence)

    # Create ApprovalItem records for each post (Human-in-the-Loop Gating)
    approval_items = []
    created_posts_payload = []

    for idx, post in enumerate(generated_posts_list):
        plat_name = post.get("platform", "LinkedIn")
        tool_status = connected_tools.get(plat_name.lower(), "not_connected")
        is_executable = (tool_status == "connected")

        post_id = f"{plat_name.lower()}-{idx+1}"
        approval_id = uuid.uuid4()
        aspect_ratio = "1:1" if plat_name in ["Instagram", "Facebook"] else "16:9"

        visual_prompt = post.get("visualPrompt") or f"Clean visual design for {product_name}: {post.get('category', 'Launch')}"

        appr = ApprovalItem(
            id=approval_id,
            organization_id=org_uuid,
            instance_id=instance_id,
            node_id="route_and_approve",
            review_type="product_launch_post",
            reason="Product Launch Campaign post requires human approval before publishing.",
            context_brief=f"Product Launch: {product_name} — {plat_name} ({post.get('category', 'POST')})",
            payload={
                "post_id": post_id,
                "platform": plat_name,
                "category": post.get("category", "LAUNCH ANNOUNCEMENT"),
                "scheduledTime": post.get("scheduledTime", "Oct 1 - 9:00 AM"),
                "dateStr": post.get("dateStr", "Wed 1"),
                "timeStr": post.get("timeStr", "9:00 AM"),
                "caption": post.get("caption", ""),
                "hashtags": post.get("hashtags", []),
                "actionLabel": post.get("actionLabel", cta),
                "visual_prompt": visual_prompt,
                "visual_status": "pending_generation",
                "visual_aspect_ratio": aspect_ratio,
                "is_executable_connection": is_executable,
                "approval_required": True,
            },
            status="pending",
            created_at=datetime.utcnow(),
        )
        db.add(appr)

        post_item = {
            "id": post_id,
            "approval_id": str(approval_id),
            "platform": plat_name,
            "category": post.get("category", "LAUNCH ANNOUNCEMENT"),
            "scheduledTime": post.get("scheduledTime", "Oct 1 - 9:00 AM"),
            "dateStr": post.get("dateStr", "Wed 1"),
            "timeStr": post.get("timeStr", "9:00 AM"),
            "caption": post.get("caption", ""),
            "hashtags": post.get("hashtags", []),
            "visual_prompt": visual_prompt,
            "visual_status": "pending_generation",
            "visual_aspect_ratio": aspect_ratio,
            "status": "Needs review",
            "is_executable": is_executable,
            "actionLabel": post.get("actionLabel", cta),
        }
        created_posts_payload.append(post_item)

    # Record AuditEvent
    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=current_user.email,
        action="product_launch_campaign_created",
        entity_type="WorkflowInstance",
        entity_id=str(instance_id),
        metadata_={"post_count": len(created_posts_payload), "product_name": product_name},
        created_at=datetime.utcnow(),
    )
    db.add(audit)

    # Save context in WorkflowInstance
    wf_instance.context = {
        "brief": brief,
        "posts": created_posts_payload,
        "posts_count": len(created_posts_payload),
    }

    await db.commit()

    return {
        "instance_id": str(instance_id),
        "status": WorkflowStatus.ESCALATED.value,
        "posts": created_posts_payload,
        "strategy_summary": strategy_summary,
    }


@router.post("/posts/{approval_id}/approve")
async def approve_product_launch_post(
    approval_id: str,
    body: Optional[PostApprovalRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Approve a Product Launch post approval item.
    Updates ApprovalItem status to 'approved', sets decided_by & decided_at, and logs AuditEvent.
    MUST NOT publish externally to platforms — publishing is a separate, explicitly authorized step.
    """
    try:
        appr_uuid = uuid.UUID(approval_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid approval ID format")

    stmt = select(ApprovalItem).where(ApprovalItem.id == appr_uuid)
    res = await db.execute(stmt)
    appr = res.scalar_one_or_none()

    if not appr:
        raise HTTPException(status_code=404, detail="Post approval item not found")

    appr.status = "approved"
    appr.decided_by = current_user.email
    appr.decided_at = datetime.utcnow()

    payload = appr.payload or {}
    if body and body.decision_notes:
        payload["decision_notes"] = body.decision_notes
    appr.payload = payload

    # Log AuditEvent
    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=appr.organization_id,
        actor_id=current_user.email,
        action="product_launch_post_approved",
        entity_type="ApprovalItem",
        entity_id=str(appr.id),
        metadata_={
            "post_id": payload.get("post_id"),
            "platform": payload.get("platform"),
            "external_publishing_executed": False,  # Explicit: No auto-publishing!
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(appr)

    log.info(
        "Product launch post approved (NO external publishing)",
        approval_id=str(appr.id),
        platform=payload.get("platform"),
        decided_by=appr.decided_by,
    )

    return {
        "approval_id": str(appr.id),
        "status": "approved",
        "decided_by": appr.decided_by,
        "decided_at": appr.decided_at.isoformat() if appr.decided_at else None,
        "external_publishing_executed": False,
        "message": "Post approved successfully. External publishing requires separate authorization.",
    }


@router.post("/posts/{approval_id}/reject")
async def reject_product_launch_post(
    approval_id: str,
    body: Optional[PostApprovalRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Reject a Product Launch post approval item.
    Updates ApprovalItem status to 'rejected', sets decided_by & decided_at, and logs AuditEvent.
    """
    try:
        appr_uuid = uuid.UUID(approval_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid approval ID format")

    stmt = select(ApprovalItem).where(ApprovalItem.id == appr_uuid)
    res = await db.execute(stmt)
    appr = res.scalar_one_or_none()

    if not appr:
        raise HTTPException(status_code=404, detail="Post approval item not found")

    appr.status = "rejected"
    appr.decided_by = current_user.email
    appr.decided_at = datetime.utcnow()

    payload = appr.payload or {}
    if body and body.decision_notes:
        payload["decision_notes"] = body.decision_notes
    appr.payload = payload

    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=appr.organization_id,
        actor_id=current_user.email,
        action="product_launch_post_rejected",
        entity_type="ApprovalItem",
        entity_id=str(appr.id),
        metadata_={
            "post_id": payload.get("post_id"),
            "platform": payload.get("platform"),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(appr)

    return {
        "approval_id": str(appr.id),
        "status": "rejected",
        "decided_by": appr.decided_by,
        "decided_at": appr.decided_at.isoformat() if appr.decided_at else None,
        "message": "Post rejected.",
    }


@router.put("/posts/{approval_id}/update")
async def update_product_launch_post(
    approval_id: str,
    req: UpdatePostRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Update post caption, hashtags, or visual prompt before approval.
    """
    try:
        appr_uuid = uuid.UUID(approval_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid approval ID format")

    stmt = select(ApprovalItem).where(ApprovalItem.id == appr_uuid)
    res = await db.execute(stmt)
    appr = res.scalar_one_or_none()

    if not appr:
        raise HTTPException(status_code=404, detail="Post approval item not found")

    payload = appr.payload or {}
    if req.caption is not None:
        payload["caption"] = req.caption
    if req.hashtags is not None:
        payload["hashtags"] = req.hashtags
    if req.visual_prompt is not None:
        payload["visual_prompt"] = req.visual_prompt
    appr.payload = payload

    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=appr.organization_id,
        actor_id=current_user.email,
        action="product_launch_post_updated",
        entity_type="ApprovalItem",
        entity_id=str(appr.id),
        metadata_={"post_id": payload.get("post_id")},
        created_at=datetime.utcnow(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(appr)

    return {
        "approval_id": str(appr.id),
        "payload": payload,
        "message": "Post updated successfully.",
    }


@router.get("/campaign/{instance_id}/export")
async def export_product_launch_campaign(
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Export the scheduled product launch campaign data and calendar without executing external API calls.
    Logs AuditEvent for tracking export.
    """
    try:
        inst_uuid = uuid.UUID(instance_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid instance ID format")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == inst_uuid)
    res = await db.execute(stmt)
    inst = res.scalar_one_or_none()

    if not inst:
        raise HTTPException(status_code=404, detail="Campaign workflow instance not found")

    context = inst.context or {}
    posts = context.get("posts", [])
    brief = context.get("brief", {})

    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=inst.organization_id,
        actor_id=current_user.email,
        action="product_launch_campaign_exported",
        entity_type="WorkflowInstance",
        entity_id=str(inst.id),
        metadata_={"posts_count": len(posts), "product_name": brief.get("productName")},
        created_at=datetime.utcnow(),
    )
    db.add(audit)
    await db.commit()

    return {
        "instance_id": str(inst.id),
        "product_name": brief.get("productName"),
        "exported_at": datetime.utcnow().isoformat(),
        "posts_count": len(posts),
        "posts": posts,
        "brief_summary": {
            "productName": brief.get("productName"),
            "shortDescription": brief.get("shortDescription"),
            "desiredCta": brief.get("desiredCta"),
            "targetAudience": brief.get("targetAudience"),
        }
    }

