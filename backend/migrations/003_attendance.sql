-- 003_attendance.sql
-- HR Module 2.7: Attendance Management

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  status TEXT DEFAULT 'absent',
  shift_id UUID,
  late_minutes INT DEFAULT 0,
  overtime_minutes INT DEFAULT 0,
  remarks TEXT,
  location JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_tenant ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_att_employee ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_att_status ON attendance_records(status);

CREATE TABLE IF NOT EXISTS attendance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reason TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_tenant ON attendance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_employee ON attendance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON attendance_requests(status);
