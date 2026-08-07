import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PermissionsCacheService } from '../../../shared/permissions-cache.service';

@Injectable()
export class BranchAccessService {
  constructor(
    private db: DatabaseService,
    private permissionsCache: PermissionsCacheService,
  ) {}

  async findByBranch(branchId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT bua.id, bua.user_id, bua.role, bua.is_active, bua.created_at,
         u.email AS user_email,
         COALESCE(e.first_name || ' ' || e.last_name, u.email) AS user_name,
         e.employee_code,
         COALESCE(gb_e.first_name || ' ' || gb_e.last_name, gb.email) AS granted_by_name
       FROM branch_user_access bua
       JOIN users u       ON u.id  = bua.user_id
       LEFT JOIN employees e   ON e.id  = u.employee_id AND e.tenant_id = bua.tenant_id
       LEFT JOIN users gb      ON gb.id = bua.granted_by
       LEFT JOIN employees gb_e ON gb_e.id = gb.employee_id AND gb_e.tenant_id = bua.tenant_id
       WHERE bua.branch_id = $1 AND bua.tenant_id = $2 AND bua.is_active = TRUE
       ORDER BY bua.created_at ASC`,
      [branchId, tenantId],
    );
    return rows;
  }

  async grant(tenantId: string, branchId: string, grantedBy: string, data: { user_id: string; role: string }) {
    const { rows } = await this.db.query(
      `INSERT INTO branch_user_access (tenant_id, branch_id, user_id, role, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, branch_id, user_id)
       DO UPDATE SET role = $4, is_active = TRUE, revoked_at = NULL, revoked_by = NULL, updated_at = now()
       RETURNING *`,
      [tenantId, branchId, data.user_id, data.role || 'viewer', grantedBy],
    );
    await this.permissionsCache.invalidateUser(tenantId, data.user_id);
    return rows[0];
  }

  async revoke(tenantId: string, branchId: string, userId: string, revokedBy: string) {
    const { rows } = await this.db.query(
      `UPDATE branch_user_access
       SET is_active = FALSE, revoked_at = now(), revoked_by = $4, updated_at = now()
       WHERE tenant_id = $1 AND branch_id = $2 AND user_id = $3 AND is_active = TRUE
       RETURNING *`,
      [tenantId, branchId, userId, revokedBy],
    );
    if (!rows.length) throw new NotFoundException('Access record not found');
    await this.permissionsCache.invalidateUser(tenantId, userId);
    return rows[0];
  }

  async getUserBranches(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT bua.role, b.id, b.name, b.code, b.branch_type, b.status
       FROM branch_user_access bua
       JOIN branches b ON b.id = bua.branch_id
       WHERE bua.user_id = $1 AND bua.tenant_id = $2 AND bua.is_active = TRUE AND b.deleted_at IS NULL
       ORDER BY b.name`,
      [userId, tenantId],
    );
    return rows;
  }
}
