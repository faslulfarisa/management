-- 116_vacancy_management.sql
-- Recruitment/ATS Phase 1: Vacancy Management (request -> approval -> lifecycle).
-- Job Description, Publishing, Candidates, Pipeline are out of scope here —
-- this table only carries the vacancy "shell" (role definition + approval +
-- lifecycle status). Attachments reuse the existing generic `documents`
-- table (entity_type = 'vacancy') via DocumentService/FileUploadService —
-- no new attachments table. Approval reuses the existing ApprovalEngineService
-- (mirrors compliance_documents' dual-status pattern: approval_status drives
-- the engine, status is the broader vacancy lifecycle, synced by
-- VacancyApprovalService after each engine call).

CREATE TABLE IF NOT EXISTS vacancies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  department_id UUID REFERENCES departments(id),
  position_id UUID REFERENCES positions(id),
  -- Free-text title kept distinct from the linked position so a vacancy can
  -- be raised before a formal Position record exists, same pattern
  -- job_postings.title already uses alongside designation_id.
  title TEXT NOT NULL,

  hiring_manager_id UUID REFERENCES employees(id),
  recruiter_id UUID REFERENCES employees(id),
  reporting_manager_id UUID REFERENCES employees(id),

  employment_type_id UUID REFERENCES employment_types(id),
  experience_min_years NUMERIC(4,1),
  experience_max_years NUMERIC(4,1),
  qualification TEXT,
  salary_min NUMERIC(12,2),
  salary_max NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'INR',
  number_of_positions INT NOT NULL DEFAULT 1 CHECK (number_of_positions >= 1),

  -- Timeline: target dates for the requisition itself, not the approval SLA
  -- (that's approval_requests.due_at, already handled by the engine).
  target_start_date DATE,
  target_close_date DATE,

  description TEXT,
  justification TEXT,

  -- Vacancy lifecycle status (separate from approval_status, mirrors
  -- compliance_documents.status vs approval_status split).
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','open','on_hold','closed','reopened','archived','cancelled')),

  -- Approval workflow status — owned by ApprovalEngineService via
  -- ENTITY_SYNC_CONFIG['vacancies']; kept distinct from `status` for the same
  -- reason compliance_documents separates them.
  approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','under_review','escalated','approved','rejected','cancelled','expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rejection_reason TEXT,
  approval_step INT NOT NULL DEFAULT 1,
  approval_log JSONB NOT NULL DEFAULT '[]',

  -- Lifecycle action audit fields (close/reopen/archive reasons — distinct
  -- from rejection_reason, which is approval-specific).
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id),
  close_reason TEXT,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES users(id),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id),

  created_by UUID REFERENCES users(id),
  last_updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT chk_vacancy_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max),
  CONSTRAINT chk_vacancy_experience_range CHECK (experience_min_years IS NULL OR experience_max_years IS NULL OR experience_min_years <= experience_max_years)
);

CREATE INDEX IF NOT EXISTS idx_vacancies_tenant ON vacancies(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vacancies_branch ON vacancies(branch_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_department ON vacancies(department_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_approval_status ON vacancies(approval_status);
CREATE INDEX IF NOT EXISTS idx_vacancies_hiring_manager ON vacancies(hiring_manager_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_recruiter ON vacancies(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_vacancies_created_at ON vacancies(created_at DESC);

-- Append-only comment thread (Activity/Comments tab in the detail view).
-- Vacancy-specific for now, same one-off pattern as other per-entity history
-- tables in this codebase (e.g. exit_timeline_events) — no generic comments
-- table exists yet; revisit genericizing once a second module needs it.
CREATE TABLE IF NOT EXISTS vacancy_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vacancy_comments_vacancy ON vacancy_comments(vacancy_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vacancy_comments_tenant ON vacancy_comments(tenant_id);

-- Append-only lifecycle/status-change history ("History" field in the spec) —
-- independent of approval_log (covers only the approval chain) and of
-- audit_logs (generic, cross-module, less display-friendly).
CREATE TABLE IF NOT EXISTS vacancy_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vacancy_id UUID NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vacancy_status_history_vacancy ON vacancy_status_history(vacancy_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vacancy_status_history_tenant ON vacancy_status_history(tenant_id);

-- Permission catalog rows. `view/create/edit/approve` already exist in
-- shared/permissions.constants.ts and backend/scripts/seed.ts (demo-tenant
-- seed only) but were never backfilled into the `permissions` catalog or
-- granted via role_permissions for already-provisioned tenants — the legacy
-- recruitment controller has zero permission enforcement today, so this gap
-- was invisible until now. Re-inserting all eight actions here (idempotent
-- via ON CONFLICT) closes that gap as part of adding the first enforced
-- recruitment endpoints.
INSERT INTO permissions (module, action, description) VALUES
  ('hr.recruitment', 'view',    'View vacancies and recruitment data'),
  ('hr.recruitment', 'create',  'Create new vacancy requests'),
  ('hr.recruitment', 'edit',    'Edit vacancy details (draft/rejected only)'),
  ('hr.recruitment', 'approve', 'Approve or reject vacancy requests'),
  ('hr.recruitment', 'close',   'Close a vacancy (stop accepting candidates)'),
  ('hr.recruitment', 'reopen',  'Reopen a closed vacancy'),
  ('hr.recruitment', 'archive', 'Archive a vacancy (terminal state)'),
  ('hr.recruitment', 'comment', 'Comment on a vacancy')
ON CONFLICT (module, action) DO NOTHING;

-- Grant the full action set to the same role set that already receives
-- equivalent grants for other HR workflows (mirrors migration
-- 112_exit_management_permissions.sql's role list for exit/asset management).
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Tenant Admin', 'HR Manager')
  AND r.is_system = TRUE
  AND p.module = 'hr.recruitment'
  AND p.action IN ('view', 'create', 'edit', 'approve', 'close', 'reopen', 'archive', 'comment')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
