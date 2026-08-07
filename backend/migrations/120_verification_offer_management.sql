-- 120_verification_offer_management.sql
-- Recruitment/ATS Phase 5: Verification + Offer Management.
--
-- Verification: one row per (application, verification_type) — same
-- "multiple typed rows per application" shape as candidate_assessments
-- (Phase 4), not a single wide row like candidate_screenings, since an
-- application can have several verification types in flight at once with
-- independent status/reviewer/timestamps. Supporting documents reuse the
-- generic `documents` table (entity_type='candidate_verification'), same
-- pattern as every other attachment in this module.
--
-- Offers: a brand-new `offers` table (application can have multiple offers
-- over time — e.g. re-offered after a decline) with versioned compensation/
-- letter content, mirroring job_descriptions/job_description_versions'
-- exact versioning shape from Phase 2 (current_version counter + snapshot
-- table). Approval reuses ApprovalEngineService (workflow_type='offer'),
-- same dual-status split (`approval_status` engine-owned, `status` broader
-- lifecycle synced by OfferApprovalService) as vacancies/job_descriptions.
-- Negotiation is an append-only thread distinguishing candidate vs recruiter
-- authorship, since candidates can post here through the unauthenticated
-- Career Portal (no users.id to attribute to).
--
-- No new permission strings — reuses hr.recruitment:view/create/edit/approve
-- exactly like Phase 4.

CREATE TABLE IF NOT EXISTS candidate_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL
    CHECK (verification_type IN ('reference','employment','education','identity','address','background')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','verified','failed','not_applicable')),
  -- Flexible per-type detail: reference contact, employer name/dates, institution/degree,
  -- ID type/number, address, background-check agency — same JSONB-instead-of-per-type-table
  -- pattern as candidates.education/experience.
  details JSONB NOT NULL DEFAULT '{}',
  comments TEXT,
  reviewer_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verifications_application ON candidate_verifications(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verifications_app_type ON candidate_verifications(application_id, verification_type);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES vacancies(id),

  designation TEXT,
  employment_type_id UUID REFERENCES employment_types(id),
  joining_date DATE,
  currency TEXT NOT NULL DEFAULT 'INR',
  ctc NUMERIC(12,2),
  -- [{ name, amount, frequency }] — same flexible-array pattern as job_descriptions.benefits.
  salary_components JSONB NOT NULL DEFAULT '[]',
  benefits JSONB NOT NULL DEFAULT '[]',
  offer_letter_content TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','sent','accepted','declined','withdrawn','expired')),

  approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','under_review','escalated','approved','rejected','cancelled','expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejection_reason TEXT,
  approval_step INT NOT NULL DEFAULT 1,
  approval_log JSONB NOT NULL DEFAULT '[]',

  current_version INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  expires_at DATE,
  responded_at TIMESTAMPTZ,
  decline_reason TEXT,
  withdrawn_at TIMESTAMPTZ,
  withdrawn_by UUID REFERENCES users(id),

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_offers_tenant ON offers(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_offers_application ON offers(application_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_approval_status ON offers(approval_status);

CREATE TABLE IF NOT EXISTS offer_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  snapshot JSONB NOT NULL,
  change_note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offer_versions_offer ON offer_versions(offer_id, version_number DESC);

-- Append-only negotiation thread — candidates post via the unauthenticated
-- Career Portal (raised_by='candidate', created_by NULL), recruiters post
-- from the HRMS side (raised_by='recruiter', created_by=users.id).
CREATE TABLE IF NOT EXISTS offer_negotiations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  raised_by TEXT NOT NULL CHECK (raised_by IN ('candidate','recruiter')),
  note TEXT NOT NULL,
  proposed_ctc NUMERIC(12,2),
  proposed_joining_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offer_negotiations_offer ON offer_negotiations(offer_id, created_at);
