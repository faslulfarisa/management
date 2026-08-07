/**
 * Static route -> label registry, mirroring the module structure in
 * `components/layout/sidebar.tsx`. Used by the header page title and by
 * the breadcrumb / navigation-history system to label visited pages.
 *
 * Order matters: more specific (deeper) paths must appear before their
 * parents so exact/prefix matching picks the most specific label first.
 */
export const ROUTE_LABELS: { pattern: string; label: string }[] = [
  // Platform
  { pattern: '/dashboard/platform/audit-logs', label: 'Audit Logs' },
  { pattern: '/dashboard/platform/templates', label: 'Templates' },
  { pattern: '/dashboard/platform/users', label: 'User Management' },
  { pattern: '/dashboard/platform/branches', label: 'Branches' },
  { pattern: '/dashboard/platform/departments', label: 'Departments' },
  { pattern: '/dashboard/platform/areas', label: 'Areas' },
  { pattern: '/dashboard/platform/positions', label: 'Positions' },
  { pattern: '/dashboard/platform/approval-chains', label: 'Approval Chains' },
  { pattern: '/dashboard/platform', label: 'Organization' },

  // HR
  { pattern: '/dashboard/hr/exit-management', label: 'Exit Management' },
  { pattern: '/dashboard/hr/performance', label: 'Performance' },
  { pattern: '/dashboard/hr/compliance', label: 'Compliance' },
  { pattern: '/dashboard/hr/recruitment', label: 'Recruitment' },
  { pattern: '/dashboard/hr/attendance', label: 'Attendance' },
  { pattern: '/dashboard/hr/employees', label: 'Employees' },
  { pattern: '/dashboard/hr/fines', label: 'Fines & Deductions' },
  { pattern: '/dashboard/hr/payroll', label: 'Payroll' },
  { pattern: '/dashboard/hr/shifts', label: 'Shifts' },
  { pattern: '/dashboard/hr/leave', label: 'Leave' },

  // Operations
  { pattern: '/dashboard/ops/assets', label: 'Assets' },

  // Compliance (tab bar — see dashboard/compliance/layout.tsx)
  { pattern: '/dashboard/compliance/company-documents', label: 'Company Documents' },
  { pattern: '/dashboard/compliance/employee-documents', label: 'Employee Documents' },
  { pattern: '/dashboard/compliance/tracker', label: 'Compliance Tracker' },
  { pattern: '/dashboard/compliance/licenses-certifications', label: 'Licenses & Certifications' },
  { pattern: '/dashboard/compliance/government-registrations', label: 'Government Registrations' },
  { pattern: '/dashboard/compliance/policies', label: 'Policy Management' },
  { pattern: '/dashboard/compliance/expiring', label: 'Expiring Documents' },
  { pattern: '/dashboard/compliance/renewals', label: 'Renewals' },
  { pattern: '/dashboard/compliance/templates', label: 'Document Templates' },
  { pattern: '/dashboard/compliance/reports', label: 'Compliance Reports' },
  { pattern: '/dashboard/compliance', label: 'Compliance' },

  // Templates
  { pattern: '/dashboard/templates/attendance-policy', label: 'Attendance Policy' },
  { pattern: '/dashboard/templates/leave-policy', label: 'Leave Policy' },
  { pattern: '/dashboard/templates/salary-structure', label: 'Salary Structure' },
  { pattern: '/dashboard/templates/overtime-policy', label: 'Overtime Policy' },
  { pattern: '/dashboard/templates/shifts', label: 'Shift Templates' },
  { pattern: '/dashboard/templates', label: 'Templates' },

  // Schedules
  { pattern: '/dashboard/schedules/overview', label: 'Schedule Overview' },
  { pattern: '/dashboard/schedules/assignments', label: 'All Assignments' },
  { pattern: '/dashboard/schedules/unassigned', label: 'Unassigned' },
  { pattern: '/dashboard/schedules', label: 'Schedules' },

  // Finance
  { pattern: '/dashboard/finance/gst', label: 'GST Dashboard' },
  { pattern: '/dashboard/finance/reimbursements', label: 'Reimbursements' },
  { pattern: '/dashboard/finance/expenses', label: 'Expenses' },
  { pattern: '/dashboard/finance/invoices', label: 'Invoices' },
  { pattern: '/dashboard/finance/vendors', label: 'Vendors' },
  { pattern: '/dashboard/finance/bills', label: 'Vendor Bills' },
  { pattern: '/dashboard/finance/cashbook', label: 'Cashbook' },
  { pattern: '/dashboard/finance/budgets', label: 'Budgets' },
  { pattern: '/dashboard/finance', label: 'Finance Overview' },

  // Reports
  { pattern: '/dashboard/reports', label: 'Reports' },

  // Biometrics
  { pattern: '/dashboard/biometrics/live-attendance', label: 'Live Attendance' },
  { pattern: '/dashboard/biometrics/queue-health', label: 'Queue Health' },
  { pattern: '/dashboard/biometrics/dlq', label: 'Dead Letter Queue' },
  { pattern: '/dashboard/biometrics/corrections', label: 'Corrections' },
  { pattern: '/dashboard/biometrics/historical-attendance-import', label: 'Historical Attendance Import' },
  { pattern: '/dashboard/biometrics', label: 'Biometrics' },

  // System / Settings
  { pattern: '/dashboard/system/settings/integrations', label: 'Settings · Integrations' },
  { pattern: '/dashboard/system/settings/guest-billing', label: 'Settings · Guest Billing' },
  { pattern: '/dashboard/system/settings/saas-billing', label: 'Settings · SaaS Billing' },
  { pattern: '/dashboard/system/settings/mfa', label: 'Settings · Multi-Factor Auth' },
  { pattern: '/dashboard/system/settings/sessions', label: 'Settings · Sessions' },
  { pattern: '/dashboard/system/settings/kpi', label: 'Settings · KPI Tracking' },
  { pattern: '/dashboard/system/settings', label: 'Settings' },
  { pattern: '/dashboard/settings/company-profile', label: 'Company Profile' },

  // Approvals / Automation
  { pattern: '/dashboard/approvals', label: 'Approvals' },
  { pattern: '/dashboard/automation', label: 'Automation' },

  // Dashboard (must be last — most generic)
  { pattern: '/dashboard', label: 'Dashboard' },
];

const ID_PATTERN =
  /^([0-9a-fA-F]{24}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\d+)$/;

/** Crude English singularization, sufficient for the nav labels in ROUTE_LABELS. */
function singularize(label: string): string {
  if (/ches$|shes$|xes$/i.test(label)) return label.slice(0, -2);
  if (/ies$/i.test(label)) return label.slice(0, -3) + 'y';
  if (/s$/i.test(label) && !/ss$/i.test(label)) return label.slice(0, -1);
  return label;
}

function humanize(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getParentPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'branch-admin') {
    const parent = '/' + segments.slice(0, -1).join('/');
    return parent === '/' ? '/branch-admin' : parent;
  }
  const parent = '/' + segments.slice(0, -1).join('/');
  return parent === '/' ? '/dashboard' : parent;
}

/**
 * Resolves a human-readable label for a pathname. Used for the header page
 * title and for labeling entries in the navigation history / breadcrumb trail.
 */
export function resolveLabel(pathname: string): string {
  if (pathname === '/branch-admin') return 'Branch Dashboard';
  const normalizedPathname = pathname.replace(/^\/branch-admin(?=\/)/, '/dashboard');

  const exactMatch = ROUTE_LABELS.find((r) => r.pattern === normalizedPathname);
  if (exactMatch) return exactMatch.label;

  const segments = normalizedPathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  if (lastSegment === 'new') {
    return `New ${singularize(resolveLabel(getParentPath(normalizedPathname)))}`;
  }

  if (lastSegment === 'edit') {
    return `Edit ${singularize(resolveLabel(getParentPath(getParentPath(normalizedPathname))))}`;
  }

  if (lastSegment && ID_PATTERN.test(lastSegment)) {
    return `${singularize(resolveLabel(getParentPath(normalizedPathname)))} Details`;
  }

  // Longest prefix match for known sub-sections that don't have an exact entry
  const prefixMatch = ROUTE_LABELS.find(
    (r) => r.pattern !== '/dashboard' && normalizedPathname.startsWith(r.pattern + '/')
  );

  if (lastSegment) return humanize(lastSegment);
  return prefixMatch?.label ?? 'Dashboard';
}
