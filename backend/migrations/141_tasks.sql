-- Tasks module: tenant-scoped task management for HR
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'todo',
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(tenant_id, due_date);

-- Permissions for Tasks
INSERT INTO permissions (module, action, description)
VALUES
  ('hr.tasks', 'view',   'View tasks'),
  ('hr.tasks', 'create', 'Create tasks'),
  ('hr.tasks', 'edit',   'Edit tasks'),
  ('hr.tasks', 'delete', 'Delete tasks'),
  ('hr.tasks', 'assign', 'Assign tasks to employees')
ON CONFLICT (module, action) DO NOTHING;
