-- Up migration: 004_operational_events.sql
-- Creates operational_events table for Phase 5 dynamic event tracking and replanning,
-- and blocked_zones table for operator-managed hazard zones.

CREATE TABLE IF NOT EXISTS operational_events (
  id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL CHECK (event_type IN (
    'REQUEST_CREATED',
    'REQUEST_FLAGGED_DUPLICATE',
    'REQUEST_CANCELLED',
    'RESOURCE_OFFLINE',
    'RESOURCE_AVAILABLE',
    'ROAD_BLOCKED',
    'ROAD_REOPENED'
  )),
  entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('REQUEST', 'RESOURCE', 'ROAD_ZONE', 'ASSIGNMENT')),
  entity_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64),
  actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('CITIZEN', 'OPERATOR', 'SYSTEM')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(64),
  idempotency_key VARCHAR(128) UNIQUE,
  entity_version INTEGER NOT NULL DEFAULT 1,
  processing_status VARCHAR(32) NOT NULL DEFAULT 'RECORDED' CHECK (processing_status IN (
    'RECORDED',
    'SCOPE_IDENTIFIED',
    'AWAITING_REPAIR',
    'FAILED'
  )),
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code VARCHAR(64),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operational_events_type ON operational_events (event_type);
CREATE INDEX IF NOT EXISTS idx_operational_events_entity ON operational_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_operational_events_status ON operational_events (processing_status);
CREATE INDEX IF NOT EXISTS idx_operational_events_occurred_at ON operational_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_operational_events_created_at ON operational_events (created_at);

CREATE TABLE IF NOT EXISTS blocked_zones (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128),
  severity VARCHAR(32) NOT NULL DEFAULT 'BLOCKED' CHECK (severity IN ('BLOCKED', 'WATER_SURGE', 'CAUTION')),
  geometry GEOGRAPHY(Polygon, 4326) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_zones_geometry ON blocked_zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_blocked_zones_active ON blocked_zones (is_active);
