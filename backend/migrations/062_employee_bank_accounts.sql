-- 062_employee_bank_accounts.sql
-- Employee bank accounts — structured multi-account support for payroll payout.
-- Coexists with the legacy inline bank fields (bank_name, bank_account_number,
-- ifsc_code, account_type) on the employees table — no backfill required.
-- account_number_enc and ifsc_code_enc are AES-256-GCM ciphertext produced by
-- CredentialEncryptionService (format: enc:v1:AES256GCM:<iv>:<tag>:<ct>).

CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id                 UUID        REFERENCES branches(id) ON DELETE SET NULL,
  employee_id               UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Account identity
  account_holder_name       TEXT        NOT NULL,
  bank_name                 TEXT        NOT NULL,
  account_number_enc        TEXT        NOT NULL,   -- AES-256-GCM encrypted
  ifsc_code_enc             TEXT        NOT NULL,   -- AES-256-GCM encrypted
  account_type              TEXT        NOT NULL DEFAULT 'savings'
                              CHECK (account_type IN ('savings', 'current', 'salary')),

  -- UPI support (stored in plaintext — not a sensitive secret)
  upi_id                    TEXT,

  -- Razorpay Payouts API linkage (populated lazily on first payout)
  razorpay_fund_account_id  TEXT,
  razorpay_contact_id       TEXT,

  -- Primary / secondary designation
  is_primary                BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Verification lifecycle
  verification_status       TEXT        NOT NULL DEFAULT 'unverified'
                              CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed')),
  verified_by               UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at               TIMESTAMPTZ,
  verification_notes        TEXT,

  -- Audit
  created_by                UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);

-- Enforce a single primary account per employee (partial unique index handles soft-deletes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_primary_bank
  ON employee_bank_accounts(employee_id)
  WHERE is_primary = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_eba_tenant_employee
  ON employee_bank_accounts(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_eba_employee_active
  ON employee_bank_accounts(employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_eba_razorpay_fund
  ON employee_bank_accounts(razorpay_fund_account_id)
  WHERE razorpay_fund_account_id IS NOT NULL;
