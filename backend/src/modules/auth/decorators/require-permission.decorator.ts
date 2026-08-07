import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../../shared/permissions.constants';

export const PERMISSION_KEY = 'requiredPermission';
export const PERMISSION_BRANCH_PARAM_KEY = 'requiredPermissionBranchParam';

/**
 * Restricts an endpoint to actors granted `permission` (via hierarchy
 * baseline, role, or position — see AuthorizationService.can()). Use with
 * PermissionGuard.
 *
 * If `branchParam` is given, the request's `params`/`query`/`body` value at
 * that key is also checked against the actor's branch AccessScope
 * (resource-aware, hierarchy-aware check).
 *
 * Usage:
 *   @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
 *   @RequirePermission(PERMISSIONS.PAYROLL_APPROVE, 'branch_id')
 */
export const RequirePermission = (permission: Permission, branchParam?: string) =>
  (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSION_KEY, permission)(target, key, descriptor);
    if (branchParam) SetMetadata(PERMISSION_BRANCH_PARAM_KEY, branchParam)(target, key, descriptor);
    return descriptor;
  };
