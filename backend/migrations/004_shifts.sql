-- 004_shifts.sql
-- HR Module 2.8: Shift Scheduling

CREATE TABLE IF NOT EXISTS shift_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT DEFAULT 0,
  grace_period_minutes INT DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_shift_tenant ON shift_definitions(tenant_id);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  shift_id UUID NOT NULL REFERENCES shift_definitions(id),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sa_tenant ON shift_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sa_employee ON shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_sa_shift ON shift_assignments(shift_id);

CREATE TABLE IF NOT EXISTS shift_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  shift_id UUID NOT NULL REFERENCES shift_definitions(id),
  date DATE NOT NULL,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ss_tenant ON shift_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ss_employee ON shift_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_ss_date ON shift_schedules(date);
