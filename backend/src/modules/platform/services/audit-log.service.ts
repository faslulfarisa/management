import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';

@Injectable()
export class AuditLogService {
  constructor(private db: DatabaseService) {}

  /**
   * Lists audit log entries for `tenantId`. When `accessScope` is branch-scoped
   * (branch_admin/admin), entries are restricted to actions performed by users
   * whose linked employee belongs to one of the caller's accessible branches —
   * branch/org-safe audit filtering, no cross-branch visibility.
   */
  async findAll(tenantId: string, filters: any, accessScope?: AccessScope) {
    const { userId, entityType, action, startDate, endDate, page = 1, limit = 20 } = filters;
    const scoped = accessScope && !accessScope.isGlobalAccess;
    const joins = scoped ? ' LEFT JOIN users u ON u.id = al.user_id LEFT JOIN employees e ON e.id = u.employee_id' : '';

    let where = ' WHERE al.tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (userId) { where += ` AND al.user_id = $${paramIdx++}`; params.push(userId); }
    if (entityType) { where += ` AND al.entity_type = $${paramIdx++}`; params.push(entityType); }
    if (action) { where += ` AND al.action = $${paramIdx++}`; params.push(action); }
    if (startDate) { where += ` AND al.created_at >= $${paramIdx++}`; params.push(new Date(startDate)); }
    if (endDate) { where += ` AND al.created_at <= $${paramIdx++}`; params.push(new Date(endDate)); }

    if (scoped) {
      const scope = branchScopeClause(accessScope!, 'e.branch_id', paramIdx);
      where += ` AND ${scope.clause}`;
      params.push(...scope.params);
      paramIdx += scope.params.length;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const dataQuery = `SELECT al.* FROM audit_logs al${joins}${where} ORDER BY al.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const countQuery = `SELECT COUNT(*) FROM audit_logs al${joins}${where}`;
    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(dataQuery, [...params, parseInt(limit), offset]),
      this.db.query(countQuery, params),
    ]);
    const total = parseInt(countRows[0].count);

    return { data: rows, meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) } };
  }

  /**
   * Cross-tenant audit feed for a given entity type, newest first. Used by
   * the Internal Operations Portal's Activity Logs report — internal staff
   * have no tenant of their own, so `findAll`'s tenant-scoped query doesn't
   * apply here.
   */
  async findAllByEntityType(entityType: string, filters: any) {
    const { action, startDate, endDate, page = 1, limit = 20 } = filters;
    let where = ' WHERE al.entity_type = $1';
    const params: any[] = [entityType];
    let paramIdx = 2;

    if (action) { where += ` AND al.action = $${paramIdx++}`; params.push(action); }
    if (startDate) { where += ` AND al.created_at >= $${paramIdx++}`; params.push(new Date(startDate)); }
    if (endDate) { where += ` AND al.created_at <= $${paramIdx++}`; params.push(new Date(endDate)); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const dataQuery = `
      SELECT al.*, t.name AS organization_name
      FROM audit_logs al LEFT JOIN tenants t ON t.id = al.tenant_id
      ${where} ORDER BY al.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const countQuery = `SELECT COUNT(*) FROM audit_logs al${where}`;
    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(dataQuery, [...params, parseInt(limit), offset]),
      this.db.query(countQuery, params),
    ]);
    const total = parseInt(countRows[0].count);

    return { data: rows, meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) } };
  }

  async log(data: { tenantId: string; userId: string | null; entityType: string; entityId: string; action: string; oldValues?: any; newValues?: any; ipAddress?: string; userAgent?: string }) {
    const { rows } = await this.db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [data.tenantId, data.userId, data.entityType, data.entityId, data.action, data.oldValues ? JSON.stringify(data.oldValues) : null, data.newValues ? JSON.stringify(data.newValues) : null, data.ipAddress, data.userAgent],
    );
    return rows[0];
  }
}
