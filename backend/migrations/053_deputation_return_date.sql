-- Migration 053: Deputation-specific columns on employee_branch_transfers
-- Phase 6: enables auto-reversion cron for timed deputations.
-- Safe: additive only.

ALTER TABLE employee_branch_transfers
  ADD COLUMN IF NOT EXISTS return_date        DATE,
  ADD COLUMN IF NOT EXISTS original_branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS deputation_notes   TEXT;

-- Partial index for the deputation-reversion cron query
CREATE INDEX IF NOT EXISTS idx_ebt_deputation_active
  ON employee_branch_transfers(tenant_id, return_date)
  WHERE transfer_type = 'deputation' AND status = 'approved' AND return_date IS NOT NULL;
