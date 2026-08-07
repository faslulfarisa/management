-- 121_preboarding_employee_conversion.sql
-- Recruitment/ATS Phase 6: Preboarding + Employee Conversion + Probation & Confirmation.
--
-- Preboarding: one row per application (JSONB-flexible checklist, same
-- "per-application table, not a generic cross-module engine" shape the
-- plan called for) — `items` holds the welcome-communication/document-
-- collection/asset-request/account-creation/joining-schedule tasks,
-- while bank_details/emergency_contact/nda_accepted_at are dedicated
-- columns since they're candidate-entered structured data consumed
-- directly by Employee Conversion. Documents reuse the generic
-- `documents` table (entity_type='application'), same pattern as every
-- other attachment in this module.
--
-- Employee Conversion has no new table — it reuses EmployeeService.create()
-- directly and just needs a traceability pointer, added to `applications`.
--
-- Probation & Confirmation: `probation_reviews`, one row per probation
-- cycle for an employee. Same dual-status approval split as vacancies/
-- job_descriptions/offers (`approval_status` engine-owned via a new
-- ENTITY_SYNC_CONFIG entry, `status` lifecycle synced by
-- ProbationApprovalService). Goals and review feedback are JSONB arrays
-- (goal setting + review schedule are flexible lists, not normalized
-- child tables), matching candidate_evaluations' per-criteria JSONB shape.
--
-- No new permission strings — everything reuses hr.recruitment:view/
-- create/edit/approve exactly like Phases 4 and 5.

CREATE TABLE IF NOT EXISTS preboarding_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id),

  -- [{ key, label, category, status, completed_at, completed_by, notes }] —
  -- welcome_communication / document_collection / asset_request /
  -- account_creation_request / joining_schedule. Seeded with a built-in
  -- default set on first creation (mirrors exit_checklist's
  -- DEFAULT_TEMPLATE_ITEMS fallback, inlined as JSONB instead of rows).
  items JSONB NOT NULL DEFAULT '[]',

  -- Candidate-entered, consumed directly by Employee Conversion.
  bank_details JSONB NOT NULL DEFAULT '{}',
  emergency_contact JSONB NOT NULL DEFAULT '{}',
  nda_accepted_at TIMESTAMPTZ,
  nda_accepted_ip TEXT,

  -- Confirmed/proposed joining date — may differ from the offer's
  -- original joining_date if rescheduled during preboarding.
  joining_date DATE,

  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_preboarding_application ON preboarding_checklists(application_id);
CREATE INDEX IF NOT EXISTS idx_preboarding_tenant ON preboarding_checklists(tenant_id);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS converted_employee_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_applications_converted_employee ON applications(converted_employee_id);

CREATE TABLE IF NOT EXISTS probation_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),

  -- [{ description, target_date }]
  goals JSONB NOT NULL DEFAULT '[]',
  -- [{ date, reviewer_id, type: 'manager'|'hr', feedback, rating }]
  review_entries JSONB NOT NULL DEFAULT '[]',

  reviewer_id UUID REFERENCES users(id),
  probation_end_date DATE,
  extended_probation_end_date DATE,

  recommendation TEXT CHECK (recommendation IN ('confirm', 'extend', 'terminate')),
  recommendation_notes TEXT,

  -- Probation review lifecycle (separate from approval_status, mirrors
  -- vacancies.status vs approval_status split).
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),

  approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'under_review', 'escalated', 'approved', 'rejected', 'cancelled', 'expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejection_reason TEXT,
  approval_step INT NOT NULL DEFAULT 1,
  approval_log JSONB NOT NULL DEFAULT '[]',

  confirmation_date DATE,
  confirmation_letter_content TEXT,

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_tenant ON probation_reviews(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_probation_reviews_employee ON probation_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_status ON probation_reviews(status);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_approval_status ON probation_reviews(approval_status);
