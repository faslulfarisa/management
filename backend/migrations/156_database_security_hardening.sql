-- 156_database_security_hardening.sql
-- Security-only production hardening. Data preserving and backward compatible.

CREATE SCHEMA IF NOT EXISTS app_security;

CREATE OR REPLACE FUNCTION app_security.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_security.is_tenant_context_set()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app_security.current_tenant_id() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION app_security.is_platform_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_context', true), '')::boolean, false)
$$;

-- Blind indexes support exact lookup/uniqueness checks while PII is stored
-- as non-deterministic AES-256-GCM ciphertext by the application.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS personal_email_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS office_email_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS personal_phone_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_number_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS pan_number_blind_index TEXT,
  ADD COLUMN IF NOT EXISTS passport_number_blind_index TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_personal_email_blind
  ON employees(tenant_id, personal_email_blind_index)
  WHERE personal_email_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_office_email_blind
  ON employees(tenant_id, office_email_blind_index)
  WHERE office_email_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_personal_phone_blind
  ON employees(tenant_id, personal_phone_blind_index)
  WHERE personal_phone_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_alternate_phone_blind
  ON employees(tenant_id, alternate_phone_blind_index)
  WHERE alternate_phone_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_aadhaar_blind
  ON employees(tenant_id, aadhaar_number_blind_index)
  WHERE aadhaar_number_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_pan_blind
  ON employees(tenant_id, pan_number_blind_index)
  WHERE pan_number_blind_index IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_passport_blind
  ON employees(tenant_id, passport_number_blind_index)
  WHERE passport_number_blind_index IS NOT NULL AND deleted_at IS NULL;

-- Security-sensitive table indexes.
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action_created
  ON audit_logs(tenant_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs(tenant_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_attempts_tenant_success_created
  ON login_attempts(tenant_id, success, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created
  ON login_attempts(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfa_login_sessions_user_active
  ON mfa_login_sessions(user_id, expires_at DESC)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_hash_active
  ON trusted_devices(user_id, device_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant_active
  ON refresh_tokens(user_id, tenant_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_active
  ON password_reset_tokens(user_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_api_keys_tenant_active
  ON service_api_keys(tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant_active
  ON webhooks(tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant_type_active
  ON integrations(tenant_id, type, is_active);

CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_tenant_employee_active
  ON employee_bank_accounts(tenant_id, employee_id, is_primary)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_tenant_active
  ON company_bank_accounts(tenant_id, is_primary)
  WHERE deleted_at IS NULL;

-- Prepare database-level tenant protection. Policies are created but RLS is
-- not enabled here; enabling requires app sessions to SET app.current_tenant_id.
DO $$
DECLARE
  table_record RECORD;
  policy_name TEXT;
BEGIN
  FOR table_record IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
  LOOP
    policy_name := 'tenant_isolation_' || table_record.table_name;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = table_record.table_schema
        AND tablename = table_record.table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I USING (app_security.is_platform_context() OR tenant_id = app_security.current_tenant_id()) WITH CHECK (app_security.is_platform_context() OR tenant_id = app_security.current_tenant_id())',
        policy_name,
        table_record.table_schema,
        table_record.table_name
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON SCHEMA app_security IS
  'Helpers for database-level tenant isolation. Set app.current_tenant_id per request before enabling RLS.';

COMMENT ON FUNCTION app_security.current_tenant_id() IS
  'Returns the tenant UUID set in the current database session via app.current_tenant_id.';

COMMENT ON COLUMN users.mfa_secret IS
  'AES-256-GCM encrypted TOTP secret. Decrypt only inside AuthService.';

COMMENT ON COLUMN login_attempts.email IS
  'AES-256-GCM encrypted login identifier for audit correlation without plaintext PII at rest.';

COMMENT ON COLUMN webhooks.secret IS
  'AES-256-GCM encrypted webhook signing secret. Decrypt only inside IntegrationsService.';

COMMENT ON COLUMN integrations.config IS
  'JSONB integration config. Sensitive keys are stored with _enc suffix as AES-256-GCM ciphertext.';

COMMENT ON COLUMN employee_bank_accounts.account_number_enc IS
  'AES-256-GCM encrypted employee bank account number. Public APIs expose masked values only.';

COMMENT ON COLUMN employee_bank_accounts.ifsc_code_enc IS
  'AES-256-GCM encrypted employee IFSC code. Decrypt only through bank/payment services.';

COMMENT ON COLUMN company_bank_accounts.account_number_enc IS
  'AES-256-GCM encrypted company bank account number. Public APIs expose masked values only.';

COMMENT ON COLUMN employees.personal_email IS 'AES-256-GCM encrypted employee PII for new writes.';
COMMENT ON COLUMN employees.personal_phone IS 'AES-256-GCM encrypted employee PII for new writes.';
COMMENT ON COLUMN employees.alternate_phone IS 'AES-256-GCM encrypted employee PII for new writes.';
COMMENT ON COLUMN employees.office_email IS 'AES-256-GCM encrypted employee PII for new writes.';
COMMENT ON COLUMN employees.office_telephone IS 'AES-256-GCM encrypted employee PII for new writes.';
COMMENT ON COLUMN employees.present_address IS 'AES-256-GCM encrypted employee address JSON for new writes.';
COMMENT ON COLUMN employees.permanent_address IS 'AES-256-GCM encrypted employee address JSON for new writes.';
COMMENT ON COLUMN employees.emergency_contact IS 'AES-256-GCM encrypted employee emergency-contact JSON for new writes.';
COMMENT ON COLUMN employees.bank_account_number IS 'AES-256-GCM encrypted legacy employee bank account number for new writes.';
COMMENT ON COLUMN employees.upi_id IS 'AES-256-GCM encrypted employee UPI ID for new writes.';
COMMENT ON COLUMN employees.pf_number IS 'AES-256-GCM encrypted employee statutory identifier for new writes.';
COMMENT ON COLUMN employees.uan_number IS 'AES-256-GCM encrypted employee statutory identifier for new writes.';
COMMENT ON COLUMN employees.esic_number IS 'AES-256-GCM encrypted employee statutory identifier for new writes.';
COMMENT ON COLUMN employees.pan_number IS 'AES-256-GCM encrypted employee tax identifier for new writes.';
COMMENT ON COLUMN employees.aadhaar_number IS 'AES-256-GCM encrypted employee identity identifier for new writes.';
COMMENT ON COLUMN employees.passport_number IS 'AES-256-GCM encrypted employee identity identifier for new writes.';
COMMENT ON COLUMN employees.driving_license_number IS 'AES-256-GCM encrypted employee identity identifier for new writes.';
COMMENT ON COLUMN employees.voter_id IS 'AES-256-GCM encrypted employee identity identifier for new writes.';
