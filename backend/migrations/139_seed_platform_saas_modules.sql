-- Seed the platform module catalog used by plan building and operations subscription assignments.
-- Prices remain editable in Billing & Plans; this seed only creates the canonical module choices.

INSERT INTO saas_modules (
  name,
  slug,
  description,
  price_monthly,
  price_yearly,
  setup_fee,
  is_standalone_allowed,
  is_active
)
VALUES
  ('Organization Management', 'organization-management', 'Tenant, organization profile, admin users, and access setup.', 0, 0, 0, true, true),
  ('Branch Management', 'branch-management', 'Branch locations, operating units, and branch-level configuration.', 0, 0, 0, true, true),
  ('Employee Management', 'employee-management', 'Employee records, employment details, documents, and lifecycle data.', 0, 0, 0, true, true),
  ('Attendance', 'attendance', 'Attendance capture, corrections, policies, and daily attendance workflows.', 0, 0, 0, true, true),
  ('Leave Management', 'leave-management', 'Leave types, policies, balances, requests, and approvals.', 0, 0, 0, true, true),
  ('Payroll', 'payroll', 'Salary structures, payroll runs, statutory deductions, and payslips.', 0, 0, 0, true, true),
  ('Recruitment', 'recruitment', 'Hiring pipelines, candidates, interviews, and offer workflows.', 0, 0, 0, true, true),
  ('Performance', 'performance', 'Reviews, goals, ratings, feedback, and appraisal workflows.', 0, 0, 0, true, true),
  ('Compliance', 'compliance', 'Compliance tracking, statutory records, and workforce governance.', 0, 0, 0, true, true),
  ('Finance', 'finance', 'Finance administration, billing-related controls, and financial reporting.', 0, 0, 0, true, true),
  ('GST', 'gst', 'GST setup, tax reporting support, and related compliance records.', 0, 0, 0, true, true),
  ('Biometrics', 'biometrics', 'Biometric device integration, sync, and attendance device management.', 0, 0, 0, true, true),
  ('Assets', 'assets', 'Company assets, assignments, returns, and asset lifecycle tracking.', 0, 0, 0, true, true),
  ('Reports', 'reports', 'Operational, HR, attendance, payroll, and compliance reporting.', 0, 0, 0, true, true),
  ('Approvals', 'approvals', 'Configurable approval workflows across HRMS processes.', 0, 0, 0, true, true),
  ('Notifications', 'notifications', 'Email, SMS, in-app notifications, and communication preferences.', 0, 0, 0, true, true),
  ('Documents', 'documents', 'Document templates, storage, verification, and employee document records.', 0, 0, 0, true, true),
  ('Schedules', 'schedules', 'Shift schedules, rosters, calendars, and workforce planning.', 0, 0, 0, true, true),
  ('Exit Management', 'exit-management', 'Resignation, exit clearances, final settlement support, and offboarding.', 0, 0, 0, true, true),
  ('Historical Attendance Import', 'historical-attendance-import', 'Historical attendance import, validation, reconciliation, and rebuild tooling.', 0, 0, 0, true, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();
