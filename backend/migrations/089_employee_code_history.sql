-- Migration 089: Employee Code Change History
-- Tracks every change to employees.employee_code for audit visibility

CREATE TABLE IF NOT EXISTS employee_code_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  previous_code TEXT        NOT NULL,
  new_code      TEXT        NOT NULL,
  changed_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_code_history_employee
  ON employee_code_history(employee_id, changed_at DESC);
