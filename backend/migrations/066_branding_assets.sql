-- Migration 066: Branding assets table
-- Stores uploaded logo, favicon, and seal images per tenant.
-- Each asset_type has at most one active row per tenant (enforced by unique index).

CREATE TABLE IF NOT EXISTS branding_assets (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_type       VARCHAR(50) NOT NULL,
  -- Valid asset_type values:
  --   'primary_logo'  — main company logo (light background)
  --   'dark_logo'     — logo variant for dark backgrounds
  --   'favicon'       — 64x64 site favicon
  --   'invoice_logo'  — logo printed on invoices (defaults to primary_logo if absent)
  --   'payslip_logo'  — logo printed on payslips (defaults to primary_logo if absent)
  --   'report_logo'   — logo printed on report exports (defaults to primary_logo if absent)
  --   'seal'          — company seal/stamp image
  file_url         TEXT        NOT NULL,
  file_name        VARCHAR(255),
  file_size_bytes  INTEGER,
  mime_type        VARCHAR(100),
  width            INTEGER,
  height           INTEGER,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  uploaded_by      UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_branding_assets_tenant
  ON branding_assets(tenant_id)
  WHERE deleted_at IS NULL;

-- Only one active asset of each type per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_branding_assets_active_type
  ON branding_assets(tenant_id, asset_type)
  WHERE deleted_at IS NULL AND is_active = TRUE;
