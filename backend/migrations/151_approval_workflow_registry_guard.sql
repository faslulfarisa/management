-- Migration 151: Restrict approval-chain configuration to workflows that
-- currently submit through ApprovalEngineService and have entity status sync.
-- Unsupported draft workflows remain hidden until their modules are wired.

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
    'attendance_correction',
    'overtime',
    'shift_override',
    'biometric_device',
    'exit_request',
    'ff_settlement',
    'compliance_document',
    'vacancy_request',
    'job_description',
    'offer',
    'probation_confirmation',
    'workforce_plan',
    'fine_deduction',
    'fine_appeal'
  )) NOT VALID;
