-- Migration 124: Keep approval-chain workflow types aligned with ApprovalEngine submitters.
-- Safe: constraint replacement only; no data is modified.

ALTER TABLE branch_approval_chains
  DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;

ALTER TABLE branch_approval_chains
  ADD CONSTRAINT branch_approval_chains_workflow_type_check
  CHECK (workflow_type IN (
    'leave',
    'leave_encashment',
    'expense',
    'reimbursement',
    'transfer',
    'payroll',
    'payroll_payment',
    'attendance_correction',
    'manual_attendance',
    'overtime',
    'shift_change',
    'biometric_device',
    'onboarding',
    'exit_request',
    'exit_clearance',
    'ff_settlement',
    'compliance_document',
    'vacancy_request',
    'job_description',
    'offer',
    'probation_confirmation',
    'workforce_plan',
    'salary_revision',
    'role_change',
    'policy_change',
    'vendor_approval',
    'fine_deduction'
  ));
