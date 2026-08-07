// Frontend mirror of backend/src/shared/internal-roles.constants.ts and
// ops-permissions.constants.ts. Internal staff (Marketing/Sales/Technical/
// Finance/Customer Success/Customer Support/Platform Admin) are a
// separate population from the customer-side hierarchy in hierarchy.ts —
// they have no tenant, no branch scope, and their own permission registry.
export const INTERNAL_ROLES = [
  'marketing_executive',
  'marketing_manager',
  'sales_executive',
  'sales_manager',
  'technical_executive',
  'technical_manager',
  'finance_executive',
  'finance_manager',
  'customer_success_executive',
  'customer_success_manager',
  'customer_support_executive',
  'customer_support_manager',
  'platform_super_admin',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];
export type InternalTeam = 'marketing' | 'sales' | 'technical' | 'finance' | 'customer_success' | 'customer_support' | 'platform';

export const TEAM_BY_INTERNAL_ROLE: Record<InternalRole, InternalTeam> = {
  marketing_executive: 'marketing',
  marketing_manager: 'marketing',
  sales_executive: 'sales',
  sales_manager: 'sales',
  technical_executive: 'technical',
  technical_manager: 'technical',
  finance_executive: 'finance',
  finance_manager: 'finance',
  customer_success_executive: 'customer_success',
  customer_success_manager: 'customer_success',
  customer_support_executive: 'customer_support',
  customer_support_manager: 'customer_support',
  platform_super_admin: 'platform',
};

export const INTERNAL_ROLE_LABELS: Record<InternalRole, string> = {
  marketing_executive: 'Marketing Executive',
  marketing_manager: 'Marketing Manager',
  sales_executive: 'Sales Executive',
  sales_manager: 'Sales Manager',
  technical_executive: 'Technical Executive',
  technical_manager: 'Technical Manager',
  finance_executive: 'Finance Executive',
  finance_manager: 'Finance Manager',
  customer_success_executive: 'Customer Success Executive',
  customer_success_manager: 'Customer Success Manager',
  customer_support_executive: 'Customer Support Executive',
  customer_support_manager: 'Customer Support Manager',
  platform_super_admin: 'Platform Admin',
};

export const OPS_PERMISSIONS = {
  DASHBOARD_VIEW: 'ops.dashboard:view',
  ORGANIZATIONS_VIEW: 'ops.organizations:view',
  ORGANIZATIONS_CREATE: 'ops.organizations:create',
  ORGANIZATIONS_EDIT: 'ops.organizations:edit',
  ORGANIZATIONS_DELETE: 'ops.organizations:delete',
  ORGANIZATIONS_MANAGE_LIFECYCLE: 'ops.organizations:manage_lifecycle',
  ORGANIZATIONS_TECHNICAL_MANAGE: 'ops.organizations:technical_manage',
  STAFF_MANAGE: 'ops.staff:manage',
  BILLING_MANAGE_PLANS: 'ops.billing:manage_plans',
  BILLING_VIEW_SUBSCRIPTIONS: 'ops.billing:view_subscriptions',
  BILLING_MANAGE_SUBSCRIPTIONS: 'ops.billing:manage_subscriptions',
  ORGANIZATION_FEATURES_VIEW: 'ops.organization_features:view',
  ORGANIZATION_FEATURES_MANAGE: 'ops.organization_features:manage',
  MARKETING_MANAGE_OFFERS: 'ops.marketing:manage_offers',
  HISTORICAL_ATTENDANCE_IMPORT_MONITOR: 'ops.historical_attendance_import:monitor',
  HISTORICAL_ATTENDANCE_IMPORT_CONFIGURE: 'ops.historical_attendance_import:configure',
} as const;

export type OpsPermission = (typeof OPS_PERMISSIONS)[keyof typeof OPS_PERMISSIONS];

const ALL_OPS_PERMISSIONS = Object.values(OPS_PERMISSIONS);

export const DEFAULT_OPS_PERMISSIONS_BY_ROLE: Record<InternalRole, OpsPermission[]> = {
  marketing_executive: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS, OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS],
  marketing_manager: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS, OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS],

  sales_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_CREATE,
    OPS_PERMISSIONS.ORGANIZATIONS_EDIT,
    OPS_PERMISSIONS.ORGANIZATIONS_DELETE,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
  ],
  sales_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_CREATE,
    OPS_PERMISSIONS.ORGANIZATIONS_EDIT,
    OPS_PERMISSIONS.ORGANIZATIONS_DELETE,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
  ],

  technical_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE,
  ],
  technical_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE,
  ],

  finance_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS,
    OPS_PERMISSIONS.BILLING_MANAGE_PLANS,
  ],
  finance_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS,
    OPS_PERMISSIONS.BILLING_MANAGE_PLANS,
  ],

  customer_success_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
  ],
  customer_success_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
  ],

  customer_support_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
  ],
  customer_support_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
    OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS,
    OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW,
  ],

  platform_super_admin: ALL_OPS_PERMISSIONS,
};

/**
 * Client-side gating only. The backend OpsPermissionGuard is authoritative;
 * customer hierarchy roles never grant operations access.
 */
export function canOps(internalRole: string | null | undefined, permission: OpsPermission): boolean {
  if (internalRole === 'platform_super_admin') return true;
  const granted = DEFAULT_OPS_PERMISSIONS_BY_ROLE[internalRole as InternalRole];
  return granted ? granted.includes(permission) : false;
}
