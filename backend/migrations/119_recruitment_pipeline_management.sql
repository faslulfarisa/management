-- 119_recruitment_pipeline_management.sql
-- Recruitment/ATS Phase 4: Recruitment Pipeline + HR Screening + Assessment +
-- Interview Management + Evaluation + Candidate Communication.
--
-- `applications` (migration 118) keeps its coarse status (applied/under_review/
-- shortlisted/rejected/withdrawn/hired) — this migration layers a tenant-
-- configurable, granular `pipeline_stages` + `candidate_pipeline_history` on
-- top via a new `applications.current_stage_id`, same "coarse enum + richer
-- detail layered on later" pattern as vacancies.status vs approval_status.
--
-- Screening/Assessment/Evaluation are new one-off tables (no existing generic
-- table fits), following the vacancy_comments/vacancy_status_history
-- precedent of per-module tables rather than premature generalization.
--
-- Interviews: the legacy `interviews` table (014_recruitment.sql) is ALTERed
-- in place — same "extend the legacy table" approach Phase 2 took with
-- job_postings and Phase 3 took with candidates — rather than creating a
-- parallel table. Rounds/panels/scorecards are added as columns; panel
-- members and per-panelist scorecards are JSONB/array rather than normalized
-- child tables, matching job_descriptions' KRA/skills JSONB-array precedent.
--
-- No new permission strings: every endpoint in this phase reuses the existing
-- hr.recruitment:view/create/edit permissions (sub-resource mutations reuse
-- :edit, same as Phase 3's resume upload — only the primary entity (vacancy,
-- candidate) creation uses :create).

-- ── Configurable pipeline stages (tenant-defined, ordered) ──────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_category TEXT NOT NULL DEFAULT 'custom'
    CHECK (stage_category IN ('screening','assessment','interview','evaluation','offer','custom')),
  stage_order INT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages(tenant_id) WHERE is_active = true;

-- Granular stage-transition log for an application — distinct from the
-- coarse `applications.status` and from `vacancy_status_history` (different
-- entity entirely).
CREATE TABLE IF NOT EXISTS candidate_pipeline_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID REFERENCES pipeline_stages(id),
  actor_id UUID REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cph_application ON candidate_pipeline_history(application_id, created_at);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS current_stage_id UUID REFERENCES pipeline_stages(id);

-- ── HR Screening checklist (one per application) ─────────────────────────
CREATE TABLE IF NOT EXISTS candidate_screenings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  current_salary NUMERIC(12,2),
  expected_salary NUMERIC(12,2),
  notice_period_days INT,
  availability_date DATE,
  communication_rating INT CHECK (communication_rating BETWEEN 1 AND 5),
  recommendation TEXT CHECK (recommendation IN ('proceed','hold','reject')),
  notes TEXT,
  screened_by UUID REFERENCES users(id),
  screened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_screenings_application ON candidate_screenings(application_id);

-- ── Assessments (technical/coding/assignment/case-study/language tests) ──
-- Submission files / test materials reuse the generic `documents` table
-- (entity_type = 'candidate_assessment'), same pattern as vacancy/resume
-- attachments — no separate attachments table here either.
CREATE TABLE IF NOT EXISTS candidate_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL DEFAULT 'technical'
    CHECK (assessment_type IN ('technical','coding','assignment','case_study','language_test','other')),
  title TEXT NOT NULL,
  instructions TEXT,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','in_progress','submitted','evaluated','cancelled')),
  score NUMERIC(6,2),
  max_score NUMERIC(6,2) NOT NULL DEFAULT 100,
  result TEXT CHECK (result IN ('pass','fail')),
  evaluator_id UUID REFERENCES users(id),
  evaluated_at TIMESTAMPTZ,
  evaluation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assessments_application ON candidate_assessments(application_id);

-- ── Interview Management: extend the legacy `interviews` table ──────────
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id),
  ADD COLUMN IF NOT EXISTS vacancy_id UUID REFERENCES vacancies(id),
  ADD COLUMN IF NOT EXISTS round_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS round_type TEXT NOT NULL DEFAULT 'technical'
    CHECK (round_type IN ('technical','hr','managerial','final','other')),
  ADD COLUMN IF NOT EXISTS panel_member_ids UUID[] NOT NULL DEFAULT '{}',
  -- Per-panelist scorecard entries: [{ panelist_id, rating, recommendation, comments, submitted_at }]
  ADD COLUMN IF NOT EXISTS scorecard JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID REFERENCES interviews(id),
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_vacancy ON interviews(vacancy_id);

-- ── Structured Evaluations (independent of / following an interview round) ──
CREATE TABLE IF NOT EXISTS candidate_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interview_id UUID REFERENCES interviews(id),
  evaluation_type TEXT NOT NULL DEFAULT 'technical'
    CHECK (evaluation_type IN ('technical','hr','behavioural','communication','leadership','culture_fit','other')),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  -- Per-criteria ratings: [{ criteria, score, max_score, comment }]
  ratings JSONB NOT NULL DEFAULT '[]',
  overall_rating NUMERIC(3,1),
  strengths TEXT,
  concerns TEXT,
  recommendation TEXT NOT NULL DEFAULT 'neutral'
    CHECK (recommendation IN ('strong_yes','yes','neutral','no','strong_no')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluations_application ON candidate_evaluations(application_id);

-- ── Candidate Communication: templates + send log ─────────────────────────
CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('interview_invite','rejection','offer','reminder','custom')),
  subject TEXT NOT NULL,
  -- Plain-text/HTML body with {{candidate_name}} / {{job_title}} / {{interview_date}} placeholders.
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant ON communication_templates(tenant_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS candidate_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id),
  template_id UUID REFERENCES communication_templates(id),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_message TEXT,
  sent_by UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_candidate ON candidate_communications(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_application ON candidate_communications(application_id);

-- ── Default seed data for already-provisioned tenants ─────────────────────
-- (Same "backfill existing tenants only" scope as migration 116's permission
-- backfill — new-tenant provisioning isn't hooked up for any recruitment
-- config yet, so this matches existing precedent rather than inventing one.)
INSERT INTO pipeline_stages (tenant_id, name, stage_category, stage_order, color)
SELECT t.id, v.name, v.category, v.ord, v.color
FROM tenants t
CROSS JOIN (VALUES
  ('Screening', 'screening', 1, '#0ea5e9'),
  ('Assessment', 'assessment', 2, '#8b5cf6'),
  ('Interview Round 1', 'interview', 3, '#f59e0b'),
  ('Interview Round 2', 'interview', 4, '#f97316'),
  ('HR Round', 'interview', 5, '#ec4899'),
  ('Offer', 'offer', 6, '#16a34a')
) AS v(name, category, ord, color)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages ps WHERE ps.tenant_id = t.id);

INSERT INTO communication_templates (tenant_id, name, category, subject, body)
SELECT t.id, v.name, v.category, v.subject, v.body
FROM tenants t
CROSS JOIN (VALUES
  ('Interview Invitation', 'interview_invite', 'Interview invitation for {{job_title}}',
   'Hi {{candidate_name}},\n\nWe would like to invite you for an interview for the {{job_title}} position on {{interview_date}}.\n\nPlease let us know if this works for you.\n\nRegards,\n{{company_name}} Hiring Team'),
  ('Application Rejection', 'rejection', 'Update on your application for {{job_title}}',
   'Hi {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position and for taking the time to apply. After careful consideration, we will not be moving forward with your application at this time.\n\nWe wish you the best in your search.\n\nRegards,\n{{company_name}} Hiring Team'),
  ('Interview Reminder', 'reminder', 'Reminder: your interview for {{job_title}} is coming up',
   'Hi {{candidate_name}},\n\nThis is a reminder that your interview for the {{job_title}} position is scheduled on {{interview_date}}.\n\nLooking forward to speaking with you.\n\nRegards,\n{{company_name}} Hiring Team')
) AS v(name, category, subject, body)
WHERE NOT EXISTS (SELECT 1 FROM communication_templates ct WHERE ct.tenant_id = t.id);
