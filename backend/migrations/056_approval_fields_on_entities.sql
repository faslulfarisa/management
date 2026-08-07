-- Migration 056: Add missing approval tracking fields to entity tables
-- Enables the centralized ApprovalEngineService to sync status back to each
-- entity table and store mandatory approval/rejection reasons.
-- Safe: additive only — new columns with sensible defaults, no existing data modified.

-- Mandatory approval reason on tables that already have approval_step/log (migration 052)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

-- attendance_corrections: promote from simple approve/reject to multi-step
ALTER TABLE attendance_corrections
  ADD COLUMN IF NOT EXISTS approval_step    INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approval_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_ac_approval_step
  ON attendance_corrections(tenant_id, approval_step)
  WHERE status = 'pending';

-- employee_branch_transfers: add multi-step tracking (has status but no step/log)
ALTER TABLE employee_branch_transfers
  ADD COLUMN IF NOT EXISTS approval_step   INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ebt_approval_step
  ON employee_branch_transfers(tenant_id, approval_step)
  WHERE status = 'pending';

-- payroll_runs: add multi-step approval before finalization
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS approval_step   INT   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_log    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

-- biometric_devices: registration approval flow
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

-- Backfill: all existing devices were registered without approval flow, mark as approved
UPDATE biometric_devices
  SET registration_status = 'approved'
  WHERE registration_status IS NULL OR registration_status = '';
