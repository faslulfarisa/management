-- Migration 149: Employee fine appeal workflow
-- Adds a self-service appeal entity that routes through the centralized approval inbox.
-- Safe: additive table + approval-chain constraint replacement only.

CREATE TABLE IF NOT EXISTS employee_fine_appeals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id           UUID        REFERENCES branches(id) ON DELETE SET NULL,
  employee_id         UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fine_id             UUID        NOT NULL REFERENCES employee_fines(id) ON DELETE CASCADE,

  reason              TEXT        NOT NULL,
  requested_change    TEXT,

  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),

  approval_step       INT         NOT NULL DEFAULT 1,
  approval_log        JSONB       NOT NULL DEFAULT '[]',
  approval_reason     TEXT,
  approved_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  created_by          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efa_tenant_employee
  ON employee_fine_appeals(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_efa_fine
  ON employee_fine_appeals(fine_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_efa_active_fine
  ON employee_fine_appeals(tenant_id, fine_id, employee_id)
  WHERE status IN ('pending', 'under_review');

ALTER TABLE branch_approval_chains DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;
ALTER TABLE branch_approval_chains ADD CONSTRAINT branch_approval_chains_workflow_type_check CHECK (workflow_type IN (
  'leave', 'leave_encashment', 'expense', 'reimbursement', 'transfer', 'payroll', 'payroll_payment',
  'attendance_correction', 'manual_attendance', 'overtime', 'shift_change', 'shift_override',
  'biometric_device', 'onboarding', 'exit_request', 'exit_clearance', 'ff_settlement',
  'compliance_document', 'vacancy_request', 'job_description', 'offer', 'probation_confirmation',
  'workforce_plan', 'salary_revision', 'role_change', 'policy_change', 'vendor_approval',
  'fine_deduction', 'fine_appeal'
));
