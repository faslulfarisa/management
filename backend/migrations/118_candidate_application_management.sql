-- 118_candidate_application_management.sql
-- Recruitment/ATS Phase 3: Career Portal + Application Collection + Resume
-- Management + Candidate Management.
--
-- `candidates` (legacy table from 014_recruitment.sql) is extended into a
-- full profile (education/experience/skills/certifications as JSONB — same
-- flexible-field pattern as job_descriptions). A candidate can now apply to
-- multiple postings, so the per-application relationship + status moves to
-- a new `applications` table; `candidates.status`/`job_posting_id` are left
-- in place (unused by new code, not dropped) for backward compatibility.
-- Resumes reuse the existing generic `documents` table (entity_type=
-- 'candidate') exactly like vacancy attachments in migration 116 — multiple
-- uploads naturally accumulate as separate rows, newest = current version.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS address JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS education JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS experience JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dedup_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_candidates_dedup_hash ON candidates(tenant_id, dedup_hash);
CREATE INDEX IF NOT EXISTS idx_candidates_tags ON candidates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_candidates_deleted ON candidates(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_posting_id UUID NOT NULL REFERENCES job_postings(id),
  vacancy_id UUID REFERENCES vacancies(id),

  source TEXT NOT NULL DEFAULT 'career_portal'
    CHECK (source IN ('career_portal','employee_referral','walk_in','agency','bulk_import','manual')),
  referred_by_employee_id UUID REFERENCES employees(id),

  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied','under_review','shortlisted','rejected','withdrawn','hired')),

  resume_document_id UUID,
  cover_note TEXT,

  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_posting ON applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at DESC);
