-- 063_payroll_payments.sql
-- Payroll payment processing — tracks every payment attempt per payslip.
-- Multiple rows per payslip are allowed (retries), but only one may be
-- in an active state (pending / processing) at a time — enforced via a
-- partial unique index.
-- Also adds active_payment_id to payslips for O(1) canonical payment lookup.
-- Includes an append-only audit table for tamper-evident payment history.

CREATE TABLE IF NOT EXISTS payroll_payments (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id               UUID          REFERENCES branches(id) ON DELETE SET NULL,
  payslip_id              UUID          NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  payroll_run_id          UUID          REFERENCES payroll_runs(id) ON DELETE SET NULL,
  employee_id             UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_account_id         UUID          REFERENCES employee_bank_accounts(id) ON DELETE SET NULL,

  -- Payment details
  amount                  DECIMAL(14,2) NOT NULL CONSTRAINT positive_payment_amount CHECK (amount > 0),
  payment_method          TEXT          NOT NULL
                            CHECK (payment_method IN (
                              'bank_transfer', 'upi', 'cash', 'cheque',
                              'razorpay', 'neft', 'imps', 'rtgs'
                            )),

  -- Gateway routing (null = manual / no gateway)
  payment_gateway         TEXT          CHECK (payment_gateway IN ('razorpay', 'manual')),
  gateway_payout_id       TEXT,                         -- Razorpay payout ID
  gateway_fund_account_id TEXT,                         -- Razorpay fund account used
  gateway_response        JSONB,                        -- Full gateway response for audit/debug

  -- Status lifecycle
  status                  TEXT          NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending', 'processing', 'paid',
                              'failed', 'cancelled', 'reversed'
                            )),

  -- Manual / offline payment fields
  transaction_reference   TEXT,                         -- UTR, cheque no., receipt no., etc.
  payment_date            DATE,

  -- Retry chain
  retry_count             INT           NOT NULL DEFAULT 0,
  parent_payment_id       UUID          REFERENCES payroll_payments(id) ON DELETE SET NULL,
  failure_reason          TEXT,

  -- Timestamps
  initiated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  processed_at            TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,

  -- Actor
  initiated_by            UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Only one active (pending/processing) payment per payslip at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payment_active
  ON payroll_payments(payslip_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_pp_tenant_run
  ON payroll_payments(tenant_id, payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_pp_tenant_employee
  ON payroll_payments(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_pp_status
  ON payroll_payments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pp_payslip
  ON payroll_payments(payslip_id);

CREATE INDEX IF NOT EXISTS idx_pp_gateway_payout
  ON payroll_payments(gateway_payout_id)
  WHERE gateway_payout_id IS NOT NULL;

-- ─── Payslip linkage ──────────────────────────────────────────────────────────
-- Points to the currently canonical (most-recent active) payment for a payslip.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS active_payment_id UUID REFERENCES payroll_payments(id) ON DELETE SET NULL;

-- ─── Immutable payment audit log ─────────────────────────────────────────────
-- Append-only — no updated_at column by design. Records every state transition
-- and webhook event for tamper-evident payment auditability beyond audit_logs.

CREATE TABLE IF NOT EXISTS payroll_payment_audit (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id  UUID          NOT NULL REFERENCES payroll_payments(id) ON DELETE CASCADE,
  payslip_id  UUID          NOT NULL,
  employee_id UUID          NOT NULL,

  -- What happened
  event_type  TEXT          NOT NULL,
  -- initiated | processing | paid | failed | retry | reversed | cancelled | webhook_received

  old_status  TEXT,
  new_status  TEXT,

  -- Who triggered it (null for system/webhook-driven events)
  actor_id    UUID,
  actor_type  TEXT,  -- 'user' | 'system' | 'webhook'

  -- Full context snapshot (request body, gateway payload, etc.)
  metadata    JSONB,
  ip_address  TEXT,

  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
  -- intentionally no updated_at — rows must never be updated
);

CREATE INDEX IF NOT EXISTS idx_ppa_payment
  ON payroll_payment_audit(payment_id);

CREATE INDEX IF NOT EXISTS idx_ppa_tenant_date
  ON payroll_payment_audit(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ppa_payslip
  ON payroll_payment_audit(payslip_id);
