CREATE TABLE IF NOT EXISTS employee_branch_transfers (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
  employee_id         UUID        NOT NULL REFERENCES employees(id),
  from_branch_id      UUID        REFERENCES branches(id),
  to_branch_id        UUID        NOT NULL REFERENCES branches(id),
  from_department_id  UUID        REFERENCES departments(id),
  to_department_id    UUID        REFERENCES departments(id),
  transfer_type       VARCHAR(50) NOT NULL DEFAULT 'permanent',
  effective_date      DATE        NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'pending',
  remarks             TEXT,
  rejection_reason    TEXT,
  requested_by        UUID        REFERENCES users(id),
  approved_by         UUID        REFERENCES users(id),
  rejected_by         UUID        REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ebt_employee ON employee_branch_transfers(employee_id);
CREATE INDEX IF NOT EXISTS idx_ebt_tenant   ON employee_branch_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ebt_status   ON employee_branch_transfers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ebt_from     ON employee_branch_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_ebt_to       ON employee_branch_transfers(to_branch_id);
