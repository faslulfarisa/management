-- 105_attendance_summary_payroll_lock_v2.sql
-- Attendance Summary & Payroll Lock workflow refactor.
-- Additive only: widens the status lifecycle, adds business-day/payable-day
-- breakdown, generation/review/lock/processing metadata, version history,
-- and branch-scoped holidays. Existing rows/values remain valid.

-- ── payroll_attendance_summary: richer lifecycle + breakdown columns ───────────

ALTER TABLE payroll_attendance_summary DROP CONSTRAINT IF EXISTS payroll_attendance_summary_status_check;

ALTER TABLE payroll_attendance_summary
  ADD COLUMN IF NOT EXISTS branch_id            UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS department_id        UUID REFERENCES departments(id),

  ADD COLUMN IF NOT EXISTS business_working_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_days         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_off_days       INT NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS paid_leave_days      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_days    INT NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS payable_days         NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_ot_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS generated_by         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS generated_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_version   INT NOT NULL DEFAULT 1,

  ADD COLUMN IF NOT EXISTS reviewed_by          UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_notes       TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason     TEXT,
  ADD COLUMN IF NOT EXISTS correction_notes     TEXT,

  ADD COLUMN IF NOT EXISTS lock_reason          TEXT,

  ADD COLUMN IF NOT EXISTS payroll_run_id       UUID REFERENCES payroll_runs(id),
  ADD COLUMN IF NOT EXISTS payslip_count        INT,
  ADD COLUMN IF NOT EXISTS processed_by         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS processed_at         TIMESTAMPTZ;

-- Backfill: business_working_days defaults to the existing calendar-day figure,
-- payable_days approximates present+leave, until the next compute recalculates properly.
UPDATE payroll_attendance_summary
  SET business_working_days = total_working_days
  WHERE business_working_days = 0;

UPDATE payroll_attendance_summary
  SET payable_days = present_days + leave_days
  WHERE payable_days = 0;

-- pending_approval was defined but never set by any code path — rename in place.
UPDATE payroll_attendance_summary SET status = 'pending_review' WHERE status = 'pending_approval';

ALTER TABLE payroll_attendance_summary
  ADD CONSTRAINT payroll_attendance_summary_status_check
  CHECK (status IN ('draft','pending_review','approved','payroll_locked','payroll_processed','rejected','cancelled'));

CREATE INDEX IF NOT EXISTS idx_pas_branch_status ON payroll_attendance_summary(tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_pas_dept_status ON payroll_attendance_summary(tenant_id, department_id, status);
CREATE INDEX IF NOT EXISTS idx_pas_payroll_run ON payroll_attendance_summary(payroll_run_id) WHERE payroll_run_id IS NOT NULL;

-- ── Version history: append-only snapshot of every (re)computation ─────────────

CREATE TABLE IF NOT EXISTS payroll_attendance_summary_versions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  summary_id         UUID NOT NULL REFERENCES payroll_attendance_summary(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL,
  employee_id        UUID NOT NULL REFERENCES employees(id),
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  generation_version INT NOT NULL,
  snapshot           JSONB NOT NULL,
  generated_by       UUID REFERENCES users(id),
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pasv_summary ON payroll_attendance_summary_versions(summary_id, generation_version DESC);
CREATE INDEX IF NOT EXISTS idx_pasv_tenant_period ON payroll_attendance_summary_versions(tenant_id, period_start, period_end);

-- ── Branch-scoped holidays (org-wide when branch_id IS NULL) ───────────────────

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_holidays_branch ON holidays(tenant_id, branch_id, holiday_date);
