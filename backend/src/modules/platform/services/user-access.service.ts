import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PermissionsCacheService } from '../../../shared/permissions-cache.service';
import { ALL_USER_TYPES, HIERARCHY_RANK, UserType, normalizeStoredUserType } from '../../../shared/user-hierarchy.constants';
import { AuditLogService } from './audit-log.service';

export interface RoleAssignmentInput {
  roleId: string;
  scopeType?: string;
  scopeId?: string;
}

export interface UserAccess {
  userType: UserType;
  branchIds: string[];
  positionId: string | null;
}

export interface SetUserAccessInput {
  userType: UserType;
  branchIds?: string[];
  positionId?: string | null;
  reportingManagerId?: string | null;
  roles?: RoleAssignmentInput[];
}

export interface ActorContext {
  sub: string;
  isSuperAdmin: boolean;
  userType: UserType;
}

@Injectable()
export class UserAccessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

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

    const userType: UserType = rows[0].is_super_admin && rows[0].user_type == null
      ? 'super_admin'
      : normalizeStoredUserType(rows[0].user_type);

    let branchIds: string[] = [];
    if (userType === 'branch_admin' || userType === 'admin') {
      const { rows: branchRows } = await this.db.query(
        `SELECT branch_id FROM branch_user_access
         WHERE user_id = $1 AND tenant_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
        [userId, tenantId],
      );
      branchIds = branchRows.map((r) => r.branch_id);
    }

    const position = await this.getUserPosition(userId, tenantId);
    return { userType, branchIds, positionId: position?.position_id || null };
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

    let permissionStateChanged = false;

    if (targetType === 'super_admin') {
      if (!wasSuperAdmin) {
        await this.db.query('UPDATE users SET is_super_admin = TRUE WHERE id = $1', [targetUserId]);
        permissionStateChanged = true;
      }
    } else {
      if (wasSuperAdmin) {
        await this.db.query('UPDATE users SET is_super_admin = FALSE WHERE id = $1', [targetUserId]);
        permissionStateChanged = true;
      }

      await this.db.query(
        `INSERT INTO user_tenants (user_id, tenant_id, user_type, is_org_admin)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET user_type = $3, is_org_admin = $4`,
        [targetUserId, tenantId, targetType, targetType === 'org_admin'],
      );

      if (targetType === 'org_admin' && actor.isSuperAdmin) {
        await this.assignOrganizationAdmin(actor, targetUserId, tenantId);
      } else {
        await this.db.query(
          `UPDATE tenants SET organization_admin_user_id = NULL, updated_at = now()
           WHERE id = $1 AND organization_admin_user_id = $2`,
          [tenantId, targetUserId],
        );
      }

      if (targetType === 'branch_admin' || targetType === 'admin') {
        await this.syncBranchAdminScope(actor, targetUserId, tenantId, targetType, input.branchIds || []);
      } else {
        await this.db.query(
          `UPDATE branch_user_access
           SET is_active = FALSE, revoked_at = now(), revoked_by = $3, updated_at = now()
           WHERE tenant_id = $1 AND user_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
          [tenantId, targetUserId, actor.sub],
        );
      }
      permissionStateChanged = true;
    }

    if (input.positionId !== undefined) {
      if (input.positionId) {
        await this.assignPosition(tenantId, input.positionId, targetUserId, actor.sub, false);
      } else {
        await this.clearPosition(tenantId, targetUserId, false);
      }
      permissionStateChanged = true;
    }

    if (input.roles !== undefined) {
      await this.assignRoles(tenantId, targetUserId, input.roles, false);
      permissionStateChanged = true;
    }

    if (input.reportingManagerId !== undefined) {
      await this.assignReportingManager(tenantId, targetUserId, input.reportingManagerId);
      permissionStateChanged = true;
    }

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user_access',
      entityId: targetUserId,
      action: 'user_access_assigned',
      newValues: {
        userType: targetType,
        branchIds: input.branchIds,
        positionId: input.positionId,
        reportingManagerId: input.reportingManagerId,
        roles: input.roles,
        ...(wasSuperAdmin && targetType !== 'super_admin' ? { revokedSuperAdmin: true } : {}),
      },
    });

    if (permissionStateChanged) {
      await this.refreshPermissions(tenantId, targetUserId);
    }

    return this.getUserAccess(targetUserId, tenantId);
  }

  async assignPosition(
    tenantId: string,
    positionId: string,
    userId: string,
    assignedBy: string,
    refreshPermissions = true,
  ) {
    await this.assertActivePosition(tenantId, positionId);
    await this.db.query(
      `INSERT INTO user_positions (tenant_id, user_id, position_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET position_id = EXCLUDED.position_id,
             assigned_by = EXCLUDED.assigned_by,
             assigned_at = now()`,
      [tenantId, userId, positionId, assignedBy],
    );

    if (refreshPermissions) {
      await this.refreshPermissions(tenantId, userId);
    }

    return this.getUserPosition(userId, tenantId);
  }

  async clearPosition(tenantId: string, userId: string, refreshPermissions = true) {
    await this.db.query(
      'DELETE FROM user_positions WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId],
    );

    if (refreshPermissions) {
      await this.refreshPermissions(tenantId, userId);
    }

    return { success: true };
  }

  async assignRoles(
    tenantId: string,
    userId: string,
    roles: RoleAssignmentInput[],
    refreshPermissions = true,
  ) {
    await this.db.query('DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);

    for (const role of roles) {
      await this.db.query(
        'INSERT INTO user_roles (tenant_id, user_id, role_id, scope_type, scope_id) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, userId, role.roleId, role.scopeType || null, role.scopeId || null],
      );
    }

    if (refreshPermissions) {
      await this.refreshPermissions(tenantId, userId);
    }
  }

  async assignReportingManager(tenantId: string, userId: string, reportingManagerId?: string | null) {
    const { rows } = await this.db.query(
      `SELECT u.employee_id
       FROM users u
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
      [userId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('User not found');
    const employeeId = rows[0].employee_id;
    if (!employeeId) return;

    const managerEmployeeId = reportingManagerId
      ? await this.resolveManagerEmployeeId(tenantId, reportingManagerId)
      : null;

    if (managerEmployeeId && managerEmployeeId === employeeId) {
      throw new BadRequestException('A user cannot report to themselves');
    }

    await this.db.query(
      `UPDATE employees
       SET reporting_manager_id = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [employeeId, tenantId, managerEmployeeId],
    );
  }

  async getUserPosition(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT up.*, p.name AS position_name, p.code AS position_code,
              u.email AS assigned_by_email
       FROM user_positions up
       JOIN positions p ON up.position_id = p.id
       LEFT JOIN users u ON up.assigned_by = u.id
       WHERE up.user_id = $1 AND up.tenant_id = $2`,
      [userId, tenantId],
    );
    return rows[0] || null;
  }

  private async assertActivePosition(tenantId: string, positionId: string) {
    const { rows } = await this.db.query(
      'SELECT 1 FROM positions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [positionId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Position not found');
  }

  private async refreshPermissions(tenantId: string, userId: string) {
    await this.permissionsCache.invalidateUser(tenantId, userId);
  }

  private async resolveManagerEmployeeId(tenantId: string, managerId: string): Promise<string> {
    const { rows: employeeRows } = await this.db.query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [managerId, tenantId],
    );
    if (employeeRows.length) return employeeRows[0].id;

    const { rows: userRows } = await this.db.query(
      `SELECT employee_id
       FROM users
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND employee_id IS NOT NULL`,
      [managerId, tenantId],
    );
    if (userRows.length) return userRows[0].employee_id;

    throw new NotFoundException('Reporting manager not found');
  }

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
      await this.refreshPermissions(tenantId, previousAdminId);
    }

    await this.db.query(
      `UPDATE tenants SET organization_admin_user_id = $1, assigned_by_super_admin = $2, updated_at = now()
       WHERE id = $3`,
      [targetUserId, actor.sub, tenantId],
    );
  }

  private async syncBranchAdminScope(
    actor: ActorContext,
    targetUserId: string,
    tenantId: string,
    targetType: 'admin' | 'branch_admin',
    branchIds: string[],
  ) {
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
