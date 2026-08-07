-- 070_leave_encashment_requests.sql
-- Creates the leave_encashment_requests table to track employee encashment requests.
-- Encashment rules (enabled, max_days, timing, basis, approval) are stored in
-- leave_policy templates; this table holds the actual request records.

CREATE TABLE IF NOT EXISTS leave_encashment_requests (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  employee_id      UUID         NOT NULL REFERENCES employees(id),
  leave_type_id    UUID         NOT NULL REFERENCES leave_types(id),
  days             DECIMAL(5,2) NOT NULL,
  daily_rate       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  year             INT          NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  remarks          TEXT,
  processed_by     UUID,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ler_tenant   ON leave_encashment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ler_employee ON leave_encashment_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_ler_emp_year ON leave_encashment_requests(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_ler_status   ON leave_encashment_requests(status);
