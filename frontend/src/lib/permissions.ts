// Frontend mirror of backend/src/shared/permissions.constants.ts.
//
// Keep these permission strings in sync with the backend registry — they are
// the same `${module}:${action}` strings returned by GET /auth/me/permissions
// and checked by AuthorizationService.can() / @RequirePermission().
export const PERMISSIONS = {
  EMPLOYEES_VIEW: 'hr.employees:view',
  EMPLOYEES_CREATE: 'hr.employees:create',
  EMPLOYEES_EDIT: 'hr.employees:edit',
  EMPLOYEES_DELETE: 'hr.employees:delete',
  EMPLOYEES_EXPORT: 'hr.employees:export',

  ATTENDANCE_VIEW: 'hr.attendance:view',
  ATTENDANCE_CREATE: 'hr.attendance:create',
  ATTENDANCE_EDIT: 'hr.attendance:edit',
  ATTENDANCE_APPROVE: 'hr.attendance:approve',
  ATTENDANCE_EXPORT: 'hr.attendance:export',
  HISTORICAL_ATTENDANCE_IMPORT_MANAGE: 'historical_attendance_import:manage',

  LEAVE_VIEW: 'hr.leave:view',
  LEAVE_CREATE: 'hr.leave:create',
  LEAVE_EDIT: 'hr.leave:edit',
  LEAVE_APPROVE: 'hr.leave:approve',
  LEAVE_EXPORT: 'hr.leave:export',

  PAYROLL_VIEW: 'hr.payroll:view',
  PAYROLL_CREATE: 'hr.payroll:create',
  PAYROLL_EDIT: 'hr.payroll:edit',
  PAYROLL_APPROVE: 'hr.payroll:approve',
  PAYROLL_EXPORT: 'hr.payroll:export',
  PAYROLL_LOCK: 'hr.payroll:lock',
  PAYROLL_UNLOCK: 'hr.payroll:unlock',

  PAYROLL_VIEW_PAYMENTS: 'payroll:view_payments',
  PAYROLL_PROCESS_PAYMENT: 'payroll:process_payment',
  PAYROLL_RETRY_PAYMENT: 'payroll:retry_payment',
  PAYROLL_REVERSE_PAYMENT: 'payroll:reverse_payment',
  PAYROLL_MANAGE_BANK_DETAILS: 'payroll:manage_bank_details',
  PAYROLL_VIEW_BANK_DETAILS: 'payroll:view_bank_details',

  COMPLIANCE_VIEW: 'hr.compliance:view',
  COMPLIANCE_CREATE: 'hr.compliance:create',
  COMPLIANCE_EXPORT: 'hr.compliance:export',

  PERFORMANCE_VIEW: 'hr.performance:view',
  PERFORMANCE_EDIT: 'hr.performance:edit',
  PERFORMANCE_APPROVE: 'hr.performance:approve',
  PERFORMANCE_EXPORT: 'hr.performance:export',
  PERFORMANCE_BEHAVIOUR_VIEW: 'hr.performance.behaviour:view',
  PERFORMANCE_BEHAVIOUR_CONFIGURE: 'hr.performance.behaviour:configure',
  PERFORMANCE_BEHAVIOUR_RECALCULATE: 'hr.performance.behaviour:recalculate',
  PERFORMANCE_BEHAVIOUR_OVERRIDE: 'hr.performance.behaviour:override',

  RECRUITMENT_VIEW: 'hr.recruitment:view',
  RECRUITMENT_CREATE: 'hr.recruitment:create',
  RECRUITMENT_EDIT: 'hr.recruitment:edit',
  RECRUITMENT_APPROVE: 'hr.recruitment:approve',
  RECRUITMENT_CLOSE: 'hr.recruitment:close',
  RECRUITMENT_REOPEN: 'hr.recruitment:reopen',
  RECRUITMENT_ARCHIVE: 'hr.recruitment:archive',
  RECRUITMENT_COMMENT: 'hr.recruitment:comment',

  FINANCE_INVOICES_VIEW: 'finance.invoices:view',
  FINANCE_INVOICES_CREATE: 'finance.invoices:create',
  FINANCE_INVOICES_EDIT: 'finance.invoices:edit',
  FINANCE_INVOICES_APPROVE: 'finance.invoices:approve',
  FINANCE_INVOICES_EXPORT: 'finance.invoices:export',

  FINANCE_BILLS_VIEW: 'finance.bills:view',
  FINANCE_BILLS_CREATE: 'finance.bills:create',
  FINANCE_BILLS_APPROVE: 'finance.bills:approve',

  FINANCE_CASHBOOK_VIEW: 'finance.cashbook:view',
  FINANCE_CASHBOOK_CREATE: 'finance.cashbook:create',

  FINANCE_BUDGETS_VIEW: 'finance.budgets:view',
  FINANCE_BUDGETS_CREATE: 'finance.budgets:create',
  FINANCE_BUDGETS_APPROVE: 'finance.budgets:approve',

  FINANCE_VENDORS_MANAGE: 'finance.vendors:manage',

  GST_RETURNS_VIEW: 'gst.returns:view',
  GST_RETURNS_CREATE: 'gst.returns:create',
  GST_RETURNS_EXPORT: 'gst.returns:export',

  PLATFORM_ROLES_VIEW: 'platform.roles:view',
  PLATFORM_ROLES_CREATE: 'platform.roles:create',
  PLATFORM_ROLES_EDIT: 'platform.roles:edit',
  PLATFORM_ROLES_DELETE: 'platform.roles:delete',

  PLATFORM_USERS_VIEW: 'platform.users:view',
  PLATFORM_USERS_CREATE: 'platform.users:create',
  PLATFORM_USERS_EDIT: 'platform.users:edit',
  PLATFORM_USERS_DELETE: 'platform.users:delete',

  PLATFORM_TEMPLATES_VIEW: 'platform.templates:view',
  PLATFORM_TEMPLATES_CREATE: 'platform.templates:create',
  PLATFORM_TEMPLATES_EDIT: 'platform.templates:edit',
  PLATFORM_TEMPLATES_DELETE: 'platform.templates:delete',
  PLATFORM_TEMPLATES_ASSIGN: 'platform.templates:assign',

  PLATFORM_ORGANIZATIONS_VIEW: 'platform.organizations:view',
  PLATFORM_ORGANIZATIONS_CREATE: 'platform.organizations:create',
  PLATFORM_ORGANIZATIONS_EDIT: 'platform.organizations:edit',
  PLATFORM_ORGANIZATIONS_DELETE: 'platform.organizations:delete',

  ORGANIZATION_PROFILE_VIEW: 'organization_profile:view',
  ORGANIZATION_PROFILE_EDIT: 'organization_profile:edit',

  BRANCH_VIEW: 'branch:view',
  BRANCH_MANAGE: 'branch:manage',

  SCHEDULES_VIEW: 'schedules:view',
  SCHEDULES_CREATE: 'schedules:create',
  SCHEDULES_EDIT: 'schedules:edit',
  SCHEDULES_DELETE: 'schedules:delete',
  SCHEDULES_ASSIGN: 'schedules:assign',

  APPROVALS_VIEW: 'approvals:view',
  APPROVALS_APPROVE: 'approvals:approve',
  APPROVALS_REJECT: 'approvals:reject',
  APPROVALS_MANAGE: 'approvals:manage',

  DOCUMENTS_VIEW: 'documents:view',
  DOCUMENTS_UPLOAD: 'documents:upload',
  DOCUMENTS_DELETE: 'documents:delete',

  NOTIFICATIONS_VIEW: 'notifications:view',
  NOTIFICATIONS_SEND: 'notifications:send',
  NOTIFICATIONS_MANAGE: 'notifications:manage',

  REPORTS_VIEW: 'reports:view',
  REPORTS_PAYROLL: 'reports:payroll',
  REPORTS_ATTENDANCE: 'reports:attendance',
  REPORTS_EXPORT: 'reports:export',

  AUDIT_LOGS_VIEW: 'audit_logs:view',
  AUDIT_LOGS_EXPORT: 'audit_logs:export',

  EXIT_VIEW: 'hr.exit:view',
  EXIT_CREATE: 'hr.exit:create',
  EXIT_EDIT: 'hr.exit:edit',
  EXIT_APPROVE: 'hr.exit:approve',
  EXIT_DELETE: 'hr.exit:delete',
  EXIT_CHECKLIST_MANAGE: 'hr.exit.checklist:manage',
  EXIT_CLEARANCE_MANAGE: 'hr.exit.clearance:manage',
  EXIT_SETTLEMENT_VIEW: 'hr.exit.settlement:view',
  EXIT_SETTLEMENT_CALCULATE: 'hr.exit.settlement:calculate',
  EXIT_SETTLEMENT_APPROVE: 'hr.exit.settlement:approve',
  EXIT_SETTLEMENT_PAY: 'hr.exit.settlement:pay',
  EXIT_TEMPLATES_MANAGE: 'hr.exit.templates:manage',

  ASSETS_VIEW: 'assets:view',
  ASSETS_MANAGE: 'assets:manage',
  ASSETS_RECOVER: 'assets:recover',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
