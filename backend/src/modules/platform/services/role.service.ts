import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { translateUniqueViolation } from '../../../shared/unique-code.validator';
import { PermissionsCacheService } from '../../../shared/permissions-cache.service';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class RoleService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private permissionsCache: PermissionsCacheService,
  ) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM roles WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId],
    );
    return rows;
  }

  async findOneWithPermissions(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM roles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Role not found');
    const role = rows[0];

    const { rows: perms } = await this.db.query(
      `SELECT p.* FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
      [id],
    );
    return { ...role, permissions: perms };
  }

  async create(tenantId: string, data: any, actorUserId?: string) {
    const { rows: existing } = await this.db.query(
      'SELECT 1 FROM roles WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL',
      [tenantId, data.name],
    );
    if (existing.length) throw new BadRequestException('Role name already exists');

    try {
      const { rows } = await this.db.query(
        'INSERT INTO roles (tenant_id, name, description, is_system) VALUES ($1, $2, $3, $4) RETURNING *',
        [tenantId, data.name, data.description, false],
      );

      if (actorUserId) {
        await this.auditLog.log({
          tenantId,
          userId: actorUserId,
          entityType: 'role',
          entityId: rows[0].id,
          action: 'role_created',
          newValues: { name: rows[0].name, description: rows[0].description },
        });
      }

      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Role name');
      throw e;
    }
  }

  async update(id: string, tenantId: string, data: any, actorUserId?: string) {
    const role = await this.findOneWithPermissions(id, tenantId);
    if (role.is_system && data.name) throw new BadRequestException('Cannot rename system roles');

    const { rows } = await this.db.query(
      'UPDATE roles SET name = COALESCE($3, name), description = COALESCE($4, description), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.description],
    );

    if (actorUserId) {
      await this.auditLog.log({
        tenantId,
        userId: actorUserId,
        entityType: 'role',
        entityId: id,
        action: 'role_updated',
        oldValues: { name: role.name, description: role.description },
        newValues: { name: rows[0].name, description: rows[0].description },
      });
    }

    return rows[0];
  }

  async remove(id: string, tenantId: string, actorUserId?: string) {
    const role = await this.findOneWithPermissions(id, tenantId);
    if (role.is_system) throw new BadRequestException('Cannot delete system roles');

    await this.db.query('UPDATE roles SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

    if (actorUserId) {
      await this.auditLog.log({
        tenantId,
        userId: actorUserId,
        entityType: 'role',
        entityId: id,
        action: 'role_deleted',
        oldValues: { name: role.name },
      });
    }

    return { success: true };
  }

  async setPermissions(tenantId: string, roleId: string, permissionIds: string[], actorUserId?: string) {
    const role = await this.findOneWithPermissions(roleId, tenantId);
    const previousPermissionIds = role.permissions.map((p: any) => p.id);

    await this.db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

    if (permissionIds.length > 0) {
      for (let i = 0; i < permissionIds.length; i++) {
        await this.db.query(
          'INSERT INTO role_permissions (tenant_id, role_id, permission_id) VALUES ($1, $2, $3)',
          [tenantId, roleId, permissionIds[i]],
        );
      }
    }

    if (actorUserId) {
      await this.auditLog.log({
        tenantId,
        userId: actorUserId,
        entityType: 'role',
        entityId: roleId,
        action: 'role_permissions_updated',
        oldValues: { permissionIds: previousPermissionIds },
        newValues: { permissionIds },
      });
    }

    await this.invalidateCacheForRole(tenantId, roleId);

    return this.findOneWithPermissions(roleId, tenantId);
  }

  async getUserPermissions(userId: string, tenantId: string) {
    return this.permissionsCache.getRolePermissions(tenantId, userId, async () => {
      const { rows } = await this.db.query(
        `SELECT DISTINCT p.module, p.action FROM user_roles ur
         JOIN role_permissions rp ON ur.role_id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
        [userId, tenantId],
      );
      return rows.map(r => `${r.module}:${r.action}`);
    });
  }

  /** Every user holding this role sees a stale permission cache until invalidated. */
  private async invalidateCacheForRole(tenantId: string, roleId: string) {
    const { rows } = await this.db.query(
      'SELECT user_id FROM user_roles WHERE role_id = $1 AND tenant_id = $2',
      [roleId, tenantId],
    );
    await this.permissionsCache.invalidateRoleForUsers(tenantId, rows.map(r => r.user_id));
  }
}
