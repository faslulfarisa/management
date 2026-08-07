-- 074_template_assignment_exclusions.sql
-- Adds employee-level exclusion support on top of bulk template assignments.
-- When a template is assigned to a department/designation/property scope,
-- individual employees can be excluded so the assignment does not apply to them.

CREATE TABLE IF NOT EXISTS template_assignment_exclusions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL,
  template_assignment_id UUID NOT NULL REFERENCES template_assignments(id) ON DELETE CASCADE,
  employee_id            UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  excluded_by            UUID REFERENCES users(id),
  reason                 TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, template_assignment_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_tae_assignment ON template_assignment_exclusions(template_assignment_id);
CREATE INDEX IF NOT EXISTS idx_tae_employee   ON template_assignment_exclusions(employee_id);
CREATE INDEX IF NOT EXISTS idx_tae_tenant     ON template_assignment_exclusions(tenant_id);
