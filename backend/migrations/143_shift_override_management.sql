-- 143_shift_override_management.sql
-- Shift Override Management subsystem

-- Create shift_override_requests table
CREATE TABLE IF NOT EXISTS shift_override_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  current_shift_id UUID REFERENCES shift_definitions(id),
  reason_category TEXT NOT NULL,
  detailed_reason TEXT NOT NULL,
  supporting_documents TEXT[],
  urgency TEXT NOT NULL DEFAULT 'medium',
  preferred_action TEXT, -- 'assign_replacement', 'swap_shift', 'move_shift', 'convert_to_leave', 'cancel_shift', 'manager_decision'
  remarks TEXT,
  status TEXT DEFAULT 'pending',
  approval_step INT DEFAULT 1,
  approval_log JSONB DEFAULT '[]',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  action_type TEXT, -- final selected manager action
  replacement_employee_id UUID REFERENCES employees(id),
  target_shift_id UUID REFERENCES shift_definitions(id),
  custom_start_time TIME,
  custom_end_time TIME,
  custom_break_minutes INT,
  custom_grace_period_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sor_tenant ON shift_override_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sor_employee ON shift_override_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_sor_status ON shift_override_requests(status);
CREATE INDEX IF NOT EXISTS idx_sor_dates ON shift_override_requests(start_date, end_date);

-- Create shift_overrides table
CREATE TABLE IF NOT EXISTS shift_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  shift_id UUID REFERENCES shift_definitions(id),
  start_time TIME,
  end_time TIME,
  break_minutes INT DEFAULT 0,
  grace_period_minutes INT DEFAULT 15,
  is_overnight BOOLEAN DEFAULT false,
  override_type TEXT NOT NULL, -- 'replaced', 'shift_change', 'cancelled', 'leave', 'custom_hours'
  request_id UUID REFERENCES shift_override_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_so_tenant ON shift_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_so_employee ON shift_overrides(employee_id);
CREATE INDEX IF NOT EXISTS idx_so_date ON shift_overrides(date);

-- Extend branch_approval_chains constraint to allow 'shift_override'
ALTER TABLE branch_approval_chains DROP CONSTRAINT IF EXISTS branch_approval_chains_workflow_type_check;
ALTER TABLE branch_approval_chains ADD CONSTRAINT branch_approval_chains_workflow_type_check CHECK (workflow_type IN (
  'leave', 'leave_encashment', 'expense', 'reimbursement', 'transfer', 'payroll', 'payroll_payment',
  'attendance_correction', 'manual_attendance', 'overtime', 'shift_change', 'biometric_device', 'onboarding',
  'exit_request', 'exit_clearance', 'ff_settlement', 'compliance_document', 'vacancy_request', 'job_description',
  'offer', 'probation_confirmation', 'workforce_plan', 'salary_revision', 'role_change', 'policy_change',
  'vendor_approval', 'fine_deduction', 'shift_override'
));

-- Insert permissions
INSERT INTO permissions (module, action, description) VALUES
  ('hr.shifts', 'override_view', 'View shift override requests and records'),
  ('hr.shifts', 'override_create', 'Create and submit shift override requests'),
  ('hr.shifts', 'override_approve', 'Approve, reject, and take action on shift override requests')
ON CONFLICT (module, action) DO NOTHING;

-- Assign all permissions to Super Admin and HR Manager
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'HR Manager')
  AND r.is_system = TRUE
  AND p.module = 'hr.shifts'
  AND p.action IN ('override_view', 'override_create', 'override_approve')
ON CONFLICT DO NOTHING;

-- Assign view/create permissions to Employee
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Employee'
  AND r.is_system = TRUE
  AND p.module = 'hr.shifts'
  AND p.action IN ('override_view', 'override_create')
ON CONFLICT DO NOTHING;
