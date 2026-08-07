-- 042_branches.sql
-- Introduces the Branch entity as the primary operational unit under a tenant.
-- Branches sit between Tenant and Department in the org hierarchy.
-- Run after 041_employee_position.sql
-- SAFE: new table only — no existing tables touched.

CREATE TABLE IF NOT EXISTS branches (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_branch_id        UUID          REFERENCES branches(id) ON DELETE SET NULL,

  -- Identity
  name                    TEXT          NOT NULL,
  code                    TEXT          NOT NULL,
  display_name            TEXT,
  branch_type             TEXT          NOT NULL DEFAULT 'main',
    -- 'main' | 'regional' | 'satellite' | 'franchise' | 'warehouse' | 'admin'

  -- Contact
  address                 JSONB,
  phone                   TEXT,
  email                   TEXT,

  -- Financial Identity
  gstin                   TEXT,
  pan                     TEXT,
  cost_center_code        TEXT,

  -- Geolocation
  geo_lat                 NUMERIC(10,7),
  geo_lng                 NUMERIC(10,7),
  geofence_radius_meters  INT           DEFAULT 200,

  -- Operations
  timezone                TEXT          NOT NULL DEFAULT 'Asia/Kolkata',
  operating_hours         JSONB,
  established_date        DATE,

  -- Management (nullable FKs — employees table already exists)
  manager_id              UUID          REFERENCES employees(id) ON DELETE SET NULL,
  hr_contact_id           UUID          REFERENCES employees(id) ON DELETE SET NULL,

  -- Branch-specific config overrides (shift defaults, OT rules, etc.)
  settings                JSONB         NOT NULL DEFAULT '{}',

  -- State
  status                  TEXT          NOT NULL DEFAULT 'active',
    -- 'active' | 'inactive' | 'under_construction' | 'closed'
  is_active               BOOLEAN       NOT NULL DEFAULT true,

  -- Backfill link to legacy property (1:1 for migrated data, NULL for new branches)
  property_id             UUID          REFERENCES properties(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,

  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant
  ON branches(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branches_parent
  ON branches(parent_branch_id)
  WHERE parent_branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branches_manager
  ON branches(manager_id)
  WHERE manager_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branches_status
  ON branches(tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branches_type
  ON branches(tenant_id, branch_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branches_property
  ON branches(property_id)
  WHERE property_id IS NOT NULL;
