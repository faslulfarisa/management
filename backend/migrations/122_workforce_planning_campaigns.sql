-- 122_workforce_planning_campaigns.sql
-- Recruitment/ATS Phase 7: Workforce Planning + Recruitment Campaigns.
--
-- Workforce Planning: one row per (branch, year) "plan" — the org→branch
-- level scope a single approval covers — with a JSONB `breakdown` array
-- carrying the department/position-level line items (current/budgeted
-- headcount, planned hires, budget). Same dual-status approval split as
-- vacancies/job_descriptions/offers/probation_reviews (`approval_status`
-- engine-owned via a new ENTITY_SYNC_CONFIG entry, `status` lifecycle
-- synced by WorkforcePlanApprovalService). branch_id NULL = org-wide plan.
--
-- Recruitment Campaigns: source/referral/agency/walk-in/campus/internship
-- tracking. `applications.source` already has a coarse enum recording *how*
-- a candidate applied — campaigns are the *named, budgeted initiative*
-- layered on top (a campaign can span multiple vacancies and multiple
-- sources). No approval workflow — deliberately simpler than Workforce
-- Planning, just CRUD + a campaign_id FK on applications for attribution.
-- No new permission strings for either — both reuse hr.recruitment:view/
-- create/edit/approve exactly like every prior phase.

CREATE TABLE IF NOT EXISTS workforce_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  year INT NOT NULL CHECK (year >= 2000),
  title TEXT NOT NULL,
  notes TEXT,

  -- [{ department_id, position_id, current_headcount, budgeted_headcount,
  --    planned_hires, budget_amount, justification }]
  breakdown JSONB NOT NULL DEFAULT '[]',

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','active','closed','cancelled')),

  approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','under_review','escalated','approved','rejected','cancelled','expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejection_reason TEXT,
  approval_step INT NOT NULL DEFAULT 1,
  approval_log JSONB NOT NULL DEFAULT '[]',

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workforce_plans_tenant ON workforce_plans(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_plans_branch ON workforce_plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_workforce_plans_year ON workforce_plans(year);
CREATE INDEX IF NOT EXISTS idx_workforce_plans_status ON workforce_plans(status);
CREATE INDEX IF NOT EXISTS idx_workforce_plans_approval_status ON workforce_plans(approval_status);

CREATE TABLE IF NOT EXISTS recruitment_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'other'
    CHECK (campaign_type IN ('employee_referral','agency','walk_in','campus','internship','job_board','social_media','other')),
  vacancy_ids UUID[] NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  budget_amount NUMERIC(12,2),
  actual_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','paused','completed','cancelled')),
  description TEXT,

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recruitment_campaigns_tenant ON recruitment_campaigns(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_campaigns_status ON recruitment_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_campaigns_type ON recruitment_campaigns(campaign_type);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES recruitment_campaigns(id);
CREATE INDEX IF NOT EXISTS idx_applications_campaign ON applications(campaign_id);
