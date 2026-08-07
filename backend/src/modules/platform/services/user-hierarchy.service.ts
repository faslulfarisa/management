import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { ALL_USER_TYPES, HIERARCHY_RANK, UserType } from '../../../shared/user-hierarchy.constants';
import { AccessScope, GLOBAL_ACCESS_SCOPE } from '../../../shared/scope.util';
import { ActorContext, SetUserAccessInput, UserAccess, UserAccessService } from './user-access.service';

export { USER_TYPES, ALL_USER_TYPES, HIERARCHY_RANK } from '../../../shared/user-hierarchy.constants';
export type { StoredUserType, UserType } from '../../../shared/user-hierarchy.constants';
export type { ActorContext, SetUserAccessInput, UserAccess } from './user-access.service';

@Injectable()
export class UserHierarchyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly userAccessService: UserAccessService,
  ) {}

  getManageableTypes(actorUserType: UserType): UserType[] {
    return this.userAccessService.getManageableTypes(actorUserType);
  }

  async getUserAccess(userId: string, tenantId: string): Promise<UserAccess> {
    return this.userAccessService.getUserAccess(userId, tenantId);
  }

  async setUserAccess(
    actor: ActorContext,
    targetUserId: string,
    tenantId: string,
    input: SetUserAccessInput,
  ): Promise<UserAccess> {
    return this.userAccessService.setUserAccess(actor, targetUserId, tenantId, input);
  }

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
}
