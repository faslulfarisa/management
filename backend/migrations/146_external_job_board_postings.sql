-- External job board posting tracking for Recruitment.
-- This keeps one Career Portal job_posting as the canonical apply target while
-- allowing a vacancy to be distributed to multiple external boards with
-- board-specific tracked apply links and external listing URLs.

CREATE TABLE IF NOT EXISTS job_board_postings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  job_description_id UUID NOT NULL REFERENCES job_descriptions(id),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,

  provider TEXT NOT NULL
    CHECK (provider IN ('linkedin','indeed','naukri','monster','glassdoor','foundit','ziprecruiter','other')),
  status TEXT NOT NULL DEFAULT 'ready_to_post'
    CHECK (status IN ('ready_to_post','published','failed','unpublished','expired')),

  apply_url TEXT NOT NULL,
  external_job_id TEXT,
  external_url TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,

  published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  UNIQUE (tenant_id, vacancy_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_job_board_postings_vacancy
  ON job_board_postings(tenant_id, vacancy_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_board_postings_provider_status
  ON job_board_postings(tenant_id, provider, status)
  WHERE deleted_at IS NULL;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'applications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE applications DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE applications
  ADD CONSTRAINT chk_applications_source
  CHECK (source IN (
    'career_portal',
    'employee_referral',
    'walk_in',
    'agency',
    'bulk_import',
    'manual',
    'linkedin',
    'indeed',
    'naukri',
    'monster',
    'glassdoor',
    'foundit',
    'ziprecruiter',
    'other_job_board'
  ));
