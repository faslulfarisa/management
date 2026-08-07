-- Migration 126: Composite indexes for Phase 2 dashboard hot paths.
--
-- Dashboard overview/summary filters repeatedly combine tenant, date/status,
-- and branch scope. Existing single-column indexes help less under production
-- tenant volumes because Postgres still has to filter the remaining predicates.
-- CONCURRENTLY keeps these safe for live deployment.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_records_tenant_date_branch
  ON attendance_records(tenant_id, date, branch_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_records_tenant_date_late_branch
  ON attendance_records(tenant_id, date, branch_id)
  WHERE late_minutes > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_requests_tenant_status_employee
  ON leave_requests(tenant_id, status, employee_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_tenant_status_branch
  ON expenses(tenant_id, status, branch_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gst_invoices_tenant_invoice_date
  ON gst_invoices(tenant_id, invoice_date);
