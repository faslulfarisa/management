-- 014_recruitment.sql
-- HR Module: Recruitment

CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  designation_id UUID REFERENCES designations(id),
  location TEXT,
  employment_type_id UUID REFERENCES employment_types(id),
  description TEXT,
  requirements TEXT,
  salary_min DECIMAL(10,2),
  salary_max DECIMAL(10,2),
  openings INT DEFAULT 1,
  status TEXT DEFAULT 'open',
  posted_by UUID REFERENCES users(id),
  posted_at TIMESTAMPTZ DEFAULT now(),
  closes_at DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jp_tenant ON job_postings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jp_status ON job_postings(status);

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  job_posting_id UUID REFERENCES job_postings(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  current_company TEXT,
  current_designation TEXT,
  experience_years DECIMAL(4,1),
  expected_salary DECIMAL(10,2),
  resume_url TEXT,
  source TEXT,
  status TEXT DEFAULT 'applied',
  rating INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cand_tenant ON candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cand_job ON candidates(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_cand_status ON candidates(status);

CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  job_posting_id UUID REFERENCES job_postings(id),
  interviewer_id UUID REFERENCES users(id),
  interview_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 60,
  location TEXT,
  meeting_link TEXT,
  status TEXT DEFAULT 'scheduled',
  feedback TEXT,
  rating INT,
  recommendation TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_int_tenant ON interviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_int_candidate ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_int_scheduled ON interviews(scheduled_at);
