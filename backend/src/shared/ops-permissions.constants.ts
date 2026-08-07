// Permission registry for the Internal Operations Portal. Mirrors the shape
// of permissions.constants.ts (PERMISSIONS / DEFAULT_PERMISSIONS_BY_USER_TYPE)
// but is a deliberately separate track: AuthorizationService.can() requires a
// tenantId for non-wildcard lookups, which internal staff never have.
import { InternalRole } from './internal-roles.constants';

export const OPS_PERMISSIONS = {
  DASHBOARD_VIEW: 'ops.dashboard:view',

  ORGANIZATIONS_VIEW: 'ops.organizations:view',
  ORGANIZATIONS_CREATE: 'ops.organizations:create',
  ORGANIZATIONS_EDIT: 'ops.organizations:edit',
  ORGANIZATIONS_DELETE: 'ops.organizations:delete',
  ORGANIZATIONS_MANAGE_LIFECYCLE: 'ops.organizations:manage_lifecycle',
  ORGANIZATIONS_TECHNICAL_MANAGE: 'ops.organizations:technical_manage',

  // Platform staff provisioning (Marketing/Sales/Technical/Finance/Customer
  // Success/Customer Support/Platform Super Admin accounts themselves) —
  // deliberately not granted to any role by default below, see comment on
  // DEFAULT_OPS_PERMISSIONS_BY_ROLE.platform_super_admin.
  STAFF_MANAGE: 'ops.staff:manage',

  // Platform-wide subscription plan definitions (pricing/features/limits) —
  // a global resource, never tenant-scoped. Moved here in Phase 4 of the
  // Platform/Customer separation: this used to be reachable by ANY
  // authenticated user via billing.controller.ts (a real authorization gap).
  BILLING_MANAGE_PLANS: 'ops.billing:manage_plans',

  // Signup incentive campaigns (free trials / discount codes shown on the
  // public registration wizard) — a growth/marketing lever over new
  // organization signups, not a customer HR concern. Relocated from the
  // customer admin dashboard (was super_admin-only via HierarchyGuard).
  MARKETING_MANAGE_OFFERS: 'ops.marketing:manage_offers',

  // Historical Attendance Import platform controls. Platform users can only
  // enable/disable the capability for an organization and monitor sanitized job
  // metadata; customer punch payloads remain tenant-side only.
  HISTORICAL_ATTENDANCE_IMPORT_MONITOR: 'ops.historical_attendance_import:monitor',
  HISTORICAL_ATTENDANCE_IMPORT_CONFIGURE: 'ops.historical_attendance_import:configure',
} as const;

export type OpsPermission = (typeof OPS_PERMISSIONS)[keyof typeof OPS_PERMISSIONS];

const ALL_OPS_PERMISSIONS = Object.values(OPS_PERMISSIONS);

/**
 * Per the spec's permission model: Marketing = read-only on organizations,
 * Sales = full CRUD + lifecycle management, Technical = view + technical
 * management (module/subscription/integration config — no profile edit, no
 * delete). Executive and Manager get identical grants for now — the spec's
 * permission table differentiates by team, not by tier within a team.
 *
 * Finance/Customer Success/Customer Support were added in Phase 2 (RBAC
 * separation) without dedicated finance/CS/support-specific ops permissions
 * yet (those land with the billing/ticketing module work in Phase 4) — for
 * now each is mapped onto the closest existing grant: Finance gets read-only
 * (parallel to Marketing, until real billing permissions exist), Customer
 * Success gets lifecycle management (it owns "Customer Lifecycle" per the
 * platform spec, parallel to Sales), Customer Support gets technical_manage
 * (Support Tickets already lives under that permission, parallel to
 * Technical). `platform_super_admin` is granted every permission here for
 * defense-in-depth, even though OpsPermissionGuard bypasses it outright.
 */
export const DEFAULT_OPS_PERMISSIONS_BY_ROLE: Record<InternalRole, OpsPermission[]> = {
  marketing_executive: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS],
  marketing_manager: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS],

  sales_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_CREATE,
    OPS_PERMISSIONS.ORGANIZATIONS_EDIT,
    OPS_PERMISSIONS.ORGANIZATIONS_DELETE,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
  ],
  sales_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_CREATE,
    OPS_PERMISSIONS.ORGANIZATIONS_EDIT,
    OPS_PERMISSIONS.ORGANIZATIONS_DELETE,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
  ],

  technical_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
  ],
  technical_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
  ],

  finance_executive: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.BILLING_MANAGE_PLANS],
  finance_manager: [OPS_PERMISSIONS.DASHBOARD_VIEW, OPS_PERMISSIONS.ORGANIZATIONS_VIEW, OPS_PERMISSIONS.BILLING_MANAGE_PLANS],

  customer_success_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
  ],
  customer_success_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE,
  ],

  customer_support_executive: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
  ],
  customer_support_manager: [
    OPS_PERMISSIONS.DASHBOARD_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_VIEW,
    OPS_PERMISSIONS.ORGANIZATIONS_TECHNICAL_MANAGE,
  ],

  platform_super_admin: ALL_OPS_PERMISSIONS,
};
