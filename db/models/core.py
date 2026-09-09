"""
db/models/core.py
=================
Core Platform ORM Models: Organizations, Users, Tool Connections, Workflows, Agents, Approvals, Evidence, Audit.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class Organization(Base):
    __tablename__ = "organizations"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(255), nullable=False)
    industry        = Column(String(100), nullable=False, default="saas")
    enabled_modules = Column(JSONB, nullable=False, default=["medical_tourism"])
    profile_config  = Column(JSONB, nullable=False, default={})
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OrganizationUser(Base):
    __tablename__ = "organization_users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=False)
    user_id         = Column(UUID(as_uuid=True), nullable=False)
    email           = Column(String(255), nullable=False)
    full_name       = Column(String(255))
    role            = Column(String(50), nullable=False, default="org_user") # platform_admin, org_admin, org_user
    created_at      = Column(DateTime, default=datetime.utcnow)

class ToolConnection(Base):
    __tablename__ = "tool_connections"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id       = Column(UUID(as_uuid=True), nullable=False)
    tool_name             = Column(String(100), nullable=False)
    display_name          = Column(String(255))
    status                = Column(String(50), nullable=False, default="not_connected") # not_connected, connected, error
    encrypted_credentials = Column(Text)
    config                = Column(JSONB, default={})
    last_tested_at        = Column(DateTime)
    created_at            = Column(DateTime, default=datetime.utcnow)

class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=True)
    name            = Column(String(255), nullable=False)
    industry        = Column(String(100), nullable=False, default="general")
    version         = Column(String(20), nullable=False, default="1.0.0")
    dag_definition  = Column(JSONB, nullable=False)
    is_template     = Column(Boolean, default=False)
    active          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id  = Column(UUID(as_uuid=True), nullable=False)
    definition_id    = Column(UUID(as_uuid=True), nullable=True)
    workflow_name    = Column(String(255), nullable=False)
    status           = Column(String(50), nullable=False, default="pending")
    trigger_payload  = Column(JSONB, nullable=False, default={})
    current_node     = Column(String(100))
    context          = Column(JSONB, default={})
    started_at       = Column(DateTime, default=datetime.utcnow)
    completed_at     = Column(DateTime)
    outcome          = Column(JSONB)
    error_log        = Column(Text)
    total_tokens_in  = Column(Integer, default=0)
    total_tokens_out = Column(Integer, default=0)
    total_cost_usd   = Column(Float, default=0.0)

class AgentRunRecord(Base):
    __tablename__ = "agent_run_records"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id      = Column(UUID(as_uuid=True), nullable=False)
    node_id          = Column(String(100), nullable=False)
    agent_capability = Column(String(100), nullable=False)
    status           = Column(String(50), default="pending")
    cost_usd         = Column(Float, default=0.0)
    tokens_in        = Column(Integer, default=0)
    tokens_out       = Column(Integer, default=0)
    model_used       = Column(String(200))
    confidence       = Column(Float)
    duration_ms      = Column(Integer)
    error            = Column(Text)
    tools_used       = Column(JSONB, default=list)
    completed_at     = Column(DateTime, default=datetime.utcnow)

class ApprovalItem(Base):
    __tablename__ = "approval_items"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id     = Column(UUID(as_uuid=True), nullable=False)
    instance_id         = Column(UUID(as_uuid=True), nullable=True)
    node_id             = Column(String(100))
    review_type         = Column(String(100), nullable=False)
    reason              = Column(Text, nullable=False)
    context_brief       = Column(Text, nullable=False)
    payload             = Column(JSONB, default={})
    status              = Column(String(50), default="pending")
    required_signatures = Column(Integer, default=1)
    signatures          = Column(JSONB, default=list)
    decided_by          = Column(String(255))
    decided_at          = Column(DateTime)
    created_at          = Column(DateTime, default=datetime.utcnow)

class EvidenceRecord(Base):
    __tablename__ = "evidence_records"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id    = Column(UUID(as_uuid=True), nullable=False)
    instance_id        = Column(UUID(as_uuid=True), nullable=False)
    evidence_json_path = Column(String(500), nullable=False)
    checksum           = Column(String(64))
    created_at         = Column(DateTime, default=datetime.utcnow)

class AuditEvent(Base):
    __tablename__ = "audit_events"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True))
    actor_id        = Column(String(255), nullable=False)
    action          = Column(String(100), nullable=False)
    entity_type     = Column(String(100), nullable=False)
    entity_id       = Column(String(255))
    metadata_       = Column("metadata", JSONB, default={})
    created_at      = Column(DateTime, default=datetime.utcnow)

class ProcessedEmailEvent(Base):
    __tablename__ = "processed_email_events"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), nullable=True)
    message_id      = Column(String(255), unique=True, nullable=False, index=True)
    batch_id        = Column(String(255), nullable=True, index=True)
    instance_id     = Column(UUID(as_uuid=True), nullable=True)
    source          = Column(String(100), default="synthetic_email")
    processed_at    = Column(DateTime, default=datetime.utcnow)

