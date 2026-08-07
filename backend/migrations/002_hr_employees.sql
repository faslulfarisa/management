-- 002_hr_employees.sql
-- HR Module 2.5: Employee Master & Lifecycle

-- Employees master table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_code TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  marital_status TEXT,
  blood_group TEXT,
  nationality TEXT DEFAULT 'Indian',
  photo_url TEXT,
  personal_email TEXT,
  personal_phone TEXT,
  present_address JSONB,
  permanent_address JSONB,
  emergency_contact JSONB,
  property_id UUID REFERENCES properties(id),
  department_id UUID REFERENCES departments(id),
  designation_id UUID REFERENCES designations(id),
  employment_type_id UUID REFERENCES employment_types(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  reporting_manager_id UUID REFERENCES employees(id),
  date_of_joining DATE NOT NULL,
  probation_end_date DATE,
  confirmation_date DATE,
  bank_name TEXT,
  bank_account_number TEXT,
  ifsc_code TEXT,
  account_type TEXT,
  pf_number TEXT,
  uan_number TEXT,
  esic_number TEXT,
  pan_number TEXT,
  aadhaar_number TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);

-- Employee lifecycle events
CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  event_type TEXT NOT NULL,
  effective_date DATE NOT NULL,
  old_values JSONB,
  new_values JSONB,
  remarks TEXT,
  approved_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ele_employee ON employee_lifecycle_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_ele_tenant ON employee_lifecycle_events(tenant_id);

-- Onboarding tasks
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  task_name TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  due_date DATE,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ob_employee ON onboarding_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_ob_tenant ON onboarding_tasks(tenant_id);

-- Employee documents
CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes INT,
  mime_type TEXT,
  expires_at DATE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ed_employee ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_ed_tenant ON employee_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ed_expires ON employee_documents(expires_at);
