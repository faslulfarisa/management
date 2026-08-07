-- 011_billing.sql
-- Billing Module: Guest billing, room charges, packages, payment tracking

CREATE TABLE IF NOT EXISTS billing_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bi_tenant ON billing_items(tenant_id);

CREATE TABLE IF NOT EXISTS guest_folios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  guest_name TEXT NOT NULL,
  room_number TEXT,
  check_in DATE,
  check_out DATE,
  status TEXT DEFAULT 'open',
  total_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gf_tenant ON guest_folios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gf_status ON guest_folios(status);

CREATE TABLE IF NOT EXISTS folio_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  folio_id UUID REFERENCES guest_folios(id),
  billing_item_id UUID REFERENCES billing_items(id),
  description TEXT,
  quantity DECIMAL(8,2) DEFAULT 1,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fc_folio ON folio_charges(folio_id);

CREATE TABLE IF NOT EXISTS folio_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  folio_id UUID REFERENCES guest_folios(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_folio ON folio_payments(folio_id);
