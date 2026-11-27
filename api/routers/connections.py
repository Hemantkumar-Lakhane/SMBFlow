"""
api/routers/connections.py
===========================
First-Class Tool Connections API router.
Manages tool integration lifecycle: Connect, Disconnect, Test Connection, Configuration, Capabilities.
Enforces multi-tenant isolation and secure MultiFernet credential vault encryption.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps.auth import TokenData, require_authenticated_user
from api.dependencies import get_db
from core.redis_cache import cache as redis_cache
from integrations.key_vault import encrypt_credentials, decrypt_credentials, mask_credentials
from integrations.connectors import (
    GmailConnector, GoogleWorkspaceConnector, HubSpotConnector, SlackConnector, StripeConnector, GenericRESTConnector
)

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/connections", tags=["Tool Connections"])

AVAILABLE_CONNECTORS = [
    # ── Google Workspace ──────────────────────────────────────────────────────
    {
        "tool_name": "gmail",
        "display_name": "Gmail",
        "category": "Google Workspace",
        "description": "Search, read, draft, and send emails in Gmail.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["gmail.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Triage inbound customer emails and summarize action items",
            "Draft AI-generated follow-up replies for human approval",
            "Extract invoice or lead details from incoming threads",
        ],
        "required_fields": [],
        "config_fields": ["sender_alias", "sender_name", "queue_for_approval"],
        "capabilities": [
            {"id": "gmail.read_inbox", "name": "Read Inbox", "desc": "Read incoming inquiries and emails", "risk": "low"},
            {"id": "gmail.search_messages", "name": "Search Messages", "desc": "Search email threads and history", "risk": "low"},
            {"id": "gmail.create_draft", "name": "Create Drafts", "desc": "Prepare email drafts for review", "risk": "low"},
            {"id": "gmail.send_message", "name": "Send Messages", "desc": "Send outbound emails (Requires Approval)", "risk": "high", "requires_hitl": True},
        ],
    },
    {
        "tool_name": "google_calendar",
        "display_name": "Google Calendar",
        "category": "Google Workspace",
        "description": "Check availability, schedule events, and manage reminders.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Find open slots and book qualified sales demo calls",
            "Schedule patient or client appointment reminders",
            "Sync launch sprint milestones to team calendars",
        ],
        "required_fields": [],
        "config_fields": ["default_calendar_id"],
        "capabilities": [
            {"id": "calendar.read", "name": "Read Availability", "desc": "Check busy/free slots and upcoming events", "risk": "low"},
            {"id": "calendar.create", "name": "Schedule Events", "desc": "Create and update calendar events", "risk": "medium"},
        ],
    },
    {
        "tool_name": "google_drive",
        "display_name": "Google Drive",
        "category": "Google Workspace",
        "description": "Search, upload, download, and share files.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Index intake documents and contracts for workflow extraction",
            "Archive generated reports and case briefs in shared folders",
            "Retrieve client assets for campaign orchestration",
        ],
        "required_fields": [],
        "config_fields": ["default_folder_id"],
        "capabilities": [
            {"id": "drive.read", "name": "Read Drive Files", "desc": "Search and download files from Google Drive", "risk": "low"},
            {"id": "drive.write", "name": "Upload Files", "desc": "Save generated reports and assets to Drive", "risk": "low"},
        ],
    },
    {
        "tool_name": "google_docs",
        "display_name": "Google Docs",
        "category": "Google Workspace",
        "description": "Read, draft, and edit docs.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["docs.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Summarize this case brief and list open action items",
            "Draft an investor or partnership update from weekly metrics",
            "Generate a structured SOP or onboarding guide in Docs",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "docs.read", "name": "Read Documents", "desc": "Extract text and structure from Google Docs", "risk": "low"},
            {"id": "docs.write", "name": "Create & Edit Docs", "desc": "Draft and update Google Docs", "risk": "medium"},
        ],
    },
    {
        "tool_name": "google_sheets",
        "display_name": "Google Sheets",
        "category": "Google Workspace",
        "description": "Read, write, and format spreadsheets.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["sheets.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Log qualified leads and deal scores into a tracking sheet",
            "Read expense rows and flag policy anomalies",
            "Update inventory health and churn risk tables automatically",
        ],
        "required_fields": [],
        "config_fields": ["default_spreadsheet_id"],
        "capabilities": [
            {"id": "sheets.read", "name": "Read Spreadsheets", "desc": "Read rows and ranges from Google Sheets", "risk": "low"},
            {"id": "sheets.write", "name": "Update Spreadsheets", "desc": "Append and update spreadsheet rows", "risk": "medium"},
        ],
    },
    {
        "tool_name": "google_slides",
        "display_name": "Google Slides",
        "category": "Google Workspace",
        "description": "Read, edit, and export presentations.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["slides.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/presentations",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Repurpose customer case studies into sales pitch decks",
            "Update quarterly board slides with live pipeline metrics",
            "Extract talking points and notes from existing decks",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "slides.read", "name": "Read Presentations", "desc": "Read slide text and speaker notes", "risk": "low"},
            {"id": "slides.write", "name": "Edit Presentations", "desc": "Create and update presentation slides", "risk": "medium"},
        ],
    },
    {
        "tool_name": "google_meet",
        "display_name": "Google Meet",
        "category": "Google Workspace",
        "description": "Capture meeting spaces, transcripts, and follow-up summaries.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["meet.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/meetings.space.readonly",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Capture meeting transcripts and extract action items",
            "Generate follow-up emails after client discovery calls",
            "Sync meeting intelligence directly to CRM deals",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "meet.read", "name": "Read Meeting Spaces", "desc": "Access Google Meet conference records", "risk": "low"},
            {"id": "meet.transcript.read", "name": "Read Transcripts", "desc": "Fetch meeting transcripts and recordings", "risk": "low"},
        ],
    },
    {
        "tool_name": "google_tasks",
        "display_name": "Google Tasks",
        "category": "Google Workspace",
        "description": "Create, track, and complete follow-up tasks and checklists.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["tasks.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Convert email action items into tracked Google Tasks",
            "Assign follow-up reminders after client onboarding calls",
            "Sync daily SLA checklists with workspace owners",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "tasks.read", "name": "Read Tasks", "desc": "List task lists and pending action items", "risk": "low"},
            {"id": "tasks.write", "name": "Manage Tasks", "desc": "Create and complete tasks", "risk": "low"},
        ],
    },
    {
        "tool_name": "google_contacts",
        "display_name": "Google Contacts",
        "category": "Google Workspace",
        "description": "Look up client contacts, emails, and organization details.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["people.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/contacts.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Enrich inbound leads with existing Google Contacts context",
            "Resolve recipient names and phone numbers before outreach",
            "Check stakeholder details for account-based campaigns",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "contacts.read", "name": "Read Contacts", "desc": "Search and read Google Contacts directory", "risk": "low"},
        ],
    },
    {
        "tool_name": "google_forms",
        "display_name": "Google Forms",
        "category": "Google Workspace",
        "description": "Read intake forms, surveys, and client questionnaire responses.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["forms.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/forms.responses.readonly",
            "https://www.googleapis.com/auth/forms.body.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Triage new patient or client intake form submissions",
            "Extract structured answers from onboarding questionnaires",
            "Route qualified survey leads to sales workflows",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "forms.read", "name": "Read Forms & Responses", "desc": "Fetch form structure and submissions", "risk": "low"},
        ],
    },
    {
        "tool_name": "youtube",
        "display_name": "YouTube",
        "category": "Google Workspace",
        "description": "Access channel videos, analytics, and content metadata.",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Repurpose YouTube videos into social and blog campaigns",
            "Monitor channel growth metrics for weekly founder briefs",
            "Fetch video metadata and descriptions for content ops",
        ],
        "required_fields": [],
        "config_fields": [],
        "capabilities": [
            {"id": "youtube.read", "name": "Read Channel & Videos", "desc": "Fetch channel stats and uploaded videos", "risk": "low"},
        ],
    },
    {
        "tool_name": "google_analytics",
        "display_name": "Google Analytics",
        "category": "Google Workspace",
        "description": "Pull website traffic, conversions, and growth metrics (GA4).",
        "auth_type": "oauth2",
        "oauth_provider": "google",
        "domains": ["analyticsadmin.googleapis.com", "analyticsdata.googleapis.com", "www.googleapis.com"],
        "oauth_scopes": [
            "https://www.googleapis.com/auth/analytics.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ],
        "examples": [
            "Include live GA4 traffic and conversion trends in founder briefs",
            "Track landing page performance for launch campaigns",
            "Detect sudden traffic drops or funnel anomalies",
        ],
        "required_fields": [],
        "config_fields": ["property_id"],
        "capabilities": [
            {"id": "analytics.read", "name": "Read GA4 Reports", "desc": "Query GA4 properties and traffic metrics", "risk": "low"},
        ],
    },

    # ── AI & Models (API Keys) ────────────────────────────────────────────────
    {
        "tool_name": "gemini",
        "display_name": "Gemini API",
        "category": "AI & Models",
        "description": "Run reasoning, extraction, and multimodal workflows with Google Gemini.",
        "auth_type": "api_key",
        "domains": ["generativelanguage.googleapis.com"],
        "examples": [
            "Power multi-agent consensus and workflow reasoning",
            "Extract structured JSON from invoices and intake forms",
            "Draft personalized outreach and executive briefs",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["default_model"],
        "capabilities": [
            {"id": "llm.generate", "name": "Text & Multimodal Generation", "desc": "Run Gemini models across workflow nodes", "risk": "low"},
        ],
    },
    {
        "tool_name": "openai",
        "display_name": "OpenAI",
        "category": "AI & Models",
        "description": "Power GPT-4o agents, structured extraction, and embeddings.",
        "auth_type": "api_key",
        "domains": ["api.openai.com"],
        "examples": [
            "Run GPT-4o reasoning and tool-calling workflow steps",
            "Generate semantic embeddings for knowledge retrieval",
            "Verify and cross-check agent outputs in consensus mode",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["default_model"],
        "capabilities": [
            {"id": "llm.generate", "name": "GPT Inference", "desc": "Execute OpenAI chat and embedding models", "risk": "low"},
        ],
    },
    {
        "tool_name": "anthropic",
        "display_name": "Anthropic Claude",
        "category": "AI & Models",
        "description": "Use Claude models for deep analysis, compliance, and synthesis.",
        "auth_type": "api_key",
        "domains": ["api.anthropic.com"],
        "examples": [
            "Analyze legal briefs and compliance policies with high accuracy",
            "Draft nuanced customer communication and executive summaries",
            "Perform long-context document review and verification",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["default_model"],
        "capabilities": [
            {"id": "llm.generate", "name": "Claude Inference", "desc": "Execute Anthropic Claude models", "risk": "low"},
        ],
    },
    {
        "tool_name": "groq",
        "display_name": "Groq",
        "category": "AI & Models",
        "description": "Ultra-fast LPU inference for real-time classification and triage.",
        "auth_type": "api_key",
        "domains": ["api.groq.com"],
        "examples": [
            "Classify incoming support tickets in milliseconds",
            "Route high-volume lead signals with low latency",
            "Run fast pre-screening checks before heavy reasoning",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["default_model"],
        "capabilities": [
            {"id": "llm.generate", "name": "Fast Inference", "desc": "Execute Groq-hosted models", "risk": "low"},
        ],
    },

    # ── Messaging & Collaboration ─────────────────────────────────────────────
    {
        "tool_name": "slack",
        "display_name": "Slack",
        "category": "Messaging & Collaboration",
        "description": "Post real-time alerts, escalation approvals, and channel updates.",
        "auth_type": "bot_token",
        "domains": ["slack.com"],
        "examples": [
            "Send urgent churn or SLA escalation alerts to #ops-alerts",
            "Post human-in-the-loop approval requests to team channels",
            "Read channel threads to trigger automated triage workflows",
        ],
        "required_fields": ["bot_token"],
        "config_fields": ["cs_alerts_channel", "sales_channel"],
        "capabilities": [
            {"id": "slack.post_message", "name": "Post Messages", "desc": "Post notifications to Slack channels", "risk": "low"},
            {"id": "slack.post_alert", "name": "Post Risk Escalations", "desc": "Send urgent escalation alerts to team", "risk": "medium"},
            {"id": "slack.read_history", "name": "Read Channel History", "desc": "Monitor channel inquiries and replies", "risk": "low"},
        ],
    },
    {
        "tool_name": "telegram",
        "display_name": "Telegram",
        "category": "Messaging & Collaboration",
        "description": "Run autonomous customer support and alert bots on Telegram.",
        "auth_type": "bot_token",
        "domains": ["api.telegram.org"],
        "examples": [
            "Deliver instant workflow completion alerts to founders",
            "Handle inbound customer questions via Telegram bot",
            "Send daily growth and revenue digest messages",
        ],
        "required_fields": ["bot_token"],
        "config_fields": ["default_chat_id"],
        "capabilities": [
            {"id": "telegram.send_message", "name": "Send Bot Messages", "desc": "Send notifications via Telegram Bot API", "risk": "low"},
        ],
    },

    # ── CRM, Billing & Operations ─────────────────────────────────────────────
    {
        "tool_name": "hubspot",
        "display_name": "HubSpot CRM",
        "category": "CRM, Billing & Operations",
        "description": "Sync customer accounts, lead contacts, and pipeline deals.",
        "auth_type": "api_key",
        "domains": ["api.hubapi.com"],
        "examples": [
            "Enrich inbound leads and create qualified HubSpot contacts",
            "Update deal stages automatically after demo calls",
            "Monitor pipeline velocity and flag stalled accounts",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["pipeline_id"],
        "capabilities": [
            {"id": "hubspot.read_contacts", "name": "Read Contacts & Deals", "desc": "Fetch CRM contacts and pipeline status", "risk": "low"},
            {"id": "hubspot.create_contact", "name": "Create Leads/Contacts", "desc": "Add new leads to HubSpot CRM", "risk": "low"},
            {"id": "hubspot.update_deal", "name": "Update Pipeline Deals", "desc": "Update deal stages and values", "risk": "medium"},
        ],
    },
    {
        "tool_name": "stripe",
        "display_name": "Stripe",
        "category": "CRM, Billing & Operations",
        "description": "Retrieve subscription status, invoice data, and billing events.",
        "auth_type": "api_key",
        "domains": ["api.stripe.com"],
        "examples": [
            "Check customer ARR and subscription health before outreach",
            "Identify overdue invoices and trigger billing follow-ups",
            "Feed live revenue metrics into weekly founder briefs",
        ],
        "required_fields": ["secret_key"],
        "config_fields": [],
        "capabilities": [
            {"id": "stripe.read_customers", "name": "Read Customer Accounts", "desc": "Access customer payment profiles", "risk": "low"},
            {"id": "stripe.read_subscriptions", "name": "Read Subscriptions", "desc": "Check subscription tiers and status", "risk": "low"},
            {"id": "stripe.read_invoices", "name": "Read Billing Invoices", "desc": "Retrieve invoice histories and payments", "risk": "low"},
        ],
    },
    {
        "tool_name": "recall_ai",
        "display_name": "Recall.ai",
        "category": "CRM, Billing & Operations",
        "description": "Join live Meet, Zoom, and Teams calls to capture transcripts.",
        "auth_type": "api_key",
        "domains": ["us-west-2.recall.ai"],
        "examples": [
            "Dispatch a meeting bot to record and transcribe live calls",
            "Generate structured meeting summaries and next steps",
            "Trigger post-call follow-up workflows automatically",
        ],
        "required_fields": ["api_key"],
        "config_fields": ["region"],
        "capabilities": [
            {"id": "recall.bot_join", "name": "Dispatch Meeting Bot", "desc": "Send transcription bot to live meetings", "risk": "medium"},
        ],
    },
    {
        "tool_name": "serper",
        "display_name": "Serper Search",
        "category": "CRM, Billing & Operations",
        "description": "Real-time Google Search grounding for research and enrichment.",
        "auth_type": "api_key",
        "domains": ["google.serper.dev"],
        "examples": [
            "Research prospect companies and recent news before outreach",
            "Verify market pricing and competitor updates in real time",
            "Ground AI research agents with live web search results",
        ],
        "required_fields": ["api_key"],
        "config_fields": [],
        "capabilities": [
            {"id": "search.web", "name": "Web Search", "desc": "Run real-time Google Search queries", "risk": "low"},
        ],
    },
    {
        "tool_name": "rest_api",
        "display_name": "Custom REST API",
        "category": "CRM, Billing & Operations",
        "description": "Connect internal webhooks and custom business REST endpoints.",
        "auth_type": "api_key",
        "domains": [],
        "examples": [
            "Push workflow outputs to internal ERP or webhook endpoints",
            "Query proprietary customer or inventory databases via REST",
            "Trigger external automations with signed API requests",
        ],
        "required_fields": ["base_url", "api_key"],
        "config_fields": ["auth_header", "auth_prefix"],
        "capabilities": [
            {"id": "rest.get_resource", "name": "GET Resource Endpoints", "desc": "Query custom REST endpoints", "risk": "low"},
            {"id": "rest.post_resource", "name": "POST Resource Endpoints", "desc": "Write data to custom REST endpoints", "risk": "medium"},
        ],
    },
]


GOOGLE_TOOL_SCOPES = {
    "gmail": [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
    ],
    "google_calendar": [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
    ],
    "google_drive": [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
    "google_docs": [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
    "google_sheets": [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
    "google_slides": [
        "https://www.googleapis.com/auth/presentations",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
    "google_meet": [
        "https://www.googleapis.com/auth/meetings.space.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
    ],
    "google_tasks": [
        "https://www.googleapis.com/auth/tasks",
    ],
    "google_contacts": [
        "https://www.googleapis.com/auth/contacts.readonly",
    ],
    "google_forms": [
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/forms.body.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
    "youtube": [
        "https://www.googleapis.com/auth/youtube.readonly",
    ],
    "google_analytics": [
        "https://www.googleapis.com/auth/analytics.readonly",
    ],
    "google_workspace": [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
    ],
}


class ConnectToolRequest(BaseModel):
    tool_name: str
    display_name: Optional[str] = None
    credentials: dict = Field(default_factory=dict)
    config: dict = Field(default_factory=dict)


class UpdateToolRequest(BaseModel):
    display_name: Optional[str] = None
    credentials: Optional[dict] = None
    config: Optional[dict] = None


class GoogleOAuthExchangeRequest(BaseModel):
    code: str
    redirect_uri: str
    tool_name: Optional[str] = None
    state: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


async def _verify_google_tool(tool_name: str, access_token: str) -> tuple[bool, str, dict]:
    """Run a live API verification call + structured read preview for a specific Google Workspace tool."""
    import asyncio
    import httpx
    from datetime import timezone

    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        if tool_name == "gmail":
            r = await client.get("https://gmail.googleapis.com/gmail/v1/users/me/profile", headers=headers)
            if r.status_code != 200:
                return False, f"Gmail API returned {r.status_code}: {r.text[:160]}", {}
            data = r.json()
            preview_items = []
            preview_rows = []
            try:
                msg_list = await client.get(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                    params={"maxResults": 5, "q": "in:inbox"},
                    headers=headers,
                )
                if msg_list.status_code == 200:
                    ids = [m["id"] for m in msg_list.json().get("messages", [])[:5]]
                    meta_resps = await asyncio.gather(*[
                        client.get(
                            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date",
                            headers=headers,
                        )
                        for mid in ids
                    ], return_exceptions=True)
                    for mr in meta_resps:
                        if not isinstance(mr, Exception) and mr.status_code == 200:
                            mjson = mr.json()
                            hdrs = {h["name"]: h["value"] for h in mjson.get("payload", {}).get("headers", [])}
                            subj = hdrs.get("Subject") or "(No Subject)"
                            frm_raw = hdrs.get("From") or ""
                            frm = frm_raw.split("<")[0].strip().strip('"') or frm_raw
                            date_raw = hdrs.get("Date") or ""
                            date_short = " ".join(date_raw.split()[:3]) if date_raw else ""
                            snippet = mjson.get("snippet", "")
                            tid = mjson.get("threadId") or mjson.get("id")
                            preview_items.append(f"{subj} — {frm}" if frm else subj)
                            preview_rows.append({
                                "title": subj,
                                "subtitle": frm,
                                "snippet": snippet,
                                "meta": date_short,
                                "url": f"https://mail.google.com/mail/u/0/#inbox/{tid}" if tid else "https://mail.google.com",
                            })
            except Exception:
                pass
            return True, f"Verified Gmail ({data.get('emailAddress', 'connected')})", {
                "email": data.get("emailAddress"),
                "messages_total": data.get("messagesTotal"),
                "external_url": "https://mail.google.com",
                "external_label": "Open Gmail",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name == "google_calendar":
            r = await client.get("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=5", headers=headers)
            if r.status_code != 200:
                return False, f"Calendar API returned {r.status_code}: {r.text[:160]}", {}
            items = r.json().get("items", [])
            preview_items = []
            preview_rows = []
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                ev_resp = await client.get(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    params={"maxResults": 5, "singleEvents": "true", "orderBy": "startTime", "timeMin": now_iso},
                    headers=headers,
                )
                if ev_resp.status_code == 200:
                    for ev in ev_resp.json().get("items", [])[:5]:
                        start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date") or ""
                        title = ev.get("summary") or "(Untitled event)"
                        when = start[:16].replace("T", " ") if start else ""
                        preview_items.append(f"{title} ({when})" if when else title)
                        preview_rows.append({
                            "title": title,
                            "subtitle": ev.get("organizer", {}).get("email", "Primary Calendar"),
                            "snippet": ev.get("location") or "",
                            "meta": when,
                            "url": ev.get("htmlLink") or "https://calendar.google.com",
                        })
            except Exception:
                pass
            return True, f"Verified Google Calendar ({len(items)} calendar(s) accessible)", {
                "calendars_count": len(items),
                "external_url": "https://calendar.google.com",
                "external_label": "Open Calendar",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name in ("google_drive", "google_docs", "google_sheets", "google_slides", "google_forms"):
            r = await client.get("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)", headers=headers)
            if r.status_code != 200:
                return False, f"Google Drive/Docs API returned {r.status_code}: {r.text[:160]}", {}
            u = r.json().get("user", {})
            mime_map = {
                "google_docs": "mimeType='application/vnd.google-apps.document' and trashed=false",
                "google_sheets": "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                "google_slides": "mimeType='application/vnd.google-apps.presentation' and trashed=false",
                "google_forms": "mimeType='application/vnd.google-apps.form' and trashed=false",
                "google_drive": "trashed=false",
            }
            ext_urls = {
                "google_docs": ("https://docs.google.com", "Open Docs"),
                "google_sheets": ("https://sheets.google.com", "Open Sheets"),
                "google_slides": ("https://slides.google.com", "Open Slides"),
                "google_forms": ("https://docs.google.com/forms", "Open Forms"),
                "google_drive": ("https://drive.google.com", "Open Drive"),
            }
            preview_items = []
            preview_rows = []
            try:
                f_resp = await client.get(
                    "https://www.googleapis.com/drive/v3/files",
                    params={
                        "q": mime_map[tool_name],
                        "pageSize": 5,
                        "orderBy": "modifiedTime desc",
                        "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
                    },
                    headers=headers,
                )
                if f_resp.status_code == 200:
                    for f in f_resp.json().get("files", [])[:5]:
                        name = f.get("name", "Untitled")
                        mod = (f.get("modifiedTime") or "")[:10]
                        preview_items.append(name)
                        preview_rows.append({
                            "title": name,
                            "subtitle": f.get("mimeType", "").split(".")[-1].replace("google-apps.", ""),
                            "snippet": "",
                            "meta": mod,
                            "url": f.get("webViewLink") or ext_urls[tool_name][0],
                        })
            except Exception:
                pass
            return True, f"Verified {tool_name.replace('_', ' ').title()} ({u.get('emailAddress', 'connected')})", {
                "email": u.get("emailAddress"),
                "external_url": ext_urls[tool_name][0],
                "external_label": ext_urls[tool_name][1],
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name == "google_meet":
            r = await client.get("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", headers=headers)
            if r.status_code == 200:
                preview_items = []
                preview_rows = []
                try:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    ev_resp = await client.get(
                        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                        params={"maxResults": 8, "singleEvents": "true", "orderBy": "startTime", "timeMin": now_iso},
                        headers=headers,
                    )
                    if ev_resp.status_code == 200:
                        for ev in ev_resp.json().get("items", []):
                            if ev.get("hangoutLink") or ev.get("conferenceData"):
                                title = ev.get("summary", "Google Meet")
                                start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date") or ""
                                when = start[:16].replace("T", " ") if start else ""
                                preview_items.append(title)
                                preview_rows.append({
                                    "title": title,
                                    "subtitle": "Google Meet",
                                    "snippet": ev.get("hangoutLink") or "",
                                    "meta": when,
                                    "url": ev.get("hangoutLink") or "https://meet.google.com",
                                })
                            if len(preview_rows) >= 5:
                                break
                except Exception:
                    pass
                return True, "Verified Google Meet & Calendar access", {
                    "external_url": "https://meet.google.com",
                    "external_label": "Open Meet",
                    "preview_items": preview_items,
                    "preview_rows": preview_rows,
                }
            r2 = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
            if r2.status_code == 200:
                return True, f"Verified Google Meet OAuth ({r2.json().get('email', '')})", {"external_url": "https://meet.google.com", "external_label": "Open Meet"}
            return False, f"Google Meet verification returned {r.status_code}", {}

        elif tool_name == "google_tasks":
            r = await client.get("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=5", headers=headers)
            if r.status_code != 200:
                return False, f"Google Tasks API returned {r.status_code}: {r.text[:160]}", {}
            lists = r.json().get("items", [])
            preview_items = []
            preview_rows = []
            if lists:
                try:
                    t_resp = await client.get(f"https://tasks.googleapis.com/tasks/v1/lists/{lists[0]['id']}/tasks?maxResults=5", headers=headers)
                    if t_resp.status_code == 200:
                        for t in t_resp.json().get("items", [])[:5]:
                            title = t.get("title") or "(Untitled task)"
                            preview_items.append(title)
                            preview_rows.append({
                                "title": title,
                                "subtitle": lists[0].get("title", "My Tasks"),
                                "snippet": t.get("notes", ""),
                                "meta": (t.get("due") or "")[:10] or t.get("status", ""),
                                "url": "https://tasks.google.com",
                            })
                except Exception:
                    pass
            return True, f"Verified Google Tasks ({len(lists)} list(s))", {
                "external_url": "https://tasks.google.com",
                "external_label": "Open Tasks",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name == "google_contacts":
            r = await client.get(
                "https://people.googleapis.com/v1/people/me/connections",
                params={"personFields": "names,emailAddresses", "pageSize": 5},
                headers=headers,
            )
            if r.status_code != 200:
                return False, f"Google Contacts API returned {r.status_code}: {r.text[:160]}", {}
            conns = r.json().get("connections", [])
            preview_items = []
            preview_rows = []
            for p in conns[:5]:
                name = (p.get("names") or [{}])[0].get("displayName") or "Unnamed Contact"
                email = (p.get("emailAddresses") or [{}])[0].get("value") or ""
                preview_items.append(f"{name} ({email})" if email else name)
                preview_rows.append({
                    "title": name,
                    "subtitle": email,
                    "snippet": "",
                    "meta": "",
                    "url": "https://contacts.google.com",
                })
            return True, f"Verified Google Contacts ({len(conns)} contact(s) loaded)", {
                "external_url": "https://contacts.google.com",
                "external_label": "Open Contacts",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name == "youtube":
            r = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "snippet,statistics", "mine": "true"},
                headers=headers,
            )
            if r.status_code != 200:
                return False, f"YouTube API returned {r.status_code}: {r.text[:160]}", {}
            items = r.json().get("items", [])
            preview_items = []
            preview_rows = []
            for ch in items[:3]:
                title = ch.get("snippet", {}).get("title", "YouTube Channel")
                subs = ch.get("statistics", {}).get("subscriberCount", "0")
                vids = ch.get("statistics", {}).get("videoCount", "0")
                preview_items.append(f"{title} ({subs} subscribers)")
                preview_rows.append({
                    "title": title,
                    "subtitle": f"{subs} subscribers · {vids} videos",
                    "snippet": "",
                    "meta": "Channel",
                    "url": f"https://www.youtube.com/channel/{ch.get('id', '')}",
                })
            return True, f"Verified YouTube ({len(items)} channel(s))", {
                "external_url": "https://studio.youtube.com",
                "external_label": "Open YouTube Studio",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        elif tool_name == "google_analytics":
            r = await client.get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=5", headers=headers)
            if r.status_code != 200:
                return False, f"Google Analytics API returned {r.status_code}: {r.text[:160]}", {}
            summaries = r.json().get("accountSummaries", [])
            preview_items = []
            preview_rows = []
            for acc in summaries[:5]:
                acc_name = acc.get("displayName", "GA4 Account")
                props = acc.get("propertySummaries", [])
                preview_items.append(f"{acc_name} ({len(props)} properties)")
                preview_rows.append({
                    "title": acc_name,
                    "subtitle": ", ".join(p.get("displayName", "") for p in props[:2]) or "GA4",
                    "snippet": "",
                    "meta": f"{len(props)} props",
                    "url": "https://analytics.google.com",
                })
            return True, f"Verified Google Analytics ({len(summaries)} account(s))", {
                "external_url": "https://analytics.google.com",
                "external_label": "Open Analytics",
                "preview_items": preview_items,
                "preview_rows": preview_rows,
            }

        else:
            r = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
            if r.status_code == 200:
                return True, f"Verified Google Account ({r.json().get('email', '')})", r.json()
            return False, f"Google UserInfo returned {r.status_code}", {}


async def _verify_api_key_tool(tool_name: str, creds: dict, config: dict) -> tuple[bool, str, dict]:
    """Run a live API verification call for API-key and bot-token tools."""
    import httpx
    t = (tool_name or "").lower()
    async with httpx.AsyncClient(timeout=15) as client:
        if t == "gemini":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing Gemini API key", {}
            r = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
            if r.status_code == 200:
                models = r.json().get("models", [])
                names = [m.get("name", "").replace("models/", "") for m in models[:3]]
                return True, f"Verified Gemini API ({len(models)} models available)", {"models_count": len(models), "preview_items": names}
            return False, f"Gemini API rejected key ({r.status_code})", {}

        if t == "openai":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing OpenAI API key", {}
            r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                models = r.json().get("data", [])
                return True, f"Verified OpenAI API ({len(models)} models accessible)", {"models_count": len(models)}
            return False, f"OpenAI API rejected key ({r.status_code})", {}

        if t == "anthropic":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing Anthropic API key", {}
            r = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            )
            if r.status_code == 200:
                models = r.json().get("data", [])
                return True, f"Verified Anthropic API ({len(models)} models accessible)", {"models_count": len(models)}
            return False, f"Anthropic API rejected key ({r.status_code})", {}

        if t == "groq":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing Groq API key", {}
            r = await client.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                models = r.json().get("data", [])
                return True, f"Verified Groq API ({len(models)} models available)", {"models_count": len(models)}
            return False, f"Groq API rejected key ({r.status_code})", {}

        if t == "telegram":
            token = (creds.get("bot_token") or "").strip()
            if not token:
                return False, "Missing Telegram bot token", {}
            r = await client.get(f"https://api.telegram.org/bot{token}/getMe")
            data = r.json() if r.status_code == 200 else {}
            if r.status_code == 200 and data.get("ok"):
                bot_user = data.get("result", {}).get("username", "bot")
                return True, f"Verified Telegram bot (@{bot_user})", {"username": bot_user}
            return False, f"Telegram rejected bot token ({r.status_code})", {}

        if t == "serper":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing Serper API key", {}
            r = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": "SMBFlow health check", "num": 1},
            )
            if r.status_code == 200:
                return True, "Verified Serper Search API", {}
            return False, f"Serper API rejected key ({r.status_code})", {}

        if t == "recall_ai":
            key = (creds.get("api_key") or "").strip()
            if not key:
                return False, "Missing Recall.ai API key", {}
            region = (config.get("region") or "us-west-2").strip()
            r = await client.get(f"https://{region}.recall.ai/api/v1/bot/?limit=1", headers={"Authorization": f"Token {key}"})
            if r.status_code == 200:
                return True, f"Verified Recall.ai ({region})", {"region": region}
            return False, f"Recall.ai rejected key ({r.status_code})", {}

        if t == "slack":
            connector = SlackConnector(credentials=creds, config=config)
            ok = await connector.health_check()
            await connector.close()
            return (True, "Verified Slack bot token", {}) if ok else (False, "Slack auth.test failed", {})

        if t == "hubspot":
            connector = HubSpotConnector(credentials=creds, config=config)
            ok = await connector.health_check()
            await connector.close()
            return (True, "Verified HubSpot CRM token", {}) if ok else (False, "HubSpot API rejected token", {})

        if t == "stripe":
            connector = StripeConnector(credentials=creds, config=config)
            ok = await connector.health_check()
            await connector.close()
            return (True, "Verified Stripe secret key", {}) if ok else (False, "Stripe API rejected secret key", {})

        connector = GenericRESTConnector(credentials=creds, config=config)
        ok = await connector.health_check()
        await connector.close()
        return (True, "Verified REST endpoint", {}) if ok else (False, "REST endpoint unreachable or returned error", {})


@router.get("/oauth/google/authorize")
async def get_google_oauth_authorize_url(
    redirect_uri: Optional[str] = "http://localhost:5173/integrations",
    tool_name: Optional[str] = "gmail",
    scopes: Optional[str] = None,
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Generate Google OAuth authorization URL for a specific Google Workspace tool with exact scopes."""
    import os
    import json
    import base64
    import urllib.parse
    from dotenv import load_dotenv

    load_dotenv(override=True)
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_CLIENT_ID is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to SMBFlow/.env."
        )

    target_tool = (tool_name or "gmail").lower().strip()
    scope_mapping = {
        "email": GOOGLE_TOOL_SCOPES["gmail"],
        "gmail": GOOGLE_TOOL_SCOPES["gmail"],
        "calendar": GOOGLE_TOOL_SCOPES["google_calendar"],
        "google_calendar": GOOGLE_TOOL_SCOPES["google_calendar"],
        "drive": GOOGLE_TOOL_SCOPES["google_drive"],
        "google_drive": GOOGLE_TOOL_SCOPES["google_drive"],
        "docs": GOOGLE_TOOL_SCOPES["google_docs"],
        "google_docs": GOOGLE_TOOL_SCOPES["google_docs"],
        "sheets": GOOGLE_TOOL_SCOPES["google_sheets"],
        "google_sheets": GOOGLE_TOOL_SCOPES["google_sheets"],
        "slides": GOOGLE_TOOL_SCOPES["google_slides"],
        "google_slides": GOOGLE_TOOL_SCOPES["google_slides"],
        "meet": GOOGLE_TOOL_SCOPES["google_meet"],
        "google_meet": GOOGLE_TOOL_SCOPES["google_meet"],
        "tasks": GOOGLE_TOOL_SCOPES["google_tasks"],
        "google_tasks": GOOGLE_TOOL_SCOPES["google_tasks"],
        "contacts": GOOGLE_TOOL_SCOPES["google_contacts"],
        "google_contacts": GOOGLE_TOOL_SCOPES["google_contacts"],
        "forms": GOOGLE_TOOL_SCOPES["google_forms"],
        "google_forms": GOOGLE_TOOL_SCOPES["google_forms"],
        "youtube": GOOGLE_TOOL_SCOPES["youtube"],
        "analytics": GOOGLE_TOOL_SCOPES["google_analytics"],
        "google_analytics": GOOGLE_TOOL_SCOPES["google_analytics"],
        "google_workspace": GOOGLE_TOOL_SCOPES["google_workspace"],
    }

    resolved_scopes = {
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "openid",
    }

    if scopes:
        requested_list = [s.strip() for s in scopes.split(",") if s.strip()]
        for req in requested_list:
            low = req.lower()
            if low in scope_mapping:
                resolved_scopes.update(scope_mapping[low])
            elif req.startswith("https://"):
                resolved_scopes.add(req)
    else:
        resolved_scopes.update(scope_mapping.get(target_tool, GOOGLE_TOOL_SCOPES["gmail"]))

    state_payload = {
        "org_id": str(current_user.organization_id or current_user.tenant_id or ""),
        "tool_name": target_tool,
    }
    state_data = base64.urlsafe_b64encode(json.dumps(state_payload).encode("utf-8")).decode("utf-8")

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(sorted(resolved_scopes)),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state_data,
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"url": url, "redirect_uri": redirect_uri, "tool_name": target_tool, "scopes": sorted(resolved_scopes)}


@router.post("/oauth/google/exchange")
async def exchange_google_oauth_code(
    body: GoogleOAuthExchangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Securely exchange Google OAuth authorization code for tokens and store encrypted credentials for the target tool."""
    import os
    import time
    import json
    import base64
    import httpx
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization context")
    org_uuid = uuid.UUID(org_id)

    # Resolve target tool_name from body or encoded state
    target_tool = (body.tool_name or "").lower().strip()
    if not target_tool and body.state:
        try:
            padded = body.state + "=" * (-len(body.state) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
            target_tool = (decoded.get("tool_name") or "").lower().strip()
        except Exception:
            pass
    if not target_tool:
        target_tool = "gmail"

    from dotenv import load_dotenv
    load_dotenv(override=True)
    client_id = body.client_id or os.getenv("GOOGLE_CLIENT_ID")
    client_secret = body.client_secret or os.getenv("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Google Client ID and Client Secret are required for token exchange."
        )

    # 1. Exchange code with Google
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": body.code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": body.redirect_uri,
                    "grant_type": "authorization_code",
                }
            )
            if token_resp.status_code != 200:
                err_text = token_resp.text
                log.error("Google token exchange failed", status=token_resp.status_code, error=err_text)
                raise HTTPException(status_code=400, detail=f"Google OAuth exchange failed: {err_text}")

            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)
            token_type = token_data.get("token_type", "Bearer")
            granted_scopes = token_data.get("scope", "")

            if not access_token:
                raise HTTPException(status_code=400, detail="No access_token returned by Google.")

            # 2. Query real Google user profile & identity (never fall back to login/fake email)
            connected_email = None
            user_display_name = None
            avatar_url = None
            userinfo_resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if userinfo_resp.status_code == 200:
                uinfo = userinfo_resp.json()
                connected_email = uinfo.get("email")
                user_display_name = uinfo.get("name")
                avatar_url = uinfo.get("picture")

            if not connected_email:
                profile_resp = await client.get(
                    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                if profile_resp.status_code == 200:
                    connected_email = profile_resp.json().get("emailAddress")

            if not connected_email:
                raise HTTPException(
                    status_code=400,
                    detail="Google OAuth succeeded but did not return a verified email address."
                )
    except HTTPException:
        raise
    except Exception as e:
        log.error("Google token exchange exception", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to connect to Google OAuth service: {str(e)}")

    # 3. Construct credentials
    creds = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": time.time() + expires_in,
        "token_type": token_type,
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": granted_scopes,
    }

    config_data = {
        "connected_email": connected_email,
        "sender_alias": connected_email,
        "sender_name": user_display_name,
        "avatar_url": avatar_url,
        "queue_for_approval": True,
        "granted_scopes": granted_scopes,
    }

    # 4. Run live verification for the target Google tool
    is_healthy, verify_msg, verify_details = await _verify_google_tool(target_tool, access_token)
    encrypted = encrypt_credentials(creds)
    catalog_meta = next((item for item in AVAILABLE_CONNECTORS if item["tool_name"] == target_tool), None)
    display_name = catalog_meta["display_name"] if catalog_meta else target_tool.replace("_", " ").title()

    async def _upsert_conn(t_name: str, d_name: str):
        stmt = select(ToolConnection).where(
            ToolConnection.organization_id == org_uuid,
            ToolConnection.tool_name == t_name,
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            existing.status = "connected" if is_healthy else "error"
            existing.display_name = d_name
            existing.encrypted_credentials = encrypted
            existing.last_tested_at = datetime.utcnow()
            existing.config = {**(existing.config or {}), **config_data, "last_verify_message": verify_msg}
            return existing
        obj = ToolConnection(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            tool_name=t_name,
            display_name=d_name,
            status="connected" if is_healthy else "error",
            encrypted_credentials=encrypted,
            config={**config_data, "last_verify_message": verify_msg},
            last_tested_at=datetime.utcnow(),
        )
        db.add(obj)
        return obj

    conn_obj = await _upsert_conn(target_tool, display_name)

    # Also keep google_workspace synced for legacy workflow compatibility
    if target_tool != "google_workspace" and any(s in granted_scopes for s in ("calendar", "drive", "documents", "spreadsheets", "presentations", "meetings")):
        await _upsert_conn("google_workspace", "Google Workspace & Drive")

    await db.commit()
    await db.refresh(conn_obj)
    await redis_cache.delete(f"cache:connections:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")

    return {
        "id": str(conn_obj.id),
        "tool_name": target_tool,
        "display_name": conn_obj.display_name,
        "status": conn_obj.status,
        "config": conn_obj.config,
        "connected_email": connected_email,
        "verified": is_healthy,
        "details": verify_details,
        "message": verify_msg or f"Successfully connected {display_name} ({connected_email})",
    }


@router.get("/available")
async def list_available_connectors(current_user: TokenData = Depends(require_authenticated_user)):
    """List all supported platform tool connectors."""
    return AVAILABLE_CONNECTORS


def _inspect_connection_auth(conn: Any) -> dict[str, Any]:
    """
    Verify whether a ToolConnection row holds real, non-sandbox credentials.
    Returns effective status, real account_email (never fake/fallback), and auth metadata.
    """
    import time

    cfg = dict(conn.config or {})
    tool_name = (conn.tool_name or "").lower()
    is_google = tool_name in GOOGLE_TOOL_SCOPES

    if not conn.encrypted_credentials:
        return {
            "is_real": False,
            "effective_status": "not_connected",
            "account_email": None,
            "has_refresh_token": False,
            "granted_scopes": [],
        }

    try:
        creds = decrypt_credentials(conn.encrypted_credentials)
    except Exception:
        return {
            "is_real": False,
            "effective_status": "error",
            "account_email": None,
            "has_refresh_token": False,
            "granted_scopes": [],
        }

    if not isinstance(creds, dict):
        return {
            "is_real": False,
            "effective_status": "not_connected",
            "account_email": None,
            "has_refresh_token": False,
            "granted_scopes": [],
        }

    # Reject seeded sandbox or placeholder sessions
    if creds.get("sandbox") or creds.get("type") == "sandbox" or creds.get("auth") == "oauth_session":
        return {
            "is_real": False,
            "effective_status": "not_connected",
            "account_email": None,
            "has_refresh_token": False,
            "granted_scopes": [],
        }

    if is_google:
        has_access = bool(creds.get("access_token"))
        has_refresh = bool(creds.get("refresh_token"))
        if not (has_access or has_refresh):
            return {
                "is_real": False,
                "effective_status": "not_connected",
                "account_email": None,
                "has_refresh_token": False,
                "granted_scopes": [],
            }
        expires_at = float(creds.get("expires_at") or 0)
        is_expired_no_refresh = expires_at > 0 and time.time() >= expires_at and not has_refresh
        raw_scopes = creds.get("scope") or cfg.get("granted_scopes") or ""
        scopes_list = [s for s in str(raw_scopes).split() if s]
        raw_email = cfg.get("connected_email")
        # Never surface seeded placeholder email
        account_email = raw_email if (raw_email and raw_email != "workspace@isolate.ai") else None
        effective = "reauth_required" if is_expired_no_refresh else (conn.status if conn.status in ("connected", "error") else "connected")
        return {
            "is_real": True,
            "effective_status": effective,
            "account_email": account_email,
            "has_refresh_token": has_refresh,
            "granted_scopes": scopes_list,
        }

    # API key / Bot token tools
    has_secret = any(bool(str(creds.get(k) or "").strip()) for k in ("api_key", "bot_token", "secret_key", "token"))
    if not has_secret:
        return {
            "is_real": False,
            "effective_status": "not_connected",
            "account_email": None,
            "has_refresh_token": False,
            "granted_scopes": [],
        }

    return {
        "is_real": True,
        "effective_status": conn.status if conn.status in ("connected", "error") else "connected",
        "account_email": None,
        "has_refresh_token": False,
        "granted_scopes": [],
    }


async def _run_live_health_check(conn: Any) -> tuple[bool, str, dict[str, Any], Optional[dict]]:
    """
    Execute a live health check for a ToolConnection row.
    Returns: (is_healthy, message, details, updated_credentials_or_none)
    """
    import asyncio
    import httpx

    try:
        creds = decrypt_credentials(conn.encrypted_credentials) if conn.encrypted_credentials else {}
    except Exception:
        return False, "Failed to decrypt stored credentials.", {}, None

    tool_name = (conn.tool_name or "").lower()
    updated_creds = None

    try:
        if tool_name in GOOGLE_TOOL_SCOPES:
            gw = GoogleWorkspaceConnector(credentials=creds, config=conn.config or {})
            try:
                token_ok = await asyncio.wait_for(gw._ensure_valid_token(), timeout=6.0)
                if not token_ok:
                    return False, "Google OAuth token expired or revoked. Please reconnect.", {}, None
                if gw.credentials != creds:
                    updated_creds = gw.credentials
                    creds = gw.credentials
                ok, msg, details = await asyncio.wait_for(
                    _verify_google_tool(tool_name, creds.get("access_token", "")),
                    timeout=6.0,
                )
                if ok:
                    async with httpx.AsyncClient(timeout=5) as client:
                        ui = await client.get(
                            "https://www.googleapis.com/oauth2/v2/userinfo",
                            headers={"Authorization": f"Bearer {creds.get('access_token', '')}"},
                        )
                        if ui.status_code == 200 and ui.json().get("email"):
                            details["email"] = ui.json()["email"]
                return ok, msg, details, updated_creds
            finally:
                await gw.close()
        else:
            ok, msg, details = await asyncio.wait_for(
                _verify_api_key_tool(tool_name, creds, conn.config or {}),
                timeout=6.0,
            )
            return ok, msg, details, None
    except asyncio.TimeoutError:
        return False, f"Health check timed out for {conn.tool_name}.", {}, updated_creds
    except Exception as e:
        return False, f"Health check error: {str(e)}", {}, updated_creds


@router.get("")
async def list_organization_connections(
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """List tool connections for the current organization after verifying live health."""
    import asyncio
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        return []

    cache_key = f"cache:connections:v3:{org_id}"
    if not refresh:
        cached = await redis_cache.get(cache_key)
        if cached is not None:
            return cached

    stmt = select(ToolConnection).where(ToolConnection.organization_id == uuid.UUID(org_id))
    result = await db.execute(stmt)
    connections = result.scalars().all()

    real_items: list[tuple[Any, dict[str, Any]]] = []
    for conn in connections:
        auth_info = _inspect_connection_auth(conn)
        if auth_info["is_real"]:
            real_items.append((conn, auth_info))

    # Run live health checks in parallel so status is always accurate before rendering
    health_results = await asyncio.gather(
        *[_run_live_health_check(conn) for conn, _ in real_items],
        return_exceptions=True,
    )

    output = []
    dirty = False
    for (conn, auth_info), h_res in zip(real_items, health_results):
        if isinstance(h_res, Exception):
            is_healthy, verify_msg, details, updated_creds = False, f"Health check failed: {h_res}", {}, None
        else:
            is_healthy, verify_msg, details, updated_creds = h_res

        new_status = "connected" if is_healthy else "error"
        if conn.status != new_status or updated_creds is not None or details.get("email"):
            conn.status = new_status
            conn.last_tested_at = datetime.utcnow()
            cfg = dict(conn.config or {})
            cfg["last_verify_message"] = verify_msg
            if details.get("email"):
                cfg["connected_email"] = details["email"]
                cfg["sender_alias"] = details["email"]
                auth_info["account_email"] = details["email"]
            conn.config = cfg
            if updated_creds is not None:
                conn.encrypted_credentials = encrypt_credentials(updated_creds)
            dirty = True

        catalog_item = next((item for item in AVAILABLE_CONNECTORS if item["tool_name"] == conn.tool_name), None)
        capabilities = catalog_item.get("capabilities", []) if catalog_item else []
        safe_config = {k: v for k, v in (conn.config or {}).items() if k not in ("connected_email", "sender_alias") or v != "workspace@isolate.ai"}
        if auth_info["account_email"]:
            safe_config["connected_email"] = auth_info["account_email"]

        output.append({
            "id": str(conn.id),
            "tool_name": conn.tool_name,
            "display_name": conn.display_name or conn.tool_name.title(),
            "status": new_status,
            "auth_verified": is_healthy,
            "account_email": auth_info["account_email"],
            "has_refresh_token": auth_info["has_refresh_token"],
            "granted_scopes": auth_info["granted_scopes"],
            "config": safe_config,
            "capabilities": capabilities,
            "last_tested_at": conn.last_tested_at.isoformat() if conn.last_tested_at else None,
            "created_at": conn.created_at.isoformat() if conn.created_at else None,
        })

    if dirty:
        await db.commit()

    await redis_cache.set(cache_key, output, ttl=60)
    return output


@router.get("/{connection_id}")
async def get_tool_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Get connection details by ID enforcing organization ownership."""
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization context")

    try:
        conn_uuid = uuid.UUID(connection_id)
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid connection or organization ID")

    stmt = select(ToolConnection).where(
        ToolConnection.id == conn_uuid,
        ToolConnection.organization_id == org_uuid
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="Tool connection not found")

    catalog_item = next((item for item in AVAILABLE_CONNECTORS if item["tool_name"] == conn.tool_name), None)
    capabilities = catalog_item.get("capabilities", []) if catalog_item else []

    return {
        "id": str(conn.id),
        "tool_name": conn.tool_name,
        "display_name": conn.display_name or conn.tool_name.title(),
        "status": conn.status,
        "config": conn.config or {},
        "capabilities": capabilities,
        "last_tested_at": conn.last_tested_at.isoformat() if conn.last_tested_at else None,
        "created_at": conn.created_at.isoformat() if conn.created_at else None,
    }


@router.post("")
async def connect_tool(
    body: ConnectToolRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Connect a tool and store encrypted credentials in MultiFernet Vault."""
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing Organization ID")

    try:
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Organization ID format")

    # Reject sandbox / empty credentials — require real authentication
    if not body.credentials or body.credentials.get("sandbox") or body.credentials.get("type") == "sandbox":
        raise HTTPException(
            status_code=400,
            detail="Real credentials are required. Sandbox or placeholder connections are not permitted.",
        )

    config_data = dict(body.config or {})
    encrypted = encrypt_credentials(body.credentials)

    # Determine initial connection health status via live verification
    if body.tool_name in GOOGLE_TOOL_SCOPES:
        if not body.credentials.get("access_token"):
            raise HTTPException(status_code=400, detail="Please connect via Google OAuth.")
        is_healthy, verify_msg, _ = await _verify_google_tool(body.tool_name, body.credentials["access_token"])
        if not is_healthy:
            raise HTTPException(status_code=400, detail=verify_msg)
    else:
        is_healthy, verify_msg, _ = await _verify_api_key_tool(body.tool_name, body.credentials, config_data)
        if not is_healthy:
            raise HTTPException(status_code=400, detail=verify_msg)
    conn_status = "connected"
    config_data["last_verify_message"] = verify_msg

    stmt = select(ToolConnection).where(
        ToolConnection.organization_id == org_uuid,
        ToolConnection.tool_name == body.tool_name
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.status = conn_status
        if encrypted:
            existing.encrypted_credentials = encrypted
        existing.last_tested_at = datetime.utcnow()
        existing.config = {**(existing.config or {}), **config_data}
        await db.commit()
        await db.refresh(existing)
        conn_obj = existing
    else:
        conn_obj = ToolConnection(
            id=uuid.uuid4(),
            organization_id=org_uuid,
            tool_name=body.tool_name,
            display_name=body.display_name or body.tool_name.title(),
            status=conn_status,
            encrypted_credentials=encrypted,
            config=config_data,
            last_tested_at=datetime.utcnow(),
        )
        db.add(conn_obj)
        await db.commit()
        await db.refresh(conn_obj)

    await redis_cache.delete(f"cache:connections:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")

    return {
        "id": str(conn_obj.id),
        "tool_name": conn_obj.tool_name,
        "display_name": conn_obj.display_name,
        "status": conn_obj.status,
        "config": conn_obj.config,
        "message": f"Successfully processed connection for {conn_obj.display_name}",
    }


@router.patch("/{connection_id}")
async def update_tool_connection(
    connection_id: str,
    body: UpdateToolRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Update connection configuration or credentials enforcing organization ownership."""
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization context")

    try:
        conn_uuid = uuid.UUID(connection_id)
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    stmt = select(ToolConnection).where(
        ToolConnection.id == conn_uuid,
        ToolConnection.organization_id == org_uuid
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="Tool connection not found")

    if body.display_name is not None:
        conn.display_name = body.display_name
    if body.config is not None:
        conn.config = {**(conn.config or {}), **body.config}
    if body.credentials is not None and len(body.credentials) > 0:
        conn.encrypted_credentials = encrypt_credentials(body.credentials)

    await db.commit()
    await db.refresh(conn)
    await redis_cache.delete(f"cache:connections:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")

    return {
        "id": str(conn.id),
        "tool_name": conn.tool_name,
        "display_name": conn.display_name,
        "status": conn.status,
        "config": conn.config,
        "message": "Connection configuration updated successfully",
    }


@router.post("/{connection_id}/test")
async def test_tool_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Run health test against connected tool enforcing organization ownership."""
    from sqlalchemy import select
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization context")

    try:
        conn_uuid = uuid.UUID(connection_id)
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    stmt = select(ToolConnection).where(
        ToolConnection.id == conn_uuid,
        ToolConnection.organization_id == org_uuid
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="Tool connection not found")

    # Decrypt credentials for backend-only health check execution
    creds = {}
    if conn.encrypted_credentials:
        try:
            creds = decrypt_credentials(conn.encrypted_credentials)
        except Exception as e:
            log.error("Failed to decrypt credentials for connection test", conn_id=connection_id, error=str(e))
            conn.status = "error"
            conn.last_tested_at = datetime.utcnow()
            await db.commit()
            return {
                "id": str(conn.id),
                "tool_name": conn.tool_name,
                "status": "error",
                "success": False,
                "message": "Failed to decrypt credentials",
                "tested_at": conn.last_tested_at.isoformat(),
            }

    # Reject sandbox / placeholder credentials immediately
    if not creds or creds.get("sandbox") or creds.get("type") == "sandbox" or creds.get("auth") == "oauth_session":
        conn.status = "not_connected"
        conn.last_tested_at = datetime.utcnow()
        await db.commit()
        await redis_cache.delete(f"cache:connections:{org_id}")
        await redis_cache.delete(f"cache:connections:v2:{org_id}")
        await redis_cache.delete(f"cache:connections:v3:{org_id}")
        return {
            "id": str(conn.id),
            "tool_name": conn.tool_name,
            "status": "not_connected",
            "success": False,
            "message": "No real OAuth token or API key found. Please authenticate.",
            "tested_at": conn.last_tested_at.isoformat(),
        }

    # Execute live health check for the specific integration
    is_healthy = False
    verify_msg = "Health check failed"
    verify_details: dict[str, Any] = {}
    try:
        tool_name = (conn.tool_name or "").lower()
        if tool_name in GOOGLE_TOOL_SCOPES:
            # Refresh token if expired before testing
            gw = GoogleWorkspaceConnector(credentials=creds, config=conn.config or {})
            if await gw._ensure_valid_token():
                if gw.credentials != creds:
                    conn.encrypted_credentials = encrypt_credentials(gw.credentials)
                    creds = gw.credentials
                is_healthy, verify_msg, verify_details = await _verify_google_tool(
                    tool_name, creds.get("access_token", "")
                )
                # Ensure real Google account email is populated from userinfo
                if is_healthy:
                    import httpx
                    async with httpx.AsyncClient(timeout=10) as client:
                        ui = await client.get(
                            "https://www.googleapis.com/oauth2/v2/userinfo",
                            headers={"Authorization": f"Bearer {creds.get('access_token', '')}"},
                        )
                        if ui.status_code == 200 and ui.json().get("email"):
                            real_email = ui.json()["email"]
                            conn.config = {**(conn.config or {}), "connected_email": real_email, "sender_alias": real_email}
            else:
                is_healthy = False
                verify_msg = "Google OAuth token expired or revoked. Please reconnect."
            await gw.close()
        else:
            is_healthy, verify_msg, verify_details = await _verify_api_key_tool(
                tool_name, creds, conn.config or {}
            )
    except Exception as e:
        log.warning("Health check execution error", tool_name=conn.tool_name, error=str(e))
        is_healthy = False
        verify_msg = f"Health check error: {str(e)}"

    conn.status = "connected" if is_healthy else "error"
    conn.last_tested_at = datetime.utcnow()
    conn.config = {**(conn.config or {}), "last_verify_message": verify_msg}
    await db.commit()
    await redis_cache.delete(f"cache:connections:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")

    return {
        "id": str(conn.id),
        "tool_name": conn.tool_name,
        "status": conn.status,
        "success": is_healthy,
        "message": verify_msg,
        "details": verify_details,
        "tested_at": conn.last_tested_at.isoformat(),
    }


@router.delete("/{connection_id}")
async def disconnect_tool(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_authenticated_user),
):
    """Disconnect and delete stored credentials for a tool enforcing tenant isolation."""
    from sqlalchemy import select, delete
    from db.models.core import ToolConnection

    org_id = current_user.organization_id or current_user.tenant_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization context")

    try:
        conn_uuid = uuid.UUID(connection_id)
        org_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    stmt = select(ToolConnection).where(
        ToolConnection.id == conn_uuid,
        ToolConnection.organization_id == org_uuid
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="Tool connection not found")

    del_stmt = delete(ToolConnection).where(ToolConnection.id == conn_uuid)
    await db.execute(del_stmt)
    await db.commit()
    await redis_cache.delete(f"cache:connections:{org_id}")
    await redis_cache.delete(f"cache:connections:v2:{org_id}")
    await redis_cache.delete(f"cache:connections:v3:{org_id}")

    return {"message": "Tool disconnected successfully", "id": connection_id}


