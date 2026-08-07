import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { PositionService } from './position.service';
import { ALL_USER_TYPES, HIERARCHY_RANK, UserType } from '../../../shared/user-hierarchy.constants';
import { AccessScope, GLOBAL_ACCESS_SCOPE } from '../../../shared/scope.util';

export { USER_TYPES, ALL_USER_TYPES, HIERARCHY_RANK } from '../../../shared/user-hierarchy.constants';
export type { UserType, StoredUserType } from '../../../shared/user-hierarchy.constants';

export interface UserAccess {
  userType: UserType;
  branchIds: string[];
  positionId: string | null;
}

export interface SetUserAccessInput {
  userType: UserType;
  branchIds?: string[];
  positionId?: string | null;
}

export interface ActorContext {
  sub: string;
  isSuperAdmin: boolean;
  userType: UserType;
}

@Injectable()
export class UserHierarchyService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private positionService: PositionService,
  ) {}

  /** All user types an actor is allowed to assign to others (strictly lower rank). Super admins may also grant/revoke super_admin itself. */
  getManageableTypes(actorUserType: UserType): UserType[] {
    const actorRank = HIERARCHY_RANK[actorUserType];
    const types = ALL_USER_TYPES.filter((t) => HIERARCHY_RANK[t] > actorRank);
    return actorUserType === 'super_admin' ? ['super_admin', ...types] : types;
  }

  async getUserAccess(userId: string, tenantId: string): Promise<UserAccess> {
    const { rows } = await this.db.query(
      `SELECT u.is_super_admin, ut.user_type
       FROM users u
       LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $2
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('User not found');

    const userType: UserType = rows[0].is_super_admin ? 'super_admin' : (rows[0].user_type || 'employee');

    let branchIds: string[] = [];
    if (userType === 'branch_admin' || userType === 'admin') {
      const { rows: branchRows } = await this.db.query(
        `SELECT branch_id FROM branch_user_access
         WHERE user_id = $1 AND tenant_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
        [userId, tenantId],
      );
      branchIds = branchRows.map((r) => r.branch_id);
    }

    const position = await this.positionService.getUserPosition(userId, tenantId);

    return {
      userType,
      branchIds,
      positionId: position?.position_id || null,
    };
  }

  async setUserAccess(
    actor: ActorContext,
    targetUserId: string,
    tenantId: string,
    input: SetUserAccessInput,
  ): Promise<UserAccess> {
    const targetType = input.userType;

    if (targetType === 'super_admin' && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only a super admin can grant super admin access');
    }

    if (!actor.isSuperAdmin && HIERARCHY_RANK[targetType] <= HIERARCHY_RANK[actor.userType]) {
      throw new ForbiddenException('You cannot assign a user type equal to or higher than your own');
    }

    const { rows: targetRows } = await this.db.query(
      'SELECT id, is_super_admin FROM users WHERE id = $1 AND deleted_at IS NULL',
      [targetUserId],
    );
    if (!targetRows.length) throw new NotFoundException('User not found');

    const wasSuperAdmin = targetRows[0].is_super_admin;
    if (wasSuperAdmin && !actor.isSuperAdmin) {
      throw new BadRequestException('Cannot modify access for a super admin');
    }
    if (wasSuperAdmin && targetType !== 'super_admin' && targetUserId === actor.sub) {
      throw new ForbiddenException('You cannot remove your own super admin access');
    }

    if (targetType === 'super_admin') {
      if (!wasSuperAdmin) {
        await this.db.query('UPDATE users SET is_super_admin = TRUE WHERE id = $1', [targetUserId]);
        await this.auditLog.log({
          tenantId,
          userId: actor.sub,
          entityType: 'user_access',
          entityId: targetUserId,
          action: 'user_type_assigned',
          newValues: { userType: 'super_admin' },
        });
      }
    } else {
      if (wasSuperAdmin) {
        await this.db.query('UPDATE users SET is_super_admin = FALSE WHERE id = $1', [targetUserId]);
      }

      const isOrgAdmin = targetType === 'org_admin';

      await this.db.query(
        `INSERT INTO user_tenants (user_id, tenant_id, user_type, is_org_admin)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET user_type = $3, is_org_admin = $4`,
        [targetUserId, tenantId, targetType, isOrgAdmin],
      );

      // Only a super admin can ever reach this branch with targetType === 'org_admin'
      // (getManageableTypes only offers strictly-lower-rank types to non-super-admins),
      // so this is the single write path for "assign/reassign Organization Admin".
      if (targetType === 'org_admin' && actor.isSuperAdmin) {
        await this.assignOrganizationAdmin(actor, targetUserId, tenantId);
      } else {
        // Moving away from org_admin (or never having been one) — clear the
        // org's ownership pointer if it was pointing at this user.
        await this.db.query(
          `UPDATE tenants SET organization_admin_user_id = NULL, updated_at = now()
           WHERE id = $1 AND organization_admin_user_id = $2`,
          [tenantId, targetUserId],
        );
      }

      if (targetType === 'branch_admin' || targetType === 'admin') {
        await this.syncBranchAdminScope(actor, targetUserId, tenantId, targetType, input.branchIds || []);
      } else {
        // Revoke any leftover branch_admin grants when moving away from a branch-scoped type
        await this.db.query(
          `UPDATE branch_user_access
           SET is_active = FALSE, revoked_at = now(), revoked_by = $3, updated_at = now()
           WHERE tenant_id = $1 AND user_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
          [tenantId, targetUserId, actor.sub],
        );
      }

      await this.auditLog.log({
        tenantId,
        userId: actor.sub,
        entityType: 'user_access',
        entityId: targetUserId,
        action: 'user_type_assigned',
        newValues: {
          userType: targetType,
          branchIds: input.branchIds,
          positionId: input.positionId,
          ...(wasSuperAdmin ? { revokedSuperAdmin: true } : {}),
        },
      });
    }

    if (input.positionId !== undefined) {
      if (input.positionId) {
        await this.positionService.assignUser(tenantId, input.positionId, targetUserId, actor.sub);
      } else {
        await this.positionService.unassignUser(tenantId, targetUserId);
      }
    }

    return this.getUserAccess(targetUserId, tenantId);
  }

  /**
   * Returns the actor's explicit data-access scope.
   * `isGlobalAccess: true`  -> super_admin / org_admin (sees all branches in the tenant).
   * `isGlobalAccess: false` -> branch_admin / admin, restricted to `branchIds`.
   */
  async getAccessScope(user: ActorContext, tenantId: string): Promise<AccessScope> {
    if (user.isSuperAdmin) return GLOBAL_ACCESS_SCOPE;
    if (user.userType !== 'branch_admin' && user.userType !== 'admin') return GLOBAL_ACCESS_SCOPE;

    const { rows } = await this.db.query(
      `SELECT branch_id FROM branch_user_access
       WHERE user_id = $1 AND tenant_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
      [user.sub, tenantId],
    );
    return { isGlobalAccess: false, branchIds: rows.map((r) => r.branch_id) };
  }

  /** Throws if a branch-scoped actor (branch_admin/admin) tries to access a user outside their branch(es). No-op for org_admin and above. */
  async assertUserInScope(actor: ActorContext, targetUserId: string, tenantId: string): Promise<void> {
    const scope = await this.getAccessScope(actor, tenantId);
    if (scope.isGlobalAccess) return;

    const { rows } = await this.db.query(
      `SELECT e.branch_id
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
      [targetUserId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('User not found');
    if (!rows[0].branch_id || !scope.branchIds.includes(rows[0].branch_id)) {
      await this.auditLog.log({
        tenantId,
        userId: actor.sub,
        entityType: 'authorization',
        entityId: targetUserId,
        action: 'scope_violation',
        newValues: { reason: 'user_outside_branch_scope', actorBranchIds: scope.branchIds, targetBranchId: rows[0]?.branch_id || null },
      });
      throw new ForbiddenException('User is outside your branch scope');
    }
  }

  /**
   * Designates `targetUserId` as the single Organization Admin for `tenantId`,
   * demoting whoever previously held that pointer. Only ever called when
   * `actor.isSuperAdmin` (see setUserAccess) — Organization Admin is a
   * single-org role, so there is no multi-org sync to do here.
   */
  private async assignOrganizationAdmin(actor: ActorContext, targetUserId: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT organization_admin_user_id FROM tenants WHERE id = $1',
      [tenantId],
    );
    const previousAdminId = rows[0]?.organization_admin_user_id;

    if (previousAdminId && previousAdminId !== targetUserId) {
      await this.db.query(
        `UPDATE user_tenants SET user_type = 'employee', is_org_admin = FALSE
         WHERE user_id = $1 AND tenant_id = $2`,
        [previousAdminId, tenantId],
      );
    }

    await this.db.query(
      `UPDATE tenants SET organization_admin_user_id = $1, assigned_by_super_admin = $2, updated_at = now()
       WHERE id = $3`,
      [targetUserId, actor.sub, tenantId],
    );
  }

  private async syncBranchAdminScope(actor: ActorContext, targetUserId: string, tenantId: string, targetType: 'admin' | 'branch_admin', branchIds: string[]) {
    if (targetType === 'admin' && branchIds.length !== 1) {
      throw new BadRequestException('The "admin" user type requires exactly one branch');
    }
    if (targetType === 'branch_admin' && branchIds.length < 1) {
      throw new BadRequestException('The "branch_admin" user type requires at least one branch');
    }

    await this.db.query(
      `UPDATE branch_user_access
       SET is_active = FALSE, revoked_at = now(), revoked_by = $3, updated_at = now()
       WHERE tenant_id = $1 AND user_id = $2 AND role = 'branch_admin' AND is_active = TRUE
         AND NOT (branch_id = ANY($4::uuid[]))`,
      [tenantId, targetUserId, actor.sub, branchIds],
    );

    for (const branchId of branchIds) {
      await this.db.query(
        `INSERT INTO branch_user_access (tenant_id, branch_id, user_id, role, granted_by)
         VALUES ($1, $2, $3, 'branch_admin', $4)
         ON CONFLICT (tenant_id, branch_id, user_id)
         DO UPDATE SET role = 'branch_admin', is_active = TRUE, revoked_at = NULL, revoked_by = NULL, updated_at = now()`,
        [tenantId, branchId, targetUserId, actor.sub],
      );
    }
  }
}
