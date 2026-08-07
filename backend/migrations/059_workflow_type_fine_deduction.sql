-- Migration 059: Add fine_deduction workflow type to approval chains and requests
-- Allows HR/Finance to configure multi-step approval chains for fine creation
-- via the existing branch_approval_chains configuration UI.
-- Safe: constraint replacement only — no data modified.

-- Extend branch_approval_chains to accept the new workflow type
ALTER TABLE branch_approval_chains
  DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;

ALTER TABLE branch_approval_chains
  ADD CONSTRAINT branch_approval_chains_workflow_type_check
  CHECK (workflow_type IN (
    -- Original types (preserved from migration 055)
    'leave',
    'expense',
    'reimbursement',
    'transfer',
    'payroll',
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
    'vendor_approval',
    -- New type
    'fine_deduction'
  ));
