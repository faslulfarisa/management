-- Migration 055: Expand branch_approval_chains workflow_type constraint
-- Adds 12 new workflow types so admin can configure approval chains for all
-- operational activities beyond the original 5 (leave, expense, reimbursement,
-- transfer, payroll).
-- Safe: constraint replacement only — no data modified.

ALTER TABLE branch_approval_chains
  DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;

ALTER TABLE branch_approval_chains
  ADD CONSTRAINT branch_approval_chains_workflow_type_check
  CHECK (workflow_type IN (
    -- Original types (preserved)
    'leave',
    'expense',
    'reimbursement',
    'transfer',
    'payroll',
    -- New types
    'attendance_correction',
    'manual_attendance',
    'overtime',
    'shift_change',
    'biometric_device',
    'onboarding',
    'exit_clearance',
    'ff_settlement',
    'salary_revision',
    'role_change',
    'policy_change',
    'vendor_approval'
  ));
