import { Injectable } from '@nestjs/common';
import { PositionService } from './position.service';
import { UserHierarchyService } from './user-hierarchy.service';
import { UserType } from '../../../shared/user-hierarchy.constants';
import { AccessScope, GLOBAL_ACCESS_SCOPE, isBranchInScope } from '../../../shared/scope.util';
import { DEFAULT_PERMISSIONS_BY_USER_TYPE, PERMISSIONS, Permission } from '../../../shared/permissions.constants';

export interface AuthUser {
  sub: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
  userType: UserType;
}

export interface AuthorizationResource {
  branchId?: string | null;
}

/**
 * Centralized authorization engine.
 *
 * `can(user, permission, resource?)` resolves the final access decision from:
 *  1. User type baseline - only platform super admins and organization admins
 *     receive wildcard module access.
 *  2. Position permissions for branch admins, admins, and employees.
 *  3. Branch scope - if `resource.branchId` is supplied, the actor must have
 *     that branch in scope.
 *
 * Roles define administrative identity and organizational/branch scope. They
 * are not used as the operational permission source for branch admins, admins,
 * or employees.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private positionService: PositionService,
    private hierarchyService: UserHierarchyService,
  ) {}

  async can(user: AuthUser, permission: Permission, resource?: AuthorizationResource): Promise<boolean> {
    const granted = await this.hasPermission(user, permission);
    if (!granted) return false;

    return this.checkScope(user, resource);
  }

  private async hasPermission(user: AuthUser, permission: Permission): Promise<boolean> {
    const base = DEFAULT_PERMISSIONS_BY_USER_TYPE[user.userType] ?? [];
    if (base === '*') return true;
    if (base.includes(permission)) return true;

    if (!user.tenantId) return false;

    const positionPerms = await this.positionService.getUserPermissions(user.sub, user.tenantId);
    return positionPerms.includes(permission);
  }

  private async checkScope(user: AuthUser, resource?: AuthorizationResource): Promise<boolean> {
    if (!resource?.branchId) return true;
    if (!user.tenantId) return false;

    const scope = await this.hierarchyService.getAccessScope(user, user.tenantId);
    return isBranchInScope(scope, resource.branchId);
  }

  /**
   * Resolves the full set of permission strings and the branch AccessScope
   * for `user` in their active tenant — the same inputs `can()` checks
   * against, but returned in bulk for the frontend (`GET /auth/me/permissions`).
   *
   * `'*'` (platform super admin / organization admin baseline) expands to
   * every registered permission string so the frontend never needs to
   * special-case wildcard access.
   */
  async getEffectivePermissions(user: AuthUser): Promise<{ permissions: Permission[]; accessScope: AccessScope }> {
    const base = DEFAULT_PERMISSIONS_BY_USER_TYPE[user.userType] ?? [];

    let permissions: Permission[];
    if (base === '*') {
      permissions = Object.values(PERMISSIONS);
    } else if (!user.tenantId) {
      permissions = base;
    } else {
      const positionPerms = await this.positionService.getUserPermissions(user.sub, user.tenantId);
      permissions = Array.from(new Set([...base, ...positionPerms])) as Permission[];
    }

    const accessScope = user.tenantId
      ? await this.hierarchyService.getAccessScope(user, user.tenantId)
      : GLOBAL_ACCESS_SCOPE;

    return { permissions, accessScope };
  }
}
