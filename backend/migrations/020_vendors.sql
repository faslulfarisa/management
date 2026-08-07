-- Vendor directory for finance module
CREATE TABLE IF NOT EXISTS vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  phone         VARCHAR(30),
  gstin         VARCHAR(20),
  pan           VARCHAR(12),
  address       TEXT,
  city          VARCHAR(100),
  state         VARCHAR(100),
  pincode       VARCHAR(12),
  bank_name     VARCHAR(255),
  bank_account  VARCHAR(50),
  bank_ifsc     VARCHAR(20),
  payment_terms INTEGER DEFAULT 30,
  category      VARCHAR(100),
  notes         TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant    ON vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendors_status    ON vendors(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vendors_name      ON vendors(tenant_id, name);

-- Permissions
INSERT INTO permissions (module, action, description) VALUES
  ('finance.vendors', 'manage', 'Manage vendor directory')
ON CONFLICT (module, action) DO NOTHING;
