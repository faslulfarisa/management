-- 017_finance_invoices.sql
-- Finance: Invoices, Vendor Bills, Payments, Cashbook, Budgets

-- ─── Invoice number sequence ────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS bill_seq    START 1 INCREMENT 1;

-- ─── Invoices (Accounts Receivable) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,          -- INV-2026-0001
  customer_name   TEXT NOT NULL,
  customer_email  TEXT,
  customer_phone  TEXT,
  customer_address TEXT,
  customer_gstin  TEXT,
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  currency        TEXT NOT NULL DEFAULT 'INR',
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount_paid     DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|paid|overdue|cancelled
  source          TEXT DEFAULT 'manual',           -- manual|ocr
  ocr_raw_text    TEXT,                            -- raw OCR text for imported invoices
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_inv_tenant  ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_status  ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_inv_due     ON invoices(due_date);

-- ─── Invoice Line Items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL,
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  hsn_sac      TEXT,
  quantity     DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit         TEXT DEFAULT 'nos',
  unit_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_rate     DECIMAL(5,2)  NOT NULL DEFAULT 0,   -- GST %
  amount       DECIMAL(14,2) NOT NULL DEFAULT 0,   -- after discount + tax
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_lines_inv ON invoice_line_items(invoice_id);

-- ─── Vendor Bills (Accounts Payable) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_bills (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_number    TEXT NOT NULL,           -- BILL-2026-0001
  vendor_name    TEXT NOT NULL,
  vendor_email   TEXT,
  vendor_gstin   TEXT,
  bill_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE,
  currency       TEXT NOT NULL DEFAULT 'INR',
  subtotal       DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount_paid    DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|paid|cancelled
  source         TEXT DEFAULT 'manual',            -- manual|ocr
  ocr_raw_text   TEXT,
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, bill_number)
);
CREATE INDEX IF NOT EXISTS idx_bill_tenant ON vendor_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bill_status ON vendor_bills(status);

-- ─── Vendor Bill Line Items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_bill_line_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL,
  bill_id      UUID NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  hsn_sac      TEXT,
  quantity     DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit         TEXT DEFAULT 'nos',
  unit_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_rate     DECIMAL(5,2)  NOT NULL DEFAULT 0,
  amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON vendor_bill_line_items(bill_id);

-- ─── Payments (both received and made) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_type   TEXT NOT NULL,           -- received|made
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  amount         DECIMAL(14,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'INR',
  payment_method TEXT DEFAULT 'bank',     -- bank|cash|upi|cheque|card
  reference      TEXT,
  notes          TEXT,
  invoice_id     UUID REFERENCES invoices(id),
  bill_id        UUID REFERENCES vendor_bills(id),
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant  ON finance_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON finance_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill    ON finance_payments(bill_id);

-- ─── Cashbook Entries ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashbook_entries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type   TEXT NOT NULL,             -- receipt|payment
  category     TEXT NOT NULL,             -- sales|purchase|salary|rent|misc|…
  description  TEXT,
  reference    TEXT,
  amount       DECIMAL(14,2) NOT NULL,
  account      TEXT DEFAULT 'main',       -- bank account name/label
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashbook_tenant ON cashbook_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_date   ON cashbook_entries(entry_date);

-- ─── Budgets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  department    TEXT,
  category      TEXT,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  allocated     DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets(tenant_id);

-- ─── Finance permissions ─────────────────────────────────────────────────────
INSERT INTO permissions (module, action) VALUES
  ('finance.invoices', 'view'),
  ('finance.invoices', 'create'),
  ('finance.invoices', 'edit'),
  ('finance.bills',    'view'),
  ('finance.bills',    'create'),
  ('finance.bills',    'approve'),
  ('finance.cashbook', 'view'),
  ('finance.cashbook', 'create'),
  ('finance.budgets',  'view'),
  ('finance.budgets',  'create')
ON CONFLICT (module, action) DO NOTHING;
