-- 064_payroll_payment_permissions.sql
-- Adds fine-grained payroll payment permissions and grants them to relevant
-- system roles. Follows the established pattern from migrations 016 and 017.
-- System roles in this project: Super Admin, Tenant Admin, HR Manager,
-- Finance Manager, Employee.

-- ─── New permissions ─────────────────────────────────────────────────────────

INSERT INTO permissions (module, action, description) VALUES
  ('payroll', 'view_payments',       'View payroll payment history and transaction status'),
  ('payroll', 'process_payment',     'Initiate salary payment (single or bulk payslip payout)'),
  ('payroll', 'manage_bank_details', 'Add, edit, and manage employee bank account details'),
  ('payroll', 'retry_payment',       'Retry a failed payroll payment'),
  ('payroll', 'reverse_payment',     'Reverse or cancel a completed payroll payment'),
  ('payroll', 'view_bank_details',   'View employee bank account details (masked)')
ON CONFLICT (module, action) DO NOTHING;

-- ─── Role grants ─────────────────────────────────────────────────────────────

-- Super Admin, Tenant Admin, HR Manager, Finance Manager get full payment access
-- (excluding reverse_payment — see below)
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Tenant Admin', 'HR Manager', 'Finance Manager')
  AND r.is_system = TRUE
  AND p.module = 'payroll'
  AND p.action IN (
    'view_payments',
    'process_payment',
    'manage_bank_details',
    'retry_payment',
    'view_bank_details'
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Only Finance Manager and Super Admin may reverse payments
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Finance Manager', 'Super Admin')
  AND r.is_system = TRUE
  AND p.module = 'payroll'
  AND p.action = 'reverse_payment'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- ─── Extend approval workflow types ──────────────────────────────────────────
-- Add payroll_payment as a valid approval chain workflow type.
-- Safe: constraint replacement only — no data modified.

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
    -- Added in migration 059
    'fine_deduction',
    -- New type added here
    'payroll_payment'
  ));
