-- Migration 067: Document branding configuration and company bank accounts
-- document_branding_config: per-document-type watermark/footer/logo settings,
--   with optional branch-level overrides.
-- company_bank_accounts: stores bank/UPI details for invoicing and payroll,
--   with account numbers encrypted at the application layer.

-- ─── Document Branding Config ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_branding_config (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id          UUID        REFERENCES branches(id) ON DELETE CASCADE,
  -- NULL branch_id = org-wide default; branch row overrides it for that branch
  document_type      VARCHAR(50) NOT NULL,
  -- Valid document_type values:
  --   'invoice', 'payslip', 'payroll_export', 'hr_letter',
  --   'offer_letter', 'experience_letter', 'report', 'quotation'
  logo_placement     VARCHAR(30) NOT NULL DEFAULT 'top-left',
  -- 'top-left' | 'top-center' | 'top-right'
  watermark_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  watermark_text     VARCHAR(255),
  watermark_opacity  DECIMAL(3,2) NOT NULL DEFAULT 0.10,
  show_company_seal  BOOLEAN     NOT NULL DEFAULT FALSE,
  footer_text        TEXT,
  header_color       VARCHAR(7),   -- hex color e.g. '#1e3a5f'
  accent_color       VARCHAR(7),
  show_gstin         BOOLEAN     NOT NULL DEFAULT TRUE,
  show_address       BOOLEAN     NOT NULL DEFAULT TRUE,
  custom_config      JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One config row per (tenant, document_type, branch).
-- Uses a sentinel UUID for NULL branch_id to make the unique constraint work.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_branding_unique
  ON document_branding_config(
    tenant_id,
    document_type,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

CREATE INDEX IF NOT EXISTS idx_doc_branding_tenant
  ON document_branding_config(tenant_id);

CREATE INDEX IF NOT EXISTS idx_doc_branding_branch
  ON document_branding_config(branch_id)
  WHERE branch_id IS NOT NULL;

-- ─── Company Bank Accounts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID        REFERENCES branches(id) ON DELETE SET NULL,
  account_label         VARCHAR(100),
  account_holder_name   VARCHAR(255),
  bank_name             VARCHAR(255),
  -- account number stored AES-256-GCM encrypted (iv:tag:ciphertext base64).
  -- The application layer decrypts using ENCRYPTION_KEY env var.
  -- Only the last 4 digits are ever returned in API responses.
  account_number_enc    TEXT,
  ifsc_code             VARCHAR(20),
  account_type          VARCHAR(30),   -- 'savings' | 'current' | 'od'
  upi_id                VARCHAR(100),
  is_primary            BOOLEAN     NOT NULL DEFAULT FALSE,
  use_for_invoices      BOOLEAN     NOT NULL DEFAULT FALSE,
  use_for_payroll       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_tenant
  ON company_bank_accounts(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_branch
  ON company_bank_accounts(branch_id)
  WHERE branch_id IS NOT NULL AND deleted_at IS NULL;

-- Only one primary account per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_bank_accounts_primary
  ON company_bank_accounts(tenant_id)
  WHERE is_primary = TRUE AND deleted_at IS NULL;
