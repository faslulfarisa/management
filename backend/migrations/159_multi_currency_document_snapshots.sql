-- 159_multi_currency_document_snapshots.sql
-- Complete multi-currency persistence foundation.
--
-- Safe/backward-compatible:
-- - Adds immutable currency snapshot columns beside existing money columns.
-- - Existing currency/currency_symbol/exchange_rate columns remain in place.
-- - Backfills snapshots from each document's stored currency first, then the
--   owning organization's current default currency, without changing amounts.

CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate DECIMAL(18,8) NOT NULL CHECK (rate > 0),
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider TEXT,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(base_currency, quote_currency, rate_date, provider)
);

CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_pair_date
  ON currency_exchange_rates(base_currency, quote_currency, rate_date DESC);

CREATE TABLE IF NOT EXISTS organization_currency_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  currency_symbol VARCHAR(12),
  currency_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  exchange_rate DECIMAL(18,8),
  exchange_rate_base_currency TEXT,
  exchange_rate_source TEXT,
  exchange_rate_as_of TIMESTAMPTZ,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_org_currency_history_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_org_currency_history_tenant_effective
  ON organization_currency_history(tenant_id, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_currency_history_open
  ON organization_currency_history(tenant_id)
  WHERE effective_to IS NULL;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_currency TEXT,
  ADD COLUMN IF NOT EXISTS default_currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS default_currency_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS currency_effective_from TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE tenants
SET
  currency = COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
  default_currency = COALESCE(NULLIF(UPPER(default_currency), ''), NULLIF(UPPER(currency), ''), 'INR'),
  default_currency_symbol = COALESCE(default_currency_symbol, currency_symbol),
  default_currency_metadata = CASE
    WHEN default_currency_metadata IS NULL OR default_currency_metadata = '{}'::jsonb THEN COALESCE(currency_metadata, '{}'::jsonb)
    ELSE default_currency_metadata
  END
WHERE default_currency IS NULL
   OR default_currency_symbol IS NULL
   OR default_currency_metadata = '{}'::jsonb
   OR currency IS NULL;

INSERT INTO organization_currency_history (
  tenant_id, currency, currency_symbol, currency_metadata,
  exchange_rate, exchange_rate_base_currency, exchange_rate_source,
  exchange_rate_as_of, effective_from
)
SELECT
  t.id,
  COALESCE(NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  COALESCE(t.default_currency_symbol, t.currency_symbol),
  COALESCE(NULLIF(t.default_currency_metadata, '{}'::jsonb), t.currency_metadata, '{}'::jsonb),
  NULL,
  NULL,
  'organization_default',
  now(),
  COALESCE(t.currency_effective_from, t.created_at, now())
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_currency_history h
  WHERE h.tenant_id = t.id
    AND h.effective_to IS NULL
);

ALTER TABLE tenants
  ALTER COLUMN default_currency SET DEFAULT 'INR',
  ALTER COLUMN default_currency SET NOT NULL;

-- Snapshot columns for all current financial/document tables.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE vendor_bill_line_items
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE finance_payments
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cashbook_entries
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payroll_payments
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE saas_base_plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE report_export_logs
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Purchase orders are not part of the current schema, but keep this migration
-- ready for deployments where that table exists.
DO $$
BEGIN
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN
    ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
      ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
      ADD COLUMN IF NOT EXISTS base_currency TEXT,
      ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8),
      ADD COLUMN IF NOT EXISTS exchange_rate_to_base DECIMAL(18,8),
      ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
      ADD COLUMN IF NOT EXISTS exchange_rate_as_of TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS currency_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Backfill immutable document snapshots. These are deliberately derived from
-- each row's stored currency when available, not from future tenant settings.
UPDATE invoices d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE vendor_bills d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE finance_payments d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE expenses d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE reimbursements d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE budgets d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE payroll_payments d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), sub.currency, NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, sub.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, sub.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, sub.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), sub.currency, 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, sub.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, sub.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN COALESCE(NULLIF(sub.currency_snapshot, '{}'::jsonb), jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), sub.currency, NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, sub.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, sub.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, sub.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  )) ELSE d.currency_snapshot END
FROM tenants t
LEFT JOIN (
  SELECT 
    pp.id AS pp_id,
    ps.currency,
    ps.currency_symbol,
    ps.base_currency,
    ps.exchange_rate_to_base,
    ps.exchange_rate_source,
    ps.exchange_rate_as_of,
    ps.currency_snapshot
  FROM payroll_payments pp
  LEFT JOIN payslips ps ON ps.id = pp.payslip_id
) sub ON true
WHERE t.id = d.tenant_id AND sub.pp_id = d.id;

UPDATE cashbook_entries d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE payroll_runs d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE payslips d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE salary_structures d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE offers d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE subscription_plans
SET
  currency = COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
  currency_snapshot = CASE WHEN currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
    'currencySymbol', currency_symbol,
    'baseCurrency', COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
    'exchangeRate', 1,
    'source', 'backfill',
    'asOf', COALESCE(created_at, now())
  ) ELSE currency_snapshot END;

UPDATE saas_base_plans
SET
  currency = COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
  currency_snapshot = CASE WHEN currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
    'currencySymbol', currency_symbol,
    'baseCurrency', COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
    'exchangeRate', 1,
    'source', 'backfill',
    'asOf', COALESCE(created_at, now())
  ) ELSE currency_snapshot END;

UPDATE tenant_subscriptions d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE subscription_invoices d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE payment_transactions d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, d.exchange_rate, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  exchange_rate_source = COALESCE(d.exchange_rate_source, 'backfill'),
  exchange_rate_as_of = COALESCE(d.exchange_rate_as_of, d.created_at, now()),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', COALESCE(d.exchange_rate_to_base, d.exchange_rate),
    'source', 'backfill',
    'asOf', COALESCE(d.created_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE report_export_logs d
SET
  currency = COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
  currency_symbol = COALESCE(d.currency_symbol, t.default_currency_symbol),
  base_currency = COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
  exchange_rate_to_base = COALESCE(d.exchange_rate_to_base, CASE WHEN COALESCE(NULLIF(UPPER(d.currency), ''), 'INR') = COALESCE(NULLIF(UPPER(t.default_currency), ''), 'INR') THEN 1 ELSE NULL END),
  currency_snapshot = CASE WHEN d.currency_snapshot = '{}'::jsonb THEN jsonb_build_object(
    'currency', COALESCE(NULLIF(UPPER(d.currency), ''), NULLIF(UPPER(t.default_currency), ''), 'INR'),
    'currencySymbol', COALESCE(d.currency_symbol, t.default_currency_symbol),
    'baseCurrency', COALESCE(d.base_currency, NULLIF(UPPER(t.default_currency), ''), NULLIF(UPPER(t.currency), ''), 'INR'),
    'exchangeRate', d.exchange_rate_to_base,
    'source', 'backfill',
    'asOf', COALESCE(d.exported_at, now())
  ) ELSE d.currency_snapshot END
FROM tenants t
WHERE t.id = d.tenant_id;

UPDATE invoice_line_items li
SET
  currency = COALESCE(li.currency, i.currency),
  currency_symbol = COALESCE(li.currency_symbol, i.currency_symbol),
  base_currency = COALESCE(li.base_currency, i.base_currency),
  exchange_rate_to_base = COALESCE(li.exchange_rate_to_base, i.exchange_rate_to_base),
  currency_snapshot = CASE WHEN li.currency_snapshot = '{}'::jsonb THEN i.currency_snapshot ELSE li.currency_snapshot END
FROM invoices i
WHERE i.id = li.invoice_id;

UPDATE vendor_bill_line_items li
SET
  currency = COALESCE(li.currency, b.currency),
  currency_symbol = COALESCE(li.currency_symbol, b.currency_symbol),
  base_currency = COALESCE(li.base_currency, b.base_currency),
  exchange_rate_to_base = COALESCE(li.exchange_rate_to_base, b.exchange_rate_to_base),
  currency_snapshot = CASE WHEN li.currency_snapshot = '{}'::jsonb THEN b.currency_snapshot ELSE li.currency_snapshot END
FROM vendor_bills b
WHERE b.id = li.bill_id;

CREATE INDEX IF NOT EXISTS idx_invoices_currency
  ON invoices(tenant_id, currency, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_currency
  ON vendor_bills(tenant_id, currency, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_currency
  ON expenses(tenant_id, currency, date DESC);
CREATE INDEX IF NOT EXISTS idx_reimbursements_currency
  ON reimbursements(tenant_id, currency, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_currency
  ON budgets(tenant_id, currency, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_finance_payments_currency
  ON finance_payments(tenant_id, currency, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_currency
  ON cashbook_entries(tenant_id, currency, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_currency
  ON payroll_runs(tenant_id, currency, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_payslips_currency
  ON payslips(tenant_id, currency, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_salary_structures_currency
  ON salary_structures(tenant_id, currency, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_offers_currency
  ON offers(tenant_id, currency, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_currency
  ON subscription_invoices(tenant_id, currency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_export_logs_currency
  ON report_export_logs(tenant_id, currency, exported_at DESC);

COMMENT ON TABLE organization_currency_history IS
  'Immutable organization default-currency history. Financial documents copy their own currency snapshot and must not join here for historical display.';

COMMENT ON COLUMN tenants.default_currency IS
  'Organization-owned default currency for new records. Existing document snapshots are immutable and must not be rewritten when this changes.';

COMMENT ON COLUMN invoices.currency_snapshot IS 'Immutable invoice currency snapshot captured at document creation.';
COMMENT ON COLUMN payroll_runs.currency_snapshot IS 'Immutable payroll-run currency snapshot captured at run creation.';
COMMENT ON COLUMN payslips.currency_snapshot IS 'Immutable payslip currency snapshot captured at payslip creation.';
COMMENT ON COLUMN salary_structures.currency_snapshot IS 'Immutable salary-structure currency snapshot captured at structure creation.';
COMMENT ON COLUMN offers.currency_snapshot IS 'Immutable recruitment-offer currency snapshot captured at offer creation.';
COMMENT ON COLUMN expenses.currency_snapshot IS 'Immutable expense currency snapshot captured at expense creation.';
COMMENT ON COLUMN reimbursements.currency_snapshot IS 'Immutable reimbursement currency snapshot captured at reimbursement creation.';
COMMENT ON COLUMN budgets.currency_snapshot IS 'Immutable budget currency snapshot captured at budget creation.';
COMMENT ON COLUMN vendor_bills.currency_snapshot IS 'Immutable vendor-bill currency snapshot captured at bill creation.';
COMMENT ON COLUMN finance_payments.currency_snapshot IS 'Immutable finance payment currency snapshot captured at payment creation.';
COMMENT ON COLUMN cashbook_entries.currency_snapshot IS 'Immutable cashbook entry currency snapshot captured at entry creation.';
COMMENT ON COLUMN payroll_payments.currency_snapshot IS 'Immutable payroll payment currency snapshot captured at payment initiation.';
COMMENT ON COLUMN tenant_subscriptions.currency_snapshot IS 'Immutable subscription currency snapshot captured at subscription creation.';
COMMENT ON COLUMN subscription_invoices.currency_snapshot IS 'Immutable subscription invoice currency snapshot captured at invoice creation.';
COMMENT ON COLUMN report_export_logs.currency_snapshot IS 'Immutable report/export currency context captured at export time.';
