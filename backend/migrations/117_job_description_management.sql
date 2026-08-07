-- 117_job_description_management.sql
-- Recruitment/ATS Phase 2: Job Description Management + Job Publishing.
-- `job_descriptions` is the structured JD content (responsibilities/KRAs/KPIs/
-- skills/competencies/benefits as JSONB — flexible, not over-normalized, same
-- pattern as branch_approval_chains.steps). `job_postings` (legacy table from
-- 014_recruitment.sql) becomes the publishable unit: ALTERed with a link back
-- to the vacancy + job description it was published from, plus publishing
-- metadata (share link, provider, visibility). Reuses ApprovalEngineService
-- (workflow_type='job_description') and the existing `hr.recruitment:*`
-- permissions — no new permission strings needed for this phase.

CREATE TABLE IF NOT EXISTS job_descriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES vacancies(id),
  title TEXT NOT NULL,
  summary TEXT,
  responsibilities TEXT,
  kras JSONB NOT NULL DEFAULT '[]',
  kpis JSONB NOT NULL DEFAULT '[]',
  skills JSONB NOT NULL DEFAULT '[]',
  competencies JSONB NOT NULL DEFAULT '[]',
  benefits JSONB NOT NULL DEFAULT '[]',
  qualifications TEXT,
  certifications TEXT,
  work_location TEXT,

  is_template BOOLEAN NOT NULL DEFAULT false,
  template_name TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','archived')),
  approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','under_review','escalated','approved','rejected','cancelled','expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejection_reason TEXT,
  approval_step INT NOT NULL DEFAULT 1,
  approval_log JSONB NOT NULL DEFAULT '[]',

  current_version INT NOT NULL DEFAULT 1,

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_tenant ON job_descriptions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_descriptions_vacancy ON job_descriptions(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_status ON job_descriptions(status);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_template ON job_descriptions(tenant_id) WHERE is_template = true;

-- Append-only version snapshots — mirrors compliance_document_versions'
-- purpose (full-field snapshot + change note), not a generic documents row
-- since JD content is structured fields, not a file.
CREATE TABLE IF NOT EXISTS job_description_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_description_id UUID NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  snapshot JSONB NOT NULL,
  change_note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_description_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_jd_versions_jd ON job_description_versions(job_description_id, version_number);

-- job_postings becomes the publishable unit: link back to vacancy + JD, plus
-- publishing metadata. All nullable/defaulted so existing rows remain valid.
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS vacancy_id UUID REFERENCES vacancies(id),
  ADD COLUMN IF NOT EXISTS job_description_id UUID REFERENCES job_descriptions(id),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'career_portal';

ALTER TABLE job_postings
  ADD CONSTRAINT chk_job_postings_visibility CHECK (visibility IN ('public','unlisted'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_postings_share_token ON job_postings(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_postings_vacancy ON job_postings(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_visibility_status ON job_postings(tenant_id, status, visibility);

-- Add `job_description` to the approval engine's entity sync — same
-- dual-status split as vacancies/compliance_documents (handled in code via
-- ENTITY_SYNC_CONFIG, no schema-level change needed beyond the columns above).
