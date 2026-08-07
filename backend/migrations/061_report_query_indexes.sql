-- 061_report_query_indexes.sql
-- Phase 4: Composite performance indexes for enterprise report query paths.
-- Run after 060_saved_reports.sql
-- SAFE: CREATE INDEX IF NOT EXISTS only. No schema changes.
--
-- NOTE: attendance_records indexes use regular (non-concurrent) syntax so this
-- migration can run inside a transaction block. On large prod datasets run each
-- C-O-N-C-U-R-R-E-N-T-L-Y index statement manually outside a transaction.

-- ─── attendance_records ───────────────────────────────────────────────────────

-- Date-range scans without branch filter (daily summary, absenteeism, work-hours)
CREATE INDEX IF NOT EXISTS idx_ar_tenant_date
  ON attendance_records(tenant_id, date DESC);

-- Status-filtered aggregations (daily summary GROUP BY status, absenteeism pct)
CREATE INDEX IF NOT EXISTS idx_ar_tenant_status_date
  ON attendance_records(tenant_id, status, date DESC);

-- Late-arrivals report: filters late_minutes > 0
CREATE INDEX IF NOT EXISTS idx_ar_tenant_late
  ON attendance_records(tenant_id, date DESC, late_minutes)
  WHERE late_minutes > 0;

-- Overtime report: filters overtime_minutes > 0
CREATE INDEX IF NOT EXISTS idx_ar_tenant_overtime
  ON attendance_records(tenant_id, date DESC, overtime_minutes)
  WHERE overtime_minutes > 0;

-- Shift-attendance report: filters by shift_id
CREATE INDEX IF NOT EXISTS idx_ar_tenant_shift_date
  ON attendance_records(tenant_id, shift_id, date DESC);

-- Missed-punch report: clock_in without clock_out
CREATE INDEX IF NOT EXISTS idx_ar_tenant_missed_punch
  ON attendance_records(tenant_id, date DESC)
  WHERE clock_in IS NOT NULL AND clock_out IS NULL;

-- Verification-method breakdown: group by verify_method per branch
CREATE INDEX IF NOT EXISTS idx_ar_tenant_verify_method
  ON attendance_records(tenant_id, verify_method, date DESC);

-- Overnight attendance: partial index on is_overnight when it exists
-- (is_overnight was added by the biometrics migration - skips gracefully if absent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_records' AND column_name = 'is_overnight'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_ar_tenant_overnight
        ON attendance_records(tenant_id, date DESC)
        WHERE is_overnight = TRUE
    $sql$;
  END IF;
END$$;

-- ─── employees ────────────────────────────────────────────────────────────────

-- Headcount / workforce stats: tenant + branch + active status
CREATE INDEX IF NOT EXISTS idx_emp_tenant_branch_status
  ON employees(tenant_id, branch_id, status)
  WHERE deleted_at IS NULL;

-- Department demographics / headcount: tenant + department
CREATE INDEX IF NOT EXISTS idx_emp_tenant_dept_status
  ON employees(tenant_id, department_id, status)
  WHERE deleted_at IS NULL;

-- Joining-trend report: ordered by date_of_joining
CREATE INDEX IF NOT EXISTS idx_emp_tenant_joining
  ON employees(tenant_id, date_of_joining DESC)
  WHERE deleted_at IS NULL;

-- Resignation-trend / resigned employee report
CREATE INDEX IF NOT EXISTS idx_emp_tenant_status_joining
  ON employees(tenant_id, status, date_of_joining DESC)
  WHERE deleted_at IS NULL;

-- ─── leave_balances ──────────────────────────────────────────────────────────

-- Leave balance report: tenant + employee + type + year lookup
CREATE INDEX IF NOT EXISTS idx_lb_tenant_emp_type_year
  ON leave_balances(tenant_id, employee_id, leave_type_id, year);

-- Leave utilization by type: group by leave_type across tenant
CREATE INDEX IF NOT EXISTS idx_lb_tenant_type_year
  ON leave_balances(tenant_id, leave_type_id, year);

-- ─── leave_requests ──────────────────────────────────────────────────────────

-- Leave approval status report: filter by status + date range
CREATE INDEX IF NOT EXISTS idx_lr_tenant_status_date
  ON leave_requests(tenant_id, status, start_date DESC);

-- Employee-wise leave history
CREATE INDEX IF NOT EXISTS idx_lr_tenant_emp_status
  ON leave_requests(tenant_id, employee_id, status, start_date DESC);

-- Calendar / overlap report: date range scan per tenant
CREATE INDEX IF NOT EXISTS idx_lr_tenant_start_end
  ON leave_requests(tenant_id, start_date DESC, end_date);

-- Branch-level leave analytics (branch_id added by migration 047 or similar)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'branch_id'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_lr_tenant_branch_date
        ON leave_requests(tenant_id, branch_id, start_date DESC)
    $sql$;
  END IF;
END$$;

-- ─── payslips ────────────────────────────────────────────────────────────────

-- Payroll monthly summary: group by tenant + year + month
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_year_month
  ON payslips(tenant_id, year DESC, month DESC);

-- Payslip detail: filter by employee
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_emp_month
  ON payslips(tenant_id, employee_id, year DESC, month DESC);

-- ─── payroll_runs ────────────────────────────────────────────────────────────

-- Payroll summary + audit: tenant + year + month composite
CREATE INDEX IF NOT EXISTS idx_pr_tenant_year_month
  ON payroll_runs(tenant_id, year DESC, month DESC);

-- Branch-scoped payroll (branch_id added by migration 047)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_runs' AND column_name = 'branch_id'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_pr_tenant_branch_month
        ON payroll_runs(tenant_id, branch_id, year DESC, month DESC)
    $sql$;
  END IF;
END$$;

-- ─── shift_assignments ───────────────────────────────────────────────────────

-- Active shift allocation report: filter is_active
CREATE INDEX IF NOT EXISTS idx_sa_tenant_active
  ON shift_assignments(tenant_id, is_active, start_date DESC)
  WHERE is_active = TRUE;

-- Shift-change / reassignment history: per employee
CREATE INDEX IF NOT EXISTS idx_sa_tenant_emp_date
  ON shift_assignments(tenant_id, employee_id, start_date DESC);

-- ─── attendance_corrections ──────────────────────────────────────────────────

-- Regularization report: filter by status across all (not just pending)
CREATE INDEX IF NOT EXISTS idx_ac_tenant_status_created
  ON attendance_corrections(tenant_id, status, created_at DESC);

-- Employee-wise correction history
CREATE INDEX IF NOT EXISTS idx_ac_tenant_emp_created
  ON attendance_corrections(tenant_id, employee_id, created_at DESC);

-- ─── saved_reports (additional) ──────────────────────────────────────────────

-- Category-filtered listing (used by saved reports page filter)
CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_category
  ON saved_reports(tenant_id, category, updated_at DESC);
