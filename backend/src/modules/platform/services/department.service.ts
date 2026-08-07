import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { assertUniqueCode, translateUniqueViolation } from '../../../shared/unique-code.validator';
import { AccessScope, GLOBAL_ACCESS_SCOPE } from '../../../shared/scope.util';
import { AuditLogService } from './audit-log.service';

const SCOPE_TYPES = ['ORGANIZATION', 'SELECTED_BRANCHES', 'SINGLE_BRANCH'] as const;
type ScopeType = typeof SCOPE_TYPES[number];

export interface DepartmentActor {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

const DEPARTMENT_SELECT = `
  SELECT
    d.*,
    p.name AS property_name,
    parent.name AS parent_name,
    b.name AS branch_name,
    CONCAT(he.first_name, ' ', he.last_name) AS head_employee_name,
    COALESCE(array_remove(array_agg(DISTINCT db.branch_id), NULL), '{}') AS branch_ids,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'active'   AND e.deleted_at IS NULL) AS employee_count,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'resigned' AND e.deleted_at IS NULL) AS resigned_count
  FROM departments d
  LEFT JOIN properties p ON d.property_id = p.id
  LEFT JOIN departments parent ON d.parent_id = parent.id
  LEFT JOIN branches b ON d.branch_id = b.id
  LEFT JOIN employees he ON he.id = d.head_employee_id
  LEFT JOIN department_branches db ON db.department_id = d.id
  LEFT JOIN employees e ON e.department_id = d.id AND e.tenant_id = $1
`;
const DEPARTMENT_GROUP_BY = 'GROUP BY d.id, p.name, parent.name, b.name, he.first_name, he.last_name';

@Injectable()
export class DepartmentService {
  constructor(private db: DatabaseService, private auditLog: AuditLogService) {}

  async findAll(
    tenantId: string,
    filters: { branch_id?: string; scope_type?: string; head_employee_id?: string } = {},
    accessScope: AccessScope = GLOBAL_ACCESS_SCOPE,
  ) {
    const { branch_id, scope_type, head_employee_id } = filters;
    const params: any[] = [tenantId];
    const conditions: string[] = [];

    // Explicit branch_id filter wins; otherwise branch-scoped actors (branch_admin/admin)
    // are restricted to departments visible to one of their accessible branches.
    const visibilityBranchIds = branch_id ? [branch_id] : (!accessScope.isGlobalAccess ? accessScope.branchIds : null);
    if (visibilityBranchIds) {
      params.push(visibilityBranchIds);
      const idx = params.length;
      conditions.push(`(
        d.scope_type = 'ORGANIZATION'
        OR (d.scope_type = 'SINGLE_BRANCH' AND d.branch_id = ANY($${idx}::uuid[]))
        OR (d.scope_type = 'SELECTED_BRANCHES' AND EXISTS (
              SELECT 1 FROM department_branches db2
              WHERE db2.department_id = d.id AND db2.branch_id = ANY($${idx}::uuid[])
            ))
      )`);
    }

    if (scope_type) { params.push(scope_type); conditions.push(`d.scope_type = $${params.length}`); }
    if (head_employee_id) { params.push(head_employee_id); conditions.push(`d.head_employee_id = $${params.length}`); }

    const extraConditions = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const { rows } = await this.db.query(
      `${DEPARTMENT_SELECT}
       WHERE d.tenant_id = $1 AND d.deleted_at IS NULL ${extraConditions}
       ${DEPARTMENT_GROUP_BY}
       ORDER BY d.name ASC`,
      params,
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `${DEPARTMENT_SELECT}
       WHERE d.id = $2 AND d.tenant_id = $1 AND d.deleted_at IS NULL
       ${DEPARTMENT_GROUP_BY}`,
      [tenantId, id],
    );
    if (!rows.length) throw new NotFoundException('Department not found');
    return rows[0];
  }

  /** Resolves the requested scope into a validated { scopeType, branchId, branchIds } triple. */
  private resolveScope(data: any, fallback?: { scope_type: ScopeType; branch_id: string | null; branch_ids: string[] }) {
    const scopeType: ScopeType = data.scope_type || fallback?.scope_type || 'SINGLE_BRANCH';
    if (!SCOPE_TYPES.includes(scopeType)) {
      throw new BadRequestException(`Invalid scope_type. Must be one of: ${SCOPE_TYPES.join(', ')}`);
    }

    if (scopeType === 'SINGLE_BRANCH') {
      const branchId = data.branch_id !== undefined ? data.branch_id : fallback?.branch_id;
      if (!branchId) throw new BadRequestException('branch_id is required for SINGLE_BRANCH scope');
      return { scopeType, branchId, branchIds: [] as string[] };
    }

    if (scopeType === 'SELECTED_BRANCHES') {
      const branchIds: string[] = data.branch_ids !== undefined
        ? (Array.isArray(data.branch_ids) ? data.branch_ids.filter(Boolean) : [])
        : (fallback?.branch_ids || []);
      if (!branchIds.length) throw new BadRequestException('At least one branch is required for SELECTED_BRANCHES scope');
      return { scopeType, branchId: null as string | null, branchIds };
    }

    // ORGANIZATION — available everywhere, no branch bookkeeping needed.
    return { scopeType, branchId: null as string | null, branchIds: [] as string[] };
  }

  private async replaceBranchMapping(tenantId: string, departmentId: string, branchIds: string[]) {
    await this.db.query('DELETE FROM department_branches WHERE department_id = $1 AND tenant_id = $2', [departmentId, tenantId]);
    for (const branchId of branchIds) {
      await this.db.query(
        `INSERT INTO department_branches (tenant_id, department_id, branch_id) VALUES ($1, $2, $3)
         ON CONFLICT (department_id, branch_id) DO NOTHING`,
        [tenantId, departmentId, branchId],
      );
    }
  }

  async create(tenantId: string, data: any, actor?: DepartmentActor) {
    const { scopeType, branchId, branchIds } = this.resolveScope(data);

    if (data.code) {
      await assertUniqueCode(this.db, 'departments', tenantId, 'code', data.code, { label: 'Department code' });
    }

    try {
      const { rows } = await this.db.query(
        `INSERT INTO departments (tenant_id, property_id, branch_id, parent_id, name, code, cost_center_id, scope_type, is_global_department, head_employee_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          tenantId, data.property_id || null, branchId, data.parent_id || null, data.name, data.code || null,
          data.cost_center_id || null, scopeType, scopeType === 'ORGANIZATION', data.head_employee_id || null,
        ],
      );
      const dept = rows[0];

      if (scopeType === 'SELECTED_BRANCHES') {
        await this.replaceBranchMapping(tenantId, dept.id, branchIds);
      }

      if (actor) {
        await this.auditLog.log({
          tenantId,
          userId: actor.userId,
          entityType: 'department',
          entityId: dept.id,
          action: 'department_created',
          newValues: { name: dept.name, code: dept.code, scope_type: scopeType, branch_id: branchId, branch_ids: branchIds, head_employee_id: dept.head_employee_id || null },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return this.findOne(dept.id, tenantId);
    } catch (e: any) {
      translateUniqueViolation(e, 'Department code');
      throw e;
    }
  }

  async update(id: string, tenantId: string, data: any, actor?: DepartmentActor) {
    const existing = await this.findOne(id, tenantId);
    const { scopeType, branchId, branchIds } = this.resolveScope(data, {
      scope_type: existing.scope_type,
      branch_id: existing.branch_id,
      branch_ids: existing.branch_ids || [],
    });

    if (data.code) {
      await assertUniqueCode(this.db, 'departments', tenantId, 'code', data.code, { excludeId: id, label: 'Department code' });
    }

    const headEmployeeId = data.head_employee_id !== undefined ? (data.head_employee_id || null) : (existing.head_employee_id || null);

    try {
      const { rows } = await this.db.query(
        `UPDATE departments SET
           name = COALESCE($3, name),
           code = COALESCE($4, code),
           property_id = COALESCE($5, property_id),
           branch_id = $6,
           parent_id = COALESCE($7, parent_id),
           scope_type = $8,
           is_global_department = $9,
           head_employee_id = $10,
           updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, tenantId, data.name, data.code, data.property_id, branchId, data.parent_id, scopeType, scopeType === 'ORGANIZATION', headEmployeeId],
      );

      if (scopeType === 'SELECTED_BRANCHES') {
        await this.replaceBranchMapping(tenantId, id, branchIds);
      } else if (existing.scope_type === 'SELECTED_BRANCHES') {
        await this.db.query('DELETE FROM department_branches WHERE department_id = $1 AND tenant_id = $2', [id, tenantId]);
      }

      if (actor) {
        if (existing.scope_type !== scopeType) {
          await this.auditLog.log({
            tenantId, userId: actor.userId, entityType: 'department', entityId: id,
            action: 'department_scope_changed',
            oldValues: { scope_type: existing.scope_type },
            newValues: { scope_type: scopeType },
            ipAddress: actor.ipAddress, userAgent: actor.userAgent,
          });
        }

        const oldBranchIds = existing.scope_type === 'SELECTED_BRANCHES' ? (existing.branch_ids || []) : (existing.branch_id ? [existing.branch_id] : []);
        const newBranchIds = scopeType === 'SELECTED_BRANCHES' ? branchIds : (branchId ? [branchId] : []);
        if (JSON.stringify([...oldBranchIds].sort()) !== JSON.stringify([...newBranchIds].sort())) {
          await this.auditLog.log({
            tenantId, userId: actor.userId, entityType: 'department', entityId: id,
            action: 'department_branch_mapping_changed',
            oldValues: { branch_ids: oldBranchIds },
            newValues: { branch_ids: newBranchIds },
            ipAddress: actor.ipAddress, userAgent: actor.userAgent,
          });
        }

        if ((existing.head_employee_id || null) !== headEmployeeId) {
          await this.auditLog.log({
            tenantId, userId: actor.userId, entityType: 'department', entityId: id,
            action: 'department_head_changed',
            oldValues: { head_employee_id: existing.head_employee_id || null },
            newValues: { head_employee_id: headEmployeeId },
            ipAddress: actor.ipAddress, userAgent: actor.userAgent,
          });
        }
      }

      return this.findOne(id, tenantId);
    } catch (e: any) {
      translateUniqueViolation(e, 'Department code');
      throw e;
    }
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE departments SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId],
    );
    return rows[0];
  }

  async removeMany(ids: string[], tenantId: string) {
    if (!ids.length) return 0;
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const { rowCount } = await this.db.query(
      `UPDATE departments SET deleted_at = now()
       WHERE tenant_id = $1 AND id IN (${placeholders}) AND deleted_at IS NULL`,
      [tenantId, ...ids],
    );
    return rowCount;
  }

  /**
   * Find duplicate groups: departments sharing the same name (case-insensitive).
   * Returns each duplicate group with the keeper (most employees, else oldest) and victims.
   */
  async findDuplicates(tenantId: string) {
    const { rows } = await this.db.query(
      `WITH dept_counts AS (
         SELECT
           d.id, d.name, d.code, d.created_at,
           COUNT(e.id) FILTER (WHERE e.deleted_at IS NULL) AS employee_count
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.tenant_id = $1
         WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
         GROUP BY d.id
       ),
       dup_names AS (
         SELECT LOWER(TRIM(name)) AS norm_name
         FROM dept_counts
         GROUP BY LOWER(TRIM(name))
         HAVING COUNT(*) > 1
       )
       SELECT dc.*
       FROM dept_counts dc
       JOIN dup_names dn ON LOWER(TRIM(dc.name)) = dn.norm_name
       ORDER BY LOWER(TRIM(dc.name)), dc.employee_count DESC, dc.created_at ASC`,
      [tenantId],
    );

    const groups: Record<string, { keeper: any; victims: any[] }> = {};
    for (const row of rows) {
      const key = row.name.toLowerCase().trim();
      if (!groups[key]) {
        groups[key] = { keeper: row, victims: [] };
      } else {
        groups[key].victims.push(row);
      }
    }
    return Object.values(groups);
  }

  /**
   * Merge all duplicate departments:
   * - For each duplicate group, keep the department with the most employees (else oldest).
   * - Reassign all employees from victims to the keeper.
   * - Soft-delete victim departments.
   * Returns number of departments removed.
   */
  async deduplicate(tenantId: string): Promise<{ removed: number; groups: number }> {
    const groups = await this.findDuplicates(tenantId);
    let removed = 0;

    for (const { keeper, victims } of groups) {
      if (!victims.length) continue;
      const victimIds = victims.map(v => v.id);
      const placeholders = victimIds.map((_, i) => `$${i + 3}`).join(', ');

      // Reassign employees from victim departments to the keeper
      await this.db.query(
        `UPDATE employees SET department_id = $1, updated_at = now()
         WHERE tenant_id = $2 AND department_id IN (${placeholders}) AND deleted_at IS NULL`,
        [keeper.id, tenantId, ...victimIds],
      );

      // Soft-delete victim departments
      await this.db.query(
        `UPDATE departments SET deleted_at = now()
         WHERE tenant_id = $1 AND id IN (${placeholders})`,
        [tenantId, ...victimIds],
      );

      removed += victimIds.length;
    }

    return { removed, groups: groups.length };
  }
}
