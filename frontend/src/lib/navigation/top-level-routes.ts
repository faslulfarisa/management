/**
 * Pathnames that represent top-level module pages — pages reachable directly
 * from the sidebar. These are the "home" page of a workflow: the back button
 * is hidden here, and visiting one of these routes clears any child/detail
 * pages from the navigation trail (see navigation-history.store.ts).
 *
 * Mirrors the `href` values in `components/layout/sidebar.tsx`.
 */
export const TOP_LEVEL_ROUTES: ReadonlySet<string> = new Set([
  '/dashboard',

  // Organization Management
  '/dashboard/platform',
  '/dashboard/platform/branches',
  '/dashboard/platform/departments',
  '/dashboard/platform/areas',
  '/dashboard/platform/positions',
  '/dashboard/platform/users',
  '/dashboard/platform/approval-chains',
  '/dashboard/platform/audit-logs',
  '/dashboard/platform/transfers',

  // HR
  '/dashboard/hr/employees',
  '/dashboard/hr/attendance',
  '/dashboard/hr/leave',
  '/dashboard/hr/payroll',
  '/dashboard/hr/fines',
  '/dashboard/hr/compliance',
  '/dashboard/hr/performance',
  '/dashboard/hr/exit-management',

  // Operations
  '/dashboard/ops/assets',

  // Compliance (tab bar — see dashboard/compliance/layout.tsx)
  '/dashboard/compliance',
  '/dashboard/compliance/company-documents',
  '/dashboard/compliance/employee-documents',
  '/dashboard/compliance/tracker',
  '/dashboard/compliance/licenses-certifications',
  '/dashboard/compliance/government-registrations',
  '/dashboard/compliance/policies',
  '/dashboard/compliance/expiring',
  '/dashboard/compliance/renewals',
  '/dashboard/compliance/templates',
  '/dashboard/compliance/reports',

  // Recruitment (tab bar — see dashboard/hr/recruitment/layout.tsx)
  '/dashboard/hr/recruitment',
  '/dashboard/hr/recruitment/vacancies',
  '/dashboard/hr/recruitment/job-descriptions',
  '/dashboard/hr/recruitment/candidates',
  '/dashboard/hr/recruitment/pipeline',
  '/dashboard/hr/recruitment/interviews',
  '/dashboard/hr/recruitment/offers',
  '/dashboard/hr/recruitment/onboarding',
  '/dashboard/hr/recruitment/workforce-planning',
  '/dashboard/hr/recruitment/campaigns',

  // Templates
  '/dashboard/templates/attendance-policy',
  '/dashboard/templates/leave-policy',
  '/dashboard/templates/salary-structure',
  '/dashboard/templates/overtime-policy',
  '/dashboard/templates/shifts',

  // Schedules
  '/dashboard/schedules/overview',
  '/dashboard/schedules/assignments',
  '/dashboard/schedules/unassigned',

  // Finance
  '/dashboard/finance',
  '/dashboard/finance/expenses',
  '/dashboard/finance/reimbursements',
  '/dashboard/finance/invoices',
  '/dashboard/finance/vendors',
  '/dashboard/finance/bills',
  '/dashboard/finance/cashbook',
  '/dashboard/finance/budgets',
  '/dashboard/finance/gst',

  // Reports
  '/dashboard/reports',

  // Biometrics
  '/dashboard/biometrics/live-attendance',
  '/dashboard/biometrics/queue-health',
  '/dashboard/biometrics/dlq',
  '/dashboard/biometrics/corrections',
  '/dashboard/biometrics/historical-attendance-import',

  // Settings
  '/dashboard/system/settings',
  '/dashboard/settings/company-profile',

  // Approvals / Automation
  '/dashboard/approvals',
  '/dashboard/automation',
]);

/**
 * Returns true if `pathname` is a top-level module page (a sidebar landing
 * page with no parent workflow page).
 */
export function isTopLevelRoute(pathname: string): boolean {
  if (pathname === '/branch-admin') return true;
  const normalizedPathname = pathname.replace(/^\/branch-admin(?=\/)/, '/dashboard');
  return TOP_LEVEL_ROUTES.has(normalizedPathname);
}
