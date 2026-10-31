-- Down migration: 003_operator_auth.down.sql
DROP TABLE IF EXISTS operator_sessions;
DROP TABLE IF EXISTS operators;
