import { DatabaseService } from '../../../shared/database.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';

export type PerformanceScopeMode = 'org' | 'branch' | 'team' | 'self';
export interface PerformanceScope {
  mode: PerformanceScopeMode;
  employeeIds?: string[];
  branchIds?: string[];
}

/**
 * Resolves how much of the Performance Module a caller may see:
 * org_admin/super_admin -> everything; branch_admin/admin -> their
 * accessible branches; everyone else -> themselves, plus their direct
 * reports (via employees.reporting_manager_id) if they have any.
 *
 * `employee` and "manager" share the same hierarchy userType — a manager is
 * just an employee with direct reports — so this single resolver covers
 * both the Employee and Manager RBAC tiers.
 */
export async function resolvePerformanceScope(
  db: DatabaseService,
  userHierarchyService: UserHierarchyService,
  user: any,
  tenantId: string,
): Promise<PerformanceScope> {
  if (user.isSuperAdmin || user.userType === 'super_admin' || user.userType === 'org_admin') {
    return { mode: 'org' };
  }
  if (user.userType === 'branch_admin' || user.userType === 'admin') {
    const accessScope = await userHierarchyService.getAccessScope(user, tenantId);
    return accessScope.isGlobalAccess ? { mode: 'org' } : { mode: 'branch', branchIds: accessScope.branchIds };
  }

  const selfEmployeeId = user.employeeId || user.employee_id;
  if (!selfEmployeeId) return { mode: 'self', employeeIds: [] };

  const { rows } = await db.query(
    `SELECT id FROM employees WHERE tenant_id = $1 AND reporting_manager_id = $2 AND deleted_at IS NULL`,
    [tenantId, selfEmployeeId],
  );
  if (rows.length) {
    return { mode: 'team', employeeIds: [selfEmployeeId, ...rows.map((r: any) => r.id)] };
  }
  return { mode: 'self', employeeIds: [selfEmployeeId] };
}
