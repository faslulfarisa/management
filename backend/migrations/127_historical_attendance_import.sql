-- 127_historical_attendance_import.sql
-- Phase 1 foundation for historical attendance migration.
-- This subsystem is deliberately separate from live biometric synchronization
-- and does not write to production attendance tables.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS historical_attendance_import_enabled BOOLEAN NOT NULL DEFAULT false;

INSERT INTO permissions (module, action, description) VALUES
  ('historical_attendance_import', 'manage', 'Manage historical attendance import batches, sources, staging rows, logs, and audit records')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Tenant Admin')
  AND r.is_system = TRUE
  AND p.module = 'historical_attendance_import'
  AND p.action = 'manage'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS historical_attendance_import_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type VARCHAR(32) NOT NULL CHECK (source_type IN ('device', 'vendor_software', 'sql_database', 'rest_api', 'csv', 'sdk')),
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical_schema_version VARCHAR(16) NOT NULL DEFAULT 'v1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_hai_sources_tenant ON historical_attendance_import_sources(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hai_sources_type ON historical_attendance_import_sources(tenant_id, source_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'uploading', 'processing', 'validation', 'ready', 'completed', 'cancelled', 'failed')),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  notes TEXT,
  statistics JSONB NOT NULL DEFAULT '{"totalRecords":0,"stagedRecords":0,"importedRecords":0,"failedRecords":0,"warnings":0}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_reason TEXT,
  deleted_at TIMESTAMPTZ,
  CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_hai_batches_tenant_status ON historical_attendance_import_batches(tenant_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hai_batches_source ON historical_attendance_import_batches(source_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_staging_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  row_number INT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical_punch JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_employee_identifier TEXT,
  punched_at TIMESTAMPTZ,
  punch_direction VARCHAR(16) CHECK (punch_direction IN ('in', 'out', 'break_in', 'break_out', 'unknown')),
  device_identifier TEXT,
  location_identifier TEXT,
  confidence NUMERIC(5,4),
  row_hash TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'normalization_failed', 'ignored')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hai_staging_batch ON historical_attendance_import_staging_rows(batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hai_staging_tenant_punched ON historical_attendance_import_staging_rows(tenant_id, punched_at);
CREATE INDEX IF NOT EXISTS idx_hai_staging_status ON historical_attendance_import_staging_rows(batch_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hai_staging_hash_unique
  ON historical_attendance_import_staging_rows(batch_id, row_hash)
  WHERE row_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  mapping_type VARCHAR(32) NOT NULL DEFAULT 'field_mapping' CHECK (mapping_type IN ('field_mapping', 'value_mapping', 'timezone', 'identifier_hint')),
  source_field TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  transform_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hai_mapping_source ON historical_attendance_import_mapping(source_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hai_mapping_batch ON historical_attendance_import_mapping(batch_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  phase VARCHAR(32) NOT NULL DEFAULT 'draft',
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  imported_records INT NOT NULL DEFAULT 0,
  failed_records INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  message TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id)
);
CREATE INDEX IF NOT EXISTS idx_hai_progress_tenant ON historical_attendance_import_progress(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS historical_attendance_import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  level VARCHAR(16) NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  code TEXT,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hai_logs_batch ON historical_attendance_import_logs(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hai_logs_tenant ON historical_attendance_import_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS historical_attendance_import_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hai_audit_batch ON historical_attendance_import_audit(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hai_audit_tenant ON historical_attendance_import_audit(tenant_id, created_at DESC);
