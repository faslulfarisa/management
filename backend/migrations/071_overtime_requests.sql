-- 071_overtime_requests.sql
-- Controlled overtime eligibility and approval-gated payment workflow.
-- Only employees assigned an overtime_policy template can request OT.
-- All OT payments require an approved overtime_request before entering payroll.

CREATE TABLE IF NOT EXISTS overtime_requests (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  employee_id           UUID          NOT NULL,
  branch_id             UUID,
  department_id         UUID,

  -- Request details
  ot_date               DATE          NOT NULL,
  shift_id              UUID,
  requested_hours       NUMERIC(5,2)  NOT NULL CHECK (requested_hours > 0 AND requested_hours <= 24),
  reason                TEXT          NOT NULL,
  notes                 TEXT,

  -- Attendance validation snapshot (captured at submission time)
  clock_in              TIMESTAMPTZ,
  clock_out             TIMESTAMPTZ,
  shift_end_time        TIME,
  attendance_ot_minutes INTEGER       NOT NULL DEFAULT 0,

  -- OT policy that was active when this request was created
  ot_policy_template_id UUID,

  -- Approval workflow (synced by approval engine)
  status                VARCHAR(30)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','under_review','approved','rejected','cancelled','escalated')),
  approval_step         INTEGER       NOT NULL DEFAULT 1,
  approval_log          JSONB         NOT NULL DEFAULT '[]'::jsonb,
  approved_hours        NUMERIC(5,2),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  approval_reason       TEXT,
  rejection_reason      TEXT,

  -- Payroll linkage (set when payslip is generated)
  payroll_month         INTEGER       CHECK (payroll_month BETWEEN 1 AND 12),
  payroll_year          INTEGER,
  payslip_id            UUID,
  ot_amount             NUMERIC(12,2),

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ot_req_tenant_employee
  ON overtime_requests(tenant_id, employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ot_req_tenant_status
  ON overtime_requests(tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ot_req_tenant_date
  ON overtime_requests(tenant_id, ot_date DESC)
  WHERE deleted_at IS NULL;

-- Payroll lookup: approved OT for a period
CREATE INDEX IF NOT EXISTS idx_ot_req_payroll
  ON overtime_requests(tenant_id, employee_id, payroll_month, payroll_year)
  WHERE status = 'approved' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ot_req_branch
  ON overtime_requests(tenant_id, branch_id, status)
  WHERE deleted_at IS NULL;

-- Prevent duplicate active requests for the same employee on the same date.
-- Rejected/cancelled requests are excluded so employees can re-apply.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_req_unique_active
  ON overtime_requests(tenant_id, employee_id, ot_date)
  WHERE status NOT IN ('rejected', 'cancelled') AND deleted_at IS NULL;
