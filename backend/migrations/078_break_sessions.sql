-- 078_break_sessions.sql
-- Punch-out reason tracking & break session monitoring.
--
-- Additive only: new table + nullable/defaulted columns on
-- attendance_records. Does not alter existing columns, constraints,
-- or queries. clock_in/clock_out/overtime_minutes/late_minutes and the
-- payroll_attendance_summary aggregation remain untouched.

CREATE TABLE IF NOT EXISTS break_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id),
  date DATE NOT NULL,
  break_code TEXT NOT NULL,
  category TEXT NOT NULL,
  reason_label TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INT,
  allowed_minutes INT,
  is_paid BOOLEAN DEFAULT true,
  overdue_minutes INT DEFAULT 0,
  is_overdue BOOLEAN DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_break_sessions_tenant ON break_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_break_sessions_employee ON break_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_break_sessions_date ON break_sessions(date);
CREATE INDEX IF NOT EXISTS idx_break_sessions_status ON break_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_break_sessions_record ON break_sessions(attendance_record_id);

-- Only one active break session per employee at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_break_sessions_one_active
  ON break_sessions(tenant_id, employee_id) WHERE status = 'active';

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS is_on_break BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_break_session_id UUID REFERENCES break_sessions(id),
  ADD COLUMN IF NOT EXISTS total_break_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_break_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overdue_break_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_punch_out_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS last_punch_out_note TEXT;
