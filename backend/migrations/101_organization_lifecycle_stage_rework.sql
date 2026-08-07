-- 101_organization_lifecycle_stage_rework.sql
-- Replaces the original CRM-style lifecycle pipeline (draft/lead/prospect/
-- demo_scheduled/negotiation/onboarding/active/suspended/archived) with an
-- organization-management pipeline. The Operations Portal is an internal
-- HRMS console for managing customer organizations, not a sales CRM — see
-- shared/organization-lifecycle.constants.ts for the new stage set.

-- Drop the old constraint first — it doesn't allow the new stage names, so
-- the remap UPDATEs below would violate it if it were still in place.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_lifecycle_stage_check;

-- Remap existing values onto the new 6-stage pipeline. draft/lead/prospect
-- were all "not yet vetted" stages, so they collapse into pending_review;
-- demo_scheduled/negotiation were later-funnel stages closer to conversion,
-- so they collapse into pending_approval. onboarding/active/suspended/
-- archived are unchanged.
UPDATE tenants SET lifecycle_stage = 'pending_review' WHERE lifecycle_stage IN ('draft', 'lead', 'prospect');
UPDATE tenants SET lifecycle_stage = 'pending_approval' WHERE lifecycle_stage IN ('demo_scheduled', 'negotiation');

ALTER TABLE tenants
  ADD CONSTRAINT tenants_lifecycle_stage_check
    CHECK (lifecycle_stage IN (
      'pending_review', 'pending_approval',
      'onboarding', 'active', 'suspended', 'archived'
    ));
