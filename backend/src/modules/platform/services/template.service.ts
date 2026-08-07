import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';
import { AuditLogService } from './audit-log.service';
import { HolidayPolicyTemplateService } from './holiday-policy-template.service';
import { BreakPolicyTemplateService, BREAK_POLICY_TEMPLATE_TYPE } from './break-policy-template.service';

@Injectable()
export class TemplateService {
  constructor(
    private db: DatabaseService,
    @Optional() private readonly auditLog?: AuditLogService,
    @Optional() private readonly holidayPolicy?: HolidayPolicyTemplateService,
    @Optional() private readonly breakPolicy?: BreakPolicyTemplateService,
  ) {}

  async findAll(tenantId: string, type?: string) {
    const query = type
      ? 'SELECT * FROM templates WHERE tenant_id = $1 AND template_type = $2 AND deleted_at IS NULL ORDER BY is_default DESC, created_at DESC'
      : 'SELECT * FROM templates WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY template_type, is_default DESC, created_at DESC';
    const { rows } = await this.db.query(query, type ? [tenantId, type] : [tenantId]);
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM templates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Template not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, data: any) {
    const config = this.validateConfigForType(data.template_type, data.config || {});

    const { rows } = await this.db.query(
      `INSERT INTO templates
         (tenant_id, template_type, name, description, config, is_default, status,
          effective_from, effective_until, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        data.template_type,
        data.name,
        data.description,
        config,
        data.is_default || false,
        data.status || 'active',
        data.effective_from || null,
        data.effective_until || null,
        data.notes || null,
        createdById,
      ],
    );
    if (rows[0].is_default) await this.clearOtherDefaults(tenantId, rows[0].template_type, rows[0].id);
    await this.writeAudit(tenantId, createdById, rows[0].id, 'template_created', null, rows[0]);
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any, userId?: string) {
    const existing = await this.findOne(id, tenantId);
    const config = data.config !== undefined
      ? this.validateConfigForType(existing.template_type, data.config || {})
      : data.config;

    const { rows } = await this.db.query(
      `UPDATE templates
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           config = COALESCE($5, config),
           is_default = COALESCE($6, is_default),
           status = COALESCE($7, status),
           effective_from = COALESCE($8, effective_from),
           effective_until = COALESCE($9, effective_until),
           notes = COALESCE($10, notes),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        data.name,
        data.description,
        config,
        data.is_default,
        data.status,
        data.effective_from,
        data.effective_until,
        data.notes,
      ],
    );
    if (rows[0].is_default) await this.clearOtherDefaults(tenantId, rows[0].template_type, rows[0].id);
    await this.writeAudit(tenantId, userId || null, id, 'template_updated', existing, rows[0]);
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM template_assignments WHERE template_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (rows[0]?.count > 0) {
      throw new ConflictException('Template has active assignments. Archive or deactivate it before deletion.');
    }

    await this.db.query('UPDATE templates SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async setStatus(id: string, tenantId: string, userId: string, status: 'active' | 'inactive' | 'archived') {
    const existing = await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE templates SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, status],
    );
    const action = status === 'active' ? 'template_activated' : status === 'archived' ? 'template_archived' : 'template_deactivated';
    await this.writeAudit(tenantId, userId, id, action, existing, rows[0]);
    return rows[0];
  }

  async duplicate(id: string, tenantId: string, userId: string, data: any = {}) {
    const template = await this.findOne(id, tenantId);
    if (template.template_type === 'holiday_policy' && this.holidayPolicy) {
      return this.holidayPolicy.duplicateTemplate(tenantId, userId, id, data);
    }
    const config = template.template_type === BREAK_POLICY_TEMPLATE_TYPE && this.breakPolicy
      ? this.breakPolicy.validateConfig(template.config || {})
      : template.config || {};

    const { rows } = await this.db.query(
      `INSERT INTO templates
         (tenant_id, template_type, name, description, config, is_default, status,
          effective_from, effective_until, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, false, 'draft', $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        template.template_type,
        data.name || `${template.name} Copy`,
        data.description ?? template.description,
        config,
        data.effective_from ?? template.effective_from,
        data.effective_until ?? template.effective_until,
        data.notes ?? template.notes,
        userId,
      ],
    );
    await this.writeAudit(tenantId, userId, rows[0].id, 'template_duplicated', { source_template_id: id }, rows[0]);
    return rows[0];
  }

  async findAllAssignments(tenantId: string, templateId?: string, accessScope?: AccessScope) {
    const params: any[] = [tenantId];
    let filterClause = templateId ? `AND ta.template_id = $${params.push(templateId)}` : '';

    if (accessScope && !accessScope.isGlobalAccess) {
      const branchIdx = params.push(accessScope.branchIds);
      filterClause += ` AND (
        ta.scope_type NOT IN ('property', 'branch')
        OR ta.scope_id = ANY($${branchIdx}::uuid[])
        OR ta.scope_id IN (
          SELECT property_id FROM branches WHERE id = ANY($${branchIdx}::uuid[]) AND property_id IS NOT NULL
        )
      )`;
    }

    const { rows } = await this.db.query(
      `SELECT
         ta.id, ta.template_id, ta.template_type, ta.scope_type, ta.scope_id,
         ta.priority, ta.effective_from, ta.effective_to, ta.created_at,
         t.name AS template_name,
         COALESCE(
           CASE ta.scope_type
             WHEN 'employee'     THEN (SELECT concat(first_name, ' ', last_name) FROM employees    WHERE id = ta.scope_id)
             WHEN 'designation'  THEN (SELECT name FROM designations WHERE id = ta.scope_id)
             WHEN 'department'   THEN (SELECT name FROM departments  WHERE id = ta.scope_id)
             WHEN 'branch'       THEN (SELECT name FROM branches     WHERE id = ta.scope_id)
             WHEN 'property'     THEN (SELECT name FROM properties   WHERE id = ta.scope_id)
             WHEN 'organization' THEN (SELECT name FROM tenants      WHERE id = ta.scope_id)
             ELSE NULL
           END,
           ta.scope_id::text
         ) AS scope_name
       FROM template_assignments ta
       JOIN templates t ON t.id = ta.template_id
       WHERE ta.tenant_id = $1 AND ta.deleted_at IS NULL
       ${filterClause}
       ORDER BY ta.priority DESC, ta.created_at DESC`,
      params,
    );
    return rows;
  }

  async assign(tenantId: string, data: any) {
    const { rows: templateRows } = await this.db.query(
      'SELECT template_type FROM templates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [data.template_id, tenantId],
    );
    if (!templateRows.length) throw new NotFoundException('Template not found');

    const templateType = templateRows[0].template_type;
    if (data.template_type && data.template_type !== templateType) {
      throw new ConflictException('Template type does not match the selected template');
    }

    if (data.scope_type === 'organization') {
      data.scope_id = tenantId;
      data.priority = data.priority ?? 0;
    }

    if (templateType === 'leave_policy' && data.scope_type === 'employee') {
      const { rows: existingRows } = await this.db.query(
        `SELECT id FROM template_assignments
         WHERE tenant_id = $1
           AND template_type = 'leave_policy'
           AND scope_type = 'employee'
           AND scope_id = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, data.scope_id],
      );
      if (existingRows.length) {
        throw new ConflictException(
          'This employee already has a leave policy template assigned. Remove the existing assignment before assigning another.',
        );
      }
    }

    const { rows } = await this.db.query(
      'INSERT INTO template_assignments (tenant_id, template_id, template_type, scope_type, scope_id, priority, effective_from, effective_to) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [tenantId, data.template_id, templateType, data.scope_type, data.scope_id, data.priority || 0, data.effective_from, data.effective_to],
    );
    await this.writeAudit(tenantId, data.user_id || null, rows[0].id, 'template_assignment_changed', null, rows[0]);
    return rows[0];
  }

  async getResolved(tenantId: string, templateType: string, scopeType: string, scopeId: string) {
    if (scopeType === 'employee') {
      const { rows } = await this.db.query(
        `SELECT t.*, ta.priority, ta.scope_type AS resolved_via
         FROM template_assignments ta
         JOIN templates t ON ta.template_id = t.id
         WHERE ta.tenant_id = $1
           AND ta.template_type = $2
           AND ta.deleted_at IS NULL
           AND t.deleted_at IS NULL
           AND COALESCE(t.status, 'active') = 'active'
           AND (ta.effective_from IS NULL OR ta.effective_from <= now())
           AND (ta.effective_to IS NULL OR ta.effective_to >= now())
           AND (t.effective_from IS NULL OR t.effective_from <= CURRENT_DATE)
           AND (t.effective_until IS NULL OR t.effective_until >= CURRENT_DATE)
           AND ta.id NOT IN (
             SELECT template_assignment_id
             FROM template_assignment_exclusions
             WHERE employee_id = $3 AND tenant_id = $1
           )
           AND (
             (ta.scope_type = 'employee' AND ta.scope_id = $3)
             OR (ta.scope_type = 'designation' AND ta.scope_id IN (
               SELECT designation_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR (ta.scope_type = 'department' AND ta.scope_id IN (
               SELECT department_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR (ta.scope_type = 'branch' AND ta.scope_id IN (
               SELECT branch_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR (ta.scope_type = 'property' AND ta.scope_id IN (
               SELECT property_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR (ta.scope_type = 'organization' AND ta.scope_id = $1)
           )
         ORDER BY ta.priority DESC
         LIMIT 1`,
        [tenantId, templateType, scopeId],
      );
      if (rows.length) return rows[0];

      const { rows: def } = await this.db.query(
        `SELECT * FROM templates
         WHERE tenant_id = $1 AND template_type = $2 AND is_default = true
           AND deleted_at IS NULL AND COALESCE(status, 'active') = 'active'
           AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
           AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
         ORDER BY effective_from DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [tenantId, templateType],
      );
      return def[0] || null;
    }

    const { rows } = await this.db.query(
      `SELECT t.* FROM template_assignments ta
       JOIN templates t ON ta.template_id = t.id
       WHERE ta.tenant_id = $1 AND ta.template_type = $2 AND ta.scope_type = $3 AND ta.scope_id = $4
       AND ta.deleted_at IS NULL AND t.deleted_at IS NULL
       AND COALESCE(t.status, 'active') = 'active'
       AND (ta.effective_from IS NULL OR ta.effective_from <= now())
       AND (ta.effective_to IS NULL OR ta.effective_to >= now())
       AND (t.effective_from IS NULL OR t.effective_from <= CURRENT_DATE)
       AND (t.effective_until IS NULL OR t.effective_until >= CURRENT_DATE)
       ORDER BY ta.priority DESC LIMIT 1`,
      [tenantId, templateType, scopeType, scopeId],
    );
    return rows[0] || null;
  }

  async removeAssignment(id: string, tenantId: string, userId?: string) {
    await this.db.query('UPDATE template_assignments SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    await this.writeAudit(tenantId, userId || null, id, 'template_assignment_changed', null, { deleted: true });
    return { success: true };
  }

  async getExclusions(tenantId: string, assignmentId: string) {
    const { rows } = await this.db.query(
      `SELECT tae.id, tae.employee_id, tae.excluded_by, tae.reason, tae.created_at,
              concat(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_code,
              d.name AS department_name,
              des.name AS designation_name
       FROM template_assignment_exclusions tae
       JOIN employees e ON tae.employee_id = e.id
       LEFT JOIN departments  d   ON e.department_id  = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE tae.tenant_id = $1 AND tae.template_assignment_id = $2
       ORDER BY tae.created_at DESC`,
      [tenantId, assignmentId],
    );
    return rows;
  }

  async addExclusion(tenantId: string, assignmentId: string, employeeId: string, excludedById: string, reason?: string) {
    const { rows: aRows } = await this.db.query(
      'SELECT id FROM template_assignments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [assignmentId, tenantId],
    );
    if (!aRows.length) throw new NotFoundException('Assignment not found');

    try {
      const { rows } = await this.db.query(
        `INSERT INTO template_assignment_exclusions
           (tenant_id, template_assignment_id, employee_id, excluded_by, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, template_assignment_id, employee_id) DO NOTHING
         RETURNING *`,
        [tenantId, assignmentId, employeeId, excludedById, reason || null],
      );
      await this.writeAudit(tenantId, excludedById, assignmentId, 'template_assignment_changed', null, { excluded_employee_id: employeeId });
      return rows[0] || null;
    } catch {
      throw new ConflictException('Employee is already excluded from this assignment');
    }
  }

  async removeExclusion(id: string, tenantId: string) {
    await this.db.query(
      'DELETE FROM template_assignment_exclusions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return { success: true };
  }

  async getEffectiveEmployees(tenantId: string, assignmentId: string, accessScope?: AccessScope) {
    const { rows: aRows } = await this.db.query(
      'SELECT id, scope_type, scope_id FROM template_assignments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [assignmentId, tenantId],
    );
    if (!aRows.length) throw new NotFoundException('Assignment not found');
    const assignment = aRows[0];

    const BASE_EMP_SELECT = `
      SELECT e.id,
             concat(e.first_name, ' ', e.last_name) AS name,
             e.employee_code,
             d.name  AS department_name,
             des.name AS designation_name
      FROM employees e
      LEFT JOIN departments  d   ON e.department_id  = d.id
      LEFT JOIN designations des ON e.designation_id = des.id`;

    let scopeWhere = '';
    let scopeParams: any[] = [tenantId, assignment.scope_id];

    switch (assignment.scope_type) {
      case 'department':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.department_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'branch':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.branch_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'designation':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.designation_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'property':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.property_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'employee':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.id = $2 AND e.deleted_at IS NULL`;
        break;
      case 'organization':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL`;
        scopeParams = [tenantId];
        break;
      default:
        return { scope_type: assignment.scope_type, scope_id: assignment.scope_id, total: 0, excluded_count: 0, effective_count: 0, employees: [], exclusions: [] };
    }

    if (accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'e.branch_id', scopeParams.length + 1);
      scopeWhere += ` AND ${scope.clause}`;
      scopeParams.push(...scope.params);
    }

    const { rows: employees } = await this.db.query(`${BASE_EMP_SELECT} ${scopeWhere}`, scopeParams);

    const { rows: exclusions } = await this.db.query(
      `SELECT tae.id, tae.employee_id, tae.reason, tae.created_at,
              concat(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_code
       FROM template_assignment_exclusions tae
       JOIN employees e ON tae.employee_id = e.id
       WHERE tae.tenant_id = $1 AND tae.template_assignment_id = $2`,
      [tenantId, assignmentId],
    );

    const excludedIds = new Set<string>(exclusions.map((ex: any) => ex.employee_id));

    return {
      scope_type: assignment.scope_type,
      scope_id: assignment.scope_id,
      total: employees.length,
      excluded_count: exclusions.length,
      effective_count: employees.filter((e: any) => !excludedIds.has(e.id)).length,
      employees: employees.map((e: any) => ({
        ...e,
        is_excluded: excludedIds.has(e.id),
        exclusion: exclusions.find((ex: any) => ex.employee_id === e.id) || null,
      })),
      exclusions,
    };
  }

  async getMySidebarAccess(userId: string, tenantId: string) {
    const { rows: userRows } = await this.db.query(
      'SELECT employee_id FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId],
    );
    const employeeId = userRows[0]?.employee_id;

    if (employeeId) {
      return this.getResolved(tenantId, 'sidebar_access', 'employee', employeeId);
    }

    const { rows: def } = await this.db.query(
      "SELECT * FROM templates WHERE tenant_id = $1 AND template_type = 'sidebar_access' AND is_default = true AND deleted_at IS NULL AND COALESCE(status, 'active') = 'active' LIMIT 1",
      [tenantId],
    );
    return def[0] || null;
  }

  private async clearOtherDefaults(tenantId: string, templateType: string, templateId: string) {
    await this.db.query(
      `UPDATE templates
       SET is_default = false, updated_at = now()
       WHERE tenant_id = $1 AND template_type = $2 AND id <> $3 AND is_default = true AND deleted_at IS NULL`,
      [tenantId, templateType, templateId],
    );
  }

  private validateConfigForType(templateType: string, config: any) {
    if (templateType === 'holiday_policy' && this.holidayPolicy) {
      return this.holidayPolicy.validateConfig(config || {});
    }
    if (templateType === BREAK_POLICY_TEMPLATE_TYPE && this.breakPolicy) {
      return this.breakPolicy.validateConfig(config || {});
    }
    return config || {};
  }

  private async writeAudit(tenantId: string, userId: string | null, entityId: string, action: string, oldValues?: any, newValues?: any) {
    if (!this.auditLog) return;
    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'template',
      entityId,
      action,
      oldValues,
      newValues,
    });
  }
}
