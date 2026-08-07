-- Migration 112: Exit management + asset management permissions.
-- Follows the established pattern from migration 064 (payroll payment
-- permissions): seed `permissions` rows and grant them to system roles via
-- `role_permissions`, since `backend/scripts/seed.ts` only runs at initial
-- setup and won't retroactively grant new permissions to already-deployed
-- tenants. Permission strings mirror `backend/src/shared/permissions.constants.ts`
-- (`${module}:${action}`).

INSERT INTO permissions (module, action, description) VALUES
  ('hr.exit', 'view',                 'View exit/resignation requests'),
  ('hr.exit', 'create',               'Create exit requests on behalf of an employee'),
  ('hr.exit', 'edit',                 'Edit exit request details'),
  ('hr.exit', 'approve',              'Approve or reject exit requests (admin override path)'),
  ('hr.exit', 'delete',               'Delete exit requests'),
  ('hr.exit.checklist', 'manage',     'Manage exit checklist items and assignments'),
  ('hr.exit.clearance', 'manage',     'Manage and approve department exit clearances'),
  ('hr.exit.settlement', 'view',      'View Full & Final settlements'),
  ('hr.exit.settlement', 'calculate', 'Run Full & Final settlement auto-calculation'),
  ('hr.exit.settlement', 'approve',   'Approve Full & Final settlements'),
  ('hr.exit.settlement', 'pay',       'Mark Full & Final settlements as paid'),
  ('hr.exit.templates', 'manage',     'Manage exit checklist/policy templates'),
  ('assets', 'view',                  'View asset inventory and assignments'),
  ('assets', 'manage',                'Manage asset types, items, and assignments'),
  ('assets', 'recover',               'Process asset recovery during offboarding')
ON CONFLICT (module, action) DO NOTHING;

-- Super Admin / Tenant Admin / HR Manager / Finance Manager get full exit +
-- asset management access (mirrors the role set granted payroll-payment
-- permissions in migration 064 — no dedicated IT role exists in this app yet).
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Tenant Admin', 'HR Manager', 'Finance Manager')
  AND r.is_system = TRUE
  AND (p.module, p.action) IN (
    ('hr.exit', 'view'), ('hr.exit', 'create'), ('hr.exit', 'edit'),
    ('hr.exit', 'approve'), ('hr.exit', 'delete'),
    ('hr.exit.checklist', 'manage'), ('hr.exit.clearance', 'manage'),
    ('hr.exit.settlement', 'view'), ('hr.exit.settlement', 'calculate'),
    ('hr.exit.settlement', 'approve'), ('hr.exit.settlement', 'pay'),
    ('hr.exit.templates', 'manage'),
    ('assets', 'view'), ('assets', 'manage'), ('assets', 'recover')
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
