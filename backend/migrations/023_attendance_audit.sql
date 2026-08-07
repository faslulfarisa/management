-- 023_attendance_audit.sql
-- Immutable attendance audit trail + correction workflow.
--
-- Supports:
--   - Payroll dispute investigation
--   - Manual clock-in/clock-out corrections with approval flow
--   - Sync troubleshooting (trace which provider wrote which record)
--   - Regulatory compliance (complete change history)
--
-- Run after: 022_punch_fingerprints.sql
-- SAFE: fully additive.

-- ── Audit Log (immutable event stream) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  employee_id          UUID        REFERENCES employees(id) ON DELETE SET NULL,
  attendance_record_id UUID        REFERENCES attendance_records(id) ON DELETE SET NULL,

  -- What happened
  event_type    TEXT  NOT NULL,
  -- 'punch_received'     — raw punch ingested from a provider
  -- 'record_created'     — new attendance_records row inserted
  -- 'record_updated'     — existing row modified (UPSERT changed a field)
  -- 'manual_correction'  — human edited clock_in / clock_out / status
  -- 'approval_granted'   — correction request approved
  -- 'approval_rejected'  — correction request rejected
  -- 'record_reverted'    — record rolled back to a prior state

  -- Who triggered it
  actor_type   TEXT  NOT NULL DEFAULT 'system',
  -- 'system' | 'provider' | 'user' | 'api'
  actor_id     TEXT,
  -- user UUID for 'user', provider name for 'provider', key prefix for 'api'

  -- Immutable state snapshots
  before_state JSONB,
  after_state  JSONB,

  -- Additional context (device serial, fingerprint hash, IP address, etc.)
  metadata     JSONB,

  -- Rows are never updated or deleted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aal_tenant_emp
  ON attendance_audit_logs (tenant_id, employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aal_record
  ON attendance_audit_logs (attendance_record_id)
  WHERE attendance_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aal_event_type
  ON attendance_audit_logs (tenant_id, event_type, created_at DESC);

COMMENT ON TABLE attendance_audit_logs IS
  'Immutable event log for all attendance record changes. '
  'Never UPDATE or DELETE rows in this table.';

-- ── Correction Workflow ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  employee_id          UUID        NOT NULL REFERENCES employees(id),
  attendance_record_id UUID        NOT NULL REFERENCES attendance_records(id),

  -- Who requested and who decided
  requested_by         UUID        NOT NULL,
  approved_by          UUID,

  -- Lifecycle state
  status               TEXT        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected' | 'applied' | 'reverted'

  -- State at time of request (for rollback support)
  original_state       JSONB       NOT NULL,

  -- What the requestor wants the record changed to
  requested_state      JSONB       NOT NULL,

  reason               TEXT,
  notes                TEXT,

  requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at           TIMESTAMPTZ,
  applied_at           TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ac_pending
  ON attendance_corrections (tenant_id, status, requested_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ac_employee
  ON attendance_corrections (tenant_id, employee_id, requested_at DESC);

COMMENT ON TABLE attendance_corrections IS
  'Approval workflow for attendance record corrections. '
  'original_state enables rollback; requested_state is what will be applied on approval.';
