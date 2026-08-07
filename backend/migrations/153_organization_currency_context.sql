-- Organization currency context and immutable monetary snapshots.
-- Existing values remain untouched; missing currency values default to INR for backward compatibility.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS currency_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE tenants
SET
  currency = COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
  currency_symbol = COALESCE(currency_symbol, CASE COALESCE(NULLIF(UPPER(currency), ''), 'INR')
    WHEN 'INR' THEN '₹'
    WHEN 'USD' THEN '$'
    WHEN 'EUR' THEN '€'
    WHEN 'GBP' THEN '£'
    WHEN 'AED' THEN 'د.إ'
    WHEN 'SAR' THEN 'ر.س'
    WHEN 'QAR' THEN 'ر.ق'
    WHEN 'AUD' THEN '$'
    WHEN 'CAD' THEN '$'
    WHEN 'JPY' THEN '¥'
    WHEN 'SGD' THEN '$'
    WHEN 'MYR' THEN 'RM'
    ELSE '₹'
  END),
  currency_metadata = CASE
    WHEN currency_metadata IS NULL OR currency_metadata = '{}'::jsonb THEN jsonb_build_object(
      'code', COALESCE(NULLIF(UPPER(currency), ''), 'INR'),
      'symbol', CASE COALESCE(NULLIF(UPPER(currency), ''), 'INR')
        WHEN 'INR' THEN '₹'
        WHEN 'USD' THEN '$'
        WHEN 'EUR' THEN '€'
        WHEN 'GBP' THEN '£'
        WHEN 'AED' THEN 'د.إ'
        WHEN 'SAR' THEN 'ر.س'
        WHEN 'QAR' THEN 'ر.ق'
        WHEN 'AUD' THEN '$'
        WHEN 'CAD' THEN '$'
        WHEN 'JPY' THEN '¥'
        WHEN 'SGD' THEN '$'
        WHEN 'MYR' THEN 'RM'
        ELSE '₹'
      END
    )
    ELSE currency_metadata
  END;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE finance_payments
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE cashbook_entries
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE payroll_payments
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(12),
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(18,8);
