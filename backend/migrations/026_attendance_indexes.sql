-- 026_attendance_indexes.sql
-- Phase 9: Performance indexes for high-traffic attendance query paths.
-- NOTE: CONCURRENTLY indexes cannot run inside a transaction block.
-- Run this migration with: psql -c "\i 026_attendance_indexes.sql"
-- or via a migration runner that disables auto-transaction per statement.

-- Punch lookup hot path: tenant + employee + date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_tenant_emp_date
  ON attendance_records(tenant_id, employee_id, date DESC);

-- Provider-filtered live dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_provider_time
  ON attendance_records(tenant_id, provider_name, date DESC)
  WHERE provider_name IS NOT NULL;

-- Branch-filtered live dashboard: see migration 092 (attendance_records.branch_id
-- does not exist until migration 050).

-- Fingerprint deduplication: the critical hot path — must be fast
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fp_hash
  ON punch_fingerprints(tenant_id, fingerprint);

-- Correction workflow: pending corrections per tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_corrections_tenant_status
  ON attendance_corrections(tenant_id, status)
  WHERE status = 'pending';

-- Audit log employee history (from/to range scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_emp_created
  ON attendance_audit_logs(tenant_id, employee_id, created_at DESC);

-- Payroll summary period lookup (used by generatePayslips)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pas_lookup
  ON payroll_attendance_summary(tenant_id, period_start, period_end, status);
