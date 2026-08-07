-- Migration 058: Add fine_deductions tracking columns to payslips
-- Allows payslip records to carry the aggregate fine deduction amount and
-- references to the individual employee_fines rows that were deducted.
-- Safe: additive only — new columns with defaults, no existing data modified.

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS fine_deductions     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_deduction_refs UUID[]        NOT NULL DEFAULT '{}';

-- Index to quickly find payslips that carry fine deductions (finance audit queries)
CREATE INDEX IF NOT EXISTS idx_ps_fine_deductions
  ON payslips(tenant_id)
  WHERE fine_deductions > 0;
