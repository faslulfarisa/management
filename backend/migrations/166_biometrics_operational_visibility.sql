-- 166_biometrics_operational_visibility.sql
-- Durable, HR-safe operational events for biometrics dashboards.
-- Additive only.

CREATE TABLE IF NOT EXISTS biometric_operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  source TEXT NOT NULL,
  provider_name TEXT,
  device_id TEXT,
  terminal_id UUID REFERENCES attendance_terminals(id) ON DELETE SET NULL,
  employee_code TEXT,
  request_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_biometric_operational_events_tenant_time
  ON biometric_operational_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_biometric_operational_events_type
  ON biometric_operational_events (tenant_id, event_type, occurred_at DESC);

COMMENT ON TABLE biometric_operational_events IS
  'Aggregated operational events for HR-facing biometrics troubleshooting dashboards.';
