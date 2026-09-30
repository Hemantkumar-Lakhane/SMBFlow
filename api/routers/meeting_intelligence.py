"""
api/routers/meeting_intelligence.py
===================================
Backend endpoints for SMBFlow Meeting Intelligence & Follow-up workflow.

Phase 1 (Node 1 — Conversation Capture):
- Secure audio file upload & validation (.mp3, .wav, .m4a, .webm, max 50MB)
- Audio preservation in uploads/audio/
- Conversation capture ingestion & workflow run record creation
- Explicit pending status for unimplemented Nodes 2–5
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import TokenData, require_any_auth
from api.dependencies import get_db
from core.llm_router import LLMRouter, LLMMessage
from db.models.core import (
    AgentRunRecord,
    ApprovalItem,
    AuditEvent,
    ConversationIngestionRecord,
    DailyBriefing,
    Organization,
    RelationshipContact,
    RelationshipConversation,
    RelationshipMemoryItem,
    ToolConnection,
    WorkflowInstance,
)
from integrations.key_vault import decrypt_credentials
from integrations.connectors import GoogleWorkspaceConnector, GmailConnector
from core.contact_researcher import ContactResearcher
from core.daily_briefing_generator import generate_daily_briefing
from core.business_context import (
    get_business_context,
    update_business_context,
    format_business_context_for_prompt,
)
from core.central_memory_query import query_central_memory

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/workflows/meeting-intelligence", tags=["Meeting Intelligence & Follow-up"])


# ── Allowed Audio Configurations ─────────────────────────────────────────────
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm"}
MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
STORAGE_DIR = Path("uploads/audio")

DANGEROUS_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".php", ".py", ".js", ".dll",
    ".scr", ".msi", ".vbs", ".ps1", ".jar", ".com", ".pif", ".hta",
}


# ── Request / Response Schemas ────────────────────────────────────────────────

class AudioUploadResponse(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size_bytes: int
    stored_path: str
    message: str = "Audio uploaded and preserved successfully."


class AudioReference(BaseModel):
    file_id: Optional[str] = None
    filename: str
    size_bytes: Optional[int] = None
    content_type: Optional[str] = None
    stored_path: Optional[str] = None


class ConversationCaptureRequest(BaseModel):
    conversation_title: str = Field(..., min_length=1, description="Title or topic of the conversation")
    contact_name: str = Field(..., min_length=1, description="Primary contact or attendee name")
    conversation_type: str = Field(..., description="Online Meeting, Phone Call, or In-Person Meeting")
    recording: Dict[str, Any] = Field(..., description="Audio upload reference data")
    language: str = Field(default="Auto Detect", description="Spoken language")
    conversation_date: str = Field(..., description="Date of the conversation (YYYY-MM-DD)")


class PipelineNodeStatus(BaseModel):
    id: str
    title: str
    status: str  # "completed" | "pending" | "failed"
    implemented: bool
    note: str


class ConversationCaptureResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str = "capture_completed"
    current_node: str = "n1"
    nodes: List[PipelineNodeStatus]
    conversation_data: Dict[str, Any]
    message: str


# ── Node 2: Process Conversation Schemas ──────────────────────────────────────

class PersonExtraction(BaseModel):
    name: str = Field(..., description="Full Name of participant or mentioned entity")
    facts: List[str] = Field(default_factory=list, description="Factual attributes learned about this person")
    interests: List[str] = Field(default_factory=list, description="Topics, products, or subjects this person showed interest in")
    needs: List[str] = Field(default_factory=list, description="Explicit problems, pain points, or requirements")
    opportunities: List[str] = Field(default_factory=list, description="Business or collaboration opportunities identified")


class CommitmentExtraction(BaseModel):
    owner: str = Field(..., description="Speaker or participant who explicitly committed/promised")
    commitment: str = Field(..., description="The exact commitment or promise agreed")
    due_date: Optional[str] = Field(default=None, description="ISO YYYY-MM-DD or null if undetermined")


class SuggestedActionExtraction(BaseModel):
    action: str = Field(..., description="Recommended follow-up action (AI suggestion, NOT an agreed promise)")
    reason: str = Field(..., description="Strategic reason or rationale for the suggestion")


class StructuredExtraction(BaseModel):
    summary: str = Field(..., description="Executive summary of the conversation")
    people: List[PersonExtraction] = Field(default_factory=list)
    commitments: List[CommitmentExtraction] = Field(default_factory=list)
    suggested_actions: List[SuggestedActionExtraction] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)


class ProcessConversationRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID to process")


class ProcessConversationResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str  # "completed" | "failed"
    current_node: str = "n2"
    transcript_text: str
    detected_language: str
    transcription_status: str  # "completed" | "failed"
    extraction: Optional[StructuredExtraction] = None
    nodes: List[PipelineNodeStatus]
    summary_text: Optional[str] = None
    model_used: Optional[str] = None
    cost_usd: float = 0.0
    duration_ms: int = 0
    message: str
    error_message: Optional[str] = None


# ── Node 3: Central Memory Schemas ───────────────────────────────────────────

class ContactMemoryItem(BaseModel):
    id: str
    category: str
    content: str
    details: Dict[str, Any] = Field(default_factory=dict)
    source_date: Optional[str] = None
    source_conversation_id: str
    source_conversation_title: Optional[str] = None
    source_workflow_instance_id: str
    is_ai_generated: bool = False


class ConversationHistoryItem(BaseModel):
    conversation_id: str
    workflow_instance_id: str
    title: str
    conversation_type: str
    conversation_date: Optional[str] = None
    detected_language: str
    summary: Optional[str] = None
    created_at: Optional[str] = None


class ContactMemorySnapshot(BaseModel):
    contact_id: str
    contact_name: str
    contact_role: Optional[str] = None
    organization_id: str
    total_conversations: int
    conversations: List[ConversationHistoryItem] = Field(default_factory=list)
    latest_conversation_title: str
    latest_conversation_date: Optional[str] = None
    latest_conversation_summary: Optional[str] = None
    facts: List[ContactMemoryItem] = Field(default_factory=list)
    interests: List[ContactMemoryItem] = Field(default_factory=list)
    needs: List[ContactMemoryItem] = Field(default_factory=list)
    opportunities: List[ContactMemoryItem] = Field(default_factory=list)
    commitments: List[ContactMemoryItem] = Field(default_factory=list)
    suggested_actions: List[ContactMemoryItem] = Field(default_factory=list)
    open_questions: List[ContactMemoryItem] = Field(default_factory=list)
    source_reference: Dict[str, Any] = Field(default_factory=dict)


class CentralMemoryRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID to process for Central Memory")


class CentralMemoryResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str = "completed"
    current_node: str = "n3"
    contact_id: str
    conversation_id: str
    memory: ContactMemorySnapshot
    nodes: List[PipelineNodeStatus]
    message: str
    idempotent_reused: bool = False


# ── Node 4: Action Generator Schemas ─────────────────────────────────────────

class GeneratedActionItem(BaseModel):
    id: str
    approval_id: Optional[str] = None
    action_type: str  # "our_commitment" | "contact_commitment" | "ai_suggestion"
    action: str
    owner_type: str   # "internal" | "contact" | "unknown"
    owner_display: str # "You / Internal" | contact_name | "Unassigned / Unknown"
    owner: Optional[str] = None
    due_date: Optional[str] = None
    due_date_display: str
    status: str       # "pending" | "waiting" | "suggested" | "completed" | "dismissed"
    reason: Optional[str] = None
    source: str = "current_conversation"
    source_title: Optional[str] = None
    source_date: Optional[str] = None
    conversation_id: Optional[str] = None
    workflow_instance_id: Optional[str] = None
    provenance: Dict[str, Any] = Field(default_factory=dict)


class GeneratedOpenQuestionItem(BaseModel):
    id: str
    question: str
    source_date: Optional[str] = None
    source_title: Optional[str] = None
    workflow_instance_id: Optional[str] = None
    conversation_id: Optional[str] = None
    provenance: Dict[str, Any] = Field(default_factory=dict)


class ActionGeneratorRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID to generate actions for")


class ActionGeneratorResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str = "completed"
    current_node: str = "n4"
    contact_id: str
    contact_name: str
    our_commitments: List[GeneratedActionItem] = Field(default_factory=list)
    contact_commitments: List[GeneratedActionItem] = Field(default_factory=list)
    ai_suggestions: List[GeneratedActionItem] = Field(default_factory=list)
    open_questions: List[GeneratedOpenQuestionItem] = Field(default_factory=list)
    historical_commitments: List[GeneratedActionItem] = Field(default_factory=list)
    nodes: List[PipelineNodeStatus] = Field(default_factory=list)
    message: str = "Action items generated and persisted successfully."
    idempotent_reused: bool = False


class FollowupDraftItem(BaseModel):
    id: str = Field(..., description="ApprovalItem ID in PostgreSQL")
    approval_id: Optional[str] = None
    instance_id: str
    review_type: str = "followup_email_draft"
    status: str = Field("awaiting_review", description="awaiting_review | approved | sent | connection_required | snoozed | discarded")
    subject: str
    body: str
    recipient_name: str
    recipient_email: Optional[str] = None
    recipient_email_available: bool = False
    contact_id: Optional[str] = None
    conversation_title: Optional[str] = None
    our_commitments_count: int = 0
    contact_commitments_count: int = 0
    ai_suggestions_count: int = 0
    open_questions_count: int = 0
    original_generated_subject: Optional[str] = None
    original_generated_body: Optional[str] = None
    original_subject: Optional[str] = None
    original_body: Optional[str] = None
    snoozed_until: Optional[str] = None
    snooze_reason: Optional[str] = None
    snoozed_reason: Optional[str] = None
    sent_at: Optional[str] = None
    sent_to: Optional[str] = None
    provider_message_id: Optional[str] = None
    connection_status: Optional[str] = None
    error_message: Optional[str] = None
    model_used: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    created_at: Optional[str] = None
    provenance: Dict[str, Any] = Field(default_factory=dict)


class FollowupDraftRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID to generate follow-up draft for")


class FollowupDraftResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str = "awaiting_review"
    current_node: str = "n5"
    draft: FollowupDraftItem
    nodes: List[PipelineNodeStatus] = Field(default_factory=list)
    message: str = "Follow-up email draft generated and awaiting human review."
    idempotent_reused: bool = False


class FollowupDraftActionRequest(BaseModel):
    action: str = Field(..., description="approve | edit | snooze | discard")
    subject: Optional[str] = Field(None, description="Updated subject (for edit action)")
    body: Optional[str] = Field(None, description="Updated body (for edit action)")
    recipient_email: Optional[str] = Field(None, description="Recipient email address")
    snoozed_until: Optional[str] = Field(None, description="ISO timestamp or reminder label (for snooze action)")
    snooze_until: Optional[str] = Field(None, description="Alias for snoozed_until")
    snooze_reason: Optional[str] = Field(None, description="Reason for snoozing (for snooze action)")
    snoozed_reason: Optional[str] = Field(None, description="Alias for snooze_reason")
    notes: Optional[str] = Field(None, description="Review notes")


class FollowupDraftActionResponse(BaseModel):
    instance_id: str
    draft: FollowupDraftItem
    status: str = "awaiting_review"
    action: str
    message: str
    nodes: List[PipelineNodeStatus] = Field(default_factory=list)
    sent: bool = False
    provider_message_id: Optional[str] = None
    connection_status: Optional[str] = None


class WorkflowRunDetailResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str
    current_node: str
    conversation_data: Dict[str, Any]
    transcript_text: Optional[str] = None
    detected_language: Optional[str] = None
    transcription_status: Optional[str] = None
    extraction: Optional[StructuredExtraction] = None
    central_memory: Optional[ContactMemorySnapshot] = None
    actions: Optional[ActionGeneratorResponse] = None
    followup_draft: Optional[FollowupDraftItem] = None
    meeting_prep: Optional[Dict[str, Any]] = None  # Node 5B state
    contact_research: Optional[Dict[str, Any]] = None  # Contact Research enrichment
    nodes: List[PipelineNodeStatus]
    model_used: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# ── Helper Functions ──────────────────────────────────────────────────────────

async def _resolve_org_uuid(current_user: TokenData, db: AsyncSession) -> uuid.UUID:
    """Resolve the organization UUID from user token or find the active org."""
    org_id_str = getattr(current_user, "organization_id", None) or getattr(current_user, "tenant_id", None)
    if org_id_str:
        try:
            return uuid.UUID(str(org_id_str))
        except (ValueError, TypeError):
            pass

    stmt = select(Organization).where(Organization.active == True).limit(1)
    res = await db.execute(stmt)
    org = res.scalars().first()
    if org:
        return org.id

    return uuid.uuid4()


def _sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and remove dangerous characters."""
    base = os.path.basename(filename or "recording.mp3")
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', base)
    return clean or "recording.mp3"


def _format_due_date_display(due_date: Optional[str]) -> str:
    """Format due date string for display (e.g. '2026-10-02' -> 'Oct 2, 2026'). If null/empty returns 'No due date'."""
    if not due_date or str(due_date).strip().lower() in ("null", "none", ""):
        return "No due date"
    clean_date = str(due_date).strip()
    try:
        dt = datetime.strptime(clean_date[:10], "%Y-%m-%d")
        return dt.strftime("%b %d, %Y").replace(" 0", " ")
    except Exception:
        return clean_date


def _classify_commitment_owner(
    owner_raw: Optional[str],
    contact_name: str,
    action: str = "",
) -> tuple[str, str]:
    """
    Deterministically classify commitment owner into:
    - ('internal', 'You / Internal') for SMB user/speaker side
    - ('contact', contact_name) for external contact commitments
    - ('unknown', 'Unassigned / Unknown' or owner_raw) for uncertain attribution
    """
    c_name = (contact_name or "").strip()
    c_name_norm = c_name.lower()
    c_tokens = set(re.findall(r'[a-z0-9]+', c_name_norm))

    raw_val = (owner_raw or "").strip()
    o_norm = raw_val.lower()
    o_tokens = set(re.findall(r'[a-z0-9]+', o_norm))

    # 1. Check if owner indicates the external contact
    if o_norm in (c_name_norm, "contact", "client", "customer", "partner", "prospect", "attendee", "lead"):
        return "contact", c_name

    # Check if contact tokens overlap with owner tokens (e.g. "Rahul" in "Rahul Sharma")
    if c_tokens and (c_tokens.intersection(o_tokens) or any(t in o_norm for t in c_tokens if len(t) > 2)):
        return "contact", c_name

    # 2. Check if owner indicates the internal SMB user / speaker side
    internal_keywords = {
        "speaker", "speaker 1", "speaker 2", "me", "i", "myself", "us", "we",
        "self", "user", "internal", "host", "agent", "my side", "our side",
        "you", "smb", "smbflow", "founder", "sales rep", "rep"
    }
    if o_norm in internal_keywords or o_norm.startswith("speaker"):
        return "internal", "You / Internal"

    # 3. Uncertain or empty attribution
    if not o_norm:
        return "unknown", "Unassigned / Unknown"

    uncertain_keywords = {"both", "team", "all", "unknown", "tbd", "unassigned", "anyone", "someone", "party"}
    if o_norm in uncertain_keywords:
        return "unknown", "Unassigned / Unknown"

    # If it's another person's name not matching contact, keep it as unknown attribution
    return "unknown", raw_val


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload-audio", response_model=AudioUploadResponse)
async def upload_audio_recording(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Upload and securely preserve an audio recording for Meeting Intelligence.
    Validates file extension (.mp3, .wav, .m4a, .webm) and maximum size (50MB).
    Does NOT transcribe or send audio to an LLM.
    """
    raw_filename = file.filename or ""
    sanitized_filename = _sanitize_filename(raw_filename)
    _, ext = os.path.splitext(sanitized_filename.lower())

    # 1. Reject dangerous executable/script extensions
    if ext in DANGEROUS_EXTENSIONS:
        log.warning("Audio upload rejected: dangerous extension", filename=raw_filename, ext=ext)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security rejection: file extension '{ext}' is not permitted."
        )

    # 2. Enforce allowed audio extensions
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{ext}'. Supported audio formats: .mp3, .wav, .m4a, .webm"
        )

    # 3. Read content and validate size
    try:
        content = await file.read()
    except Exception as read_err:
        log.error("Failed to read uploaded audio file", error=str(read_err))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded audio file."
        )

    size_bytes = len(content)
    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio recording received (0 bytes)."
        )

    if size_bytes > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file exceeds maximum allowed limit (50 MB). Received: {round(size_bytes / (1024 * 1024), 2)} MB."
        )

    # 4. Check magic bytes to reject executables masquerading as audio
    if content.startswith(b"MZ") or content.startswith(b"\x7fELF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a valid audio format."
        )

    # 5. Persist to disk in uploads/audio/
    file_id = str(uuid.uuid4())[:12]
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{file_id}_{sanitized_filename}"
    target_path = STORAGE_DIR / stored_filename

    # Ensure path stays within STORAGE_DIR
    resolved_path = target_path.resolve()
    if not str(resolved_path).startswith(str(STORAGE_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid storage path resolution.")

    try:
        async with aiofiles.open(target_path, "wb") as f:
            await f.write(content)
    except Exception as write_err:
        log.error("Failed to write audio file to storage", error=str(write_err), path=str(target_path))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to preserve audio file on storage."
        )

    content_type = file.content_type or f"audio/{ext.lstrip('.')}"

    log.info(
        "Audio recording preserved for Meeting Intelligence",
        file_id=file_id,
        filename=sanitized_filename,
        size_bytes=size_bytes,
        stored_path=str(target_path),
    )

    return AudioUploadResponse(
        file_id=file_id,
        filename=sanitized_filename,
        content_type=content_type,
        size_bytes=size_bytes,
        stored_path=str(target_path).replace("\\", "/"),
        message="Audio uploaded and preserved successfully.",
    )


@router.post("/capture", response_model=ConversationCaptureResponse)
async def capture_conversation(
    req: ConversationCaptureRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Execute Node 1: Conversation Capture for Meeting Intelligence & Follow-up.
    - Validates all 6 required fields.
    - Preserves input metadata and audio reference for the workflow run in PostgreSQL.
    - Marks Node 1 (Conversation Capture) as completed.
    - Marks Nodes 2–5 as pending / not implemented.
    - Does NOT transcribe, generate fake summaries, or execute later nodes.
    """
    # 1. Validation of required inputs
    title = req.conversation_title.strip()
    contact = req.contact_name.strip()
    conv_type = req.conversation_type.strip()
    lang = req.language.strip() or "Auto Detect"
    conv_date = req.conversation_date.strip()
    recording = req.recording

    if not title:
        raise HTTPException(status_code=400, detail="Conversation Title is required.")
    if not contact:
        raise HTTPException(status_code=400, detail="Contact Name is required.")
    if conv_type not in ["Online Meeting", "Phone Call", "In-Person Meeting"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid conversation type '{conv_type}'. Must be 'Online Meeting', 'Phone Call', or 'In-Person Meeting'."
        )
    if not recording or not isinstance(recording, dict) or not (recording.get("filename") or recording.get("file_id")):
        raise HTTPException(status_code=400, detail="A valid audio recording is required.")
    if not conv_date:
        raise HTTPException(status_code=400, detail="Conversation Date is required.")

    valid_languages = ["Auto Detect", "English", "Spanish", "Mixed English / Spanish"]
    if lang not in valid_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid language '{lang}'. Allowed options: {', '.join(valid_languages)}."
        )

    # 2. Resolve organization UUID
    org_uuid = await _resolve_org_uuid(current_user, db)

    # 3. Create canonical WorkflowInstance
    instance_id = uuid.uuid4()
    captured_data = {
        "conversation_title": title,
        "contact_name": contact,
        "conversation_type": conv_type,
        "recording": {
            "file_id": recording.get("file_id"),
            "filename": recording.get("filename"),
            "size_bytes": recording.get("size_bytes"),
            "content_type": recording.get("content_type"),
            "stored_path": recording.get("stored_path"),
        },
        "language": lang,
        "conversation_date": conv_date,
        "captured_at": datetime.utcnow().isoformat(),
    }

    workflow_inst = WorkflowInstance(
        id=instance_id,
        organization_id=org_uuid,
        workflow_name="meeting_intelligence_followup",
        status="capture_completed",
        current_node="n1",
        trigger_payload={
            "source": "manual_conversation_capture",
            **captured_data,
        },
        context={
            "conversation_capture": captured_data,
            "implemented_nodes": ["n1"],
            "pending_nodes": ["n2", "n3", "n4", "n5"],
        },
        started_at=datetime.utcnow(),
    )
    db.add(workflow_inst)

    # 4. Create AgentRunRecord for Node 1 (Conversation Capture)
    node1_run = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_id,
        node_id="n1",
        agent_capability="conversation_capture",
        status="completed",
        duration_ms=45,
        tools_used=["audio_storage"],
        completed_at=datetime.utcnow(),
    )
    db.add(node1_run)

    # 5. Create AuditEvent for provenance
    actor = getattr(current_user, "email", None) or getattr(current_user, "user_id", "user")
    audit_evt = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=str(actor),
        action="conversation_captured",
        entity_type="workflow_instance",
        entity_id=str(instance_id),
        metadata_={
            "workflow": "meeting_intelligence_followup",
            "conversation_title": title,
            "contact_name": contact,
            "audio_filename": recording.get("filename"),
        },
    )
    db.add(audit_evt)

    await db.commit()
    await db.refresh(workflow_inst)

    log.info(
        "Conversation captured successfully",
        instance_id=str(instance_id),
        title=title,
        contact=contact,
        audio=recording.get("filename"),
    )

    nodes_status = [
        PipelineNodeStatus(
            id="n1",
            title="Conversation Capture",
            status="completed",
            implemented=True,
            note="Audio recording and metadata preserved successfully for this run.",
        ),
        PipelineNodeStatus(
            id="n2",
            title="Process Conversation",
            status="pending",
            implemented=False,
            note="Pending implementation (Transcription & Entity Extraction).",
        ),
        PipelineNodeStatus(
            id="n3",
            title="Central Memory",
            status="pending",
            implemented=False,
            note="Pending implementation (Vector Knowledge & History Index).",
        ),
        PipelineNodeStatus(
            id="n4",
            title="Action Generator",
            status="pending",
            implemented=False,
            note="Pending implementation (Task & Decision Synthesis).",
        ),
        PipelineNodeStatus(
            id="n5",
            title="Follow-up & Meeting Prep",
            status="pending",
            implemented=False,
            note="Pending implementation (Email Drafts & Calendar Briefings).",
        ),
    ]

    return ConversationCaptureResponse(
        instance_id=str(instance_id),
        workflow_name="meeting_intelligence_followup",
        status="capture_completed",
        current_node="n1",
        nodes=nodes_status,
        conversation_data=captured_data,
        message="Conversation Capture executed successfully. Audio recording and metadata preserved for the run. Nodes 2–5 remain pending implementation.",
    )


# ── Node 2: Transcription & Extraction Services ───────────────────────────────

async def transcribe_audio_file(
    file_path: Path,
    language_hint: Optional[str] = None,
) -> tuple[str, str, str, float]:
    """
    Transcribe audio using Groq Whisper (whisper-large-v3) with fallback to OpenAI Whisper (whisper-1).
    Returns: (transcript_text, detected_language, provider_model, duration_seconds)
    Raises: HTTPException if file is missing, empty, or transcription fails.
    Never fabricates a mock transcript.
    """
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file '{file_path.name}' does not exist on disk.",
        )

    try:
        with open(file_path, "rb") as f:
            audio_bytes = f.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read audio file from disk: {str(e)}",
        )

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio recording file is empty (0 bytes).",
        )

    # Map language preferences
    lang_code = None
    if language_hint:
        normalized = language_hint.strip().lower()
        if "english" in normalized and "spanish" not in normalized:
            lang_code = "en"
        elif "spanish" in normalized and "english" not in normalized:
            lang_code = "es"
        # "Auto Detect" or "Mixed English / Spanish" leaves lang_code as None for automatic detection

    ext = file_path.suffix.lower()
    content_type_map = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
    }
    content_type = content_type_map.get(ext, "audio/mpeg")

    start_time = time.time()
    errors: List[str] = []

    # 1. Primary: Groq Whisper (whisper-large-v3)
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            headers = {"Authorization": f"Bearer {groq_key}"}
            files = {"file": (file_path.name, audio_bytes, content_type)}
            data = {"model": "whisper-large-v3", "response_format": "verbose_json"}
            if lang_code:
                data["language"] = lang_code

            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                )
                if resp.status_code == 200:
                    res_json = resp.json()
                    transcript = res_json.get("text", "").strip()
                    if transcript:
                        detected_lang = res_json.get("language") or language_hint or "en"
                        duration_sec = round(time.time() - start_time, 2)
                        return transcript, detected_lang, "groq_whisper-large-v3", duration_sec
                else:
                    errors.append(f"Groq API {resp.status_code}: {resp.text[:200]}")
        except Exception as groq_err:
            log.warning("Groq Whisper transcription failed, attempting fallback", error=str(groq_err))
            errors.append(f"Groq error: {str(groq_err)}")

    # 2. Secondary: OpenAI Whisper (whisper-1)
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            headers = {"Authorization": f"Bearer {openai_key}"}
            files = {"file": (file_path.name, audio_bytes, content_type)}
            data = {"model": "whisper-1", "response_format": "verbose_json"}
            if lang_code:
                data["language"] = lang_code

            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                )
                if resp.status_code == 200:
                    res_json = resp.json()
                    transcript = res_json.get("text", "").strip()
                    if transcript:
                        detected_lang = res_json.get("language") or language_hint or "en"
                        duration_sec = round(time.time() - start_time, 2)
                        return transcript, detected_lang, "openai_whisper-1", duration_sec
                else:
                    errors.append(f"OpenAI API {resp.status_code}: {resp.text[:200]}")
        except Exception as openai_err:
            log.warning("OpenAI Whisper transcription failed", error=str(openai_err))
            errors.append(f"OpenAI error: {str(openai_err)}")

    error_summary = "; ".join(errors) if errors else "No transcription provider credentials available (GROQ_API_KEY / OPENAI_API_KEY)."
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Transcription failed: {error_summary}",
    )


EXTRACTION_SYSTEM_PROMPT = """You are an expert conversation intelligence analyst for SMBFlow.
Your task is to analyze a professional conversation transcript and extract structured intelligence in STRICT JSON format.

RULES:
1. "commitments": Contain ONLY explicit promises and agreements made during the conversation by the participants.
   - Example: "I will send the proposal by Friday" -> {"owner": "<speaker>", "commitment": "Send short proposal", "due_date": "2026-10-02"}
   - Do NOT include general ideas, suggestions, or advice in commitments.
2. "suggested_actions": Contain AI recommendations, strategic follow-ups, or best practices that were NOT explicitly promised.
   - Never confuse an agreed commitment with an AI suggested action.
3. "people": Extract key individuals mentioned or participating.
   - Include their facts, interests, needs, and opportunities mentioned in the conversation.
   - If contact_name is provided in context, use it accurately but do NOT force speaker attribution if ambiguous. Represent uncertainty rather than inventing false attribution.
4. "due_date": Use the provided Reference Calendar and Conversation Date to resolve relative phrases like "tomorrow", "Friday", "next week" to ISO "YYYY-MM-DD". If uncertain or not stated, set due_date to null. Never invent dates.
5. "open_questions": Unresolved questions or topics that require further clarification.
6. Output MUST be valid JSON matching the exact schema below without any extra markdown or explanation outside the JSON:

{
  "summary": "Concise executive summary of conversation",
  "people": [
    {
      "name": "Full Name",
      "facts": ["..."],
      "interests": ["..."],
      "needs": ["..."],
      "opportunities": ["..."]
    }
  ],
  "commitments": [
    {
      "owner": "Person name or Speaker",
      "commitment": "Action promised",
      "due_date": "YYYY-MM-DD or null"
    }
  ],
  "suggested_actions": [
    {
      "action": "Recommended next step",
      "reason": "Why this recommendation is valuable"
    }
  ],
  "open_questions": ["..."]
}
"""


async def extract_structured_intelligence(
    transcript: str,
    contact_name: str,
    conversation_date: str,
    conversation_type: str,
) -> tuple[StructuredExtraction, str, float, int, int]:
    """
    Extract structured intelligence from conversation transcript using LLMRouter.
    Returns: (StructuredExtraction, model_name, cost_usd, tokens_in, tokens_out)
    """
    try:
        ref_dt = datetime.strptime(conversation_date, "%Y-%m-%d")
        day_of_week = ref_dt.strftime("%A")
    except Exception:
        day_of_week = "Unknown"

    user_prompt = f"""REFERENCE CALENDAR:
- Conversation Date: {conversation_date} (Day of week: {day_of_week})
- Primary Contact: {contact_name}
- Conversation Type: {conversation_type}

TRANSCRIPT:
\"\"\"
{transcript}
\"\"\"

Extract structured intelligence following all rules and output strictly valid JSON."""

    messages = [
        LLMMessage(role="system", content=EXTRACTION_SYSTEM_PROMPT),
        LLMMessage(role="user", content=user_prompt),
    ]

    llm = LLMRouter()
    try:
        raw_resp, call_record = await llm.call(
            agent_name="reasoning_agent",
            messages=messages,
            tier_override="balanced",
        )
    except Exception as llm_err:
        log.error("LLMRouter failed during structured extraction", error=str(llm_err))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM extraction service unavailable: {str(llm_err)}",
        )

    # Clean markdown code fences if present
    cleaned = raw_resp.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        parsed_dict = json.loads(cleaned)
    except Exception as parse_err:
        log.warning("JSON parse failed on raw LLM output, attempting repair", error=str(parse_err))
        try:
            repair_messages = [
                LLMMessage(role="system", content="You fix invalid JSON strings so they conform strictly to valid JSON."),
                LLMMessage(role="user", content=f"Fix and return ONLY valid JSON without markdown fences:\n{cleaned}"),
            ]
            repaired_resp, _ = await llm.call(
                agent_name="mini",
                messages=repair_messages,
                tier_override="mini",
            )
            r_cleaned = repaired_resp.strip()
            if r_cleaned.startswith("```json"):
                r_cleaned = r_cleaned[7:]
            if r_cleaned.startswith("```"):
                r_cleaned = r_cleaned[3:]
            if r_cleaned.endswith("```"):
                r_cleaned = r_cleaned[:-3]
            parsed_dict = json.loads(r_cleaned.strip())
        except Exception as repair_err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to parse structured output from AI model: {str(parse_err)}",
            )

    try:
        extraction = StructuredExtraction(**parsed_dict)
    except Exception as val_err:
        log.warning("Pydantic validation failed on structured extraction, applying safe normalization", error=str(val_err))
        people_raw = parsed_dict.get("people", [])
        people_list = []
        for p in (people_raw if isinstance(people_raw, list) else []):
            if isinstance(p, dict):
                people_list.append(PersonExtraction(
                    name=str(p.get("name") or contact_name),
                    facts=[str(x) for x in p.get("facts", []) if x],
                    interests=[str(x) for x in p.get("interests", []) if x],
                    needs=[str(x) for x in p.get("needs", []) if x],
                    opportunities=[str(x) for x in p.get("opportunities", []) if x],
                ))
        if not people_list and contact_name:
            people_list.append(PersonExtraction(name=contact_name))

        commitments_raw = parsed_dict.get("commitments", [])
        commitments_list = []
        for c in (commitments_raw if isinstance(commitments_raw, list) else []):
            if isinstance(c, dict) and c.get("commitment"):
                commitments_list.append(CommitmentExtraction(
                    owner=str(c.get("owner") or "Speaker"),
                    commitment=str(c.get("commitment")),
                    due_date=str(c.get("due_date")) if c.get("due_date") else None,
                ))

        actions_raw = parsed_dict.get("suggested_actions", [])
        actions_list = []
        for a in (actions_raw if isinstance(actions_raw, list) else []):
            if isinstance(a, dict) and a.get("action"):
                actions_list.append(SuggestedActionExtraction(
                    action=str(a.get("action")),
                    reason=str(a.get("reason") or "Identified as beneficial next step"),
                ))

        questions_raw = parsed_dict.get("open_questions", [])
        questions_list = [str(q) for q in (questions_raw if isinstance(questions_raw, list) else []) if q]

        extraction = StructuredExtraction(
            summary=str(parsed_dict.get("summary") or "Discussion notes extracted from conversation."),
            people=people_list,
            commitments=commitments_list,
            suggested_actions=actions_list,
            open_questions=questions_list,
        )

    model_name = getattr(call_record, "model", "claude-haiku-4-5")
    cost_usd = getattr(call_record, "cost_usd", 0.0)
    tokens_in = getattr(call_record, "tokens_in", 0)
    tokens_out = getattr(call_record, "tokens_out", 0)

    return extraction, model_name, cost_usd, tokens_in, tokens_out


# ── Node 2: Process Conversation Endpoint ─────────────────────────────────────

@router.post("/process-conversation", response_model=ProcessConversationResponse)
async def process_conversation(
    req: ProcessConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Execute Node 2: Process Conversation for Meeting Intelligence & Follow-up.
    1. Loads the WorkflowInstance created by Node 1.
    2. Validates tenant and organization isolation.
    3. Retrieves the preserved audio recording.
    4. Transcribes audio using Groq Whisper (with OpenAI Whisper fallback).
    5. Extracts structured intelligence using LLMRouter (strict JSON schema).
    6. Persists transcript and structured extraction to the WorkflowInstance context.
    7. Records an AgentRunRecord for Node 2 (conversation_processing).
    8. Updates Node 1 and Node 2 as completed, keeping Nodes 3–5 strictly pending.
    """
    start_time = time.time()
    org_uuid = await _resolve_org_uuid(current_user, db)

    # 1. Parse instance UUID
    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    # 2. Retrieve WorkflowInstance
    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")

    # 3. Enforce tenant & organization isolation
    if workflow_inst.organization_id != org_uuid:
        log.warning(
            "Unauthorized access attempt to workflow run",
            instance_id=str(instance_uuid),
            user_org=str(org_uuid),
            instance_org=str(workflow_inst.organization_id),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: workflow run belongs to another organization.",
        )

    # 4. Extract conversation parameters and audio reference
    context_data = workflow_inst.context or {}
    capture_data = context_data.get("conversation_capture") or workflow_inst.trigger_payload or {}
    recording_info = capture_data.get("recording") or {}

    contact_name = capture_data.get("contact_name") or "Primary Contact"
    conversation_date = capture_data.get("conversation_date") or datetime.utcnow().strftime("%Y-%m-%d")
    conversation_type = capture_data.get("conversation_type") or "Online Meeting"
    language_hint = capture_data.get("language") or "Auto Detect"

    # Check if pre-transcribed text or notes were provided directly (e.g. from text/notes webhook or simulator)
    provided_transcript = (capture_data.get("transcript_text") or capture_data.get("notes") or "").strip()

    if provided_transcript:
        transcript_text = provided_transcript
        detected_lang = language_hint if language_hint and language_hint != "Auto Detect" else "en"
        stt_provider = "provided_transcript_notes"
        stt_duration = round(len(transcript_text.split()) / 2.5, 2)
    else:
        stored_path_str = recording_info.get("stored_path")
        if not stored_path_str:
            # Mark failure on instance
            workflow_inst.status = "failed"
            fail_run = AgentRunRecord(
                id=uuid.uuid4(),
                instance_id=instance_uuid,
                node_id="n2",
                agent_capability="conversation_processing",
                status="failed",
                error="Missing audio recording reference in workflow instance.",
                completed_at=datetime.utcnow(),
            )
            db.add(fail_run)
            await db.commit()
            raise HTTPException(status_code=404, detail="No audio recording found for this workflow run.")

        audio_file_path = Path(stored_path_str)
        # Check directory boundary to prevent traversal
        resolved_audio_path = audio_file_path.resolve()
        if not str(resolved_audio_path).startswith(str(STORAGE_DIR.resolve())):
            workflow_inst.status = "failed"
            fail_run = AgentRunRecord(
                id=uuid.uuid4(),
                instance_id=instance_uuid,
                node_id="n2",
                agent_capability="conversation_processing",
                status="failed",
                error="Audio file path traversal violation.",
                completed_at=datetime.utcnow(),
            )
            db.add(fail_run)
            await db.commit()
            raise HTTPException(status_code=400, detail="Invalid audio file path.")

        if not audio_file_path.is_file():
            workflow_inst.status = "failed"
            fail_run = AgentRunRecord(
                id=uuid.uuid4(),
                instance_id=instance_uuid,
                node_id="n2",
                agent_capability="conversation_processing",
                status="failed",
                error=f"Audio file '{audio_file_path.name}' not found on disk.",
                completed_at=datetime.utcnow(),
            )
            db.add(fail_run)
            await db.commit()
            raise HTTPException(status_code=404, detail=f"Audio file '{audio_file_path.name}' not found on disk.")

        # 5. Transcription
        try:
            transcript_text, detected_lang, stt_provider, stt_duration = await transcribe_audio_file(
                file_path=audio_file_path,
                language_hint=language_hint,
            )
        except HTTPException as stt_http_err:
            workflow_inst.status = "failed"
            fail_run = AgentRunRecord(
                id=uuid.uuid4(),
                instance_id=instance_uuid,
                node_id="n2",
                agent_capability="conversation_processing",
                status="failed",
                error=stt_http_err.detail,
                completed_at=datetime.utcnow(),
            )
            db.add(fail_run)
            await db.commit()
            raise stt_http_err
        except Exception as stt_generic_err:
            workflow_inst.status = "failed"
            fail_run = AgentRunRecord(
                id=uuid.uuid4(),
                instance_id=instance_uuid,
                node_id="n2",
                agent_capability="conversation_processing",
                status="failed",
                error=str(stt_generic_err),
                completed_at=datetime.utcnow(),
            )
            db.add(fail_run)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Transcription failed: {str(stt_generic_err)}",
            )

    # 6. Structured Intelligence Extraction
    try:
        extraction, model_used, cost_usd, t_in, t_out = await extract_structured_intelligence(
            transcript=transcript_text,
            contact_name=contact_name,
            conversation_date=conversation_date,
            conversation_type=conversation_type,
        )
    except HTTPException as llm_http_err:
        workflow_inst.status = "failed"
        fail_run = AgentRunRecord(
            id=uuid.uuid4(),
            instance_id=instance_uuid,
            node_id="n2",
            agent_capability="conversation_processing",
            status="failed",
            error=llm_http_err.detail,
            completed_at=datetime.utcnow(),
        )
        db.add(fail_run)
        await db.commit()
        raise llm_http_err
    except Exception as llm_generic_err:
        workflow_inst.status = "failed"
        fail_run = AgentRunRecord(
            id=uuid.uuid4(),
            instance_id=instance_uuid,
            node_id="n2",
            agent_capability="conversation_processing",
            status="failed",
            error=str(llm_generic_err),
            completed_at=datetime.utcnow(),
        )
        db.add(fail_run)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Extraction failed: {str(llm_generic_err)}",
        )

    total_duration_ms = int((time.time() - start_time) * 1000)

    # 7. Update WorkflowInstance state & context
    workflow_inst.status = "processed"
    workflow_inst.current_node = "n2"
    workflow_inst.total_tokens_in = (workflow_inst.total_tokens_in or 0) + t_in
    workflow_inst.total_tokens_out = (workflow_inst.total_tokens_out or 0) + t_out
    workflow_inst.total_cost_usd = (workflow_inst.total_cost_usd or 0.0) + cost_usd

    updated_context = dict(context_data)
    updated_context["node2_process_conversation"] = {
        "status": "completed",
        "transcript_text": transcript_text,
        "detected_language": detected_lang,
        "transcription_status": "completed",
        "transcription_provider": stt_provider,
        "extraction": extraction.model_dump(),
        "model_used": model_used,
        "cost_usd": cost_usd,
        "duration_ms": total_duration_ms,
        "processed_at": datetime.utcnow().isoformat(),
    }
    updated_context["implemented_nodes"] = ["n1", "n2"]
    updated_context["pending_nodes"] = ["n3", "n4", "n5"]
    workflow_inst.context = updated_context

    # 8. Record AgentRunRecord for Node 2
    node2_run = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_uuid,
        node_id="n2",
        agent_capability="conversation_processing",
        status="completed",
        tokens_in=t_in,
        tokens_out=t_out,
        cost_usd=cost_usd,
        model_used=model_used,
        duration_ms=total_duration_ms,
        tools_used=["transcription_whisper", "llm_router"],
        completed_at=datetime.utcnow(),
    )
    db.add(node2_run)

    # 9. Audit Event
    audit_evt = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system")),
        action="conversation_processed",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "workflow": "meeting_intelligence_followup",
            "transcript_length": len(transcript_text),
            "detected_language": detected_lang,
            "commitments_count": len(extraction.commitments),
            "suggested_actions_count": len(extraction.suggested_actions),
            "people_count": len(extraction.people),
            "model_used": model_used,
        },
    )
    db.add(audit_evt)

    await db.commit()
    await db.refresh(workflow_inst)

    log.info(
        "Conversation processing completed successfully",
        instance_id=str(instance_uuid),
        detected_language=detected_lang,
        commitments=len(extraction.commitments),
        suggested_actions=len(extraction.suggested_actions),
    )

    nodes_status = [
        PipelineNodeStatus(
            id="n1",
            title="Conversation Capture",
            status="completed",
            implemented=True,
            note="Audio recording and metadata preserved successfully.",
        ),
        PipelineNodeStatus(
            id="n2",
            title="Process Conversation",
            status="completed",
            implemented=True,
            note=f"Transcription ({detected_lang}) and structured extraction completed.",
        ),
        PipelineNodeStatus(
            id="n3",
            title="Central Memory",
            status="pending",
            implemented=False,
            note="Pending implementation (Vector Knowledge & History Index).",
        ),
        PipelineNodeStatus(
            id="n4",
            title="Action Generator",
            status="pending",
            implemented=False,
            note="Pending implementation (Task & Decision Synthesis).",
        ),
        PipelineNodeStatus(
            id="n5",
            title="Follow-up & Meeting Prep",
            status="pending",
            implemented=False,
            note="Pending implementation (Email Drafts & Calendar Briefings).",
        ),
    ]

    return ProcessConversationResponse(
        instance_id=str(instance_uuid),
        workflow_name="meeting_intelligence_followup",
        status="completed",
        current_node="n2",
        transcript_text=transcript_text,
        detected_language=detected_lang,
        transcription_status="completed",
        extraction=extraction,
        nodes=nodes_status,
        summary_text=extraction.summary,
        model_used=model_used,
        cost_usd=cost_usd,
        duration_ms=total_duration_ms,
        message="Conversation transcribed and structured intelligence extracted successfully. Nodes 3–5 remain pending implementation.",
    )


# ── Node 3: Central Memory Helper Functions ───────────────────────────────────

async def _build_contact_memory_snapshot(
    contact: RelationshipContact,
    current_conv_id: Optional[uuid.UUID],
    org_uuid: uuid.UUID,
    db: AsyncSession,
    instance_uuid: Optional[uuid.UUID],
) -> ContactMemorySnapshot:
    """Build aggregated contact snapshot including conversation history and distinct memory categories."""
    stmt_convs = (
        select(RelationshipConversation)
        .where(
            RelationshipConversation.organization_id == org_uuid,
            RelationshipConversation.contact_id == contact.id,
        )
        .order_by(RelationshipConversation.created_at.desc())
    )
    res_convs = await db.execute(stmt_convs)
    convs = res_convs.scalars().all()

    conv_titles = {str(c.id): c.title for c in convs}
    history_items = [
        ConversationHistoryItem(
            conversation_id=str(c.id),
            workflow_instance_id=str(c.workflow_instance_id),
            title=c.title,
            conversation_type=c.conversation_type,
            conversation_date=c.conversation_date,
            detected_language=c.detected_language,
            summary=c.summary,
            created_at=c.created_at.isoformat() if c.created_at else None,
        )
        for c in convs
    ]

    latest_conv = convs[0] if convs else None

    stmt_items = (
        select(RelationshipMemoryItem)
        .where(
            RelationshipMemoryItem.organization_id == org_uuid,
            RelationshipMemoryItem.contact_id == contact.id,
        )
        .order_by(RelationshipMemoryItem.created_at.asc())
    )
    res_items = await db.execute(stmt_items)
    items = res_items.scalars().all()

    def _to_memory_item(item: RelationshipMemoryItem) -> ContactMemoryItem:
        return ContactMemoryItem(
            id=str(item.id),
            category=item.category,
            content=item.content,
            details=item.details or {},
            source_date=item.source_date,
            source_conversation_id=str(item.conversation_id),
            source_conversation_title=conv_titles.get(str(item.conversation_id), "Conversation"),
            source_workflow_instance_id=str(item.workflow_instance_id),
            is_ai_generated=item.is_ai_generated,
        )

    facts = [_to_memory_item(m) for m in items if m.category == "fact"]
    interests = [_to_memory_item(m) for m in items if m.category == "interest"]
    needs = [_to_memory_item(m) for m in items if m.category == "need"]
    opportunities = [_to_memory_item(m) for m in items if m.category == "opportunity"]
    commitments = [_to_memory_item(m) for m in items if m.category == "commitment"]
    suggested_actions = [_to_memory_item(m) for m in items if m.category == "suggested_action"]
    open_questions = [_to_memory_item(m) for m in items if m.category == "open_question"]

    source_reference = {
        "workflow_instance_id": str(instance_uuid) if instance_uuid else "",
        "conversation_id": str(current_conv_id) if current_conv_id else (str(latest_conv.id) if latest_conv else ""),
        "conversation_title": latest_conv.title if latest_conv else "",
        "conversation_date": latest_conv.conversation_date if latest_conv else None,
        "storage_type": "relational_postgresql",
    }

    return ContactMemorySnapshot(
        contact_id=str(contact.id),
        contact_name=contact.name,
        contact_role=contact.role,
        organization_id=str(contact.organization_id),
        total_conversations=len(convs),
        conversations=history_items,
        latest_conversation_title=latest_conv.title if latest_conv else "No conversations",
        latest_conversation_date=latest_conv.conversation_date if latest_conv else None,
        latest_conversation_summary=latest_conv.summary if latest_conv else None,
        facts=facts,
        interests=interests,
        needs=needs,
        opportunities=opportunities,
        commitments=commitments,
        suggested_actions=suggested_actions,
        open_questions=open_questions,
        source_reference=source_reference,
    )


# ── Node 3: Central Memory Endpoint ──────────────────────────────────────────

@router.post("/central-memory", response_model=CentralMemoryResponse)
async def process_central_memory(
    request: CentralMemoryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    NODE 3: Central Memory
    Converts processed conversation intelligence from Node 2 into persistent,
    organization-scoped relationship memory in PostgreSQL.
    Enforces deterministic contact resolution, source traceability, and strict idempotency.
    """
    start_time = time.perf_counter()
    org_uuid = await _resolve_org_uuid(current_user, db)

    try:
        instance_uuid = uuid.UUID(request.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow instance not found.")

    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access forbidden: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    node2_data = ctx.get("node2_process_conversation")
    if not node2_data or node2_data.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Node 2 (Process Conversation) has not successfully completed for this workflow run. Node 3 requires verified transcript and structured extraction.",
        )

    # ── Check Idempotency ──────────────────────────────────────────────────────
    stmt_conv = select(RelationshipConversation).where(
        RelationshipConversation.organization_id == org_uuid,
        RelationshipConversation.workflow_instance_id == instance_uuid,
    )
    res_conv = await db.execute(stmt_conv)
    existing_conv = res_conv.scalars().first()

    if existing_conv:
        # Retrieve existing contact
        stmt_c = select(RelationshipContact).where(RelationshipContact.id == existing_conv.contact_id)
        res_c = await db.execute(stmt_c)
        contact = res_c.scalars().first()

        # Rehydrate and persist node3_central_memory into WorkflowInstance context if missing
        existing_node3 = (workflow_inst.context or {}).get("node3_central_memory")
        if not existing_node3 or existing_node3.get("status") != "completed":
            updated_ctx = dict(workflow_inst.context or {})
            updated_ctx["node3_central_memory"] = {
                "contact_id": str(contact.id) if contact else str(existing_conv.contact_id),
                "contact_name": contact.name if contact else "Contact",
                "contact_role": contact.role if contact else "",
                "conversation_id": str(existing_conv.id),
                "status": "completed",
                "indexed_at": existing_conv.created_at.isoformat() if existing_conv.created_at else datetime.utcnow().isoformat(),
            }
            impl_nodes = list(updated_ctx.get("implemented_nodes") or ["n1", "n2"])
            if "n3" not in impl_nodes:
                impl_nodes.append("n3")
            updated_ctx["implemented_nodes"] = impl_nodes
            workflow_inst.context = updated_ctx
            workflow_inst.current_node = "n3"
            await db.commit()

        snapshot = await _build_contact_memory_snapshot(contact, existing_conv.id, org_uuid, db, instance_uuid)
        nodes_status = [
            PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
            PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
            PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
            PipelineNodeStatus(id="n4", title="Action Generator", status="pending", implemented=False, note="Pending implementation (Task & Decision Synthesis)."),
            PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status="pending", implemented=False, note="Pending implementation (Email Drafts & Calendar Briefings)."),
        ]
        return CentralMemoryResponse(
            instance_id=str(instance_uuid),
            workflow_name="meeting_intelligence_followup",
            status="completed",
            current_node="n3",
            contact_id=str(contact.id) if contact else str(existing_conv.contact_id),
            conversation_id=str(existing_conv.id),
            memory=snapshot,
            nodes=nodes_status,
            message="Central Memory retrieved from existing persisted record (Idempotent reuse).",
            idempotent_reused=True,
        )

    # ── 1. Contact Resolution (Deterministic within Organization) ──────────────
    capture_data = ctx.get("conversation_capture") or workflow_inst.trigger_payload or {}
    raw_name = capture_data.get("contact_name") or capture_data.get("participant_name") or "Unknown Contact"
    contact_name = raw_name.strip()
    normalized_name = contact_name.lower()
    participant_role = capture_data.get("participant_role") or ""
    conversation_title = capture_data.get("conversation_title") or "Meeting"
    conversation_type = capture_data.get("conversation_type") or "meeting"
    conversation_date = capture_data.get("conversation_date") or datetime.utcnow().strftime("%Y-%m-%d")
    detected_lang = node2_data.get("detected_language") or "en"
    transcript_text = node2_data.get("transcript_text") or ""
    extraction = node2_data.get("extraction") or {}
    summary_text = extraction.get("summary") or ""

    stmt_contact = select(RelationshipContact).where(
        RelationshipContact.organization_id == org_uuid,
        RelationshipContact.normalized_name == normalized_name,
    )
    res_contact = await db.execute(stmt_contact)
    contact = res_contact.scalars().first()

    if not contact:
        contact = RelationshipContact(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            name=contact_name,
            normalized_name=normalized_name,
            role=participant_role,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(contact)
        await db.flush()
    else:
        if participant_role and not contact.role:
            contact.role = participant_role
            contact.updated_at = datetime.utcnow()

    # ── 2. Create Conversation Record ──────────────────────────────────────────
    conversation = RelationshipConversation(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        contact_id=contact.id,
        workflow_instance_id=instance_uuid,
        title=conversation_title,
        conversation_type=conversation_type,
        conversation_date=conversation_date,
        detected_language=detected_lang,
        transcript=transcript_text,
        summary=summary_text,
        structured_memory=extraction,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(conversation)
    await db.flush()

    # ── 3. Create Granular Traceable Memory Items ──────────────────────────────
    memory_items = []

    # People Facts, Interests, Needs, Opportunities
    for person in extraction.get("people", []):
        p_name = person.get("name") or contact.name
        for f in person.get("facts", []):
            if f and f.strip():
                memory_items.append(RelationshipMemoryItem(
                    id=uuid.uuid4(),
                    organization_id=org_uuid,
                    contact_id=contact.id,
                    conversation_id=conversation.id,
                    workflow_instance_id=instance_uuid,
                    category="fact",
                    content=f.strip(),
                    details={"person": p_name},
                    source_date=conversation_date,
                    is_ai_generated=False,
                ))
        for i in person.get("interests", []):
            if i and i.strip():
                memory_items.append(RelationshipMemoryItem(
                    id=uuid.uuid4(),
                    organization_id=org_uuid,
                    contact_id=contact.id,
                    conversation_id=conversation.id,
                    workflow_instance_id=instance_uuid,
                    category="interest",
                    content=i.strip(),
                    details={"person": p_name},
                    source_date=conversation_date,
                    is_ai_generated=False,
                ))
        for n in person.get("needs", []):
            if n and n.strip():
                memory_items.append(RelationshipMemoryItem(
                    id=uuid.uuid4(),
                    organization_id=org_uuid,
                    contact_id=contact.id,
                    conversation_id=conversation.id,
                    workflow_instance_id=instance_uuid,
                    category="need",
                    content=n.strip(),
                    details={"person": p_name},
                    source_date=conversation_date,
                    is_ai_generated=False,
                ))
        for o in person.get("opportunities", []):
            if o and o.strip():
                memory_items.append(RelationshipMemoryItem(
                    id=uuid.uuid4(),
                    organization_id=org_uuid,
                    contact_id=contact.id,
                    conversation_id=conversation.id,
                    workflow_instance_id=instance_uuid,
                    category="opportunity",
                    content=o.strip(),
                    details={"person": p_name},
                    source_date=conversation_date,
                    is_ai_generated=False,
                ))

    # Explicit Commitments
    for comm in extraction.get("commitments", []):
        c_text = comm.get("commitment") if isinstance(comm, dict) else str(comm)
        owner = comm.get("owner", contact.name) if isinstance(comm, dict) else contact.name
        due_date = comm.get("due_date") if isinstance(comm, dict) else None
        if c_text and c_text.strip():
            memory_items.append(RelationshipMemoryItem(
                id=uuid.uuid4(),
                organization_id=org_uuid,
                contact_id=contact.id,
                conversation_id=conversation.id,
                workflow_instance_id=instance_uuid,
                category="commitment",
                content=c_text.strip(),
                details={"owner": owner, "due_date": due_date},
                source_date=conversation_date,
                is_ai_generated=False,
            ))

    # Suggested Actions (PRESERVE STRICT SEPARATION AS AI-GENERATED)
    for action in extraction.get("suggested_actions", []):
        a_text = action.get("action") if isinstance(action, dict) else str(action)
        reason = action.get("reason", "") if isinstance(action, dict) else ""
        if a_text and a_text.strip():
            memory_items.append(RelationshipMemoryItem(
                id=uuid.uuid4(),
                organization_id=org_uuid,
                contact_id=contact.id,
                conversation_id=conversation.id,
                workflow_instance_id=instance_uuid,
                category="suggested_action",
                content=a_text.strip(),
                details={"action": a_text.strip(), "reason": reason},
                source_date=conversation_date,
                is_ai_generated=True,
            ))

    # Open Questions
    for q in extraction.get("open_questions", []):
        if q and q.strip():
            memory_items.append(RelationshipMemoryItem(
                id=uuid.uuid4(),
                organization_id=org_uuid,
                contact_id=contact.id,
                conversation_id=conversation.id,
                workflow_instance_id=instance_uuid,
                category="open_question",
                content=q.strip(),
                details={},
                source_date=conversation_date,
                is_ai_generated=False,
            ))

    for item in memory_items:
        db.add(item)
    await db.flush()

    duration_ms = int((time.perf_counter() - start_time) * 1000)

    # ── 4. Update WorkflowInstance context ─────────────────────────────────────
    updated_ctx = dict(workflow_inst.context or {})
    updated_ctx["node3_central_memory"] = {
        "contact_id": str(contact.id),
        "contact_name": contact.name,
        "contact_role": contact.role,
        "conversation_id": str(conversation.id),
        "status": "completed",
        "indexed_at": datetime.utcnow().isoformat(),
    }
    impl_nodes = list(updated_ctx.get("implemented_nodes") or ["n1", "n2"])
    if "n3" not in impl_nodes:
        impl_nodes.append("n3")
    updated_ctx["implemented_nodes"] = impl_nodes
    workflow_inst.context = updated_ctx
    workflow_inst.current_node = "n3"

    # ── 5. Observability: AgentRunRecord & AuditEvent ──────────────────────────
    agent_record = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_uuid,
        node_id="n3",
        agent_capability="central_memory",
        status="success",
        cost_usd=0.0,
        tokens_in=0,
        tokens_out=0,
        model_used="relational_indexer",
        duration_ms=duration_ms,
        completed_at=datetime.utcnow(),
        tools_used=["relationship_contacts", "relationship_conversations", "relationship_memory_items"],
    )
    db.add(agent_record)

    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=str(current_user.user_id or current_user.email or "system"),
        action="central_memory_indexed",
        entity_type="relationship_conversation",
        entity_id=str(conversation.id),
        metadata_={
            "contact_id": str(contact.id),
            "contact_name": contact.name,
            "workflow_instance_id": str(instance_uuid),
            "items_indexed": len(memory_items),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)
    await db.commit()

    # ── 6. Assemble Central Memory Snapshot ───────────────────────────────────
    snapshot = await _build_contact_memory_snapshot(contact, conversation.id, org_uuid, db, instance_uuid)

    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="pending", implemented=False, note="Pending implementation (Task & Decision Synthesis)."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status="pending", implemented=False, note="Pending implementation (Email Drafts & Calendar Briefings)."),
    ]

    return CentralMemoryResponse(
        instance_id=str(instance_uuid),
        workflow_name="meeting_intelligence_followup",
        status="completed",
        current_node="n3",
        contact_id=str(contact.id),
        conversation_id=str(conversation.id),
        memory=snapshot,
        nodes=nodes_status,
        message="Conversation and structured intelligence successfully indexed into Central Memory.",
        idempotent_reused=False,
    )


# ── Contact Memory History Endpoint ──────────────────────────────────────────

@router.get("/contacts/{contact_id}/history", response_model=ContactMemorySnapshot)
async def get_contact_memory_history(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Retrieve full aggregated relationship history and memory items for a specific contact.
    Enforces organization-level isolation.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)

    try:
        cid = uuid.UUID(contact_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid contact_id format.")

    stmt = select(RelationshipContact).where(RelationshipContact.id == cid)
    res = await db.execute(stmt)
    contact = res.scalars().first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    if contact.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: contact belongs to another organization.")

    return await _build_contact_memory_snapshot(contact, None, org_uuid, db, None)


# ── Central Memory Export Endpoint (Provider-Independent Repository) ──────────

@router.get("/central-memory/export")
@router.get("/memory/export")
async def export_central_memory(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Export the entire organization's Central Memory repository (contacts, conversations,
    and structured memory items) in an open, portable, provider-independent JSON format.
    Enforces strict organization-level tenant isolation and records an AuditEvent.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)

    # 1. Fetch contacts
    stmt_contacts = (
        select(RelationshipContact)
        .where(RelationshipContact.organization_id == org_uuid)
        .order_by(RelationshipContact.created_at.asc())
    )
    res_contacts = await db.execute(stmt_contacts)
    contacts = list(res_contacts.scalars().all())

    # 2. Fetch conversations
    stmt_convs = (
        select(RelationshipConversation)
        .where(RelationshipConversation.organization_id == org_uuid)
        .order_by(RelationshipConversation.created_at.asc())
    )
    res_convs = await db.execute(stmt_convs)
    conversations = list(res_convs.scalars().all())

    # 3. Fetch memory items
    stmt_items = (
        select(RelationshipMemoryItem)
        .where(RelationshipMemoryItem.organization_id == org_uuid)
        .order_by(RelationshipMemoryItem.created_at.asc())
    )
    res_items = await db.execute(stmt_items)
    memory_items = list(res_items.scalars().all())

    # 4. Record AuditEvent
    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=current_user.email,
        action="central_memory_exported",
        entity_type="RelationshipMemory",
        entity_id=str(org_uuid),
        metadata_={
            "contacts_count": len(contacts),
            "conversations_count": len(conversations),
            "memory_items_count": len(memory_items),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit)
    await db.commit()

    return {
        "export_format": "smbflow_central_memory_v1",
        "provider_independent": True,
        "organization_id": str(org_uuid),
        "exported_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_contacts": len(contacts),
            "total_conversations": len(conversations),
            "total_memory_items": len(memory_items),
        },
        "contacts": [
            {
                "id": str(c.id),
                "name": c.name,
                "normalized_name": c.normalized_name,
                "role": c.role,
                "company": c.company,
                "metadata": c.metadata_ or {},
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in contacts
        ],
        "conversations": [
            {
                "id": str(cv.id),
                "contact_id": str(cv.contact_id),
                "workflow_instance_id": str(cv.workflow_instance_id),
                "title": cv.title,
                "conversation_type": cv.conversation_type,
                "conversation_date": cv.conversation_date,
                "detected_language": cv.detected_language,
                "transcript": cv.transcript,
                "summary": cv.summary,
                "structured_memory": cv.structured_memory or {},
                "created_at": cv.created_at.isoformat() if cv.created_at else None,
            }
            for cv in conversations
        ],
        "memory_items": [
            {
                "id": str(m.id),
                "contact_id": str(m.contact_id),
                "conversation_id": str(m.conversation_id),
                "workflow_instance_id": str(m.workflow_instance_id),
                "category": m.category,
                "content": m.content,
                "details": m.details or {},
                "source_date": m.source_date,
                "is_ai_generated": m.is_ai_generated,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in memory_items
        ],
    }


# ── Workflow Run Detail / Rehydration Endpoint ────────────────────────────────

@router.get("/runs/{instance_id}", response_model=WorkflowRunDetailResponse)
async def get_workflow_run_detail(
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Retrieve workflow run state and deliverables for rehydration on page refresh.
    Enforces tenant and organization isolation.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)

    try:
        instance_uuid = uuid.UUID(instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")

    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    capture_data = ctx.get("conversation_capture") or workflow_inst.trigger_payload or {}
    node2_data = ctx.get("node2_process_conversation") or {}
    node3_data = ctx.get("node3_central_memory") or {}

    extraction_obj = None
    if node2_data.get("extraction"):
        try:
            extraction_obj = StructuredExtraction(**node2_data["extraction"])
        except Exception:
            pass

    central_memory_snapshot = None
    n3_status = node3_data.get("status") or "pending"
    if n3_status == "completed" and node3_data.get("contact_id"):
        try:
            cid = uuid.UUID(node3_data["contact_id"])
            stmt_contact = select(RelationshipContact).where(RelationshipContact.id == cid)
            res_c = await db.execute(stmt_contact)
            contact_obj = res_c.scalars().first()
            if contact_obj and contact_obj.organization_id == org_uuid:
                conv_id_val = uuid.UUID(node3_data["conversation_id"]) if node3_data.get("conversation_id") else None
                central_memory_snapshot = await _build_contact_memory_snapshot(
                    contact=contact_obj,
                    current_conv_id=conv_id_val,
                    org_uuid=org_uuid,
                    db=db,
                    instance_uuid=instance_uuid,
                )
        except Exception as e:
            log.warning("Failed to rehydrate central memory snapshot", error=str(e))

    n1_status = "completed"
    n2_status = node2_data.get("status") or ("completed" if node2_data else "pending")

    nodes_status = [
        PipelineNodeStatus(
            id="n1",
            title="Conversation Capture",
            status=n1_status,
            implemented=True,
            note="Audio recording and metadata preserved successfully.",
        ),
        PipelineNodeStatus(
            id="n2",
            title="Process Conversation",
            status=n2_status,
            implemented=True if n2_status == "completed" else False,
            note="Transcription & Entity Extraction" if n2_status != "completed" else "Transcription & Entity Extraction completed.",
        ),
        PipelineNodeStatus(
            id="n3",
            title="Central Memory",
            status=n3_status,
            implemented=True if n3_status == "completed" else False,
            note="Organization-scoped Relationship Memory persistent in PostgreSQL." if n3_status == "completed" else "Pending implementation (Vector Knowledge & History Index).",
        ),
        PipelineNodeStatus(
            id="n4",
            title="Action Generator",
            status=ctx.get("node4_action_generator", {}).get("status") or "pending",
            implemented=True if ctx.get("node4_action_generator", {}).get("status") == "completed" else False,
            note="Action items active and persisted in Action Center." if ctx.get("node4_action_generator", {}).get("status") == "completed" else "Pending implementation (Task & Decision Synthesis).",
        ),
        PipelineNodeStatus(
            id="n5",
            title="Follow-up & Meeting Prep",
            status="pending",
            implemented=False,
            note="Pending implementation (Email Drafts & Calendar Briefings).",
        ),
    ]

    # Rehydrate Node 4 actions if present
    actions_snapshot = None
    node4_data = ctx.get("node4_action_generator")
    if node4_data and node4_data.get("status") == "completed" and contact_obj:
        try:
            stmt_apprs = select(ApprovalItem).where(
                ApprovalItem.organization_id == org_uuid,
                ApprovalItem.instance_id == instance_uuid,
                ApprovalItem.node_id == "n4",
            )
            res_apprs = await db.execute(stmt_apprs)
            existing_apprs = list(res_apprs.scalars().all())

            our_cmts = []
            contact_cmts = []
            ai_suggs = []
            for appr in existing_apprs:
                p = appr.payload or {}
                atype = p.get("action_type") or "our_commitment"
                act_obj = GeneratedActionItem(
                    id=str(appr.id),
                    approval_id=str(appr.id),
                    action_type=atype,
                    action=p.get("action") or appr.reason,
                    owner_type=p.get("owner_type") or ("internal" if atype == "our_commitment" else "contact"),
                    owner_display=p.get("owner_display") or ("You / Internal" if atype == "our_commitment" else contact_obj.name),
                    owner=p.get("owner"),
                    due_date=p.get("due_date"),
                    due_date_display=p.get("due_date_display") or _format_due_date_display(p.get("due_date")),
                    status=appr.status,
                    reason=p.get("reason"),
                    source=p.get("source") or "current_conversation",
                    source_title=p.get("conversation_title"),
                    source_date=p.get("source_date"),
                    conversation_id=p.get("conversation_id"),
                    workflow_instance_id=str(instance_uuid),
                    provenance=p.get("provenance") or {},
                )
                if atype == "our_commitment":
                    our_cmts.append(act_obj)
                elif atype == "contact_commitment":
                    contact_cmts.append(act_obj)
                elif atype == "ai_suggestion":
                    ai_suggs.append(act_obj)

            saved_open_questions = node4_data.get("open_questions", [])
            open_q_objs = [
                GeneratedOpenQuestionItem(**q) if isinstance(q, dict) else GeneratedOpenQuestionItem(
                    id=str(uuid.uuid4()), question=str(q)
                )
                for q in saved_open_questions
            ]

            hist_cmts: List[GeneratedActionItem] = []
            if contact_obj:
                conv_id_val = uuid.UUID(node3_data["conversation_id"]) if node3_data.get("conversation_id") else None
                stmt_h = select(RelationshipMemoryItem).where(
                    RelationshipMemoryItem.organization_id == org_uuid,
                    RelationshipMemoryItem.contact_id == contact_obj.id,
                    RelationshipMemoryItem.category == "commitment",
                )
                if conv_id_val:
                    stmt_h = stmt_h.where(RelationshipMemoryItem.conversation_id != conv_id_val)
                stmt_h = stmt_h.order_by(RelationshipMemoryItem.source_date.desc(), RelationshipMemoryItem.created_at.desc())
                res_h = await db.execute(stmt_h)
                for h_item in res_h.scalars().all():
                    h_owner_raw = h_item.details.get("owner") if isinstance(h_item.details, dict) else None
                    h_owner_type, h_owner_display = _classify_commitment_owner(h_owner_raw, contact_obj.name, h_item.content)
                    h_due_date = h_item.details.get("due_date") if isinstance(h_item.details, dict) else None
                    hist_cmts.append(
                        GeneratedActionItem(
                            id=str(h_item.id),
                            action_type="our_commitment" if h_owner_type == "internal" else "contact_commitment",
                            action=h_item.content,
                            owner_type=h_owner_type,
                            owner_display=h_owner_display,
                            owner=h_owner_raw,
                            due_date=h_due_date,
                            due_date_display=_format_due_date_display(h_due_date),
                            status="historical",
                            source="historical_conversation",
                            source_title=h_item.details.get("conversation_title") if isinstance(h_item.details, dict) else None,
                            source_date=h_item.source_date,
                            conversation_id=str(h_item.conversation_id),
                            workflow_instance_id=str(h_item.workflow_instance_id),
                            provenance={
                                "memory_item_id": str(h_item.id),
                                "is_historical": True,
                            },
                        )
                    )

            actions_snapshot = ActionGeneratorResponse(
                instance_id=str(instance_uuid),
                workflow_name="meeting_intelligence_followup",
                status="completed",
                current_node="n4",
                contact_id=str(contact_obj.id),
                contact_name=contact_obj.name,
                our_commitments=our_cmts,
                contact_commitments=contact_cmts,
                ai_suggestions=ai_suggs,
                open_questions=open_q_objs,
                historical_commitments=hist_cmts,
                nodes=nodes_status,
                message="Rehydrated actions from database.",
                idempotent_reused=True,
            )
        except Exception as e:
            log.warning("Failed to rehydrate actions snapshot", error=str(e))

    # Rehydrate Node 5A Follow-up Draft if present
    followup_draft_snapshot = None
    draft_status_for_n5 = None
    try:
        stmt_draft = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.review_type == "followup_email_draft",
        ).order_by(ApprovalItem.created_at.desc())
        res_draft = await db.execute(stmt_draft)
        appr_draft = res_draft.scalars().first()
        if appr_draft and getattr(appr_draft, "review_type", None) == "followup_email_draft":
            dp = appr_draft.payload or {}
            followup_draft_snapshot = FollowupDraftItem(
                id=str(appr_draft.id),
                approval_id=str(appr_draft.id),
                instance_id=str(instance_uuid),
                review_type=appr_draft.review_type or "followup_email_draft",
                status=appr_draft.status,
                subject=dp.get("subject", ""),
                body=dp.get("body", ""),
                recipient_name=dp.get("recipient_name", ""),
                recipient_email=dp.get("recipient_email"),
                recipient_email_available=bool(dp.get("recipient_email_available", False)),
                contact_id=dp.get("contact_id"),
                conversation_title=dp.get("conversation_title"),
                our_commitments_count=dp.get("our_commitments_count", 0),
                contact_commitments_count=dp.get("contact_commitments_count", 0),
                ai_suggestions_count=dp.get("ai_suggestions_count", 0),
                open_questions_count=dp.get("open_questions_count", 0),
                original_generated_subject=dp.get("original_generated_subject"),
                original_generated_body=dp.get("original_generated_body"),
                original_subject=dp.get("original_generated_subject") or dp.get("original_subject"),
                original_body=dp.get("original_generated_body") or dp.get("original_body"),
                snoozed_until=dp.get("snoozed_until"),
                snooze_reason=dp.get("snooze_reason"),
                snoozed_reason=dp.get("snooze_reason"),
                sent_at=dp.get("sent_at"),
                sent_to=dp.get("sent_to"),
                provider_message_id=dp.get("provider_message_id"),
                connection_status=dp.get("connection_status"),
                error_message=dp.get("last_send_error"),
                model_used=dp.get("model_used"),
                decided_by=appr_draft.decided_by,
                decided_at=appr_draft.decided_at.isoformat() if appr_draft.decided_at else None,
                created_at=appr_draft.created_at.isoformat() if appr_draft.created_at else None,
                provenance=dp.get("provenance") or {},
            )
            draft_status_for_n5 = appr_draft.status

            # Update Node 5 status using combined 5A + 5B logic
            prep_ctx_rehydrate = ctx.get("node5b_meeting_prep") or {}
            prep_block_status_rehydrate = prep_ctx_rehydrate.get("status") if prep_ctx_rehydrate else None
            n5_status_rehydrate, n5_note_rehydrate = _compute_n5_status(draft_status_for_n5, prep_block_status_rehydrate)

            for n in nodes_status:
                if n.id == "n5":
                    n.status = n5_status_rehydrate
                    n.implemented = True
                    n.note = n5_note_rehydrate
            if actions_snapshot:
                actions_snapshot.nodes = nodes_status
    except Exception as e:
        log.warning("Failed to rehydrate follow-up draft snapshot", error=str(e))

    # If no 5A draft was found but 5B prep state exists, still update Node 5 status
    if not followup_draft_snapshot:
        prep_ctx_no5a = ctx.get("node5b_meeting_prep") or {}
        if prep_ctx_no5a:
            prep_block_status_no5a = prep_ctx_no5a.get("status")
            n5_status_no5a, n5_note_no5a = _compute_n5_status(None, prep_block_status_no5a)
            for n in nodes_status:
                if n.id == "n5":
                    n.status = n5_status_no5a
                    n.implemented = True
                    n.note = n5_note_no5a

    return WorkflowRunDetailResponse(
        instance_id=str(workflow_inst.id),
        workflow_name=workflow_inst.workflow_name,
        status=workflow_inst.status,
        current_node=workflow_inst.current_node or "n1",
        conversation_data=capture_data,
        transcript_text=node2_data.get("transcript_text"),
        detected_language=node2_data.get("detected_language"),
        transcription_status=node2_data.get("transcription_status"),
        extraction=extraction_obj,
        central_memory=central_memory_snapshot,
        actions=actions_snapshot,
        followup_draft=followup_draft_snapshot,
        meeting_prep=ctx.get("node5b_meeting_prep"),
        contact_research=ctx.get("contact_research"),
        nodes=nodes_status,
        model_used=node2_data.get("model_used"),
        started_at=workflow_inst.started_at.isoformat() if workflow_inst.started_at else None,
        completed_at=workflow_inst.completed_at.isoformat() if workflow_inst.completed_at else None,
    )


get_meeting_intelligence_run = get_workflow_run_detail


# ── Node 4: Action Generator Endpoint ─────────────────────────────────────────

@router.post("/action-generator", response_model=ActionGeneratorResponse)
async def process_action_generator(
    request: ActionGeneratorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    NODE 4: Action Generator
    Converts conversation intelligence from Node 2 & Node 3 into persistent,
    organization-scoped action items without confusing:
    1. Explicit commitments made by us (our_commitment -> internal pending task)
    2. Explicit commitments made by the contact (contact_commitment -> waiting on contact)
    3. AI-generated recommendations (ai_suggestion -> suggested, not confirmed task)
    4. Unresolved/open questions (open_question -> contextual intelligence)

    Strictly refuses execution if Node 2 or Node 3 has not completed.
    Enforces idempotency, full source traceability, and strict tenant isolation.
    Integrates with the platform Action Center via ApprovalItem.
    """
    start_time = time.perf_counter()
    org_uuid = await _resolve_org_uuid(current_user, db)

    try:
        instance_uuid = uuid.UUID(request.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow instance not found.")

    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access forbidden: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    node2_data = ctx.get("node2_process_conversation")
    if not node2_data or node2_data.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Node 2 (Process Conversation) has not successfully completed for this workflow run. Node 4 requires verified extraction.",
        )

    node3_data = ctx.get("node3_central_memory")
    if not node3_data or node3_data.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Node 3 (Central Memory) has not successfully completed for this workflow run. Node 4 requires persistent relationship memory and resolved contact.",
        )

    contact_id_str = node3_data.get("contact_id")
    if not contact_id_str:
        raise HTTPException(status_code=400, detail="Central Memory contact could not be resolved.")

    try:
        contact_uuid = uuid.UUID(contact_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid contact_id in Central Memory context.")

    stmt_c = select(RelationshipContact).where(
        RelationshipContact.id == contact_uuid,
        RelationshipContact.organization_id == org_uuid,
    )
    res_c = await db.execute(stmt_c)
    contact = res_c.scalars().first()
    if not contact:
        raise HTTPException(status_code=400, detail="Central Memory contact could not be resolved in the current organization.")

    # Retrieve current conversation
    stmt_conv = select(RelationshipConversation).where(
        RelationshipConversation.organization_id == org_uuid,
        RelationshipConversation.workflow_instance_id == instance_uuid,
    )
    res_conv = await db.execute(stmt_conv)
    current_conv = res_conv.scalars().first()
    if not current_conv:
        raise HTTPException(status_code=400, detail="Central Memory conversation could not be resolved for this run.")

    # Check for historical commitments from previous conversations with this contact
    stmt_hist = select(RelationshipMemoryItem).where(
        RelationshipMemoryItem.organization_id == org_uuid,
        RelationshipMemoryItem.contact_id == contact.id,
        RelationshipMemoryItem.category == "commitment",
        RelationshipMemoryItem.conversation_id != current_conv.id,
    ).order_by(RelationshipMemoryItem.source_date.desc(), RelationshipMemoryItem.created_at.desc())
    res_hist = await db.execute(stmt_hist)
    hist_memory_items = list(res_hist.scalars().all())

    historical_commitments: List[GeneratedActionItem] = []
    for h_item in hist_memory_items:
        h_owner_raw = h_item.details.get("owner") if isinstance(h_item.details, dict) else None
        h_due_date = h_item.details.get("due_date") if isinstance(h_item.details, dict) else None
        h_owner_type, h_owner_display = _classify_commitment_owner(h_owner_raw, contact.name, h_item.content)
        historical_commitments.append(
            GeneratedActionItem(
                id=str(h_item.id),
                action_type="our_commitment" if h_owner_type == "internal" else "contact_commitment",
                action=h_item.content,
                owner_type=h_owner_type,
                owner_display=h_owner_display,
                owner=h_owner_raw,
                due_date=h_due_date,
                due_date_display=_format_due_date_display(h_due_date),
                status="historical",
                source="historical_conversation",
                source_title=h_item.details.get("conversation_title") if isinstance(h_item.details, dict) else None,
                source_date=h_item.source_date,
                conversation_id=str(h_item.conversation_id),
                workflow_instance_id=str(h_item.workflow_instance_id),
                provenance={
                    "memory_item_id": str(h_item.id),
                    "is_historical": True,
                },
            )
        )

    # ── 1. Extract Intelligence from Node 2 & Central Memory ──────────────────
    extraction = node2_data.get("extraction") or node2_data.get("structured_extraction") or {}
    raw_commitments = extraction.get("commitments") or extraction.get("agreed_commitments") or []
    raw_suggestions = extraction.get("suggested_actions") or []
    raw_questions = extraction.get("open_questions") or []

    # Fallback to current conversation structured_memory if raw_commitments was empty
    if not raw_commitments and current_conv and isinstance(current_conv.structured_memory, dict):
        raw_commitments = current_conv.structured_memory.get("commitments") or current_conv.structured_memory.get("agreed_commitments") or []

    # Fallback to RelationshipMemoryItem for current_conv if raw_commitments was empty
    if not raw_commitments and current_conv:
        stmt_cur_cmts = select(RelationshipMemoryItem).where(
            RelationshipMemoryItem.conversation_id == current_conv.id,
            RelationshipMemoryItem.category == "commitment",
        )
        cur_mem_rows = (await db.execute(stmt_cur_cmts)).scalars().all()
        raw_commitments = [
            {
                "commitment": r.content,
                "owner": r.details.get("owner") if isinstance(r.details, dict) else None,
                "due_date": r.details.get("due_date") if isinstance(r.details, dict) else None,
            }
            for r in cur_mem_rows
        ]

    # ── Check Idempotency & Load Existing ApprovalItems ───────────────────────
    stmt_appr = select(ApprovalItem).where(
        ApprovalItem.organization_id == org_uuid,
        ApprovalItem.instance_id == instance_uuid,
        ApprovalItem.node_id == "n4",
    )
    res_appr = await db.execute(stmt_appr)
    existing_apprs = list(res_appr.scalars().all())

    existing_by_ref = {
        (appr.payload or {}).get("source_ref"): appr
        for appr in existing_apprs
        if (appr.payload or {}).get("source_ref")
    }
    existing_by_action = {
        ((appr.payload or {}).get("action") or appr.reason or "").strip().lower(): appr
        for appr in existing_apprs
    }

    our_commitments: List[GeneratedActionItem] = []
    contact_commitments: List[GeneratedActionItem] = []
    ai_suggestions: List[GeneratedActionItem] = []
    open_questions: List[GeneratedOpenQuestionItem] = []
    new_approval_items: List[ApprovalItem] = []

    # ── 2. Process Commitments (Our Commitments vs Contact Commitments) ────────
    for idx, cmt in enumerate(raw_commitments):
        action_text = (
            (cmt.get("commitment") if isinstance(cmt, dict) else "")
            or (cmt.get("action") if isinstance(cmt, dict) else "")
            or (cmt.get("content") if isinstance(cmt, dict) else "")
            or (str(cmt) if not isinstance(cmt, dict) else "")
        ).strip()
        if not action_text:
            continue
        owner_raw = (
            (cmt.get("owner") if isinstance(cmt, dict) else None)
            or (cmt.get("owner_display") if isinstance(cmt, dict) else None)
            or (cmt.get("assignee") if isinstance(cmt, dict) else None)
            or ((cmt.get("details", {}).get("owner") if isinstance(cmt.get("details"), dict) else None) if isinstance(cmt, dict) else None)
        )
        due_date = (
            (cmt.get("due_date") if isinstance(cmt, dict) else None)
            or ((cmt.get("details", {}).get("due_date") if isinstance(cmt.get("details"), dict) else None) if isinstance(cmt, dict) else None)
        )
        due_date_display = _format_due_date_display(due_date)

        owner_type, owner_display = _classify_commitment_owner(owner_raw, contact.name, action_text)
        source_ref = f"{instance_uuid}:commitment:{idx}"

        existing_appr = existing_by_ref.get(source_ref) or existing_by_action.get(action_text.lower())
        if existing_appr:
            act_id = str(existing_appr.id)
            p = existing_appr.payload or {}
            item_status = existing_appr.status
            act_due = p.get("due_date") or due_date
            act_due_disp = p.get("due_date_display") or due_date_display
            act_owner = p.get("owner") or owner_raw
            act_owner_disp = p.get("owner_display") or owner_display
            act_owner_type = p.get("owner_type") or owner_type
        else:
            act_id = str(uuid.uuid4())
            item_status = "pending" if owner_type == "internal" else ("waiting" if owner_type == "contact" else "pending_review")
            action_type_val = "our_commitment" if owner_type == "internal" else ("contact_commitment" if owner_type == "contact" else "unknown_commitment")
            reason_text = action_text if owner_type == "internal" else (f"Waiting on {owner_display}: {action_text}" if owner_type == "contact" else f"Unassigned commitment: {action_text}")
            ctx_brief = f"Meeting with {contact.name}: {action_text}" if owner_type == "internal" else (f"Meeting with {contact.name}: Waiting on {owner_display} for {action_text}" if owner_type == "contact" else f"Meeting with {contact.name}: {action_text} (Attribution uncertain: {owner_raw or 'None'})")

            appr = ApprovalItem(
                id=uuid.UUID(act_id),
                organization_id=org_uuid,
                instance_id=instance_uuid,
                node_id="n4",
                review_type="meeting_action",
                reason=reason_text,
                context_brief=ctx_brief,
                status=item_status,
                payload={
                    "workflow_key": "meeting_intelligence_followup",
                    "workflow_name": "meeting_intelligence_followup",
                    "action_type": action_type_val,
                    "action": action_text,
                    "owner_type": owner_type,
                    "owner_display": owner_display,
                    "owner": owner_raw,
                    "due_date": due_date,
                    "due_date_display": due_date_display,
                    "contact_id": str(contact.id),
                    "contact_name": contact.name,
                    "conversation_id": str(current_conv.id),
                    "conversation_title": current_conv.title,
                    "source_date": current_conv.conversation_date,
                    "source_ref": source_ref,
                    "provenance": {
                        "workflow_instance_id": str(instance_uuid),
                        "conversation_id": str(current_conv.id),
                        "source_index": idx,
                    },
                },
                created_at=datetime.utcnow(),
            )
            new_approval_items.append(appr)
            act_due = due_date
            act_due_disp = due_date_display
            act_owner = owner_raw
            act_owner_disp = owner_display
            act_owner_type = owner_type

        action_item_obj = GeneratedActionItem(
            id=act_id,
            approval_id=act_id,
            action_type="our_commitment" if act_owner_type == "internal" else ("contact_commitment" if act_owner_type == "contact" else "unknown_commitment"),
            action=action_text,
            owner_type=act_owner_type,
            owner_display=act_owner_disp,
            owner=act_owner,
            due_date=act_due,
            due_date_display=act_due_disp,
            status=item_status,
            source="current_conversation",
            source_title=current_conv.title,
            source_date=current_conv.conversation_date,
            conversation_id=str(current_conv.id),
            workflow_instance_id=str(instance_uuid),
            provenance={
                "workflow_instance_id": str(instance_uuid),
                "conversation_id": str(current_conv.id),
                "source_ref": source_ref,
            },
        )
        if act_owner_type == "internal":
            our_commitments.append(action_item_obj)
        elif act_owner_type == "contact":
            contact_commitments.append(action_item_obj)
        else:
            contact_commitments.append(action_item_obj)

    # ── 3. Process AI Suggested Actions ───────────────────────────────────────
    for idx, sugg in enumerate(raw_suggestions):
        sugg_action = (
            (sugg.get("action") if isinstance(sugg, dict) else "")
            or (sugg.get("suggestion") if isinstance(sugg, dict) else "")
            or (sugg.get("content") if isinstance(sugg, dict) else "")
            or (str(sugg) if not isinstance(sugg, dict) else "")
        ).strip()
        if not sugg_action:
            continue
        sugg_reason = ((sugg.get("reason") if isinstance(sugg, dict) else "") or "").strip()
        source_ref = f"{instance_uuid}:suggestion:{idx}"

        existing_appr = (
            existing_by_ref.get(source_ref)
            or existing_by_action.get(sugg_action.lower())
            or existing_by_action.get(f"ai suggested: {sugg_action}".lower())
        )
        if existing_appr:
            sugg_id = str(existing_appr.id)
            item_status = existing_appr.status
            p = existing_appr.payload or {}
            sugg_reason = p.get("reason") or sugg_reason
        else:
            sugg_id = str(uuid.uuid4())
            item_status = "suggested"
            appr = ApprovalItem(
                id=uuid.UUID(sugg_id),
                organization_id=org_uuid,
                instance_id=instance_uuid,
                node_id="n4",
                review_type="meeting_action",
                reason=f"AI Suggested: {sugg_action}",
                context_brief=f"Meeting with {contact.name}: AI recommends {sugg_action}",
                status="suggested",
                payload={
                    "workflow_key": "meeting_intelligence_followup",
                    "workflow_name": "meeting_intelligence_followup",
                    "action_type": "ai_suggestion",
                    "action": sugg_action,
                    "reason": sugg_reason,
                    "owner_type": "internal",
                    "owner_display": "AI Suggested",
                    "due_date": None,
                    "due_date_display": "No due date",
                    "contact_id": str(contact.id),
                    "contact_name": contact.name,
                    "conversation_id": str(current_conv.id),
                    "conversation_title": current_conv.title,
                    "source_date": current_conv.conversation_date,
                    "source_ref": source_ref,
                    "provenance": {
                        "workflow_instance_id": str(instance_uuid),
                        "conversation_id": str(current_conv.id),
                        "source_index": idx,
                    },
                },
                created_at=datetime.utcnow(),
            )
            new_approval_items.append(appr)

        ai_suggestions.append(
            GeneratedActionItem(
                id=sugg_id,
                approval_id=sugg_id,
                action_type="ai_suggestion",
                action=sugg_action,
                owner_type="internal",
                owner_display="AI Suggested",
                due_date=None,
                due_date_display="No due date",
                status=item_status,
                reason=sugg_reason,
                source="current_conversation",
                source_title=current_conv.title,
                source_date=current_conv.conversation_date,
                conversation_id=str(current_conv.id),
                workflow_instance_id=str(instance_uuid),
                provenance={
                    "workflow_instance_id": str(instance_uuid),
                    "conversation_id": str(current_conv.id),
                    "source_ref": source_ref,
                },
            )
        )

    # ── 4. Process Open Questions (Preserved Context, Not Tasks) ──────────────
    for idx, q in enumerate(raw_questions):
        q_text = (q if isinstance(q, str) else (q.get("question") if isinstance(q, dict) else str(q))).strip()
        if not q_text:
            continue
        q_id = str(uuid.uuid4())
        open_questions.append(
            GeneratedOpenQuestionItem(
                id=q_id,
                question=q_text,
                source_date=current_conv.conversation_date,
                source_title=current_conv.title,
                workflow_instance_id=str(instance_uuid),
                conversation_id=str(current_conv.id),
                provenance={
                    "workflow_instance_id": str(instance_uuid),
                    "conversation_id": str(current_conv.id),
                    "source_index": idx,
                },
            )
        )

    # ── 5. Persist New ApprovalItems to PostgreSQL ─────────────────────────────
    for appr in new_approval_items:
        db.add(appr)
    if new_approval_items:
        await db.flush()

    duration_ms = int((time.perf_counter() - start_time) * 1000)

    # ── 6. Update WorkflowInstance Context ────────────────────────────────────
    updated_ctx = dict(workflow_inst.context or {})
    updated_ctx["node4_action_generator"] = {
        "status": "completed",
        "generated_at": datetime.utcnow().isoformat(),
        "our_commitments": [a.model_dump() for a in our_commitments],
        "contact_commitments": [a.model_dump() for a in contact_commitments],
        "ai_suggestions": [a.model_dump() for a in ai_suggestions],
        "open_questions": [q.model_dump() for q in open_questions],
    }
    updated_ctx["implemented_nodes"] = ["n1", "n2", "n3", "n4"]
    updated_ctx["pending_nodes"] = ["n5"]
    workflow_inst.context = updated_ctx
    workflow_inst.current_node = "n4"

    # ── 7. Observability: AgentRunRecord & AuditEvent ──────────────────────────
    agent_record = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_uuid,
        node_id="n4",
        agent_capability="action_generation",
        status="completed",
        cost_usd=0.0,
        tokens_in=0,
        tokens_out=0,
        model_used="deterministic_action_classifier",
        duration_ms=duration_ms,
        completed_at=datetime.utcnow(),
        tools_used=["approval_items", "relationship_memory_items"],
    )
    db.add(agent_record)

    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system")),
        action="actions_generated",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "contact_id": str(contact.id),
            "contact_name": contact.name,
            "our_commitments_count": len(our_commitments),
            "contact_commitments_count": len(contact_commitments),
            "ai_suggestions_count": len(ai_suggestions),
            "open_questions_count": len(open_questions),
            "approval_items_created": len(new_approval_items),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)

    await db.commit()

    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note=f"Action items active ({len(our_commitments)} Our Commitments, {len(contact_commitments)} Waiting on Contact)."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status="pending", implemented=False, note="Pending implementation (Email Drafts & Calendar Briefings)."),
    ]

    return ActionGeneratorResponse(
        instance_id=str(instance_uuid),
        workflow_name="meeting_intelligence_followup",
        status="completed",
        current_node="n4",
        contact_id=str(contact.id),
        contact_name=contact.name,
        our_commitments=our_commitments,
        contact_commitments=contact_commitments,
        ai_suggestions=ai_suggestions,
        open_questions=open_questions,
        historical_commitments=historical_commitments,
        nodes=nodes_status,
        message="Action items generated and persisted successfully." if new_approval_items else "Action items retrieved from existing persisted records (Idempotent reuse).",
        idempotent_reused=(len(new_approval_items) == 0),
    )


# ── Node 5A: Follow-up Email Draft + Human Review ─────────────────────────────

def _build_deterministic_followup_draft(
    contact_name: str,
    conv_title: str,
    summary: str,
    our_commitments: List[Dict[str, Any]],
    contact_commitments: List[Dict[str, Any]],
    ai_suggestions: List[Dict[str, Any]],
    open_questions: List[Any],
) -> Dict[str, str]:
    """Fallback generator strictly grounded in extracted commitments without hallucinating details."""
    first_name = contact_name.split()[0] if contact_name else "there"
    subject = f"Follow-up: {conv_title} - Next Steps"

    body_lines = [
        f"Hi {first_name},",
        "",
        f"Thank you for taking the time to discuss {conv_title} today. I appreciated our conversation and sharing ideas.",
    ]
    if summary:
        body_lines.append("")
        body_lines.append(f"To summarize our discussion: {summary.strip()}")

    if our_commitments or contact_commitments:
        body_lines.append("")
        body_lines.append("To confirm our agreed next steps:")
        if our_commitments:
            body_lines.append("")
            body_lines.append("What we will do:")
            for c in our_commitments:
                due = c.get("due_date_display") or c.get("due_date")
                due_str = f" (by {due})" if due else ""
                body_lines.append(f"- {c['action']}{due_str}")
        if contact_commitments:
            body_lines.append("")
            body_lines.append(f"What {contact_name} agreed to provide:")
            for c in contact_commitments:
                due = c.get("due_date_display") or c.get("due_date")
                due_str = f" (by {due})" if due else ""
                body_lines.append(f"- {c['action']}{due_str}")

    if ai_suggestions:
        body_lines.append("")
        body_lines.append("As we plan our next milestone, here are a few suggested items for alignment:")
        for s in ai_suggestions[:2]:
            body_lines.append(f"- {s['action']}")

    body_lines.append("")
    body_lines.append("Looking forward to collaborating with you on this. Please let me know if you would like to adjust any of these items.")
    body_lines.append("")
    body_lines.append("Best regards,")

    return {
        "subject": subject,
        "body": "\n".join(body_lines),
    }


@router.post("/followup-draft", response_model=FollowupDraftResponse)
async def process_followup_draft(
    req: FollowupDraftRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Node 5A: Generate or retrieve follow-up email draft for human review.
    Grounded strictly in conversation transcript, central memory, and Node 4 actions.
    Enforces idempotency, tenant isolation, anti-hallucination, and human-in-the-loop review.
    STRICTLY DOES NOT SEND EMAIL.
    """
    start_time = time.perf_counter()
    org_uuid = await _resolve_org_uuid(current_user, db)
    if not req:
        raise HTTPException(status_code=400, detail="Missing request payload for follow-up draft.")

    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")

    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    node4_data = ctx.get("node4_action_generator") or {}

    # Node 4 must be completed before Node 5A
    if node4_data.get("status") != "completed":
        stmt_chk = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.node_id == "n4",
        )
        r_chk = await db.execute(stmt_chk)
        if not r_chk.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Node 4 (Action Generator) must be completed before generating a follow-up email draft."
            )

    # ── 1. Idempotency Check: Existing Follow-up Draft ─────────────────────────
    stmt_existing = select(ApprovalItem).where(
        ApprovalItem.organization_id == org_uuid,
        ApprovalItem.instance_id == instance_uuid,
        ApprovalItem.review_type == "followup_email_draft",
    ).order_by(ApprovalItem.created_at.desc())
    res_existing = await db.execute(stmt_existing)
    existing_appr = res_existing.scalars().first()

    if existing_appr:
        ep = existing_appr.payload or {}
        draft_item = FollowupDraftItem(
            id=str(existing_appr.id),
            approval_id=str(existing_appr.id),
            instance_id=str(instance_uuid),
            review_type=existing_appr.review_type or "followup_email_draft",
            status=existing_appr.status,
            subject=ep.get("subject", ""),
            body=ep.get("body", ""),
            recipient_name=ep.get("recipient_name", ""),
            recipient_email=ep.get("recipient_email"),
            recipient_email_available=bool(ep.get("recipient_email_available", False)),
            contact_id=ep.get("contact_id"),
            conversation_title=ep.get("conversation_title"),
            our_commitments_count=ep.get("our_commitments_count", 0),
            contact_commitments_count=ep.get("contact_commitments_count", 0),
            ai_suggestions_count=ep.get("ai_suggestions_count", 0),
            open_questions_count=ep.get("open_questions_count", 0),
            original_generated_subject=ep.get("original_generated_subject"),
            original_generated_body=ep.get("original_generated_body"),
            original_subject=ep.get("original_generated_subject") or ep.get("original_subject"),
            original_body=ep.get("original_generated_body") or ep.get("original_body"),
            snoozed_until=ep.get("snoozed_until"),
            snooze_reason=ep.get("snooze_reason"),
            snoozed_reason=ep.get("snooze_reason"),
            sent_at=ep.get("sent_at"),
            sent_to=ep.get("sent_to"),
            provider_message_id=ep.get("provider_message_id"),
            connection_status=ep.get("connection_status"),
            error_message=ep.get("last_send_error"),
            model_used=ep.get("model_used"),
            decided_by=existing_appr.decided_by,
            decided_at=existing_appr.decided_at.isoformat() if existing_appr.decided_at else None,
            created_at=existing_appr.created_at.isoformat() if existing_appr.created_at else None,
            provenance=ep.get("provenance") or {},
        )

        prep_ctx_idemp = ctx.get("node5b_meeting_prep") or {}
        prep_block_status_idemp = prep_ctx_idemp.get("status") if prep_ctx_idemp else None
        n5_status_idemp, n5_note_idemp = _compute_n5_status(existing_appr.status, prep_block_status_idemp)

        nodes_status = [
            PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
            PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
            PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
            PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
            PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status_idemp, implemented=True, note=n5_note_idemp),
        ]

        return FollowupDraftResponse(
            instance_id=str(instance_uuid),
            workflow_name="meeting_intelligence_followup",
            status=existing_appr.status,
            current_node="n5",
            draft=draft_item,
            nodes=nodes_status,
            message="Existing follow-up email draft retrieved from Action Center (Idempotent reuse).",
            idempotent_reused=True,
        )

    # ── 2. Gather Context for New Draft ────────────────────────────────────────
    capture_data = ctx.get("conversation_capture") or workflow_inst.trigger_payload or {}
    node2_data = ctx.get("node2_process_conversation") or {}
    node3_data = ctx.get("node3_central_memory") or {}
    extraction_data = node2_data.get("extraction") or {}

    contact_name = capture_data.get("contact_name") or "Contact"
    conv_title = capture_data.get("conversation_title") or "Meeting"
    conv_date = capture_data.get("conversation_date") or ""
    summary = extraction_data.get("summary") or ""

    # Contact Email Resolution (Strict Anti-Hallucination)
    recipient_email = None
    recipient_email_available = False
    contact_id_str = node3_data.get("contact_id")
    if contact_id_str:
        try:
            stmt_c = select(RelationshipContact).where(RelationshipContact.id == uuid.UUID(contact_id_str))
            res_c = await db.execute(stmt_c)
            contact_entity = res_c.scalars().first()
            if contact_entity:
                c_meta = getattr(contact_entity, "metadata_", {}) or {}
                c_email = getattr(contact_entity, "email", None) or c_meta.get("email") or c_meta.get("primary_email")
                if c_email:
                    recipient_email = str(c_email).strip()
                    recipient_email_available = bool(recipient_email)
        except Exception:
            pass

    if not recipient_email and capture_data.get("contact_email"):
        recipient_email = str(capture_data.get("contact_email")).strip()
        recipient_email_available = bool(recipient_email)

    our_cmts = list(node4_data.get("our_commitments") or [])
    contact_cmts = list(node4_data.get("contact_commitments") or [])
    ai_suggs = list(node4_data.get("ai_suggestions") or [])
    open_q = list(node4_data.get("open_questions") or [])

    if not our_cmts and not contact_cmts and not ai_suggs:
        stmt_a = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.node_id == "n4",
        )
        res_a = await db.execute(stmt_a)
        for it in res_a.scalars().all():
            ip = it.payload or {}
            at = ip.get("action_type")
            act_d = {
                "action": ip.get("action") or it.reason,
                "due_date": ip.get("due_date"),
                "due_date_display": ip.get("due_date_display"),
                "reason": ip.get("reason"),
            }
            if at == "our_commitment":
                our_cmts.append(act_d)
            elif at == "contact_commitment":
                contact_cmts.append(act_d)
            elif at == "ai_suggestion":
                ai_suggs.append(act_d)

    # ── 3. LLM Draft Generation ───────────────────────────────────────────────
    our_cmts_text = "\n".join([f"- {c['action']} (Due: {c.get('due_date_display') or c.get('due_date') or 'No due date'})" for c in our_cmts]) or "None"
    contact_cmts_text = "\n".join([f"- {c['action']} (Due: {c.get('due_date_display') or c.get('due_date') or 'No due date'})" for c in contact_cmts]) or "None"
    ai_suggs_text = "\n".join([f"- {s['action']}: {s.get('reason', '')}" for s in ai_suggs]) or "None"
    open_q_text = "\n".join([f"- {q['question'] if isinstance(q, dict) else str(q)}" for q in open_q]) or "None"

    system_prompt = """You are an executive assistant for SMBFlow generating a concise, professional follow-up email draft following a business meeting.

CRITICAL INSTRUCTIONS:
1. Greet the contact naturally by their first name (or full name if first name is ambiguous).
2. Briefly acknowledge the conversation and its purpose.
3. Summarize the agreed next steps clearly and concisely:
   - Explicitly confirm OUR commitments (what we promised to do and when).
   - Politely acknowledge any CONTACT commitments (what the contact agreed to provide or look into).
4. Strictly distinguish AGREED COMMITMENTS from AI SUGGESTIONS:
   - AGREED COMMITMENTS: These are confirmed promises made by the participants. State them clearly.
   - AI SUGGESTIONS: These are unconfirmed recommendations. You may mention them optionally as polite ideas/proposals for next steps, but NEVER present them as something already agreed to or decided in the meeting.
5. End with a warm, natural sign-off.
6. ABSOLUTE PROHIBITIONS:
   - Do NOT invent email addresses, companies, roles, dates, promises, attachments, or facts not in the context.
   - Do NOT write a generic, fluffy AI essay. Keep it brief, professional, and directly actionable (2-4 short paragraphs maximum).
7. Output STRICT JSON with two keys:
   {
     "subject": "Clear, professional subject line",
     "body": "Complete email body including greeting and sign-off"
   }
"""

    user_prompt = f"""CONTEXT:
- Contact Name: {contact_name}
- Conversation Title: {conv_title}
- Conversation Date: {conv_date}
- Conversation Summary: {summary}

AGREED COMMITMENTS MADE BY US:
{our_cmts_text}

AGREED COMMITMENTS MADE BY CONTACT:
{contact_cmts_text}

UNRESOLVED OPEN QUESTIONS:
{open_q_text}

AI SUGGESTED ACTIONS (UNCONFIRMED - NOT agreed promises):
{ai_suggs_text}

Generate the concise professional follow-up email draft in strict JSON format."""

    draft_subject = ""
    draft_body = ""
    model_used = "deterministic_fallback"
    cost_usd = 0.0
    tokens_in = 0
    tokens_out = 0

    try:
        llm = LLMRouter()
        messages = [
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=user_prompt),
        ]
        raw_resp, record = await llm.call(
            agent_name="drafting_agent",
            messages=messages,
            tier_override="balanced",
        )
        if record:
            model_used = getattr(record, "model", None) or getattr(record, "model_used", None) or "balanced"
            cost_usd = getattr(record, "cost_usd", 0.0) or 0.0
            tokens_in = getattr(record, "tokens_in", 0) or 0
            tokens_out = getattr(record, "tokens_out", 0) or 0

        cleaned = (raw_resp or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        draft_subject = (parsed.get("subject") or "").strip()
        draft_body = (parsed.get("body") or "").strip()
    except Exception as e:
        log.warning("LLM follow-up drafting failed or returned non-JSON; using deterministic grounded generator", error=str(e))

    if not draft_subject or not draft_body:
        det_draft = _build_deterministic_followup_draft(
            contact_name=contact_name,
            conv_title=conv_title,
            summary=summary,
            our_commitments=our_cmts,
            contact_commitments=contact_cmts,
            ai_suggestions=ai_suggs,
            open_questions=open_q,
        )
        draft_subject = draft_subject or det_draft["subject"]
        draft_body = draft_body or det_draft["body"]

    # ── 4. Persist ApprovalItem in PostgreSQL ──────────────────────────────────
    draft_id = uuid.uuid4()
    draft_payload = {
        "subject": draft_subject,
        "body": draft_body,
        "recipient_name": contact_name,
        "recipient_email": recipient_email,
        "recipient_email_available": recipient_email_available,
        "contact_id": contact_id_str,
        "conversation_title": conv_title,
        "conversation_date": conv_date,
        "workflow_key": "meeting_intelligence_followup",
        "our_commitments_count": len(our_cmts),
        "contact_commitments_count": len(contact_cmts),
        "ai_suggestions_count": len(ai_suggs),
        "open_questions_count": len(open_q),
        "original_generated_subject": draft_subject,
        "original_generated_body": draft_body,
        "original_subject": draft_subject,
        "original_body": draft_body,
        "model_used": model_used,
        "provenance": {
            "workflow_instance_id": str(instance_uuid),
            "contact_name": contact_name,
            "our_commitments": our_cmts,
            "contact_commitments": contact_cmts,
            "ai_suggestions": ai_suggs,
        },
    }

    new_appr = ApprovalItem(
        id=draft_id,
        organization_id=org_uuid,
        instance_id=instance_uuid,
        node_id="n5",
        review_type="followup_email_draft",
        status="awaiting_review",
        reason=f"Follow-up email draft for {contact_name} regarding {conv_title}",
        context_brief=f"Draft email based on {conv_title}. Awaiting human review before sending.",
        payload=draft_payload,
        created_at=datetime.utcnow(),
    )
    db.add(new_appr)

    # ── 5. Update WorkflowInstance Context ────────────────────────────────────
    updated_ctx = dict(workflow_inst.context or {})
    updated_ctx["node5_followup_draft"] = {
        "draft_id": str(draft_id),
        "status": "awaiting_review",
        "subject": draft_subject,
        "body": draft_body,
        "recipient_name": contact_name,
        "recipient_email": recipient_email,
        "recipient_email_available": recipient_email_available,
        "contact_id": contact_id_str,
        "generated_at": datetime.utcnow().isoformat(),
        "model_used": model_used,
    }
    workflow_inst.context = updated_ctx
    workflow_inst.current_node = "n5"

    duration_ms = int((time.perf_counter() - start_time) * 1000)

    # ── 6. AgentRunRecord & AuditEvent Observability ──────────────────────────
    agent_record = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_uuid,
        node_id="n5",
        agent_capability="followup_email_drafting",
        status="completed",
        cost_usd=cost_usd,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        model_used=model_used,
        duration_ms=duration_ms,
        completed_at=datetime.utcnow(),
        tools_used=["llm_router", "approval_items"],
    )
    db.add(agent_record)

    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system"))
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="followup_email_draft_generated",
        entity_type="approval_item",
        entity_id=str(draft_id),
        metadata_={
            "workflow_instance_id": str(instance_uuid),
            "contact_name": contact_name,
            "recipient_email": recipient_email,
            "recipient_email_available": recipient_email_available,
            "subject": draft_subject,
            "status": "awaiting_review",
            "model_used": model_used,
            "sending_executed": False,
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)

    await db.commit()

    draft_item = FollowupDraftItem(
        id=str(draft_id),
        approval_id=str(draft_id),
        instance_id=str(instance_uuid),
        review_type="followup_email_draft",
        status="awaiting_review",
        subject=draft_subject,
        body=draft_body,
        recipient_name=contact_name,
        recipient_email=recipient_email,
        recipient_email_available=recipient_email_available,
        contact_id=contact_id_str,
        conversation_title=conv_title,
        our_commitments_count=len(our_cmts),
        contact_commitments_count=len(contact_cmts),
        ai_suggestions_count=len(ai_suggs),
        open_questions_count=len(open_q),
        original_generated_subject=draft_subject,
        original_generated_body=draft_body,
        original_subject=draft_subject,
        original_body=draft_body,
        model_used=model_used,
        created_at=new_appr.created_at.isoformat(),
        provenance=draft_payload["provenance"],
    )

    prep_ctx_new = ctx.get("node5b_meeting_prep") or {}
    prep_block_status_new = prep_ctx_new.get("status") if prep_ctx_new else None
    n5_status_new, n5_note_new = _compute_n5_status("awaiting_review", prep_block_status_new)

    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status_new, implemented=True, note=n5_note_new),
    ]

    return FollowupDraftResponse(
        instance_id=str(instance_uuid),
        workflow_name="meeting_intelligence_followup",
        status="awaiting_review",
        current_node="n5",
        draft=draft_item,
        nodes=nodes_status,
        message="Follow-up email draft generated successfully and awaiting human review in Action Center.",
        idempotent_reused=False,
    )


@router.post("/followup-draft/{draft_id}/action", response_model=FollowupDraftActionResponse)
async def action_followup_draft(
    draft_id: str,
    req: FollowupDraftActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Node 5A: Execute Human-in-the-Loop review actions on a Follow-up Email Draft.
    Supported actions:
    - approve: Explicit user approval to dispatch email via Google Workspace / Gmail connector.
      - Strong double-send protection: idempotent handling for repeated approve calls.
      - Anti-fabrication: blocks sending if recipient email is missing or invalid.
      - Disconnected handling: returns clear connection-required state without crash.
      - Provider failure: keeps draft unsent and safely retryable.
    - edit: Modify subject and body, retaining original text and keeping status awaiting_review.
    - snooze: Mark draft as snoozed with snooze timestamp and reason.
    - discard: Mark draft as discarded.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    action_req = req
    if not action_req:
        raise HTTPException(status_code=400, detail="Missing action request payload.")

    try:
        draft_uuid = uuid.UUID(draft_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid draft_id format.")

    stmt = select(ApprovalItem).where(ApprovalItem.id == draft_uuid).with_for_update()
    res = await db.execute(stmt)
    appr = res.scalars().first()
    if not appr:
        raise HTTPException(status_code=404, detail="Follow-up email draft not found.")

    if appr.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: review draft belongs to another organization.")

    action_type = action_req.action.lower().strip()
    if action_type not in ("approve", "edit", "snooze", "discard"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action_req.action}'. Must be one of: approve, edit, snooze, discard."
        )

    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "human_reviewer"))
    payload = dict(appr.payload or {})
    msg = ""
    is_sent = False
    provider_msg_id = None
    conn_status = None

    if action_type == "approve":
        # ── 1. Idempotency Guard: Double-Send Protection ───────────────────
        if appr.status == "sent" or payload.get("status") == "sent":
            is_sent = True
            provider_msg_id = payload.get("provider_message_id")
            sent_to = payload.get("sent_to") or payload.get("recipient_email")
            msg = f"Follow-up email has already been sent to {sent_to} (Message ID: {provider_msg_id or 'sent'})."
            appr.status = "sent"
        else:
            # ── 2. Check Recipient Email (Strict Anti-Fabrication) ────────
            # If caller supplied a recipient email in request, validate and update payload
            if action_req.recipient_email and action_req.recipient_email.strip():
                req_email = action_req.recipient_email.strip()
                if "@" in req_email and "." in req_email.split("@")[-1]:
                    payload["recipient_email"] = req_email
                    payload["recipient_email_available"] = True

            recipient_email = (payload.get("recipient_email") or "").strip()
            if not recipient_email or "@" not in recipient_email or "." not in recipient_email.split("@")[-1]:
                # Block sending and clearly explain why
                raise HTTPException(
                    status_code=400,
                    detail="Cannot send follow-up email: recipient email address is missing or invalid. Please provide a valid recipient email address before approving."
                )

            # ── 3. Check Google Workspace / Gmail ToolConnection ──────────
            stmt_tools = select(ToolConnection).where(
                ToolConnection.organization_id == org_uuid,
                ToolConnection.tool_name.in_(["gmail", "google_workspace"]),
                ToolConnection.status == "connected",
            )
            res_tools = await db.execute(stmt_tools)
            tool_conns = res_tools.scalars().all()
            g_conn = next((c for c in tool_conns if c.tool_name == "gmail"), None) or (tool_conns[0] if tool_conns else None)

            if not g_conn or not g_conn.encrypted_credentials:
                # Disconnected Google Workspace: do not crash, do not mark as sent, return connection-required state
                appr.status = "connection_required"
                conn_status = "connection_required"
                payload["status"] = "connection_required"
                payload["connection_status"] = "connection_required"
                payload["connection_note"] = "Google Workspace / Gmail is not connected. Connect your Google account in Settings > Integrations to send follow-up emails."
                if action_req.notes:
                    payload["decision_notes"] = action_req.notes
                appr.payload = payload
                msg = "Google Workspace / Gmail account is not connected. Connect your account in Settings > Integrations before sending."
            else:
                # ── 4. Decrypt Credentials & Send Email ───────────────────
                try:
                    creds = decrypt_credentials(g_conn.encrypted_credentials)
                except Exception as dec_err:
                    log.error("Failed to decrypt Gmail credentials", org_id=str(org_uuid), error=str(dec_err))
                    appr.status = "connection_required"
                    conn_status = "connection_required"
                    payload["connection_status"] = "connection_required"
                    payload["connection_note"] = "Stored credentials could not be decrypted. Re-authorization required."
                    appr.payload = payload
                    msg = "Google Workspace connection credential error. Please reconnect in Settings > Integrations."
                else:
                    connector = GmailConnector(
                        credentials=creds,
                        config={**(g_conn.config or {}), "queue_for_approval": False}
                    )
                    try:
                        send_result = await connector.send_email(
                            to=recipient_email,
                            subject=payload.get("subject", ""),
                            body=payload.get("body", ""),
                        )
                        # Extract message ID
                        provider_msg_id = (send_result or {}).get("id") or (send_result or {}).get("message_id") or f"msg_{uuid.uuid4().hex[:12]}"
                        sent_at_iso = datetime.utcnow().isoformat()

                        appr.status = "sent"
                        appr.decided_by = actor_str
                        appr.decided_at = datetime.utcnow()
                        is_sent = True

                        payload["status"] = "sent"
                        payload["sent_at"] = sent_at_iso
                        payload["sent_to"] = recipient_email
                        payload["provider_message_id"] = provider_msg_id
                        payload["approved_at"] = sent_at_iso
                        payload["approved_by"] = actor_str
                        payload["connection_status"] = "connected"
                        payload.pop("last_send_error", None)
                        if action_req.notes:
                            payload["decision_notes"] = action_req.notes
                        appr.payload = payload

                        msg = f"Follow-up email successfully sent to {recipient_email} via Gmail (Message ID: {provider_msg_id})."
                    except Exception as prov_err:
                        # Provider API failure: keep draft safely retryable and unsent
                        log.error("Gmail send failed during approved email dispatch", draft_id=str(draft_uuid), error=str(prov_err))
                        payload["last_send_error"] = str(prov_err)
                        payload["last_send_attempt_at"] = datetime.utcnow().isoformat()
                        appr.payload = payload
                        await db.commit()
                        raise HTTPException(
                            status_code=502,
                            detail=f"Email dispatch failed via Google Workspace / Gmail API: {prov_err}. The draft remains unsent and can be safely retried."
                        )
                    finally:
                        try:
                            await connector.close()
                        except Exception:
                            pass

    elif action_type == "edit":
        if not action_req.subject or not action_req.subject.strip():
            raise HTTPException(status_code=400, detail="Subject cannot be empty for edit action.")
        if not action_req.body or not action_req.body.strip():
            raise HTTPException(status_code=400, detail="Body cannot be empty for edit action.")

        orig_s = payload.get("original_generated_subject") or payload.get("original_subject") or payload.get("subject")
        orig_b = payload.get("original_generated_body") or payload.get("original_body") or payload.get("body")
        payload["original_generated_subject"] = orig_s
        payload["original_generated_body"] = orig_b
        payload["original_subject"] = orig_s
        payload["original_body"] = orig_b

        payload["subject"] = action_req.subject.strip()
        payload["body"] = action_req.body.strip()
        payload["edited_at"] = datetime.utcnow().isoformat()
        payload["edited_by"] = actor_str
        if action_req.recipient_email and action_req.recipient_email.strip():
            req_email = action_req.recipient_email.strip()
            if "@" in req_email:
                payload["recipient_email"] = req_email
                payload["recipient_email_available"] = True
        if action_req.notes:
            payload["edit_notes"] = action_req.notes
        appr.status = "awaiting_review"
        payload["status"] = "awaiting_review"
        msg = "Follow-up email draft updated successfully and remains in review."

    elif action_type == "snooze":
        appr.status = "snoozed"
        appr.decided_by = actor_str
        appr.decided_at = datetime.utcnow()
        snooze_val = action_req.snoozed_until or action_req.snooze_until or "later"
        reason_val = action_req.snooze_reason or action_req.snoozed_reason or action_req.notes
        payload["snoozed_until"] = snooze_val
        payload["snooze_reason"] = reason_val
        payload["snoozed_reason"] = reason_val
        payload["snoozed_at"] = appr.decided_at.isoformat()
        payload["snoozed_by"] = actor_str
        payload["status"] = "snoozed"
        msg = f"Follow-up email draft snoozed ({payload['snoozed_until']})."

    elif action_type == "discard":
        appr.status = "discarded"
        appr.decided_by = actor_str
        appr.decided_at = datetime.utcnow()
        payload["discarded_at"] = appr.decided_at.isoformat()
        payload["discarded_by"] = actor_str
        payload["status"] = "discarded"
        if action_req.notes:
            payload["discard_reason"] = action_req.notes
        msg = "Follow-up email draft discarded."

    appr.payload = payload

    # Synchronize WorkflowInstance context if linked
    prep_block_status = None
    if appr.instance_id:
        stmt_w = select(WorkflowInstance).where(WorkflowInstance.id == appr.instance_id)
        res_w = await db.execute(stmt_w)
        w_inst = res_w.scalars().first()
        if w_inst:
            w_ctx = dict(w_inst.context or {})
            draft_ctx = dict(w_ctx.get("node5_followup_draft") or {})
            draft_ctx["status"] = appr.status
            draft_ctx["subject"] = payload.get("subject")
            draft_ctx["body"] = payload.get("body")
            draft_ctx["updated_at"] = datetime.utcnow().isoformat()
            if is_sent:
                draft_ctx["sent_at"] = payload.get("sent_at")
                draft_ctx["sent_to"] = payload.get("sent_to") or payload.get("recipient_email")
                draft_ctx["provider_message_id"] = payload.get("provider_message_id")
            if conn_status:
                draft_ctx["connection_status"] = conn_status
            if action_type == "snooze":
                draft_ctx["snoozed_until"] = payload.get("snoozed_until")
            w_ctx["node5_followup_draft"] = draft_ctx
            w_inst.context = w_ctx

            prep_ctx = w_ctx.get("node5b_meeting_prep") or {}
            prep_block_status = prep_ctx.get("status") if prep_ctx else None

    # Record AuditEvent for traceability
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="followup_draft_sent" if is_sent else f"followup_draft_{action_type}",
        entity_type="approval_item",
        entity_id=str(draft_id),
        metadata_={
            "workflow_instance_id": str(appr.instance_id) if appr.instance_id else None,
            "action": action_type,
            "status": appr.status,
            "subject": payload.get("subject"),
            "email_sent": is_sent,
            "provider_message_id": payload.get("provider_message_id"),
            "sent_at": payload.get("sent_at"),
            "recipient_email": payload.get("sent_to") or payload.get("recipient_email"),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)

    await db.commit()
    await db.refresh(appr)

    # Optional Redis Pub/Sub broadcast
    try:
        from core.redis_pubsub import pubsub as redis_pubsub
        await redis_pubsub.publish_event("approval_decided", {
            "approval_id": str(appr.id),
            "status": appr.status,
            "action_chosen": action_type,
            "decided_by": appr.decided_by,
            "organization_id": str(appr.organization_id) if appr.organization_id else None,
        })
        await redis_pubsub.publish_event("followup_draft_updated", {
            "draft_id": str(appr.id),
            "instance_id": str(appr.instance_id) if appr.instance_id else None,
            "status": appr.status,
            "action": action_type,
            "decided_by": appr.decided_by,
            "organization_id": str(appr.organization_id) if appr.organization_id else None,
            "provider_message_id": payload.get("provider_message_id"),
            "sent_at": payload.get("sent_at"),
        })
    except Exception:
        pass

    draft_item = FollowupDraftItem(
        id=str(appr.id),
        approval_id=str(appr.id),
        instance_id=str(appr.instance_id) if appr.instance_id else "",
        review_type=appr.review_type or "followup_email_draft",
        status=appr.status,
        subject=payload.get("subject", ""),
        body=payload.get("body", ""),
        recipient_name=payload.get("recipient_name", ""),
        recipient_email=payload.get("recipient_email"),
        recipient_email_available=bool(payload.get("recipient_email_available", False)),
        contact_id=payload.get("contact_id"),
        conversation_title=payload.get("conversation_title"),
        our_commitments_count=payload.get("our_commitments_count", 0),
        contact_commitments_count=payload.get("contact_commitments_count", 0),
        ai_suggestions_count=payload.get("ai_suggestions_count", 0),
        open_questions_count=payload.get("open_questions_count", 0),
        original_generated_subject=payload.get("original_generated_subject"),
        original_generated_body=payload.get("original_generated_body"),
        original_subject=payload.get("original_generated_subject") or payload.get("original_subject"),
        original_body=payload.get("original_generated_body") or payload.get("original_body"),
        snoozed_until=payload.get("snoozed_until"),
        snooze_reason=payload.get("snooze_reason"),
        snoozed_reason=payload.get("snooze_reason"),
        sent_at=payload.get("sent_at"),
        sent_to=payload.get("sent_to"),
        provider_message_id=payload.get("provider_message_id"),
        connection_status=payload.get("connection_status"),
        error_message=payload.get("last_send_error"),
        model_used=payload.get("model_used"),
        decided_by=appr.decided_by,
        decided_at=appr.decided_at.isoformat() if appr.decided_at else None,
        created_at=appr.created_at.isoformat() if appr.created_at else None,
        provenance=payload.get("provenance") or {},
    )

    n5_status, n5_note = _compute_n5_status(appr.status, prep_block_status)

    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status, implemented=True, note=n5_note),
    ]

    return FollowupDraftActionResponse(
        instance_id=str(appr.instance_id) if appr.instance_id else "",
        draft=draft_item,
        status=appr.status,
        action=action_type,
        message=msg,
        nodes=nodes_status,
        sent=is_sent,
        provider_message_id=provider_msg_id,
        connection_status=conn_status or payload.get("connection_status"),
    )
generate_followup_draft = process_followup_draft
handle_followup_draft_action = action_followup_draft


# =============================================================================
# NODE 5B — MEETING PREP BRIEF + PRIVATE CALENDAR PREP BLOCK
# =============================================================================

# ── Node 5B Pydantic Schemas ──────────────────────────────────────────────────

class UpcomingMeetingInput(BaseModel):
    """Upcoming meeting details provided by the user for Node 5B."""
    title: str = Field(..., min_length=1, description="Title of the upcoming meeting")
    start: str = Field(..., description="ISO 8601 meeting start datetime (timezone-aware preferred)")
    end: str = Field(..., description="ISO 8601 meeting end datetime (timezone-aware preferred)")
    timezone: str = Field(default="UTC", description="IANA timezone string e.g. 'America/New_York'")
    source_event_id: Optional[str] = Field(None, description="Source calendar event ID if known")
    calendar_provider: Optional[str] = Field(None, description="Calendar provider e.g. 'google'")


class MeetingPrepRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID")
    meeting: UpcomingMeetingInput


class MeetingPrepCancelRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID")
    reason: Optional[str] = Field(None, description="Optional cancellation reason")


class MeetingPrepRescheduleRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID")
    meeting: UpcomingMeetingInput


class PrepBlockInfo(BaseModel):
    prep_start: str
    prep_end: str
    meeting_start: str
    meeting_end: str
    meeting_title: str
    timezone: str
    event_title: str
    status: str  # scheduled | calendar_connection_required | conflict_review_required | cancelled | pending
    google_event_id: Optional[str] = None
    conflict_metadata: Optional[Dict[str, Any]] = None
    is_private: bool = True


class MeetingPrepBrief(BaseModel):
    contact_name: str
    contact_role: Optional[str] = None
    contact_company: Optional[str] = None
    total_conversations: int = 0
    last_conversation_date: Optional[str] = None
    relationship_snapshot: Dict[str, List[str]] = Field(default_factory=dict)
    recent_conversation_title: Optional[str] = None
    recent_conversation_date: Optional[str] = None
    recent_conversation_summary: Optional[str] = None
    our_outstanding_commitments: List[Dict[str, Any]] = Field(default_factory=list)
    waiting_on_contact: List[Dict[str, Any]] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    ai_suggested_topics: List[Dict[str, str]] = Field(default_factory=list)
    model_used: Optional[str] = None


class MeetingPrepResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str
    current_node: str = "n5"
    brief: MeetingPrepBrief
    prep_block: PrepBlockInfo
    nodes: List[PipelineNodeStatus] = Field(default_factory=list)
    message: str
    idempotent_reused: bool = False


class MeetingPrepCancelResponse(BaseModel):
    instance_id: str
    status: str = "cancelled"
    message: str
    nodes: List[PipelineNodeStatus] = Field(default_factory=list)


# ── Node 5B Helper: datetime parsing / prep-block calculation ─────────────────

def _parse_meeting_dt(dt_str: str, tz_str: str) -> datetime:
    """
    Parse a meeting datetime string into a timezone-aware datetime object.
    Accepts ISO 8601 with or without offset. Falls back to attaching the named
    timezone if no offset is present (naive datetime). Always returns UTC-aware.
    """
    import re as _re
    dt_str = dt_str.strip()

    # Try direct ISO parse with offset (e.g. "2026-10-05T15:00:00+05:30")
    try:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            # Naive — attach UTC (caller should pass tz separately)
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass

    # Try stripping Z suffix
    try:
        clean = dt_str.rstrip("Z")
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass

    raise ValueError(f"Cannot parse meeting datetime: {dt_str!r}")


def _calculate_prep_block(meeting_start_utc: datetime, meeting_end_utc: datetime, tz_str: str) -> tuple[datetime, datetime]:
    """
    Calculate the 30-minute prep block immediately before the meeting start.
    prep_end   = meeting_start
    prep_start = meeting_start - 30 minutes
    Both returned as UTC-aware datetimes.
    """
    prep_end = meeting_start_utc
    prep_start = meeting_start_utc - timedelta(minutes=30)
    return prep_start, prep_end


def _to_iso(dt: datetime) -> str:
    """Format a UTC datetime to ISO 8601 with Z suffix."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_prep_identity(org_uuid: uuid.UUID, instance_uuid: uuid.UUID, source_event_id: Optional[str], meeting_start_iso: str) -> str:
    """
    Build a deterministic idempotency key for a prep block.
    Prefer source_event_id when available; fall back to org+instance+start.
    """
    if source_event_id:
        return f"prep:org={org_uuid}:src_event={source_event_id}"
    clean_start = meeting_start_iso.replace(":", "").replace("-", "")[:15]
    return f"prep:org={org_uuid}:inst={instance_uuid}:start={clean_start}"


# ── Node 5B Helper: Brief generation ─────────────────────────────────────────

def _build_deterministic_meeting_brief(
    contact_name: str,
    contact_role: Optional[str],
    contact_company: Optional[str],
    total_conversations: int,
    last_conv_date: Optional[str],
    recent_title: Optional[str],
    recent_date: Optional[str],
    recent_summary: Optional[str],
    facts: List[str],
    interests: List[str],
    needs: List[str],
    opportunities: List[str],
    our_cmts: List[Dict],
    contact_cmts: List[Dict],
    open_questions: List[str],
    ai_suggestions_raw: List[str],
) -> Dict[str, Any]:
    """
    Deterministic (non-LLM) meeting prep brief builder.
    Used as fallback when LLM is unavailable or returns invalid output.
    """
    ai_topics = [
        {"topic": s, "label": "AI Suggested — Not Previously Agreed"}
        for s in ai_suggestions_raw if s
    ]
    return {
        "brief_source": "deterministic_fallback",
        "relationship_snapshot": {
            "facts": facts,
            "interests": interests,
            "needs": needs,
            "opportunities": opportunities,
        },
        "ai_suggested_topics": ai_topics,
    }


async def _generate_meeting_prep_brief(
    contact: RelationshipContact,
    current_conv: RelationshipConversation,
    org_uuid: uuid.UUID,
    instance_uuid: uuid.UUID,
    db: AsyncSession,
    our_cmts: List[Dict],
    contact_cmts: List[Dict],
    open_questions: List[str],
) -> MeetingPrepBrief:
    """
    Generate a grounded Meeting Prep Brief from Central Memory.
    Uses LLMRouter for AI suggested discussion topics only.
    All relationship facts are sourced strictly from the database — never invented.
    """
    # 1. Pull all memory items for this contact (across all conversations)
    stmt_mem = select(RelationshipMemoryItem).where(
        RelationshipMemoryItem.organization_id == org_uuid,
        RelationshipMemoryItem.contact_id == contact.id,
    ).order_by(RelationshipMemoryItem.source_date.desc(), RelationshipMemoryItem.created_at.desc())
    res_mem = await db.execute(stmt_mem)
    all_memory = list(res_mem.scalars().all())

    facts = [m.content for m in all_memory if m.category == "fact" and not m.is_ai_generated]
    interests = [m.content for m in all_memory if m.category == "interest" and not m.is_ai_generated]
    needs = [m.content for m in all_memory if m.category == "need" and not m.is_ai_generated]
    opportunities = [m.content for m in all_memory if m.category == "opportunity" and not m.is_ai_generated]
    ai_raw_suggestions = [m.content for m in all_memory if m.category == "suggested_action" or (m.category == "interest" and m.is_ai_generated)]

    # 2. Pull all conversations for history metadata
    stmt_convs = select(RelationshipConversation).where(
        RelationshipConversation.organization_id == org_uuid,
        RelationshipConversation.contact_id == contact.id,
    ).order_by(RelationshipConversation.created_at.desc())
    res_convs = await db.execute(stmt_convs)
    all_convs = list(res_convs.scalars().all())

    total_conversations = len(all_convs)
    last_conv_date = None
    for c in all_convs:
        if c.conversation_date:
            last_conv_date = c.conversation_date
            break

    # Recent conversation (most recent — should be current_conv)
    recent_conv = all_convs[0] if all_convs else current_conv
    recent_title = recent_conv.title if recent_conv else None
    recent_date = recent_conv.conversation_date if recent_conv else None
    recent_summary = recent_conv.summary if recent_conv else None

    # 3. Contact metadata (strictly from DB — never fabricated)
    c_meta = getattr(contact, "metadata_", {}) or {}
    contact_role = (contact.role or "").strip() or None
    contact_company = (contact.company or c_meta.get("company") or "").strip() or None

    # 4. Open questions: combine passed-in list with any from memory
    oq_from_memory = [m.content for m in all_memory if m.category == "open_question"]
    all_open_q = list(dict.fromkeys(open_questions + oq_from_memory))  # deduplicate preserving order

    # 5. LLM: AI suggested discussion topics ONLY (clearly labelled)
    model_used = "deterministic_fallback"
    ai_topics: List[Dict[str, str]] = []

    llm_system = """You are a meeting preparation assistant. Based on the provided relationship context, generate 2–4 concise, specific discussion topics to raise in the upcoming meeting.

CRITICAL RULES:
1. Output ONLY a JSON array of objects: [{"topic": "...", "rationale": "..."}]
2. Topics must be grounded in the provided context (interests, needs, opportunities, open questions).
3. Do NOT invent facts, commitments, dates, people, companies, or meeting details.
4. Do NOT repeat explicit commitments — those are listed separately.
5. Label intent: these are suggestions, not confirmed agenda items.
6. Keep each topic to one concise sentence."""

    context_lines = []
    if facts:
        context_lines.append("KNOWN FACTS:\n" + "\n".join(f"- {f}" for f in facts[:5]))
    if interests:
        context_lines.append("INTERESTS:\n" + "\n".join(f"- {i}" for i in interests[:5]))
    if needs:
        context_lines.append("NEEDS / PAIN POINTS:\n" + "\n".join(f"- {n}" for n in needs[:5]))
    if opportunities:
        context_lines.append("OPPORTUNITIES:\n" + "\n".join(f"- {o}" for o in opportunities[:5]))
    if all_open_q:
        context_lines.append("OPEN QUESTIONS:\n" + "\n".join(f"- {q}" for q in all_open_q[:5]))
    if recent_summary:
        context_lines.append(f"LAST CONVERSATION SUMMARY: {recent_summary[:400]}")

    llm_user = f"Contact: {contact.name}\n\n" + "\n\n".join(context_lines) if context_lines else f"Contact: {contact.name}"

    try:
        llm = LLMRouter()
        raw_resp, call_record = await llm.call(
            agent_name="drafting_agent",
            messages=[
                LLMMessage(role="system", content=llm_system),
                LLMMessage(role="user", content=llm_user),
            ],
            tier_override="mini",
        )
        if call_record:
            model_used = getattr(call_record, "model", None) or getattr(call_record, "model_used", None) or "mini"

        cleaned = (raw_resp or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict) and item.get("topic"):
                    ai_topics.append({
                        "topic": str(item["topic"]).strip(),
                        "rationale": str(item.get("rationale") or item.get("reason") or "").strip(),
                        "label": "AI Suggested — Not Previously Agreed",
                    })
    except Exception as llm_err:
        log.warning("LLM meeting prep topics failed, using raw suggestions from memory", error=str(llm_err))
        # Deterministic fallback: use AI suggestions already stored in memory
        for s in ai_raw_suggestions[:4]:
            ai_topics.append({
                "topic": s,
                "rationale": "",
                "label": "AI Suggested — Not Previously Agreed",
            })

    return MeetingPrepBrief(
        contact_name=contact.name,
        contact_role=contact_role,
        contact_company=contact_company,
        total_conversations=total_conversations,
        last_conversation_date=last_conv_date,
        relationship_snapshot={
            "facts": facts,
            "interests": interests,
            "needs": needs,
            "opportunities": opportunities,
        },
        recent_conversation_title=recent_title,
        recent_conversation_date=recent_date,
        recent_conversation_summary=recent_summary,
        our_outstanding_commitments=our_cmts,
        waiting_on_contact=contact_cmts,
        open_questions=all_open_q,
        ai_suggested_topics=ai_topics,
        model_used=model_used,
    )


# ── Node 5B: _compute_n5_status helper ───────────────────────────────────────

def _compute_n5_status(draft_status: Optional[str], prep_block_status: Optional[str]) -> tuple[str, str]:
    """
    Returns (node5_status, node5_note) based on both 5A and 5B state.
    Node 5 is COMPLETED only when 5A is available AND 5B prep block is "scheduled".
    All other combinations yield PARTIAL with a descriptive note.
    """
    # 5A component
    if draft_status == "sent":
        draft_note = "Follow-up Email Sent"
    elif draft_status == "approved":
        draft_note = "Follow-up Draft Approved"
    elif draft_status == "connection_required":
        draft_note = "Follow-up Draft: Google Workspace / Gmail Connection Required"
    elif draft_status == "snoozed":
        draft_note = "Follow-up Draft Snoozed"
    elif draft_status == "discarded":
        draft_note = "Follow-up Draft Discarded"
    elif draft_status in ("awaiting_review", None):
        draft_note = "Follow-up Draft Ready / Awaiting Review"
    else:
        draft_note = f"Follow-up Draft: {draft_status}"

    # 5B component
    if prep_block_status == "scheduled":
        prep_note = "Private Prep Block Scheduled"
    elif prep_block_status == "calendar_connection_required":
        prep_note = "Calendar Connection Required"
    elif prep_block_status == "conflict_review_required":
        prep_note = "Calendar Conflict — Review Required"
    elif prep_block_status == "cancelled":
        prep_note = "Prep Block Cancelled"
    elif prep_block_status == "meeting_details_required" or prep_block_status is None:
        prep_note = "Meeting Prep Pending — Upcoming meeting required"
    else:
        prep_note = f"Meeting Prep: {prep_block_status}"

    # Combined
    n5_note = f"{draft_note} • {prep_note}"

    # COMPLETED: 5A present (any terminal/ready state including sent) AND prep block scheduled
    if prep_block_status == "scheduled" and draft_status in ("sent", "approved", "snoozed", "discarded", "awaiting_review"):
        return "completed", n5_note

    return "partial", n5_note


# ── Node 5B: Main Endpoint ────────────────────────────────────────────────────

@router.post("/meeting-prep", response_model=MeetingPrepResponse)
async def process_meeting_prep(
    req: MeetingPrepRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Node 5B: Meeting Prep Brief + Private Calendar Prep Block.

    1. Validates prerequisite: Node 4 must be completed.
    2. Resolves contact and Central Memory.
    3. Generates a grounded Meeting Prep Brief from stored relationship memory.
    4. Calculates a 30-minute private prep block (prep_start = meeting_start - 30min).
    5. Checks for calendar conflicts in the prep window.
    6. Creates a PRIVATE Google Calendar event if connected; stores intent if not.
    7. Enforces idempotency: repeated calls with same meeting return existing prep block.
    8. Never fabricates contact facts, emails, companies, or meeting details.
    """
    start_time = time.perf_counter()
    org_uuid = await _resolve_org_uuid(current_user, db)
    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system"))

    # 1. Parse and validate instance
    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")
    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}

    # 2. Prerequisite: Node 4 must be complete
    node4_data = ctx.get("node4_action_generator") or {}
    if not node4_data or node4_data.get("status") != "completed":
        # Fallback: check if any n4 approval items exist
        stmt_n4 = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.node_id == "n4",
        ).limit(1)
        res_n4 = await db.execute(stmt_n4)
        if not res_n4.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Node 4 (Action Generator) has not completed for this run. Node 5B requires classified action items.",
            )

    # 3. Resolve contact from Node 3 context
    node3_data = ctx.get("node3_central_memory") or {}
    contact_id_str = node3_data.get("contact_id")
    if not contact_id_str:
        raise HTTPException(status_code=400, detail="Central Memory contact not resolved. Run Node 3 first.")

    try:
        contact_uuid = uuid.UUID(contact_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid contact_id in Central Memory context.")

    stmt_c = select(RelationshipContact).where(
        RelationshipContact.id == contact_uuid,
        RelationshipContact.organization_id == org_uuid,
    )
    res_c = await db.execute(stmt_c)
    contact = res_c.scalars().first()
    if not contact:
        raise HTTPException(status_code=400, detail="Contact not found for this organization.")

    # Current conversation
    stmt_conv = select(RelationshipConversation).where(
        RelationshipConversation.organization_id == org_uuid,
        RelationshipConversation.workflow_instance_id == instance_uuid,
    )
    res_conv = await db.execute(stmt_conv)
    current_conv = res_conv.scalars().first()

    # 4. Parse meeting datetimes and calculate prep block
    meeting_input = req.meeting
    try:
        meeting_start_utc = _parse_meeting_dt(meeting_input.start, meeting_input.timezone)
        meeting_end_utc = _parse_meeting_dt(meeting_input.end, meeting_input.timezone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid meeting datetime: {e}")

    prep_start_utc, prep_end_utc = _calculate_prep_block(meeting_start_utc, meeting_end_utc, meeting_input.timezone)
    prep_start_iso = _to_iso(prep_start_utc)
    prep_end_iso = _to_iso(prep_end_utc)
    meeting_start_iso = _to_iso(meeting_start_utc)
    meeting_end_iso = _to_iso(meeting_end_utc)

    # 5. Build idempotency key
    prep_identity = _build_prep_identity(org_uuid, instance_uuid, meeting_input.source_event_id, meeting_start_iso)

    # 6. Idempotency check — look for existing prep block in context
    existing_prep = ctx.get("node5b_meeting_prep") or {}
    if existing_prep.get("prep_identity") == prep_identity and existing_prep.get("status") not in (None, ""):
        # Return existing — no new LLM call, no new DB write
        existing_brief_data = existing_prep.get("brief") or {}
        brief = MeetingPrepBrief(**existing_brief_data) if existing_brief_data else MeetingPrepBrief(
            contact_name=contact.name,
            model_used="rehydrated",
        )
        prep_block = PrepBlockInfo(
            prep_start=existing_prep.get("prep_start", prep_start_iso),
            prep_end=existing_prep.get("prep_end", prep_end_iso),
            meeting_start=existing_prep.get("meeting_start", meeting_start_iso),
            meeting_end=existing_prep.get("meeting_end", meeting_end_iso),
            meeting_title=existing_prep.get("meeting_title", meeting_input.title),
            timezone=existing_prep.get("timezone", meeting_input.timezone),
            event_title=existing_prep.get("event_title", f"Prep: {meeting_input.title}"),
            status=existing_prep.get("status", "pending"),
            google_event_id=existing_prep.get("google_event_id"),
            conflict_metadata=existing_prep.get("conflict_metadata"),
            is_private=True,
        )

        draft_status = None
        try:
            stmt_d = select(ApprovalItem).where(
                ApprovalItem.organization_id == org_uuid,
                ApprovalItem.instance_id == instance_uuid,
                ApprovalItem.review_type == "followup_email_draft",
            ).order_by(ApprovalItem.created_at.desc())
            res_d = await db.execute(stmt_d)
            ad = res_d.scalars().first()
            if ad:
                draft_status = ad.status
        except Exception:
            pass

        n5_status, n5_note = _compute_n5_status(draft_status, existing_prep.get("status"))
        nodes_status = [
            PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
            PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
            PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
            PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
            PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status, implemented=True, note=n5_note),
        ]
        return MeetingPrepResponse(
            instance_id=str(instance_uuid),
            status=existing_prep.get("status", "pending"),
            brief=brief,
            prep_block=prep_block,
            nodes=nodes_status,
            message="Meeting prep block retrieved (idempotent reuse).",
            idempotent_reused=True,
        )

    # 7. Gather action items for brief
    our_cmts_raw: List[Dict] = list(node4_data.get("our_commitments") or [])
    contact_cmts_raw: List[Dict] = list(node4_data.get("contact_commitments") or [])
    open_q_raw: List = list(node4_data.get("open_questions") or [])

    if not our_cmts_raw and not contact_cmts_raw:
        stmt_a = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.node_id == "n4",
        )
        res_a = await db.execute(stmt_a)
        for it in res_a.scalars().all():
            ip = it.payload or {}
            at = ip.get("action_type")
            act_d = {
                "action": ip.get("action") or it.reason,
                "due_date": ip.get("due_date"),
                "due_date_display": ip.get("due_date_display"),
                "owner_display": ip.get("owner_display"),
            }
            if at == "our_commitment":
                our_cmts_raw.append(act_d)
            elif at == "contact_commitment":
                contact_cmts_raw.append(act_d)

    open_q_strs = [q.get("question") if isinstance(q, dict) else str(q) for q in open_q_raw if q]

    # 8. Generate Meeting Prep Brief from Central Memory
    brief = await _generate_meeting_prep_brief(
        contact=contact,
        current_conv=current_conv,
        org_uuid=org_uuid,
        instance_uuid=instance_uuid,
        db=db,
        our_cmts=our_cmts_raw,
        contact_cmts=contact_cmts_raw,
        open_questions=open_q_strs,
    )

    # 9. Calendar: look up ToolConnection (reuse product_launch pattern)
    stmt_tools = select(ToolConnection).where(
        ToolConnection.organization_id == org_uuid,
        ToolConnection.tool_name.in_(["google_workspace", "google_calendar"]),
    )
    res_tools = await db.execute(stmt_tools)
    g_conn = res_tools.scalars().first()
    calendar_connected = bool(g_conn and g_conn.status == "connected" and g_conn.encrypted_credentials)

    # 10. Conflict detection (only when calendar is connected)
    conflict_metadata = None
    block_status = "calendar_connection_required"
    google_event_id = None

    event_title = f"Prep: {meeting_input.title}" if meeting_input.title else f"Prep: Meeting with {contact.name}"

    if calendar_connected:
        try:
            creds = decrypt_credentials(g_conn.encrypted_credentials)
            connector = GoogleWorkspaceConnector(credentials=creds, config=g_conn.config or {})

            # Read events in the prep window
            existing_events = await connector.read("events", {
                "calendar_id": "primary",
                "limit": 20,
            })

            # Filter for conflicts in the prep window
            conflicting = []
            for ev in (existing_events or []):
                ev_start_raw = (ev.get("start") or {}).get("dateTime") or (ev.get("start") or {}).get("date")
                ev_end_raw = (ev.get("end") or {}).get("dateTime") or (ev.get("end") or {}).get("date")
                ev_id = ev.get("id", "")
                # Skip the source meeting itself
                if meeting_input.source_event_id and ev_id == meeting_input.source_event_id:
                    continue
                if not ev_start_raw or not ev_end_raw:
                    continue
                try:
                    ev_start = _parse_meeting_dt(ev_start_raw, "UTC")
                    ev_end = _parse_meeting_dt(ev_end_raw, "UTC")
                    # Overlap: ev_start < prep_end AND ev_end > prep_start
                    if ev_start < prep_end_utc and ev_end > prep_start_utc:
                        conflicting.append({
                            "event_id": ev_id,
                            "summary": ev.get("summary", "Untitled event"),
                            "start": ev_start_raw,
                            "end": ev_end_raw,
                        })
                except Exception:
                    continue

            if conflicting:
                # Conflict found — do NOT create the prep block automatically
                block_status = "conflict_review_required"
                conflict_metadata = {"conflicting_events": conflicting}
                log.info(
                    "Meeting prep conflict detected",
                    instance_id=str(instance_uuid),
                    conflicts=len(conflicting),
                )
                await connector.close()
            else:
                # No conflict — create the PRIVATE prep block
                try:
                    description = (
                        f"SMBFlow Meeting Preparation Block\n"
                        f"Upcoming meeting: {meeting_input.title}\n"
                        f"Contact: {contact.name}\n"
                        f"Use this time to review your meeting prep brief in SMBFlow."
                    )
                    api_event = await connector.schedule_event(
                        summary=event_title,
                        description=description,
                        start_iso=prep_start_iso,
                        end_iso=prep_end_iso,
                        attendees=[],  # Private — no attendees
                    )
                    google_event_id = api_event.get("id")

                    # Patch visibility to private (schedule_event doesn't expose it)
                    if google_event_id:
                        try:
                            await connector.update_event(
                                event_id=google_event_id,
                                visibility="private",
                            )
                        except Exception as vis_err:
                            log.warning("Could not set prep event visibility to private", error=str(vis_err))

                    block_status = "scheduled"
                    log.info(
                        "Private prep block created on Google Calendar",
                        instance_id=str(instance_uuid),
                        google_event_id=google_event_id,
                        prep_start=prep_start_iso,
                        prep_end=prep_end_iso,
                    )
                except Exception as cal_err:
                    log.warning("Google Calendar create failed, falling back to stored intent", error=str(cal_err))
                    block_status = "calendar_connection_required"
                finally:
                    try:
                        await connector.close()
                    except Exception:
                        pass
        except Exception as outer_err:
            log.warning("Calendar credential resolution failed", error=str(outer_err))
            block_status = "calendar_connection_required"
    else:
        # No calendar connection — persist intent, no external call
        block_status = "calendar_connection_required"

    # 11. Get current draft status for Node 5 note
    draft_status_val = None
    try:
        stmt_d = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.review_type == "followup_email_draft",
        ).order_by(ApprovalItem.created_at.desc())
        res_d = await db.execute(stmt_d)
        ad = res_d.scalars().first()
        if ad:
            draft_status_val = ad.status
    except Exception:
        pass

    # 12. Persist Node 5B state into WorkflowInstance context
    brief_dict = brief.model_dump()
    prep_ctx = {
        "prep_identity": prep_identity,
        "status": block_status,
        "meeting_title": meeting_input.title,
        "meeting_start": meeting_start_iso,
        "meeting_end": meeting_end_iso,
        "timezone": meeting_input.timezone,
        "source_event_id": meeting_input.source_event_id,
        "calendar_provider": meeting_input.calendar_provider,
        "prep_start": prep_start_iso,
        "prep_end": prep_end_iso,
        "event_title": event_title,
        "google_event_id": google_event_id,
        "conflict_metadata": conflict_metadata,
        "brief": brief_dict,
        "generated_at": datetime.utcnow().isoformat(),
        "is_private": True,
    }

    updated_ctx = dict(ctx)
    updated_ctx["node5b_meeting_prep"] = prep_ctx
    workflow_inst.context = updated_ctx
    workflow_inst.current_node = "n5"

    duration_ms = int((time.perf_counter() - start_time) * 1000)

    # 13. AgentRunRecord
    agent_record = AgentRunRecord(
        id=uuid.uuid4(),
        instance_id=instance_uuid,
        node_id="n5b",
        agent_capability="meeting_prep_brief",
        status="completed",
        model_used=brief.model_used or "mini",
        duration_ms=duration_ms,
        completed_at=datetime.utcnow(),
        tools_used=["llm_router", "central_memory", "google_calendar"] if calendar_connected else ["llm_router", "central_memory"],
    )
    db.add(agent_record)

    # 14. AuditEvent
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="meeting_prep_generated",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "contact_name": contact.name,
            "meeting_title": meeting_input.title,
            "prep_start": prep_start_iso,
            "prep_end": prep_end_iso,
            "block_status": block_status,
            "google_event_id": google_event_id,
            "calendar_connected": calendar_connected,
            "conflict_detected": bool(conflict_metadata),
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)

    await db.commit()

    # 15. Optional Redis pub/sub broadcast
    try:
        from core.redis_pubsub import pubsub as redis_pubsub
        await redis_pubsub.publish_event("meeting_prep_created", {
            "instance_id": str(instance_uuid),
            "organization_id": str(org_uuid),
            "status": block_status,
            "contact_name": contact.name,
        })
    except Exception:
        pass

    prep_block = PrepBlockInfo(
        prep_start=prep_start_iso,
        prep_end=prep_end_iso,
        meeting_start=meeting_start_iso,
        meeting_end=meeting_end_iso,
        meeting_title=meeting_input.title,
        timezone=meeting_input.timezone,
        event_title=event_title,
        status=block_status,
        google_event_id=google_event_id,
        conflict_metadata=conflict_metadata,
        is_private=True,
    )

    n5_status, n5_note = _compute_n5_status(draft_status_val, block_status)
    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status, implemented=True, note=n5_note),
    ]

    if block_status == "scheduled":
        msg = f"Meeting prep brief generated and private prep block scheduled on Google Calendar ({prep_start_iso} → {prep_end_iso})."
    elif block_status == "conflict_review_required":
        msg = f"Meeting prep brief generated. Calendar conflict detected in prep window — review required before scheduling."
    else:
        msg = "Meeting prep brief generated and stored. Connect Google Calendar to schedule the private prep block."

    return MeetingPrepResponse(
        instance_id=str(instance_uuid),
        status=block_status,
        brief=brief,
        prep_block=prep_block,
        nodes=nodes_status,
        message=msg,
        idempotent_reused=False,
    )


# ── Node 5B: Reschedule Endpoint ──────────────────────────────────────────────

@router.post("/meeting-prep/reschedule", response_model=MeetingPrepResponse)
async def reschedule_meeting_prep(
    req: MeetingPrepRescheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):

    org_uuid = await _resolve_org_uuid(current_user, db)
    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system"))

    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")
    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    existing_prep = ctx.get("node5b_meeting_prep") or {}
    if not existing_prep:
        raise HTTPException(status_code=400, detail="No existing prep block found for this run. Call /meeting-prep first.")

    node3_data = ctx.get("node3_central_memory") or {}
    contact_id_str = node3_data.get("contact_id")
    contact = None
    if contact_id_str:
        try:
            stmt_c = select(RelationshipContact).where(
                RelationshipContact.id == uuid.UUID(contact_id_str),
                RelationshipContact.organization_id == org_uuid,
            )
            res_c = await db.execute(stmt_c)
            contact = res_c.scalars().first()
        except Exception:
            pass

    contact_name = (contact.name if contact else None) or existing_prep.get("brief", {}).get("contact_name", "Contact")

    # Parse new datetimes
    meeting_input = req.meeting
    try:
        meeting_start_utc = _parse_meeting_dt(meeting_input.start, meeting_input.timezone)
        meeting_end_utc = _parse_meeting_dt(meeting_input.end, meeting_input.timezone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid meeting datetime: {e}")

    prep_start_utc, prep_end_utc = _calculate_prep_block(meeting_start_utc, meeting_end_utc, meeting_input.timezone)
    prep_start_iso = _to_iso(prep_start_utc)
    prep_end_iso = _to_iso(prep_end_utc)
    meeting_start_iso = _to_iso(meeting_start_utc)
    meeting_end_iso = _to_iso(meeting_end_utc)

    old_google_event_id = existing_prep.get("google_event_id")
    event_title = existing_prep.get("event_title") or f"Prep: {meeting_input.title}"
    block_status = existing_prep.get("status", "calendar_connection_required")
    new_google_event_id = old_google_event_id

    # Update existing Google Calendar event if present
    if old_google_event_id:
        stmt_tools = select(ToolConnection).where(
            ToolConnection.organization_id == org_uuid,
            ToolConnection.tool_name.in_(["google_workspace", "google_calendar"]),
        )
        res_tools = await db.execute(stmt_tools)
        g_conn = res_tools.scalars().first()

        if g_conn and g_conn.status == "connected" and g_conn.encrypted_credentials:
            try:
                creds = decrypt_credentials(g_conn.encrypted_credentials)
                connector = GoogleWorkspaceConnector(credentials=creds, config=g_conn.config or {})
                await connector.update_event(
                    event_id=old_google_event_id,
                    start_iso=prep_start_iso,
                    end_iso=prep_end_iso,
                    visibility="private",
                )
                new_google_event_id = old_google_event_id  # Same event, updated
                block_status = "scheduled"
                log.info(
                    "Prep block rescheduled on Google Calendar",
                    event_id=old_google_event_id,
                    new_prep_start=prep_start_iso,
                )
                try:
                    await connector.close()
                except Exception:
                    pass
            except Exception as cal_err:
                log.warning("Google Calendar reschedule failed", error=str(cal_err))
                block_status = "calendar_connection_required"

    # Update context
    updated_prep = dict(existing_prep)
    updated_prep.update({
        "meeting_title": meeting_input.title,
        "meeting_start": meeting_start_iso,
        "meeting_end": meeting_end_iso,
        "timezone": meeting_input.timezone,
        "source_event_id": meeting_input.source_event_id or existing_prep.get("source_event_id"),
        "prep_start": prep_start_iso,
        "prep_end": prep_end_iso,
        "google_event_id": new_google_event_id,
        "status": block_status,
        "rescheduled_at": datetime.utcnow().isoformat(),
        "conflict_metadata": None,
    })
    # Rebuild identity for new time
    updated_prep["prep_identity"] = _build_prep_identity(org_uuid, instance_uuid, meeting_input.source_event_id, meeting_start_iso)

    updated_ctx = dict(ctx)
    updated_ctx["node5b_meeting_prep"] = updated_prep
    workflow_inst.context = updated_ctx

    # AuditEvent
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="meeting_prep_rescheduled",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "old_prep_start": existing_prep.get("prep_start"),
            "new_prep_start": prep_start_iso,
            "google_event_id": new_google_event_id,
            "block_status": block_status,
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)
    await db.commit()

    # Fetch draft status for N5 note
    draft_status_val = None
    try:
        stmt_d = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.review_type == "followup_email_draft",
        ).order_by(ApprovalItem.created_at.desc())
        res_d = await db.execute(stmt_d)
        ad = res_d.scalars().first()
        if ad:
            draft_status_val = ad.status
    except Exception:
        pass

    n5_status, n5_note = _compute_n5_status(draft_status_val, block_status)
    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status, implemented=True, note=n5_note),
    ]

    brief_data = updated_prep.get("brief") or {}
    brief = MeetingPrepBrief(**brief_data) if brief_data else MeetingPrepBrief(contact_name=contact_name, model_used="rehydrated")
    prep_block = PrepBlockInfo(
        prep_start=prep_start_iso,
        prep_end=prep_end_iso,
        meeting_start=meeting_start_iso,
        meeting_end=meeting_end_iso,
        meeting_title=meeting_input.title,
        timezone=meeting_input.timezone,
        event_title=event_title,
        status=block_status,
        google_event_id=new_google_event_id,
        conflict_metadata=None,
        is_private=True,
    )

    return MeetingPrepResponse(
        instance_id=str(instance_uuid),
        status=block_status,
        brief=brief,
        prep_block=prep_block,
        nodes=nodes_status,
        message=f"Prep block rescheduled to {prep_start_iso} → {prep_end_iso}.",
        idempotent_reused=False,
    )


# ── Node 5B: Cancel Endpoint ──────────────────────────────────────────────────

@router.post("/meeting-prep/cancel", response_model=MeetingPrepCancelResponse)
async def cancel_meeting_prep(
    req: MeetingPrepCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Cancel the prep block for a workflow run.
    - Deactivates the prep block in context (status = "cancelled").
    - Deletes the Google Calendar event if one exists.
    - Preserves all relationship memory and conversation history.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system"))

    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")
    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}
    existing_prep = ctx.get("node5b_meeting_prep") or {}
    if not existing_prep:
        raise HTTPException(status_code=404, detail="No prep block found for this workflow run.")

    google_event_id = existing_prep.get("google_event_id")
    calendar_deleted = False

    # Delete external calendar event if present
    if google_event_id:
        stmt_tools = select(ToolConnection).where(
            ToolConnection.organization_id == org_uuid,
            ToolConnection.tool_name.in_(["google_workspace", "google_calendar"]),
        )
        res_tools = await db.execute(stmt_tools)
        g_conn = res_tools.scalars().first()
        if g_conn and g_conn.status == "connected" and g_conn.encrypted_credentials:
            try:
                creds = decrypt_credentials(g_conn.encrypted_credentials)
                connector = GoogleWorkspaceConnector(credentials=creds, config=g_conn.config or {})
                calendar_deleted = await connector.delete_event(event_id=google_event_id)
                log.info("Prep block Google Calendar event deleted", event_id=google_event_id, success=calendar_deleted)
                try:
                    await connector.close()
                except Exception:
                    pass
            except Exception as cal_err:
                log.warning("Google Calendar delete failed during cancel", error=str(cal_err))

    # Update context
    updated_prep = dict(existing_prep)
    updated_prep["status"] = "cancelled"
    updated_prep["cancelled_at"] = datetime.utcnow().isoformat()
    updated_prep["cancelled_by"] = actor_str
    updated_prep["cancel_reason"] = req.reason or ""
    updated_prep["calendar_event_deleted"] = calendar_deleted

    updated_ctx = dict(ctx)
    updated_ctx["node5b_meeting_prep"] = updated_prep
    workflow_inst.context = updated_ctx

    # AuditEvent
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="meeting_prep_cancelled",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "google_event_id": google_event_id,
            "calendar_event_deleted": calendar_deleted,
            "reason": req.reason,
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)
    await db.commit()

    # Node 5 note after cancel
    draft_status_val = None
    try:
        stmt_d = select(ApprovalItem).where(
            ApprovalItem.organization_id == org_uuid,
            ApprovalItem.instance_id == instance_uuid,
            ApprovalItem.review_type == "followup_email_draft",
        ).order_by(ApprovalItem.created_at.desc())
        res_d = await db.execute(stmt_d)
        ad = res_d.scalars().first()
        if ad:
            draft_status_val = ad.status
    except Exception:
        pass

    n5_status, n5_note = _compute_n5_status(draft_status_val, "cancelled")
    nodes_status = [
        PipelineNodeStatus(id="n1", title="Conversation Capture", status="completed", implemented=True, note="Audio recording and metadata preserved successfully."),
        PipelineNodeStatus(id="n2", title="Process Conversation", status="completed", implemented=True, note="Transcription & Entity Extraction completed."),
        PipelineNodeStatus(id="n3", title="Central Memory", status="completed", implemented=True, note="Organization-scoped Relationship Memory persistent in PostgreSQL."),
        PipelineNodeStatus(id="n4", title="Action Generator", status="completed", implemented=True, note="Action items active and persisted in Action Center."),
        PipelineNodeStatus(id="n5", title="Follow-up & Meeting Prep", status=n5_status, implemented=True, note=n5_note),
    ]

    return MeetingPrepCancelResponse(
        instance_id=str(instance_uuid),
        status="cancelled",
        message="Prep block cancelled." + (" Google Calendar event removed." if calendar_deleted else ""),
        nodes=nodes_status,
    )


# =============================================================================
# CONTACT RESEARCH & ENRICHMENT
# Public professional web search for a known contact.
# Enriches Central Memory with sourced public facts.
# =============================================================================

class ContactResearchRequest(BaseModel):
    instance_id: str = Field(..., description="WorkflowInstance ID")
    force_refresh: bool = Field(False, description="Re-run research even if cached results exist")


class ContactResearchResponse(BaseModel):
    instance_id: str
    workflow_name: str = "meeting_intelligence_followup"
    status: str  # completed | research_unavailable | no_results | error | idempotent_reused
    contact_name: str
    company: Optional[str] = None
    role: Optional[str] = None
    provider: str = "none"
    queries_used: List[str] = Field(default_factory=list)
    verified_facts: List[Dict[str, Any]] = Field(default_factory=list)
    uncertain_matches: List[Dict[str, Any]] = Field(default_factory=list)
    ai_talking_points: List[Dict[str, Any]] = Field(default_factory=list)
    retrieved_at: Optional[str] = None
    error: Optional[str] = None
    idempotent_reused: bool = False
    message: str = ""


@router.post("/contact-research", response_model=ContactResearchResponse)
async def run_contact_research(
    req: ContactResearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Public Contact Research & Enrichment for Meeting Intelligence.

    Searches public professional sources for the contact resolved by Node 3
    (Central Memory). Uses Serper.dev Google Search API when SERPER_API_KEY
    is configured; returns status="research_unavailable" otherwise.

    Results are persisted in WorkflowInstance.context["contact_research"] and
    rehydrated by GET /runs/{instance_id}.

    Idempotent: repeated calls return cached results unless force_refresh=True.
    Tenant-isolated: enforces organization_id on every DB access.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "system"))

    # 1. Load and validate workflow instance
    try:
        instance_uuid = uuid.UUID(req.instance_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid instance_id format.")

    stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_uuid)
    res = await db.execute(stmt)
    workflow_inst = res.scalars().first()
    if not workflow_inst:
        raise HTTPException(status_code=404, detail="Workflow run instance not found.")
    if workflow_inst.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: workflow run belongs to another organization.")

    ctx = workflow_inst.context or {}

    # 2. Prerequisite: Node 3 (Central Memory) must have resolved the contact
    node3_data = ctx.get("node3_central_memory") or {}
    contact_id_str = node3_data.get("contact_id")
    if not contact_id_str:
        raise HTTPException(
            status_code=400,
            detail="Node 3 (Central Memory) has not completed for this run. Contact research requires a resolved contact.",
        )

    # 3. Load contact from DB (for name / company / role)
    try:
        contact_uuid = uuid.UUID(contact_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid contact_id in Central Memory context.")

    stmt_c = select(RelationshipContact).where(
        RelationshipContact.id == contact_uuid,
        RelationshipContact.organization_id == org_uuid,
    )
    res_c = await db.execute(stmt_c)
    contact = res_c.scalars().first()
    if not contact:
        raise HTTPException(status_code=400, detail="Contact not found for this organization.")

    contact_name = contact.name
    contact_role = (contact.role or "").strip() or None
    c_meta = getattr(contact, "metadata_", {}) or {}
    contact_company = (contact.company or c_meta.get("company") or "").strip() or None

    # 4. Idempotency check — return cached unless force_refresh
    researcher = ContactResearcher()
    cache_key = researcher.build_cache_key(contact_name, contact_company, contact_role, org_uuid)

    existing_research = ctx.get("contact_research") or {}
    if (
        not req.force_refresh
        and existing_research.get("cache_key") == cache_key
        and existing_research.get("status") in ("completed", "no_results", "research_unavailable")
    ):
        log.info("Contact research: idempotent reuse", instance_id=str(instance_uuid), contact=contact_name)
        return ContactResearchResponse(
            instance_id=str(instance_uuid),
            status=existing_research.get("status", "completed"),
            contact_name=contact_name,
            company=contact_company,
            role=contact_role,
            provider=existing_research.get("provider", "none"),
            queries_used=existing_research.get("queries_used", []),
            verified_facts=existing_research.get("verified_facts", []),
            uncertain_matches=existing_research.get("uncertain_matches", []),
            ai_talking_points=existing_research.get("ai_talking_points", []),
            retrieved_at=existing_research.get("retrieved_at"),
            error=existing_research.get("error"),
            idempotent_reused=True,
            message="Contact research results retrieved from cache.",
        )

    # 5. Build memory summary for talking point context
    existing_memory_summary: Optional[str] = None
    try:
        conv_id_str = node3_data.get("conversation_id")
        if conv_id_str:
            stmt_conv = select(RelationshipConversation).where(
                RelationshipConversation.id == uuid.UUID(conv_id_str)
            )
            res_conv = await db.execute(stmt_conv)
            conv_obj = res_conv.scalars().first()
            if conv_obj and conv_obj.summary:
                existing_memory_summary = conv_obj.summary
    except Exception:
        pass

    # 6. Run research
    log.info("Running contact research", contact=contact_name, company=contact_company, org=str(org_uuid))
    try:
        result = await researcher.research(
            contact_name=contact_name,
            company=contact_company,
            role=contact_role,
            org_uuid=org_uuid,
            existing_memory_summary=existing_memory_summary,
        )
    except Exception as e:
        log.error("ContactResearcher.research raised unexpectedly", error=str(e))
        result = {
            "status": "error",
            "contact_name": contact_name,
            "company": contact_company,
            "role": contact_role,
            "queries_used": [],
            "verified_facts": [],
            "uncertain_matches": [],
            "ai_talking_points": [],
            "retrieved_at": datetime.utcnow().isoformat(),
            "provider": "none",
            "error": str(e),
        }

    # 7. Persist in WorkflowInstance context (tenant-scoped)
    research_ctx = {
        **result,
        "cache_key": cache_key,
        "contact_id": contact_id_str,
        "instance_id": str(instance_uuid),
        "organization_id": str(org_uuid),
        "researched_by": actor_str,
    }
    updated_ctx = dict(ctx)
    updated_ctx["contact_research"] = research_ctx
    workflow_inst.context = updated_ctx

    # 8. AuditEvent
    audit_event = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="contact_research_completed",
        entity_type="workflow_instance",
        entity_id=str(instance_uuid),
        metadata_={
            "contact_name": contact_name,
            "status": result.get("status"),
            "provider": result.get("provider", "none"),
            "verified_facts_count": len(result.get("verified_facts", [])),
            "uncertain_matches_count": len(result.get("uncertain_matches", [])),
            "force_refresh": req.force_refresh,
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_event)
    await db.commit()

    # 9. Build human-readable message
    status = result.get("status", "error")
    if status == "research_unavailable":
        msg = "Research provider not configured. Set SERPER_API_KEY to enable public contact research."
    elif status == "no_results":
        msg = f"No public results found for {contact_name}. Try adding company or role context."
    elif status == "completed":
        n_verified = len(result.get("verified_facts", []))
        n_uncertain = len(result.get("uncertain_matches", []))
        msg = f"Research completed: {n_verified} verified fact(s), {n_uncertain} uncertain match(es) found."
    elif status == "error":
        msg = f"Research failed: {result.get('error', 'Unknown error')}."
    else:
        msg = f"Research status: {status}."

    return ContactResearchResponse(
        instance_id=str(instance_uuid),
        status=status,
        contact_name=contact_name,
        company=contact_company,
        role=contact_role,
        provider=result.get("provider", "none"),
        queries_used=result.get("queries_used", []),
        verified_facts=result.get("verified_facts", []),
        uncertain_matches=result.get("uncertain_matches", []),
        ai_talking_points=result.get("ai_talking_points", []),
        retrieved_at=result.get("retrieved_at"),
        error=result.get("error"),
        idempotent_reused=False,
        message=msg,
    )


# =============================================================================
# Daily Briefing Feature (Meeting Intelligence Operational Roll-up)
# =============================================================================

class DailyBriefingGenerateRequest(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD (defaults to local today)
    force: bool = True


class DailyBriefingConfigResponse(BaseModel):
    enabled: bool = True
    time: str = "08:00"
    timezone: str = "UTC"
    scheduled_time_utc: str = "08:00"
    delivery_channel: str = "dashboard"


class DailyBriefingConfigUpdateRequest(BaseModel):
    enabled: Optional[bool] = True
    time: Optional[str] = "08:00"  # HH:MM
    timezone: Optional[str] = "UTC"
    delivery_channel: Optional[str] = "dashboard"

    @field_validator("time")
    @classmethod
    def validate_time(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
                raise ValueError("time must be in 24-hour HH:MM format (e.g. '08:00', '17:30')")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                import zoneinfo
                zoneinfo.ZoneInfo(v)
            except Exception:
                raise ValueError(f"Invalid IANA timezone: '{v}'")
        return v


class DailyBriefingResponse(BaseModel):
    id: Optional[str] = None
    organization_id: str
    briefing_date: str
    status: str  # "ready" | "generating" | "not_generated" | "error"
    content: Dict[str, Any] = Field(default_factory=dict)
    sections: Dict[str, Any] = Field(default_factory=dict)
    scheduled_time_utc: Optional[str] = None
    generated_at: Optional[str] = None
    generated_by: Optional[str] = None
    error: Optional[str] = None
    config: Optional[DailyBriefingConfigResponse] = None
    message: Optional[str] = None


def _calc_scheduled_utc(time_str: str, tz_name: str) -> str:
    """
    Given local HH:MM (e.g. 08:00) and an IANA timezone (e.g. America/New_York),
    calculate the corresponding UTC HH:MM string.
    """
    if not tz_name or tz_name.upper() == "UTC":
        return time_str
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_name)
        parts = time_str.split(":")
        h, m = int(parts[0]), int(parts[1])
        now_dt = datetime.now(timezone.utc)
        local_dt = datetime(now_dt.year, now_dt.month, now_dt.day, h, m, tzinfo=tz)
        utc_dt = local_dt.astimezone(timezone.utc)
        return utc_dt.strftime("%H:%M")
    except Exception:
        return time_str


@router.get("/daily-briefing", response_model=DailyBriefingResponse)
async def get_daily_briefing(
    date_str: Optional[str] = Query(None, alias="date"),
    generate_if_missing: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Retrieve the Daily Briefing for this organization.
    If no date is provided, defaults to today in the organization's configured timezone.
    If not yet generated and generate_if_missing is True, generates on demand.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)

    # 1. Fetch organization settings for timezone & schedule
    stmt_org = select(Organization).where(Organization.id == org_uuid)
    res_org = await db.execute(stmt_org)
    org = res_org.scalars().first()
    p_cfg = (org.profile_config or {}) if org else {}
    b_cfg = p_cfg.get("daily_briefing_config") or {}

    org_tz = b_cfg.get("timezone", "UTC")
    time_str = b_cfg.get("time", "08:00")
    enabled = b_cfg.get("enabled", True)
    scheduled_utc = b_cfg.get("scheduled_time_utc") or _calc_scheduled_utc(time_str, org_tz)

    cfg_resp = DailyBriefingConfigResponse(
        enabled=enabled,
        time=time_str,
        timezone=org_tz,
        scheduled_time_utc=scheduled_utc,
        delivery_channel=b_cfg.get("delivery_channel", "dashboard"),
    )

    # 2. Determine target briefing date
    if not date_str:
        if not org_tz or org_tz.upper() == "UTC":
            date_str = datetime.now(timezone.utc).date().isoformat()
        else:
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo(org_tz)
                date_str = datetime.now(tz).date().isoformat()
            except Exception:
                date_str = datetime.now(timezone.utc).date().isoformat()

    # 3. Look up existing briefing in DB
    stmt = select(DailyBriefing).where(
        DailyBriefing.organization_id == org_uuid,
        DailyBriefing.briefing_date == date_str,
    )
    res = await db.execute(stmt)
    briefing = res.scalars().first()

    if not briefing and generate_if_missing:
        # Generate on demand
        briefing = await generate_daily_briefing(
            db=db,
            org_uuid=org_uuid,
            briefing_date=date_str,
            generated_by="auto_view",
            scheduled_time_utc=scheduled_utc,
            org_timezone=org_tz,
            force=False,
        )

    if not briefing:
        return DailyBriefingResponse(
            organization_id=str(org_uuid),
            briefing_date=date_str,
            status="not_generated",
            content={},
            scheduled_time_utc=scheduled_utc,
            config=cfg_resp,
            message="No briefing generated for this date yet. Click 'Generate Now' to create one.",
        )

    return DailyBriefingResponse(
        id=str(briefing.id),
        organization_id=str(briefing.organization_id),
        briefing_date=briefing.briefing_date,
        status=briefing.status,
        content=briefing.content or {},
        sections=briefing.content or {},
        scheduled_time_utc=briefing.scheduled_time_utc or scheduled_utc,
        generated_at=briefing.generated_at.isoformat() if briefing.generated_at else None,
        generated_by=(briefing.content or {}).get("generated_by", "manual"),
        error=briefing.error,
        config=cfg_resp,
        message="Daily briefing loaded successfully.",
    )


@router.post("/daily-briefing/generate", response_model=DailyBriefingResponse)
async def generate_daily_briefing_endpoint(
    req: DailyBriefingGenerateRequest = DailyBriefingGenerateRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Manually generate or regenerate the Daily Briefing for this organization.
    Idempotent: updates the existing record if one already exists for this date.
    Never duplicates rows.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)

    # 1. Fetch organization settings for timezone & schedule
    stmt_org = select(Organization).where(Organization.id == org_uuid)
    res_org = await db.execute(stmt_org)
    org = res_org.scalars().first()
    p_cfg = (org.profile_config or {}) if org else {}
    b_cfg = p_cfg.get("daily_briefing_config") or {}

    org_tz = b_cfg.get("timezone", "UTC")
    time_str = b_cfg.get("time", "08:00")
    enabled = b_cfg.get("enabled", True)
    scheduled_utc = b_cfg.get("scheduled_time_utc") or _calc_scheduled_utc(time_str, org_tz)

    cfg_resp = DailyBriefingConfigResponse(
        enabled=enabled,
        time=time_str,
        timezone=org_tz,
        scheduled_time_utc=scheduled_utc,
        delivery_channel=b_cfg.get("delivery_channel", "dashboard"),
    )

    # 2. Determine target briefing date
    target_date = req.date
    if not target_date:
        if not org_tz or org_tz.upper() == "UTC":
            target_date = datetime.now(timezone.utc).date().isoformat()
        else:
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo(org_tz)
                target_date = datetime.now(tz).date().isoformat()
            except Exception:
                target_date = datetime.now(timezone.utc).date().isoformat()

    # 3. Generate or regenerate
    briefing = await generate_daily_briefing(
        db=db,
        org_uuid=org_uuid,
        briefing_date=target_date,
        generated_by="manual",
        scheduled_time_utc=scheduled_utc,
        org_timezone=org_tz,
        force=req.force,
    )

    # 4. Record AuditEvent
    actor_str = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "admin"))
    audit = AuditEvent(
        id=uuid.uuid4(),
        organization_id=org_uuid,
        actor_id=actor_str,
        action="daily_briefing_generated",
        entity_type="daily_briefing",
        entity_id=str(briefing.id),
        metadata_={
            "briefing_date": target_date,
            "status": briefing.status,
            "meetings_count": len((briefing.content or {}).get("meetings_today", [])),
            "commitments_count": len((briefing.content or {}).get("pending_commitments", [])),
            "generated_by": "manual",
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit)
    await db.commit()

    # 5. Broadcast live update via Redis PubSub
    try:
        from core.redis_pubsub import pubsub as redis_pubsub
        await redis_pubsub.publish("daily_briefing_updated", {
            "organization_id": str(org_uuid),
            "briefing_id": str(briefing.id),
            "briefing_date": briefing.briefing_date,
            "status": briefing.status,
        })
    except Exception:
        pass

    return DailyBriefingResponse(
        id=str(briefing.id),
        organization_id=str(briefing.organization_id),
        briefing_date=briefing.briefing_date,
        status=briefing.status,
        content=briefing.content or {},
        sections=briefing.content or {},
        scheduled_time_utc=briefing.scheduled_time_utc or scheduled_utc,
        generated_at=briefing.generated_at.isoformat() if briefing.generated_at else None,
        generated_by="manual",
        error=briefing.error,
        config=cfg_resp,
        message="Daily briefing generated successfully.",
    )


@router.get("/daily-briefing/config", response_model=DailyBriefingConfigResponse)
async def get_daily_briefing_config(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Get the configured Daily Briefing schedule and timezone for this organization.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    stmt = select(Organization).where(Organization.id == org_uuid)
    res = await db.execute(stmt)
    org = res.scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    p_cfg = org.profile_config or {}
    b_cfg = p_cfg.get("daily_briefing_config") or {}

    org_tz = b_cfg.get("timezone", "UTC")
    time_str = b_cfg.get("time", "08:00")
    scheduled_utc = b_cfg.get("scheduled_time_utc") or _calc_scheduled_utc(time_str, org_tz)

    return DailyBriefingConfigResponse(
        enabled=b_cfg.get("enabled", True),
        time=time_str,
        timezone=org_tz,
        scheduled_time_utc=scheduled_utc,
        delivery_channel=b_cfg.get("delivery_channel", "dashboard"),
    )


@router.put("/daily-briefing/config", response_model=DailyBriefingConfigResponse)
async def update_daily_briefing_config(
    req: DailyBriefingConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Update the Daily Briefing delivery time, timezone, and enable/disable state.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    stmt = select(Organization).where(Organization.id == org_uuid)
    res = await db.execute(stmt)
    org = res.scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")

    # Validate time format (HH:MM)
    time_str = (req.time or "08:00").strip()
    if not re.match(r"^(?:[01]\d|2[0-3]):[0-5]\d$", time_str):
        raise HTTPException(
            status_code=400,
            detail="Invalid time format. Must be 24-hour HH:MM (e.g. '08:00', '14:30')."
        )

    # Validate timezone using zoneinfo
    tz_name = (req.timezone or "UTC").strip()
    try:
        import zoneinfo
        _ = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid IANA timezone '{tz_name}'. Examples: 'UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata'."
        )

    scheduled_utc = _calc_scheduled_utc(time_str, tz_name)

    # Persist in profile_config
    p_cfg = dict(org.profile_config or {})
    b_cfg = {
        "enabled": req.enabled if req.enabled is not None else True,
        "time": time_str,
        "timezone": tz_name,
        "scheduled_time_utc": scheduled_utc,
        "delivery_channel": req.delivery_channel or "dashboard",
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "admin")),
    }
    p_cfg["daily_briefing_config"] = b_cfg
    org.profile_config = p_cfg
    await db.commit()
    await db.refresh(org)

    log.info("Daily briefing config updated", org=str(org_uuid), time=time_str, tz=tz_name, utc=scheduled_utc)

    return DailyBriefingConfigResponse(
        enabled=b_cfg["enabled"],
        time=b_cfg["time"],
        timezone=b_cfg["timezone"],
        scheduled_time_utc=scheduled_utc,
        delivery_channel=b_cfg["delivery_channel"],
    )


# =============================================================================
# A. BUSINESS CONTEXT PACK ENDPOINTS
# =============================================================================

class BusinessContextResponse(BaseModel):
    services_offerings: str = ""
    target_market: str = ""
    business_priorities: str = ""
    additional_context: str = ""
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    message: Optional[str] = None


class BusinessContextUpdateRequest(BaseModel):
    services_offerings: Optional[str] = ""
    target_market: Optional[str] = ""
    business_priorities: Optional[str] = ""
    additional_context: Optional[str] = ""


@router.get("/business-context", response_model=BusinessContextResponse)
async def get_business_context_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Retrieve organization-scoped Business Context Pack.
    Safe with empty context. Strict tenant isolation.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    ctx = await get_business_context(db, org_uuid)
    return BusinessContextResponse(**ctx)


@router.put("/business-context", response_model=BusinessContextResponse)
async def update_business_context_endpoint(
    req: BusinessContextUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Update organization-scoped Business Context Pack.
    Persists services/offerings, target market, priorities, and additional context.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    updated_by = str(getattr(current_user, "email", None) or getattr(current_user, "user_id", "admin"))
    updated = await update_business_context(
        db=db,
        org_uuid=org_uuid,
        data=req.dict(),
        updated_by=updated_by,
    )
    return BusinessContextResponse(
        **updated,
        message="Business Context Pack updated successfully.",
    )


# =============================================================================
# B. NATURAL-LANGUAGE CENTRAL MEMORY QUERY ENDPOINTS
# =============================================================================

class MemorySourceReference(BaseModel):
    conversation_id: str
    title: str
    date: Optional[str] = None
    contact_name: Optional[str] = None
    workflow_instance_id: Optional[str] = None


class MemoryItemProvenance(BaseModel):
    item_id: str
    category: str
    content: str
    is_ai_generated: bool = False
    source_conversation_id: str
    source_conversation_title: str
    source_date: Optional[str] = None
    contact_name: Optional[str] = None


class CentralMemoryQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Question over relationship memory")
    contact_name: Optional[str] = None
    contact_id: Optional[str] = None
    use_llm: bool = True


class CentralMemoryQueryResponse(BaseModel):
    query: str
    answer: str
    has_results: bool
    confidence: str = "high"
    sources: List[MemorySourceReference] = Field(default_factory=list)
    cited_items: List[MemoryItemProvenance] = Field(default_factory=list)
    execution_strategy: str = "deterministic"
    matched_contact: Optional[str] = None


@router.post("/central-memory/query", response_model=CentralMemoryQueryResponse)
async def query_central_memory_endpoint(
    req: CentralMemoryQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Ask natural-language questions over stored Central Memory and relationship intelligence.
    Grounded strictly in persisted conversations & memory items with full provenance references.
    Strict tenant isolation: queries only the authenticated user's organization data.
    Read-only: does not mutate or insert database rows.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    result = await query_central_memory(
        db=db,
        org_uuid=org_uuid,
        query_text=req.query,
        contact_name_filter=req.contact_name,
        contact_id_filter=req.contact_id,
        use_llm=req.use_llm,
    )
    return CentralMemoryQueryResponse(**result)


@router.post("/memory/query", response_model=CentralMemoryQueryResponse)
async def query_memory_alias_endpoint(
    req: CentralMemoryQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """Alias for /central-memory/query."""
    return await query_central_memory_endpoint(req=req, db=db, current_user=current_user)


# =============================================================================
# AUTOMATIC CONVERSATION INGESTION & CAPTURE
# =============================================================================

# ── Schemas ──────────────────────────────────────────────────────────────────

class ConversationIngestRequest(BaseModel):
    external_event_id: str = Field(..., min_length=1, description="External provider/webhook event ID for strong idempotency")
    conversation_title: str = Field(..., min_length=1, description="Title or topic of the conversation")
    contact_name: str = Field(..., min_length=1, description="Primary contact or attendee name")
    source: str = Field(default="webhook", description="Ingestion source (e.g. webhook, api, zoom_webhook, google_meet, upload)")
    conversation_type: str = Field(default="Online Meeting", description="Online Meeting, Phone Call, or In-Person Meeting")
    conversation_date: Optional[str] = Field(default=None, description="Date of conversation (YYYY-MM-DD); defaults to today")
    language: str = Field(default="Auto Detect", description="Spoken language")
    recording: Optional[Any] = Field(default=None, description="Audio upload reference data, filename string, or dict")
    audio_url: Optional[str] = Field(default=None, description="External audio recording URL to download and ingest")
    transcript_text: Optional[str] = Field(default=None, description="Pre-transcribed transcript or conversation notes text")
    notes: Optional[str] = Field(default=None, description="Alternative field for notes or conversation transcript")
    auto_process: bool = Field(default=True, description="Whether to execute through Node 2–5 downstream pipeline automatically")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Arbitrary provider metadata or webhook headers")


class ConversationIngestResponse(BaseModel):
    success: bool = True
    ingestion_id: str
    external_event_id: str
    instance_id: Optional[str] = None
    status: str  # "received" | "processing" | "completed" | "failed"
    duplicate: bool = False
    message: str
    conversation_title: str
    contact_name: str
    nodes_executed: Optional[List[str]] = None
    error: Optional[str] = None


class ConversationIngestionItem(BaseModel):
    id: str
    external_event_id: str
    source: str
    status: str
    conversation_title: str
    contact_name: str
    conversation_type: str
    conversation_date: str
    language: str
    instance_id: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int
    received_at: str
    completed_at: Optional[str] = None
    last_attempt_at: Optional[str] = None


class ConversationIngestionListResponse(BaseModel):
    total: int
    items: List[ConversationIngestionItem]
    supported_sources: List[str] = [
        "webhook",
        "api",
        "audio_upload",
        "recording_service",
        "google_meet",
    ]
    unsupported_sources: Dict[str, str] = {
        "teams": "Microsoft Teams Graph API requires Azure AD App and Bot Framework connector (future provider)",
        "zoom_cloud": "Zoom Cloud Recording API requires Zoom App OAuth connector (future provider)",
        "phone_telephony": "Telephony audio streams require Twilio/SIP trunk connector (future provider)",
        "wearables": "Hardware/wearable recorders require Bluetooth/hardware SDK connector (future provider)",
    }


# ── Pipeline Execution Helper ────────────────────────────────────────────────

async def execute_full_meeting_intelligence_pipeline(
    instance_id: uuid.UUID,
    org_uuid: uuid.UUID,
    db: AsyncSession,
    current_user: TokenData,
) -> Dict[str, Any]:
    """
    Feeds an ingested conversation through the existing 5-node Meeting Intelligence pipeline.
    Reuses existing node processing functions directly without duplicating Node 2–5 logic.
    """
    executed_nodes = ["n1"]

    # Node 2: Process Conversation (Transcription + Structured Extraction)
    p2_req = ProcessConversationRequest(instance_id=str(instance_id))
    p2_res = await process_conversation(p2_req, db=db, current_user=current_user)
    executed_nodes.append("n2")

    # Node 3: Central Memory (Deterministic contact resolution & relationship memory indexing)
    p3_req = CentralMemoryRequest(instance_id=str(instance_id))
    p3_res = await process_central_memory(p3_req, db=db, current_user=current_user)
    executed_nodes.append("n3")

    # Node 4: Action Generator (Commitments, waiting items, and AI suggestions)
    p4_req = ActionGeneratorRequest(instance_id=str(instance_id))
    p4_res = await process_action_generator(p4_req, db=db, current_user=current_user)
    executed_nodes.append("n4")

    # Node 5A: Follow-up Email Draft (Grounded draft generation, STRICTLY NO SEND)
    p5_req = FollowupDraftRequest(instance_id=str(instance_id))
    p5_res = await process_followup_draft(p5_req, db=db, current_user=current_user)
    executed_nodes.append("n5a")

    return {
        "executed_nodes": executed_nodes,
        "node2": p2_res,
        "node3": p3_res,
        "node4": p4_res,
        "node5a": p5_res,
    }


# ── Ingestion Core Logic ──────────────────────────────────────────────────────

async def ingest_conversation_core(
    req: ConversationIngestRequest,
    db: AsyncSession,
    current_user: TokenData,
    org_uuid: uuid.UUID,
) -> ConversationIngestResponse:
    """
    Core implementation of automatic conversation ingestion:
    1. Enforces idempotency via (organization_id, external_event_id).
    2. Validates/downloads audio recording reference.
    3. Executes Node 1 (Conversation Capture) and creates canonical WorkflowInstance.
    4. Automatically feeds through downstream pipeline (Nodes 2–5) if auto_process is True.
    5. Persists lifecycle status: received -> processing -> completed/failed.
    """
    ext_id = (req.external_event_id or "").strip()
    if not ext_id:
        raise HTTPException(status_code=400, detail="External event ID is required for conversation ingestion.")

    title = (req.conversation_title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Conversation title is required.")

    contact = (req.contact_name or "").strip()
    if not contact:
        raise HTTPException(status_code=400, detail="Contact name is required.")

    conv_type = req.conversation_type if req.conversation_type in ["Online Meeting", "Phone Call", "In-Person Meeting"] else "Online Meeting"
    conv_date = (req.conversation_date or "").strip() or datetime.utcnow().strftime("%Y-%m-%d")
    lang = req.language or "Auto Detect"

    # 1. Idempotency Check
    stmt = select(ConversationIngestionRecord).where(
        ConversationIngestionRecord.organization_id == org_uuid,
        ConversationIngestionRecord.external_event_id == ext_id,
    )
    res = await db.execute(stmt)
    existing_rec = res.scalars().first()

    if existing_rec:
        if existing_rec.status == "completed":
            log.info("Duplicate completed conversation ingestion ignored", ext_id=ext_id, org_id=str(org_uuid))
            return ConversationIngestResponse(
                success=True,
                ingestion_id=str(existing_rec.id),
                external_event_id=existing_rec.external_event_id,
                instance_id=str(existing_rec.instance_id) if existing_rec.instance_id else None,
                status="completed",
                duplicate=True,
                message="Duplicate event ignored: conversation already ingested and processed.",
                conversation_title=existing_rec.conversation_title,
                contact_name=existing_rec.contact_name,
                nodes_executed=["n1", "n2", "n3", "n4", "n5a"],
            )

        if existing_rec.status == "processing":
            log.info("Duplicate in-flight conversation ingestion ignored", ext_id=ext_id, org_id=str(org_uuid))
            return ConversationIngestResponse(
                success=True,
                ingestion_id=str(existing_rec.id),
                external_event_id=existing_rec.external_event_id,
                instance_id=str(existing_rec.instance_id) if existing_rec.instance_id else None,
                status="processing",
                duplicate=True,
                message="Duplicate event ignored: conversation ingestion is already processing.",
                conversation_title=existing_rec.conversation_title,
                contact_name=existing_rec.contact_name,
            )

        # If failed, treat this call as a retry of the existing record
        record = existing_rec
        record.retry_count = (record.retry_count or 0) + 1
        record.status = "processing"
        record.last_attempt_at = datetime.utcnow()
        record.error_message = None
        await db.commit()
    else:
        # Create fresh record in "processing" state
        record = ConversationIngestionRecord(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            external_event_id=ext_id,
            source=req.source or "webhook",
            status="processing",
            conversation_title=title,
            contact_name=contact,
            conversation_type=conv_type,
            conversation_date=conv_date,
            language=lang,
            recording_data={},
            retry_count=0,
            received_at=datetime.utcnow(),
            last_attempt_at=datetime.utcnow(),
            metadata_=req.metadata or {},
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

    # 2. Audio / Text Validation & Resolution
    transcript_text_val = (req.transcript_text or req.notes or "").strip()
    recording_dict: Optional[Dict[str, Any]] = None

    if isinstance(req.recording, dict) and (req.recording.get("filename") or req.recording.get("file_id") or req.recording.get("stored_path")):
        fn = _sanitize_filename(req.recording.get("filename") or "recording.mp3")
        recording_dict = {
            "file_id": req.recording.get("file_id") or str(uuid.uuid4())[:12],
            "filename": fn,
            "size_bytes": req.recording.get("size_bytes") or 1024,
            "content_type": req.recording.get("content_type") or "audio/mp3",
            "stored_path": req.recording.get("stored_path") or str(STORAGE_DIR / fn).replace("\\", "/"),
        }
    elif isinstance(req.recording, str) and req.recording.strip():
        fn = _sanitize_filename(req.recording.strip())
        recording_dict = {
            "file_id": str(uuid.uuid4())[:12],
            "filename": fn,
            "size_bytes": 1024,
            "content_type": "audio/mp3",
            "stored_path": str(STORAGE_DIR / fn).replace("\\", "/"),
        }
    elif req.audio_url and req.audio_url.strip():
        try:
            url = req.audio_url.strip()
            parsed_fn = os.path.basename(url.split("?")[0]) or "audio_recording.mp3"
            sanitized_fn = _sanitize_filename(parsed_fn)
            file_id = str(uuid.uuid4())[:12]
            stored_fn = f"{file_id}_{sanitized_fn}"
            target_path = STORAGE_DIR / stored_fn

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url)
                if resp.status_code == 200 and resp.content:
                    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
                    async with aiofiles.open(target_path, "wb") as f:
                        await f.write(resp.content)
                    recording_dict = {
                        "file_id": file_id,
                        "filename": sanitized_fn,
                        "size_bytes": len(resp.content),
                        "content_type": resp.headers.get("content-type") or "audio/mp3",
                        "stored_path": str(target_path).replace("\\", "/"),
                        "source_url": url,
                    }
                else:
                    raise ValueError(f"HTTP {resp.status_code} while fetching audio from {url}")
        except Exception as dl_err:
            log.warning("Failed to download audio from audio_url", error=str(dl_err), url=req.audio_url)
            record.status = "failed"
            record.error_message = f"Could not download audio from audio_url '{req.audio_url}': {str(dl_err)}"
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=record.error_message,
            )
    elif transcript_text_val:
        # Pre-transcribed conversation or meeting notes payload
        notes_id = str(uuid.uuid4())[:12]
        recording_dict = {
            "file_id": f"text_{notes_id}",
            "filename": "conversation_transcript.txt",
            "size_bytes": len(transcript_text_val.encode("utf-8")),
            "content_type": "text/plain",
            "type": "transcript_notes",
        }

    if not recording_dict:
        record.status = "failed"
        record.error_message = "Missing or invalid audio recording reference: valid recording object, audio_url, or transcript_text is required."
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail=record.error_message,
        )

    # 3. Node 1: Create or Reuse Canonical WorkflowInstance
    if record.instance_id:
        stmt_inst = select(WorkflowInstance).where(WorkflowInstance.id == record.instance_id)
        r_inst = await db.execute(stmt_inst)
        workflow_inst = r_inst.scalars().first()
    else:
        workflow_inst = None

    if not workflow_inst:
        instance_id = uuid.uuid4()
        captured_data = {
            "conversation_title": title,
            "contact_name": contact,
            "conversation_type": conv_type,
            "recording": recording_dict,
            "language": lang,
            "conversation_date": conv_date,
            "captured_at": datetime.utcnow().isoformat(),
            "external_event_id": ext_id,
            "ingestion_source": record.source,
            "transcript_text": transcript_text_val if transcript_text_val else None,
        }

        workflow_inst = WorkflowInstance(
            id=instance_id,
            organization_id=org_uuid,
            workflow_name="meeting_intelligence_followup",
            status="capture_completed",
            current_node="n1",
            trigger_payload={
                "source": f"auto_ingestion_{record.source}",
                **captured_data,
            },
            context={
                "conversation_capture": captured_data,
                "implemented_nodes": ["n1"],
                "pending_nodes": ["n2", "n3", "n4", "n5"],
            },
            started_at=datetime.utcnow(),
        )
        db.add(workflow_inst)

        node1_run = AgentRunRecord(
            id=uuid.uuid4(),
            instance_id=instance_id,
            node_id="n1",
            agent_capability="conversation_capture",
            status="completed",
            duration_ms=45,
            tools_used=["auto_ingest_audio"],
            completed_at=datetime.utcnow(),
        )
        db.add(node1_run)

        audit_evt = AuditEvent(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            actor_id=str(getattr(current_user, "email", "auto_ingest")),
            action="conversation_auto_ingested",
            entity_type="workflow_instance",
            entity_id=str(instance_id),
            metadata_={
                "workflow": "meeting_intelligence_followup",
                "conversation_title": title,
                "contact_name": contact,
                "external_event_id": ext_id,
                "source": record.source,
            },
        )
        db.add(audit_evt)

        record.instance_id = instance_id
        record.recording_data = recording_dict
        await db.commit()
        await db.refresh(record)

    # 4. Downstream Pipeline Execution (Nodes 2–5)
    if req.auto_process:
        try:
            pipe_res = await execute_full_meeting_intelligence_pipeline(
                instance_id=record.instance_id,
                org_uuid=org_uuid,
                db=db,
                current_user=current_user,
            )
            record.status = "completed"
            record.completed_at = datetime.utcnow()
            record.error_message = None
            await db.commit()

            return ConversationIngestResponse(
                success=True,
                ingestion_id=str(record.id),
                external_event_id=record.external_event_id,
                instance_id=str(record.instance_id),
                status="completed",
                duplicate=False,
                message="Conversation successfully ingested and processed through Nodes 1–5.",
                conversation_title=record.conversation_title,
                contact_name=record.contact_name,
                nodes_executed=pipe_res.get("executed_nodes", ["n1", "n2", "n3", "n4", "n5a"]),
            )
        except Exception as pipe_err:
            log.error("Automatic ingestion pipeline failed", error=str(pipe_err), instance_id=str(record.instance_id))
            record.status = "failed"
            record.error_message = str(pipe_err)
            await db.commit()
            raise HTTPException(
                status_code=502,
                detail=f"Automatic conversation ingestion pipeline failed: {str(pipe_err)}. Ingestion is recorded as failed and retryable.",
            )

    # If auto_process is False, Node 1 is captured and saved
    record.status = "completed"
    record.completed_at = datetime.utcnow()
    record.error_message = None
    await db.commit()

    return ConversationIngestResponse(
        success=True,
        ingestion_id=str(record.id),
        external_event_id=record.external_event_id,
        instance_id=str(record.instance_id),
        status="capture_completed",
        duplicate=False,
        message="Conversation captured and preserved successfully. Downstream processing pending.",
        conversation_title=record.conversation_title,
        contact_name=record.contact_name,
        nodes_executed=["n1"],
    )


# ── Ingestion Endpoints ───────────────────────────────────────────────────────

@router.post("/ingest", response_model=ConversationIngestResponse)
async def ingest_conversation(
    req: ConversationIngestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Automatic Conversation Ingestion API:
    Ingests an external recording event into the Meeting Intelligence workflow.
    Validates audio reference, enforces strict idempotency by external_event_id,
    creates canonical Node 1 run, and automatically triggers Nodes 2–5.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    return await ingest_conversation_core(
        req=req,
        db=db,
        current_user=current_user,
        org_uuid=org_uuid,
    )


@router.post("/webhook/{tenant_id}", response_model=ConversationIngestResponse)
async def ingest_conversation_webhook(
    tenant_id: str,
    req: ConversationIngestRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Inbound Webhook Endpoint for external meeting recorders and platforms.
    Resolves tenant, validates payload, and executes automatic ingestion pipeline.
    """
    org = None
    try:
        t_uuid = uuid.UUID(tenant_id)
        stmt = select(Organization).where(Organization.id == t_uuid)
        r = await db.execute(stmt)
        org = r.scalars().first()
    except (ValueError, TypeError):
        pass

    if not org:
        stmt = select(Organization).where(Organization.name == tenant_id)
        r = await db.execute(stmt)
        org = r.scalars().first()

    if not org:
        raise HTTPException(status_code=404, detail=f"Organization / tenant '{tenant_id}' not found.")

    webhook_user = TokenData(
        user_id="webhook",
        email=f"webhook@{org.name.lower().replace(' ', '-')}.local",
        role="org_admin",
        organization_id=str(org.id),
        tenant_id=str(org.id),
    )

    return await ingest_conversation_core(
        req=req,
        db=db,
        current_user=webhook_user,
        org_uuid=org.id,
    )


@router.get("/ingestions", response_model=ConversationIngestionListResponse)
async def list_conversation_ingestions(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """List recent automatic conversation ingestions for the current organization."""
    org_uuid = await _resolve_org_uuid(current_user, db)
    stmt = (
        select(ConversationIngestionRecord)
        .where(ConversationIngestionRecord.organization_id == org_uuid)
        .order_by(ConversationIngestionRecord.received_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    records = list(res.scalars().all())

    items = [
        ConversationIngestionItem(
            id=str(r.id),
            external_event_id=r.external_event_id,
            source=r.source,
            status=r.status,
            conversation_title=r.conversation_title,
            contact_name=r.contact_name,
            conversation_type=r.conversation_type,
            conversation_date=r.conversation_date,
            language=r.language,
            instance_id=str(r.instance_id) if r.instance_id else None,
            error_message=r.error_message,
            retry_count=r.retry_count,
            received_at=r.received_at.isoformat() if r.received_at else "",
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
            last_attempt_at=r.last_attempt_at.isoformat() if r.last_attempt_at else None,
        )
        for r in records
    ]

    return ConversationIngestionListResponse(
        total=len(items),
        items=items,
    )


@router.get("/ingestions/{ingestion_id}", response_model=ConversationIngestionItem)
async def get_conversation_ingestion(
    ingestion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """Retrieve status and details of a specific conversation ingestion record."""
    org_uuid = await _resolve_org_uuid(current_user, db)
    try:
        ingest_uuid = uuid.UUID(ingestion_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ingestion_id format.")

    stmt = select(ConversationIngestionRecord).where(ConversationIngestionRecord.id == ingest_uuid)
    res = await db.execute(stmt)
    record = res.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Ingestion record not found.")

    if record.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: ingestion record belongs to another organization.")

    return ConversationIngestionItem(
        id=str(record.id),
        external_event_id=record.external_event_id,
        source=record.source,
        status=record.status,
        conversation_title=record.conversation_title,
        contact_name=record.contact_name,
        conversation_type=record.conversation_type,
        conversation_date=record.conversation_date,
        language=record.language,
        instance_id=str(record.instance_id) if record.instance_id else None,
        error_message=record.error_message,
        retry_count=record.retry_count,
        received_at=record.received_at.isoformat() if record.received_at else "",
        completed_at=record.completed_at.isoformat() if record.completed_at else None,
        last_attempt_at=record.last_attempt_at.isoformat() if record.last_attempt_at else None,
    )


@router.post("/ingestions/{ingestion_id}/retry", response_model=ConversationIngestResponse)
async def retry_conversation_ingestion(
    ingestion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_any_auth),
):
    """
    Retry a failed conversation ingestion.
    Reuses existing WorkflowInstance and re-runs downstream pipeline without duplication.
    """
    org_uuid = await _resolve_org_uuid(current_user, db)
    try:
        ingest_uuid = uuid.UUID(ingestion_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ingestion_id format.")

    stmt = select(ConversationIngestionRecord).where(ConversationIngestionRecord.id == ingest_uuid)
    res = await db.execute(stmt)
    record = res.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Ingestion record not found.")

    if record.organization_id != org_uuid:
        raise HTTPException(status_code=403, detail="Access denied: ingestion record belongs to another organization.")

    if record.status == "completed":
        return ConversationIngestResponse(
            success=True,
            ingestion_id=str(record.id),
            external_event_id=record.external_event_id,
            instance_id=str(record.instance_id),
            status="completed",
            duplicate=True,
            message="Ingestion already completed successfully.",
            conversation_title=record.conversation_title,
            contact_name=record.contact_name,
        )

    # Retry downstream pipeline
    record.status = "processing"
    record.retry_count = (record.retry_count or 0) + 1
    record.last_attempt_at = datetime.utcnow()
    await db.commit()

    try:
        pipe_res = await execute_full_meeting_intelligence_pipeline(
            instance_id=record.instance_id,
            org_uuid=org_uuid,
            db=db,
            current_user=current_user,
        )
        record.status = "completed"
        record.completed_at = datetime.utcnow()
        record.error_message = None
        await db.commit()

        return ConversationIngestResponse(
            success=True,
            ingestion_id=str(record.id),
            external_event_id=record.external_event_id,
            instance_id=str(record.instance_id),
            status="completed",
            duplicate=False,
            message="Ingestion retry succeeded: processed through Nodes 1–5.",
            conversation_title=record.conversation_title,
            contact_name=record.contact_name,
            nodes_executed=pipe_res.get("executed_nodes"),
        )
    except Exception as retry_err:
        record.status = "failed"
        record.error_message = str(retry_err)
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Retry failed: {str(retry_err)}. Ingestion remains failed and retryable.",
        )


# Aliases
automatic_conversation_ingest = ingest_conversation
webhook_conversation_ingest = ingest_conversation_webhook



