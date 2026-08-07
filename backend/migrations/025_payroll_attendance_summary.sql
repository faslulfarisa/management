-- 025_payroll_attendance_summary.sql
-- Phase 9: Payroll attendance summary for monthly finalization and payroll locking

CREATE TABLE IF NOT EXISTS payroll_attendance_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Day counters
  total_working_days INT NOT NULL DEFAULT 0,
  present_days INT NOT NULL DEFAULT 0,
  absent_days INT NOT NULL DEFAULT 0,
  late_count INT NOT NULL DEFAULT 0,
  half_day_count INT NOT NULL DEFAULT 0,

  -- Hour accumulators (from attendance_records.overtime_minutes)
  total_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- Approval workflow
  -- draft → pending_approval → approved → payroll_locked
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  payroll_locked BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  locked_by UUID REFERENCES users(id),
  locked_at TIMESTAMPTZ,

  -- Corrections applied after finalization
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, employee_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_pas_tenant ON payroll_attendance_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pas_employee ON payroll_attendance_summary(employee_id);
CREATE INDEX IF NOT EXISTS idx_pas_period ON payroll_attendance_summary(tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_pas_status ON payroll_attendance_summary(tenant_id, status);
