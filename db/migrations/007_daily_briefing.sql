-- =============================================================================
-- Migration 007: Meeting Intelligence — Daily Briefing
-- Creates daily_briefings table (one row per org per date, idempotent).
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_briefings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    briefing_date    VARCHAR(10) NOT NULL,      -- YYYY-MM-DD
    status           VARCHAR(50) NOT NULL DEFAULT 'pending',
    content          JSONB NOT NULL DEFAULT '{}',
    idempotency_key  VARCHAR(255) NOT NULL,     -- "{org_id}:{YYYY-MM-DD}"
    scheduled_time_utc VARCHAR(10),            -- HH:MM e.g. "08:00"
    generated_at     TIMESTAMPTZ,
    error            TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_daily_briefing_org_date UNIQUE (organization_id, briefing_date),
    CONSTRAINT uq_daily_briefing_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_org  ON daily_briefings(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_date ON daily_briefings(briefing_date);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_ikey ON daily_briefings(idempotency_key);
