-- 008_gst.sql
-- GST Module: GSTIN Management, Invoices, Returns, Reconciliation

CREATE TABLE IF NOT EXISTS gst_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  gstin TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  registration_date DATE,
  state_code TEXT NOT NULL,
  is_composition BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, gstin)
);
CREATE INDEX IF NOT EXISTS idx_gst_tenant ON gst_settings(tenant_id);

CREATE TABLE IF NOT EXISTS gst_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  customer_gstin TEXT,
  customer_name TEXT NOT NULL,
  place_of_supply TEXT,
  taxable_value DECIMAL(14,2) NOT NULL,
  cgst DECIMAL(14,2) DEFAULT 0,
  sgst DECIMAL(14,2) DEFAULT 0,
  igst DECIMAL(14,2) DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 18,
  is_reverse_charge BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_gi_tenant ON gst_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gi_date ON gst_invoices(invoice_date);

CREATE TABLE IF NOT EXISTS gst_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  return_type TEXT NOT NULL,
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  total_outward DECIMAL(14,2) DEFAULT 0,
  total_igst DECIMAL(14,2) DEFAULT 0,
  total_cgst DECIMAL(14,2) DEFAULT 0,
  total_sgst DECIMAL(14,2) DEFAULT 0,
  total_tax DECIMAL(14,2) DEFAULT 0,
  status TEXT DEFAULT 'draft',
  filed_at TIMESTAMPTZ,
  arn TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, return_type, period_month, period_year)
);
CREATE INDEX IF NOT EXISTS idx_gr_tenant ON gst_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gr_period ON gst_returns(period_month, period_year);
