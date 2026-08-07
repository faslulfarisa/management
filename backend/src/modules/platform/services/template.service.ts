import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';

@Injectable()
export class TemplateService {
  constructor(private db: DatabaseService) {}

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
    const { rows } = await this.db.query(
      'INSERT INTO templates (tenant_id, template_type, name, description, config, is_default, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [tenantId, data.template_type, data.name, data.description, data.config, data.is_default || false, createdById],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE templates SET name = COALESCE($3, name), description = COALESCE($4, description), config = COALESCE($5, config), is_default = COALESCE($6, is_default), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.description, data.config, data.is_default],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.db.query('UPDATE templates SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /**
   * Return all assignments for a given tenant, optionally filtered by template_id.
   * Joins scope tables to resolve human-readable scope_name.
   */
  async findAllAssignments(tenantId: string, templateId?: string, accessScope?: AccessScope) {
    const params: any[] = [tenantId];
    let filterClause = templateId ? `AND ta.template_id = $${params.push(templateId)}` : '';

    if (accessScope && !accessScope.isGlobalAccess) {
      const branchIdx = params.push(accessScope.branchIds);
      filterClause += ` AND (ta.scope_type != 'property' OR ta.scope_id IN (
        SELECT property_id FROM branches WHERE id = ANY($${branchIdx}::uuid[]) AND property_id IS NOT NULL
      ))`;
    }

    const { rows } = await this.db.query(
      `SELECT
         ta.id, ta.template_id, ta.template_type, ta.scope_type, ta.scope_id,
         ta.priority, ta.effective_from, ta.effective_to, ta.created_at,
         COALESCE(
           CASE ta.scope_type
             WHEN 'employee'    THEN (SELECT concat(first_name, ' ', last_name) FROM employees    WHERE id = ta.scope_id)
             WHEN 'designation' THEN (SELECT name FROM designations WHERE id = ta.scope_id)
             WHEN 'department'  THEN (SELECT name FROM departments  WHERE id = ta.scope_id)
             WHEN 'property'    THEN (SELECT name FROM properties   WHERE id = ta.scope_id)
             ELSE NULL
           END,
           ta.scope_id::text
         ) AS scope_name
       FROM template_assignments ta
       WHERE ta.tenant_id = $1 AND ta.deleted_at IS NULL
       ${filterClause}
       ORDER BY ta.priority DESC, ta.created_at DESC`,
      params,
    );
    return rows;
  }

  async assign(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO template_assignments (tenant_id, template_id, template_type, scope_type, scope_id, priority, effective_from, effective_to) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [tenantId, data.template_id, data.template_type, data.scope_type, data.scope_id, data.priority || 0, data.effective_from, data.effective_to],
    );
    return rows[0];
  }

  /**
   * Resolve which policy template applies to an employee by cascading through
   * the priority chain: employee (100) → designation (50) → department (30) → property (10) → tenant default (0).
   * If scopeType = 'employee', we resolve automatically across all scopes.
   */
  async getResolved(tenantId: string, templateType: string, scopeType: string, scopeId: string) {
    if (scopeType === 'employee') {
      // Full cascading resolution for an employee, honouring per-assignment exclusions
      const { rows } = await this.db.query(
        `SELECT t.*, ta.priority, ta.scope_type AS resolved_via
         FROM template_assignments ta
         JOIN templates t ON ta.template_id = t.id
         WHERE ta.tenant_id = $1
           AND ta.template_type = $2
           AND ta.deleted_at IS NULL
           AND t.deleted_at IS NULL
           AND (ta.effective_from IS NULL OR ta.effective_from <= now())
           AND (ta.effective_to IS NULL OR ta.effective_to >= now())
           /* skip assignments where this employee has been individually excluded */
           AND ta.id NOT IN (
             SELECT template_assignment_id
             FROM template_assignment_exclusions
             WHERE employee_id = $3 AND tenant_id = $1
           )
           AND (
             /* direct employee match */
             (ta.scope_type = 'employee' AND ta.scope_id = $3)
             OR
             /* designation match */
             (ta.scope_type = 'designation' AND ta.scope_id IN (
               SELECT designation_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR
             /* department match */
             (ta.scope_type = 'department' AND ta.scope_id IN (
               SELECT department_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
             OR
             /* property match */
             (ta.scope_type = 'property' AND ta.scope_id IN (
               SELECT property_id FROM employees WHERE id = $3 AND tenant_id = $1
             ))
           )
         ORDER BY ta.priority DESC
         LIMIT 1`,
        [tenantId, templateType, scopeId],
      );
      if (rows.length) return rows[0];

      // Fall back to tenant-level default template
      const { rows: def } = await this.db.query(
        'SELECT * FROM templates WHERE tenant_id = $1 AND template_type = $2 AND is_default = true AND deleted_at IS NULL LIMIT 1',
        [tenantId, templateType],
      );
      return def[0] || null;
    }

    // Non-employee scope: direct match only
    const { rows } = await this.db.query(
      `SELECT t.* FROM template_assignments ta
       JOIN templates t ON ta.template_id = t.id
       WHERE ta.tenant_id = $1 AND ta.template_type = $2 AND ta.scope_type = $3 AND ta.scope_id = $4
       AND ta.deleted_at IS NULL AND t.deleted_at IS NULL
       AND (ta.effective_from IS NULL OR ta.effective_from <= now())
       AND (ta.effective_to IS NULL OR ta.effective_to >= now())
       ORDER BY ta.priority DESC LIMIT 1`,
      [tenantId, templateType, scopeType, scopeId],
    );
    return rows[0] || null;
  }

  async removeAssignment(id: string, tenantId: string) {
    await this.db.query('UPDATE template_assignments SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  // ─── Exclusion CRUD ──────────────────────────────────────────────────────────

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

    // Build scope-specific employee query
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
      case 'designation':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.designation_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'property':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.property_id = $2 AND e.status = 'active' AND e.deleted_at IS NULL`;
        break;
      case 'employee':
        scopeWhere = `WHERE e.tenant_id = $1 AND e.id = $2 AND e.deleted_at IS NULL`;
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
      [userId, tenantId]
    );
    const employeeId = userRows[0]?.employee_id;

    if (employeeId) {
      return this.getResolved(tenantId, 'sidebar_access', 'employee', employeeId);
    }

    // Fallback to tenant default if user isn't linked to an employee
    const { rows: def } = await this.db.query(
      "SELECT * FROM templates WHERE tenant_id = $1 AND template_type = 'sidebar_access' AND is_default = true AND deleted_at IS NULL LIMIT 1",
      [tenantId]
    );
    return def[0] || null;
  }
}
