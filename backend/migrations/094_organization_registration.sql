-- 094_organization_registration.sql
-- Public organization self-registration + Super Admin approval workflow.
-- See: registration.controller.ts, organization-approval.controller.ts,
-- organization-change-request.controller.ts (modules/organization-registration).

-- 1. Pre-org staging table. A registrant's personal account lives here
--    (email/password already hashed) until the organization-details form is
--    actually submitted — only then do we create tenants/users/user_tenants
--    in one transaction, matching the spec's "upon submission" sequencing.
CREATE TABLE IF NOT EXISTS pending_registrations (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name              VARCHAR(255) NOT NULL,
  email                  VARCHAR(255) NOT NULL,
  mobile                 VARCHAR(30),
  password_hash          TEXT NOT NULL,
  access_token_hash      TEXT NOT NULL,
  email_token_hash       TEXT,
  email_token_expires_at TIMESTAMPTZ,
  email_verified_at      TIMESTAMPTZ,
  mobile_otp_hash        TEXT,
  mobile_otp_expires_at  TIMESTAMPTZ,
  mobile_verified_at     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_registrations_email
  ON pending_registrations (LOWER(email));

-- 2. Change requests for protected organization fields (Phase 8). Created by
--    an org admin, decided by a Super Admin; on approval the `changes` are
--    applied to `tenants` by the same code path that wrote them here.
CREATE TABLE IF NOT EXISTS organization_change_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  requested_by_user_id  UUID NOT NULL REFERENCES users(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'documents_requested')),
  changes               JSONB NOT NULL,
  reason                TEXT NOT NULL,
  supporting_documents  JSONB,
  reviewed_by_user_id   UUID REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_change_requests_tenant ON organization_change_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_change_requests_status ON organization_change_requests(status);

-- 3. Approval workflow + registration-intake columns on tenants. Existing
--    orgs backfill to 'approved' so today's behavior is unaffected; only
--    newly self-registered orgs start at 'pending_review'.
--    NOTE: `industry` already exists on tenants (added by an earlier,
--    otherwise-unused migration) and is reused as-is for the wizard's
--    "Industry" field. Addresses reuse the existing `registered_address`/
--    `operational_address` JSONB columns (same AddressPayload shape used by
--    organization-profile's addresses tab) instead of new flat columns.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS approval_status            VARCHAR(30) NOT NULL DEFAULT 'approved'
                              CHECK (approval_status IN ('pending_review', 'under_discussion', 'needs_clarification', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by                 UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason             TEXT,
  ADD COLUMN IF NOT EXISTS demo_scheduled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_owner_user_id   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS business_category            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_hr_system            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS company_size                 VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payroll_requirement          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_requirement       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS biometric_requirement        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recruitment_requirement      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS performance_requirement      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_branch_count       INT,
  ADD COLUMN IF NOT EXISTS estimated_employee_count     INT,
  ADD COLUMN IF NOT EXISTS contact_person_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_designation          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contact_person_mobile        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contact_person_email         VARCHAR(255);

-- Existing rows are pre-approved, self-registered orgs are not.
UPDATE tenants SET approval_status = 'approved' WHERE approval_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_approval_status ON tenants(approval_status) WHERE deleted_at IS NULL;

-- 4. Duplicate-prevention (Security Requirement #6): GST / Registration
--    Number / Corporate Email must each identify at most one organization.
--    Empty strings are excluded too — some legacy rows have '' rather than
--    NULL for unset gstin.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenants_gstin
  ON tenants(gstin) WHERE gstin IS NOT NULL AND gstin <> '' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenants_registration_number
  ON tenants(registration_number) WHERE registration_number IS NOT NULL AND registration_number <> '' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenants_primary_email
  ON tenants(primary_email) WHERE primary_email IS NOT NULL AND primary_email <> '' AND deleted_at IS NULL;

-- 5. Email/mobile verification + registration-owner marker on users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mobile_verified_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_registration_owner  BOOLEAN DEFAULT false;
