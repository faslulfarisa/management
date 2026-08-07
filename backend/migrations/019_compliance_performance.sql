-- 019_compliance_performance.sql
-- Compliance Module: Statutory filings and compliance document tracking
-- Performance Module: Review cycles, KRAs, KPIs, and performance reviews

-- Compliance: Statutory filings (PF/ESI/PT/TDS per month)
CREATE TABLE IF NOT EXISTS compliance_filings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount DECIMAL(12,2) DEFAULT 0,
  reference_number TEXT,
  status TEXT DEFAULT 'pending',
  due_date DATE,
  filed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, type, month, year)
);

CREATE INDEX IF NOT EXISTS idx_comp_filings_tenant ON compliance_filings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comp_filings_status ON compliance_filings(status);
CREATE INDEX IF NOT EXISTS idx_comp_filings_period ON compliance_filings(year, month);

-- Compliance: Documents/certificates with expiry tracking
CREATE TABLE IF NOT EXISTS compliance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_docs_tenant ON compliance_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comp_docs_expiry ON compliance_documents(expiry_date);

-- Performance: Review cycles (Q1 2026, Annual 2026, etc.)
CREATE TABLE IF NOT EXISTS review_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_cycles_tenant ON review_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_review_cycles_status ON review_cycles(status);

-- Performance: Key Result Areas per employee per cycle
CREATE TABLE IF NOT EXISTS kras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID REFERENCES employees(id),
  cycle_id UUID REFERENCES review_cycles(id),
  title TEXT NOT NULL,
  weightage DECIMAL(5,2) DEFAULT 0,
  target TEXT,
  achievement TEXT,
  self_score DECIMAL(5,2),
  manager_score DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kras_tenant ON kras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kras_employee ON kras(employee_id);
CREATE INDEX IF NOT EXISTS idx_kras_cycle ON kras(cycle_id);

-- Performance: Key Performance Indicators per employee per cycle
CREATE TABLE IF NOT EXISTS kpis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID REFERENCES employees(id),
  cycle_id UUID REFERENCES review_cycles(id),
  title TEXT NOT NULL,
  unit_type TEXT DEFAULT 'number',
  target_value DECIMAL(12,2) DEFAULT 0,
  actual_value DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'on_track',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpis_tenant ON kpis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kpis_employee ON kpis(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpis_cycle ON kpis(cycle_id);

-- Performance: Final review record per employee per cycle
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID REFERENCES employees(id),
  cycle_id UUID REFERENCES review_cycles(id),
  reviewer_id UUID REFERENCES users(id),
  overall_score DECIMAL(5,2),
  rating TEXT,
  status TEXT DEFAULT 'draft',
  employee_comments TEXT,
  reviewer_comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_tenant ON performance_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_employee ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_cycle ON performance_reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_status ON performance_reviews(status);
