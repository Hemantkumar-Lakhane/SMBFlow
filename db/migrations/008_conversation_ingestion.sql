-- =============================================================================
-- Migration 008: Meeting Intelligence — Automatic Conversation Ingestion
-- Creates conversation_ingestion_records table (idempotent per org + external_event_id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_ingestion_records (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,
    external_event_id  VARCHAR(255) NOT NULL,
    source             VARCHAR(100) NOT NULL DEFAULT 'webhook',
    status             VARCHAR(50) NOT NULL DEFAULT 'received',
    conversation_title VARCHAR(255) NOT NULL,
    contact_name       VARCHAR(255) NOT NULL,
    conversation_type  VARCHAR(100) NOT NULL DEFAULT 'Online Meeting',
    conversation_date  VARCHAR(50) NOT NULL,
    language           VARCHAR(50) NOT NULL DEFAULT 'Auto Detect',
    recording_data     JSONB NOT NULL DEFAULT '{}',
    instance_id        UUID,
    error_message      TEXT,
    retry_count        INTEGER NOT NULL DEFAULT 0,
    received_at        TIMESTAMPTZ DEFAULT now(),
    completed_at       TIMESTAMPTZ,
    last_attempt_at    TIMESTAMPTZ,
    metadata           JSONB DEFAULT '{}',
    CONSTRAINT uq_conv_ingest_org_event UNIQUE (organization_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_ingest_org ON conversation_ingestion_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_conv_ingest_event ON conversation_ingestion_records(external_event_id);
CREATE INDEX IF NOT EXISTS idx_conv_ingest_instance ON conversation_ingestion_records(instance_id);
CREATE INDEX IF NOT EXISTS idx_conv_ingest_status ON conversation_ingestion_records(status);
