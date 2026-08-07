import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { translateUniqueViolation } from '../../../shared/unique-code.validator';
import { PermissionsCacheService } from '../../../shared/permissions-cache.service';
import { UserAccessService } from './user-access.service';

const POSITION_PRESETS = [
  {
    category: 'Executive',
    label: 'Executive / C-Suite',
    icon: 'Crown',
    description: 'Senior leadership with broad oversight across HR and Finance',
    permissions: [
      'hr.employees:view', 'hr.employees:export',
      'hr.attendance:view', 'hr.attendance:approve', 'hr.attendance:export',
      'hr.leave:view', 'hr.leave:approve', 'hr.leave:export',
      'hr.payroll:view', 'hr.payroll:approve', 'hr.payroll:export',
      'hr.compliance:view',
      'hr.recruitment:view', 'hr.recruitment:approve',
      'finance.invoices:view', 'finance.invoices:approve',
      'finance.bills:view', 'finance.bills:approve',
      'finance.budgets:view', 'finance.budgets:approve',
      'platform.users:view',
      'platform.roles:view',
    ],
  },
  {
    category: 'Management',
    label: 'Manager / Supervisor',
    icon: 'UserCog',
    description: 'Team leads, supervisors, and branch managers with approval authority',
    permissions: [
      'hr.employees:view',
      'hr.attendance:view', 'hr.attendance:approve',
      'hr.leave:view', 'hr.leave:approve',
      'hr.payroll:view',
      'platform.templates:view',
    ],
  },
  {
    category: 'HR',
    label: 'Human Resources',
    icon: 'Users',
    description: 'Full HR management including employees, leave, attendance, and recruitment',
    permissions: [
      'hr.employees:view', 'hr.employees:create', 'hr.employees:edit', 'hr.employees:delete', 'hr.employees:export',
      'hr.attendance:view', 'hr.attendance:create', 'hr.attendance:edit', 'hr.attendance:approve', 'hr.attendance:export',
      'hr.leave:view', 'hr.leave:create', 'hr.leave:edit', 'hr.leave:approve', 'hr.leave:export',
      'hr.payroll:view', 'hr.payroll:approve', 'hr.payroll:export',
      'hr.compliance:view', 'hr.compliance:create', 'hr.compliance:export',
      'hr.recruitment:view', 'hr.recruitment:create', 'hr.recruitment:edit', 'hr.recruitment:approve',
      'hr.recruitment:close', 'hr.recruitment:reopen', 'hr.recruitment:archive', 'hr.recruitment:comment',
      'platform.templates:view', 'platform.templates:create', 'platform.templates:edit', 'platform.templates:delete',
    ],
  },
  {
    category: 'Recruiter',
    label: 'Recruiter',
    icon: 'UserSearch',
    description: 'Creates and manages vacancy requests, screens candidates in later phases',
    permissions: [
      'hr.recruitment:view', 'hr.recruitment:create', 'hr.recruitment:edit', 'hr.recruitment:comment',
    ],
  },
  {
    category: 'Hiring Manager',
    label: 'Hiring Manager',
    icon: 'UserCheck',
    description: 'Requests vacancies for their team and approves requisitions in their department',
    permissions: [
      'hr.recruitment:view', 'hr.recruitment:create', 'hr.recruitment:approve', 'hr.recruitment:comment',
    ],
  },
  {
    category: 'Finance',
    label: 'Finance / Accounting',
    icon: 'DollarSign',
    description: 'Financial management, invoicing, budgets, GST, and payroll oversight',
    permissions: [
      'finance.invoices:view', 'finance.invoices:create', 'finance.invoices:edit', 'finance.invoices:approve', 'finance.invoices:export',
      'finance.bills:view', 'finance.bills:create', 'finance.bills:approve',
      'finance.cashbook:view', 'finance.cashbook:create',
      'finance.budgets:view', 'finance.budgets:create', 'finance.budgets:approve',
      'gst.returns:view', 'gst.returns:create', 'gst.returns:export',
      'hr.payroll:view', 'hr.payroll:export',
      'payroll.view_payments', 'payroll.manage_bank_details', 'payroll.view_bank_details',
    ],
  },
  {
    category: 'Operations',
    label: 'Operations',
    icon: 'Briefcase',
    description: 'Day-to-day operational roles with basic employee and attendance access',
    permissions: [
      'hr.employees:view',
      'hr.attendance:view', 'hr.attendance:create',
      'hr.leave:view', 'hr.leave:create',
    ],
  },
  {
    category: 'Compliance',
    label: 'Compliance / Legal',
    icon: 'FileCheck',
    description: 'Compliance reporting, audit access, and GST filing',
    permissions: [
      'hr.compliance:view', 'hr.compliance:create', 'hr.compliance:export',
      'gst.returns:view', 'gst.returns:create', 'gst.returns:export',
      'hr.employees:view',
    ],
  },
  {
    category: 'Employee',
    label: 'Employee / Staff',
    icon: 'User',
    description: 'Self-service only — attendance, leave, and payslip access',
    permissions: [
      'hr.attendance:view',
      'hr.leave:view', 'hr.leave:create',
      'hr.payroll:view',
    ],
  },
];

@Injectable()
export class PositionService {
  constructor(
    private db: DatabaseService,
    private permissionsCache: PermissionsCacheService,
    private userAccessService: UserAccessService,
  ) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT p.*,
        d.name AS department_name,
        b.name AS branch_name,
        COUNT(DISTINCT pp.permission_id)::int AS permission_count,
        COUNT(DISTINCT up.user_id)::int AS assigned_count
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN branches b ON p.branch_id = b.id
       LEFT JOIN position_permissions pp ON pp.position_id = p.id
       LEFT JOIN user_positions up ON up.position_id = p.id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
       GROUP BY p.id, d.name, b.name
       ORDER BY p.name ASC`,
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT p.*, d.name AS department_name, b.name AS branch_name
       FROM positions p
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN branches b ON p.branch_id = b.id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Position not found');
    const position = rows[0];

    const { rows: perms } = await this.db.query(
      `SELECT p.* FROM position_permissions pp
       JOIN permissions p ON pp.permission_id = p.id
       WHERE pp.position_id = $1
       ORDER BY p.module, p.action`,
      [id],
    );

    return { ...position, permissions: perms };
  }

  async create(tenantId: string, data: any) {
    if (data.code) {
      const { rows: existing } = await this.db.query(
        'SELECT 1 FROM positions WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL',
        [tenantId, data.code],
      );
      if (existing.length) throw new BadRequestException('Position code already exists');
    }

    try {
      const { rows } = await this.db.query(
        `INSERT INTO positions (tenant_id, name, code, description, department_id, branch_id, is_active, category, level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          tenantId,
          data.name,
          data.code || null,
          data.description || null,
          data.department_id || null,
          data.branch_id || null,
          data.is_active !== false,
          data.category || null,
          data.level || null,
        ],
      );
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Position code');
      throw e;
    }
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);

    if (data.code) {
      const { rows: conflict } = await this.db.query(
        'SELECT 1 FROM positions WHERE tenant_id = $1 AND code = $2 AND id != $3 AND deleted_at IS NULL',
        [tenantId, data.code, id],
      );
      if (conflict.length) throw new BadRequestException('Position code already in use');
    }

    try {
      const { rows } = await this.db.query(
        `UPDATE positions SET
          name = COALESCE($3, name),
          code = COALESCE($4, code),
          description = COALESCE($5, description),
          department_id = COALESCE($6, department_id),
          branch_id = COALESCE($7, branch_id),
          is_active = COALESCE($8, is_active),
          category = COALESCE($9, category),
          level = COALESCE($10, level),
          updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, tenantId, data.name, data.code, data.description, data.department_id, data.branch_id, data.is_active, data.category, data.level],
      );
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Position code');
      throw e;
    }
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.db.query(
      'UPDATE positions SET deleted_at = now() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return { success: true };
  }

  getPresets() {
    return POSITION_PRESETS;
  }

  // ── Permission management ──────────────────────────────────────────

  async getAllPermissions() {
    const { rows } = await this.db.query(
      'SELECT * FROM permissions ORDER BY module, action',
    );
    return rows;
  }

  async setPermissions(tenantId: string, positionId: string, permissionIds: string[]) {
    await this.findOne(positionId, tenantId);

    await this.db.query('DELETE FROM position_permissions WHERE position_id = $1', [positionId]);

    for (const permId of permissionIds) {
      await this.db.query(
        'INSERT INTO position_permissions (tenant_id, position_id, permission_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [tenantId, positionId, permId],
      );
    }

    await this.invalidateCacheForPosition(tenantId, positionId);

    return this.findOne(positionId, tenantId);
  }

  // ── User assignment ────────────────────────────────────────────────

  async assignUser(tenantId: string, positionId: string, userId: string, assignedBy: string) {
    return this.userAccessService.assignPosition(tenantId, positionId, userId, assignedBy);
  }

  async unassignUser(tenantId: string, userId: string) {
    return this.userAccessService.clearPosition(tenantId, userId);
  }

  /** Every user holding this position sees a stale permission cache until invalidated. */
  private async invalidateCacheForPosition(tenantId: string, positionId: string) {
    const { rows } = await this.db.query(
      'SELECT user_id FROM user_positions WHERE position_id = $1 AND tenant_id = $2',
      [positionId, tenantId],
    );
    await this.permissionsCache.invalidatePositionForUsers(tenantId, rows.map(r => r.user_id));
  }

  async getUserPosition(userId: string, tenantId: string) {
    return this.userAccessService.getUserPosition(userId, tenantId);
  }

  async getPositionUsers(positionId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT up.assigned_at, u.id AS user_id, u.email,
              e.first_name, e.last_name, e.employee_code
       FROM user_positions up
       JOIN users u ON up.user_id = u.id
       LEFT JOIN employees e ON e.user_id = u.id AND e.tenant_id = up.tenant_id AND e.deleted_at IS NULL
       WHERE up.position_id = $1 AND up.tenant_id = $2
       ORDER BY up.assigned_at DESC`,
      [positionId, tenantId],
    );
    return rows;
  }

  // ── Effective permissions for a user via their position ────────────

  async getUserPermissions(userId: string, tenantId: string) {
    return this.permissionsCache.getPositionPermissions(tenantId, userId, async () => {
      const { rows } = await this.db.query(
        `SELECT DISTINCT p.module, p.action
         FROM user_positions up
         JOIN position_permissions pp ON pp.position_id = up.position_id
         JOIN permissions p ON pp.permission_id = p.id
         WHERE up.user_id = $1 AND up.tenant_id = $2`,
        [userId, tenantId],
      );
      return rows.map(r => `${r.module}:${r.action}`);
    });
  }
}
