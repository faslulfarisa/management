-- 036_areas.sql
-- Physical area/zone registry for biometric device placement and employee assignment.
-- Areas represent distinct physical zones (e.g. Main Block, Restaurant, Residence)
-- and aggregate device counts and biometric enrollment tallies from synced devices.
-- Run after 035_reports_infrastructure.sql
-- SAFE: All new tables and additive ALTER columns — no existing data touched.

CREATE TABLE IF NOT EXISTS areas (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES areas(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  code        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_areas_tenant ON areas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_areas_parent ON areas(parent_id) WHERE parent_id IS NOT NULL;

-- Link biometric devices to an area
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bio_devices_area
  ON biometric_devices(area_id) WHERE area_id IS NOT NULL;

-- Link employees to an area for headcount aggregation
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_area
  ON employees(area_id) WHERE area_id IS NOT NULL;
