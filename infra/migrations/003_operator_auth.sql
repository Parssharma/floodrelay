-- Migration 003: Operator Authentication & Session Management
-- Creates tables for operator accounts, password verification, and active sessions.

CREATE TABLE IF NOT EXISTS operators (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(256) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'OPERATOR' CHECK (role IN ('OPERATOR', 'ADMIN', 'DISPATCHER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_username ON operators (username);

CREATE TABLE IF NOT EXISTS operator_sessions (
  token VARCHAR(128) PRIMARY KEY,
  operator_id VARCHAR(64) NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_token ON operator_sessions (token);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_expires_at ON operator_sessions (expires_at);
