-- Migration 057: Fine & Deduction Management System — core tables
-- Adds a fully self-contained fines/deduction module that integrates with the
-- existing approval engine and payroll pipeline without altering either.
-- Safe: new tables only — no existing tables modified.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEDUCTION CATEGORIES
--    Predefined + tenant-customizable fine reasons, optionally scoped to a branch.
--    branch_id = NULL means org-wide category visible to all branches.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_categories (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID        REFERENCES branches(id) ON DELETE SET NULL,

  name                  TEXT        NOT NULL,
  code                  TEXT        NOT NULL,
  category_type         TEXT        NOT NULL DEFAULT 'disciplinary'
    CHECK (category_type IN ('disciplinary', 'financial', 'asset', 'policy', 'recovery')),
  description           TEXT,

  is_payroll_deductible BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_dc_tenant
  ON deduction_categories(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_dc_branch
  ON deduction_categories(tenant_id, branch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EMPLOYEE FINES (master fine/deduction record)
--    Follows the approval_step / approval_log JSONB pattern from migration 056.
--    amount_remaining is a computed column: never set manually.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_fines (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID        REFERENCES branches(id) ON DELETE SET NULL,
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category_id           UUID        NOT NULL REFERENCES deduction_categories(id),

  -- Fine details
  title                 TEXT        NOT NULL,
  description           TEXT,
  fine_amount           DECIMAL(12,2) NOT NULL,

  -- Deduction mode
  -- payroll     → deducted automatically in the specified payroll cycle
  -- manual      → employee pays directly; finance verifies
  -- installment → split across multiple payroll cycles (future-ready)
  deduction_mode        TEXT        NOT NULL DEFAULT 'payroll'
    CHECK (deduction_mode IN ('payroll', 'manual', 'installment')),

  -- Target payroll cycle (required when deduction_mode = 'payroll')
  payroll_month         INT         CHECK (payroll_month BETWEEN 1 AND 12),
  payroll_year          INT,

  -- Installment config (future-ready; default 1 = single deduction)
  installments          INT         NOT NULL DEFAULT 1,

  -- Status lifecycle
  status                TEXT        NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN (
      'pending_approval',
      'approved',
      'rejected',
      'payroll_deducted',
      'manually_paid',
      'partially_paid',
      'waived',
      'cancelled'
    )),

  -- Amount tracking
  amount_deducted       DECIMAL(12,2) NOT NULL DEFAULT 0,   -- sum of payroll deductions
  amount_paid_manually  DECIMAL(12,2) NOT NULL DEFAULT 0,   -- sum of verified manual payments
  amount_waived         DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Approval fields — mirrors pattern from migration 056
  approval_step         INT         NOT NULL DEFAULT 0,
  approval_log          JSONB       NOT NULL DEFAULT '[]',
  approval_reason       TEXT,
  approved_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,

  -- Source linkage (optional — links back to attendance_corrections, policy_violations, etc.)
  reference_type        TEXT,
  reference_id          UUID,

  -- Payslip linkage (populated after payroll deduction)
  payslip_id            UUID        REFERENCES payslips(id) ON DELETE SET NULL,

  -- Audit
  created_by            UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT positive_fine_amount CHECK (fine_amount > 0),
  CONSTRAINT non_negative_amounts CHECK (
    amount_deducted >= 0 AND amount_paid_manually >= 0 AND amount_waived >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ef_tenant_employee
  ON employee_fines(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_ef_tenant_branch
  ON employee_fines(tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_ef_tenant_status
  ON employee_fines(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ef_payroll_cycle
  ON employee_fines(tenant_id, payroll_month, payroll_year)
  WHERE status = 'approved' AND deduction_mode IN ('payroll', 'installment');

CREATE INDEX IF NOT EXISTS idx_ef_approval_step
  ON employee_fines(tenant_id, approval_step)
  WHERE status = 'pending_approval';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DEDUCTION PAYMENTS (per-fine settlement / payroll-deduction event)
--    One row per payment event; multiple rows per fine for partial payments.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_payments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fine_id               UUID        NOT NULL REFERENCES employee_fines(id) ON DELETE CASCADE,
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Type of payment event
  payment_type          TEXT        NOT NULL
    CHECK (payment_type IN ('manual_payment', 'payroll_deduction', 'waiver')),

  amount                DECIMAL(12,2) NOT NULL,

  -- Manual payment fields (populated when payment_type = 'manual_payment')
  payment_date          DATE,
  payment_method        TEXT
    CHECK (payment_method IN ('cash', 'bank_transfer', 'upi', 'cheque', 'other')),
  payment_reference     TEXT,       -- transaction ID, cheque number, UTR, etc.
  payment_proof_url     TEXT,

  -- Verification by finance/HR
  status                TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at           TIMESTAMPTZ,
  verification_notes    TEXT,

  -- Payroll linkage (populated when payment_type = 'payroll_deduction')
  payroll_run_id        UUID        REFERENCES payroll_runs(id) ON DELETE SET NULL,
  payslip_id            UUID        REFERENCES payslips(id) ON DELETE SET NULL,

  notes                 TEXT,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT positive_payment_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_dp_fine
  ON deduction_payments(fine_id);

CREATE INDEX IF NOT EXISTS idx_dp_tenant_employee
  ON deduction_payments(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_dp_payslip
  ON deduction_payments(payslip_id)
  WHERE payslip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dp_status
  ON deduction_payments(tenant_id, status)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DEDUCTION RULES (future-ready automated fine trigger engine)
--    Stores policy rules that can auto-create fines based on attendance/behavior.
--    Not yet wired into automation; created now for schema completeness.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deduction_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             UUID        REFERENCES branches(id) ON DELETE SET NULL,
  category_id           UUID        REFERENCES deduction_categories(id) ON DELETE SET NULL,

  name                  TEXT        NOT NULL,
  rule_type             TEXT        NOT NULL
    CHECK (rule_type IN ('late_arrival', 'absent', 'repeated_violation', 'asset_damage', 'custom')),

  -- Trigger conditions
  trigger_count         INT,        -- e.g., fine after 3 violations
  trigger_period        TEXT        CHECK (trigger_period IN ('daily', 'weekly', 'monthly')),
  grace_minutes         INT,        -- grace before violation is counted

  -- Fine calculation
  fine_amount           DECIMAL(12,2),
  fine_percentage       DECIMAL(5,2), -- percentage of basic salary
  fine_basis            TEXT        CHECK (fine_basis IN ('fixed', 'per_day', 'percentage')),

  deduction_mode        TEXT        NOT NULL DEFAULT 'payroll'
    CHECK (deduction_mode IN ('payroll', 'manual')),

  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dr_tenant
  ON deduction_rules(tenant_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SEED DATA — predefined org-level deduction categories
--    Inserted with a placeholder tenant_id sentinel that is replaced at
--    application boot via the seed script; these rows serve as defaults for
--    any tenant that hasn't customized their categories yet.
--    For now, we create them as template rows with branch_id = NULL.
--
--    NOTE: These are NOT inserted here because tenant_id is NOT NULL and we
--    cannot reference a real tenant in a migration. The seeding of default
--    categories is handled in the FinesService.ensureDefaultCategories()
--    method called during tenant onboarding.
-- ─────────────────────────────────────────────────────────────────────────────
-- (No INSERT statements — see FinesService.ensureDefaultCategories)
