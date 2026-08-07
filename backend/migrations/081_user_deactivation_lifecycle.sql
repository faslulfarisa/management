-- 081_user_deactivation_lifecycle.sql
-- User Deactivation Reasons & Account Status Lifecycle.
-- Adds a configurable, categorized reason list for deactivating accounts,
-- a status-driven lifecycle on `users`, and a full audit trail of status
-- changes. This is additive to the migration-080 auto-lockout system
-- (is_locked / AccountLockedException), which remains unchanged.

-- Reference table of deactivation reasons. tenant_id IS NULL = global/system
-- default, available to every tenant. Tenants can add their own rows later
-- without any code changes (configurable future reason list).
CREATE TABLE IF NOT EXISTS deactivation_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  category VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  maps_to_status VARCHAR(20) NOT NULL,
  login_message TEXT NOT NULL,
  requires_notes BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deactivation_reasons_global_code
  ON deactivation_reasons(code) WHERE tenant_id IS NULL;

-- Status-driven account lifecycle fields on users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','locked','suspended','resigned','terminated','retired','on_leave')),
  ADD COLUMN IF NOT EXISTS deactivation_reason_id UUID REFERENCES deactivation_reasons(id),
  ADD COLUMN IF NOT EXISTS deactivation_notes TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE status != 'active';

-- Backfill: existing deactivated accounts get status = 'inactive' (no reason
-- recorded for pre-existing deactivations).
UPDATE users SET status = 'inactive' WHERE is_active = FALSE AND status = 'active';

-- Full audit trail of account status changes (deactivation, reactivation).
CREATE TABLE IF NOT EXISTS user_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  reason_id UUID REFERENCES deactivation_reasons(id),
  notes TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_status_history_user ON user_status_history(user_id, changed_at DESC);

-- Seed global default deactivation reasons (one row per spec'd reason).
INSERT INTO deactivation_reasons (tenant_id, category, code, label, maps_to_status, login_message, requires_notes, sort_order) VALUES
  (NULL, 'employment',     'resigned',               'Resigned',                          'resigned',   'Your employment has ended and your account is no longer active. Please contact HR for assistance.', FALSE, 10),
  (NULL, 'employment',     'terminated',             'Terminated',                        'terminated', 'Your account has been deactivated. Please contact your organization administrator for more information.', FALSE, 20),
  (NULL, 'employment',     'contract_ended',         'Contract Ended',                    'terminated', 'Your account has been deactivated. Please contact your organization administrator for more information.', FALSE, 30),
  (NULL, 'employment',     'retired',                'Retired',                           'retired',    'Your employment has ended and your account is no longer active. Please contact HR for assistance.', FALSE, 40),
  (NULL, 'employment',     'probation_failed',       'Probation Failed',                  'terminated', 'Your account has been deactivated. Please contact your organization administrator for more information.', FALSE, 50),
  (NULL, 'administrative',  'temporary_deactivation', 'Temporary Deactivation',           'inactive',   'Your account has been temporarily deactivated. Please contact your administrator.', FALSE, 60),
  (NULL, 'administrative',  'policy_violation',       'Policy Violation',                 'suspended',  'Your account access has been temporarily restricted. Please contact HR or your administrator.', TRUE, 70),
  (NULL, 'administrative',  'behavioural_issue',      'Behavioural Issue',                'suspended',  'Your account access has been temporarily restricted. Please contact HR or your administrator.', TRUE, 80),
  (NULL, 'administrative',  'disciplinary_action',    'Disciplinary Action',              'suspended',  'Your account access has been temporarily restricted. Please contact HR or your administrator.', TRUE, 90),
  (NULL, 'administrative',  'security_investigation', 'Security Investigation',           'suspended',  'Your account access has been restricted for security reasons. Please contact your administrator.', TRUE, 100),
  (NULL, 'operational',     'long_leave',             'Long Leave',                       'on_leave',   'Your account is currently inactive while you are on leave. Please contact HR if access is required.', FALSE, 110),
  (NULL, 'operational',     'employee_transfer',      'Employee Transfer',                'inactive',   'Your account has been temporarily deactivated. Please contact your administrator.', FALSE, 120),
  (NULL, 'operational',     'duplicate_account',      'Duplicate Account',                'inactive',   'Your account has been temporarily deactivated. Please contact your administrator.', FALSE, 130),
  (NULL, 'operational',     'pending_verification',   'Pending Verification',             'inactive',   'Your account has been temporarily deactivated. Please contact your administrator.', FALSE, 140),
  (NULL, 'security',        'account_locked_admin',   'Account Locked by Administrator',  'locked',     'Your account has been locked due to multiple failed login attempts. Please contact your administrator to reactivate access.', FALSE, 150),
  (NULL, 'security',        'suspicious_activity',    'Suspicious Activity',              'suspended',  'Your account access has been restricted for security reasons. Please contact your administrator.', TRUE, 160),
  (NULL, 'security',        'security_risk',          'Security Risk',                    'suspended',  'Your account access has been restricted for security reasons. Please contact your administrator.', TRUE, 170),
  (NULL, 'other',           'other',                  'Other (Custom Reason Required)',   'inactive',   'Your account has been temporarily deactivated. Please contact your administrator.', TRUE, 180)
ON CONFLICT DO NOTHING;
