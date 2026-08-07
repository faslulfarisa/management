-- Migration 107: Register 'exit_request' as a branch_approval_chains workflow type
-- Routes the main resignation approval chain (Manager -> HR -> Org Admin) through
-- the existing generic ApprovalEngineService, exactly like leave/expense/transfer.
-- 'exit_clearance' and 'ff_settlement' were already present (migration 055) but
-- unused; this migration carries the full current list forward (from 064) and
-- activates 'ff_settlement' for the Full & Final settlement approval flow.
-- Safe: constraint replacement only — no data modified.

ALTER TABLE branch_approval_chains
  DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;

ALTER TABLE branch_approval_chains
  ADD CONSTRAINT branch_approval_chains_workflow_type_check
  CHECK (workflow_type IN (
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
    'fine_deduction',
    'payroll_payment',
    -- New type
    'exit_request'
  ));
