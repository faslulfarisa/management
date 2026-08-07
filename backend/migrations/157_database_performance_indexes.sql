-- 157_database_performance_indexes.sql
-- Targeted production performance pass for high-volume tenant-scoped reads.
--
-- This migration is intentionally schema-only: no data rewrites and no API or
-- business behavior changes. CONCURRENTLY keeps index builds suitable for large
-- tables in production.

-- ---------------------------------------------------------------------------
-- Attendance records: list pagination, branch-scoped dashboards, reports, and
-- future date-range partitioning.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_tenant_date_id_desc
  ON attendance_records(tenant_id, date DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_tenant_branch_date_id
  ON attendance_records(tenant_id, branch_id, date DESC, id DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_tenant_status_date_id
  ON attendance_records(tenant_id, status, date DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_tenant_emp_date_id
  ON attendance_records(tenant_id, employee_id, date DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_open_breaks
  ON attendance_records(tenant_id, branch_id, date DESC)
  WHERE is_on_break = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_records_current_break
  ON attendance_records(current_break_session_id)
  WHERE current_break_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Break sessions: active break lookup, daily employee timelines, monitoring,
-- and attendance rollback/rebuild joins.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_break_sessions_tenant_emp_date_start
  ON break_sessions(tenant_id, employee_id, date DESC, started_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_break_sessions_active_started
  ON break_sessions(tenant_id, started_at)
  WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_break_sessions_overdue_alert
  ON break_sessions(tenant_id, started_at)
  WHERE status = 'active' AND alert_sent_at IS NULL AND allowed_minutes IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_break_sessions_tenant_record
  ON break_sessions(tenant_id, attendance_record_id);

-- ---------------------------------------------------------------------------
-- Payroll and attendance summaries: report joins, lock/finalization flows, and
-- employee-period lookups.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_runs_tenant_period_status
  ON payroll_runs(tenant_id, year DESC, month DESC, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_runs_tenant_month_year
  ON payroll_runs(tenant_id, month, year);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payslips_run_tenant_status
  ON payslips(payroll_run_id, tenant_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payslips_tenant_period_status
  ON payslips(tenant_id, year DESC, month DESC, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pas_tenant_emp_period_status
  ON payroll_attendance_summary(tenant_id, employee_id, period_start, period_end, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pas_tenant_period_branch_status
  ON payroll_attendance_summary(tenant_id, period_start, period_end, branch_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pas_tenant_period_dept_status
  ON payroll_attendance_summary(tenant_id, period_start, period_end, department_id, status);

-- ---------------------------------------------------------------------------
-- Approval requests: inboxes, submitted requests, SLA scans, entity sync, and
-- JSONB workflow context search.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_inbox_created
  ON approval_requests(tenant_id, status, created_at DESC, id DESC)
  WHERE status IN ('pending', 'under_review', 'escalated');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_branch_inbox_created
  ON approval_requests(tenant_id, branch_id, status, created_at DESC, id DESC)
  WHERE branch_id IS NOT NULL AND status IN ('pending', 'under_review', 'escalated');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_submitted_created
  ON approval_requests(tenant_id, submitted_by, created_at DESC, id DESC)
  WHERE submitted_by IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_entity_tenant
  ON approval_requests(tenant_id, entity_table, entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_workflow_status_created
  ON approval_requests(tenant_id, workflow_type, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_due_pending
  ON approval_requests(tenant_id, due_at)
  WHERE due_at IS NOT NULL AND status IN ('pending', 'under_review', 'escalated');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_metadata_gin
  ON approval_requests USING GIN(metadata jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_req_log_gin
  ON approval_requests USING GIN(approval_log jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Notifications: tenant/user feed pagination, unread counts, branch-scoped
-- visibility, module filters, entity lookups, and JSONB action metadata.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_feed
  ON notifications(tenant_id, user_id, status, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread_active
  ON notifications(tenant_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL AND is_read = false AND status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_tenant_active_created
  ON notifications(tenant_id, status, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_branch_active_created
  ON notifications(tenant_id, branch_id, status, created_at DESC, id DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_module_active_created
  ON notifications(tenant_id, source_module, status, created_at DESC)
  WHERE source_module IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_entity
  ON notifications(tenant_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_metadata_gin
  ON notifications USING GIN(metadata jsonb_path_ops);

-- Low-cardinality single-column notification indexes are counterproductive for
-- tenant-scoped inbox queries and are covered by the composite indexes above.
DROP INDEX CONCURRENTLY IF EXISTS idx_not_read;
DROP INDEX CONCURRENTLY IF EXISTS idx_not_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_not_priority;
DROP INDEX CONCURRENTLY IF EXISTS idx_not_source;

-- ---------------------------------------------------------------------------
-- Audit logs: tenant feed pagination, scoped filtering, cross-tenant entity
-- feeds, entity drilldowns, and JSONB before/after value search. Date-first
-- indexes keep audit_logs ready for future range partitioning.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_created_id
  ON audit_logs(tenant_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_entity_created
  ON audit_logs(tenant_id, entity_type, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_entity_id_created
  ON audit_logs(tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_type_created
  ON audit_logs(entity_type, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_user_action_created
  ON audit_logs(tenant_id, user_id, action, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_old_values_gin
  ON audit_logs USING GIN(old_values jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_new_values_gin
  ON audit_logs USING GIN(new_values jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Recruitment: tenant-scoped list pages, dashboard counters, report joins,
-- approval queues, campaign attribution, and flexible JSONB profile/search
-- fields.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vacancies_tenant_status_created
  ON vacancies(tenant_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vacancies_tenant_branch_status_created
  ON vacancies(tenant_id, branch_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND branch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vacancies_tenant_approval_created
  ON vacancies(tenant_id, approval_status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vacancies_tenant_recruiter_created
  ON vacancies(tenant_id, recruiter_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND recruiter_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_tenant_status_created
  ON candidates(tenant_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_tenant_email_active
  ON candidates(tenant_id, email)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_skills_gin
  ON candidates USING GIN(skills jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_experience_gin
  ON candidates USING GIN(experience jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tenant_status_applied
  ON applications(tenant_id, status, applied_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tenant_vacancy_status
  ON applications(tenant_id, vacancy_id, status, applied_at DESC)
  WHERE deleted_at IS NULL AND vacancy_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tenant_candidate_applied
  ON applications(tenant_id, candidate_id, applied_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_tenant_campaign_applied
  ON applications(tenant_id, campaign_id, applied_at DESC)
  WHERE deleted_at IS NULL AND campaign_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interviews_tenant_scheduled_status
  ON interviews(tenant_id, scheduled_at DESC, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interviews_tenant_application_scheduled
  ON interviews(tenant_id, application_id, scheduled_at DESC)
  WHERE application_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interviews_tenant_vacancy_scheduled
  ON interviews(tenant_id, vacancy_id, scheduled_at DESC)
  WHERE vacancy_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_tenant_status_created
  ON offers(tenant_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_tenant_approval_created
  ON offers(tenant_id, approval_status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_tenant_vacancy_status
  ON offers(tenant_id, vacancy_id, status, created_at DESC)
  WHERE deleted_at IS NULL AND vacancy_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_salary_components_gin
  ON offers USING GIN(salary_components jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offers_benefits_gin
  ON offers USING GIN(benefits jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_desc_tenant_status_created
  ON job_descriptions(tenant_id, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_desc_tenant_approval_created
  ON job_descriptions(tenant_id, approval_status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_desc_skills_gin
  ON job_descriptions USING GIN(skills jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_desc_kpis_gin
  ON job_descriptions USING GIN(kpis jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workforce_plans_tenant_year_status
  ON workforce_plans(tenant_id, year DESC, status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workforce_plans_tenant_approval
  ON workforce_plans(tenant_id, approval_status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workforce_plans_breakdown_gin
  ON workforce_plans USING GIN(breakdown jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recruitment_campaigns_tenant_status_dates
  ON recruitment_campaigns(tenant_id, status, start_date DESC, end_date DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Partitioning readiness documentation. These comments are intentionally
-- non-behavioral markers for a future migration that can introduce range
-- partitioning after retention/reporting windows are finalized.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE attendance_records IS
  'High-volume attendance fact table. Keep all new read paths constrained by tenant_id and date so this table can move to range partitioning by date without API changes.';

COMMENT ON TABLE audit_logs IS
  'Append-heavy audit fact table. Keep all new feed/report queries constrained by created_at where possible so this table can move to range partitioning by created_at without API changes.';
