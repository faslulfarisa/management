-- Migration 111: Asset management (net-new module).
-- Standalone asset issuance/recovery tracking, independently useful beyond
-- offboarding; exit_assignments.exit_request_id links a recovery to a
-- specific exit when the assignment is reclaimed as part of an employee's
-- separation (feeds final_settlements.asset_recovery via the exit module).

CREATE TABLE IF NOT EXISTS asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'it_equipment'
    CHECK (category IN ('it_equipment', 'access_card', 'vehicle', 'furniture', 'sim_phone', 'other')),
  depreciation_applicable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS asset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  asset_type_id UUID NOT NULL REFERENCES asset_types(id),
  asset_code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  serial_number VARCHAR(100),
  purchase_date DATE,
  purchase_value DECIMAL(12,2),
  current_value DECIMAL(12,2),
  status VARCHAR(30) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'assigned', 'in_recovery', 'damaged', 'lost', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_asset_items_branch ON asset_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_asset_items_status ON asset_items(status);
CREATE INDEX IF NOT EXISTS idx_asset_items_type ON asset_items(asset_type_id);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_item_id UUID NOT NULL REFERENCES asset_items(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  expected_return_date DATE,
  returned_at TIMESTAMPTZ,
  return_condition VARCHAR(20) CHECK (return_condition IN ('good', 'damaged', 'lost')),
  recovery_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  exit_request_id UUID REFERENCES exit_requests(id),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned', 'recovery_pending', 'written_off')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee ON asset_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_exit ON asset_assignments(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_status ON asset_assignments(status);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_item ON asset_assignments(asset_item_id);
