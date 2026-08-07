import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { AuthService } from '../../auth/auth.service';
import { AuditLogService } from './audit-log.service';
import { slugifyUsername, generateDefaultPassword, validatePasswordPolicy } from '../../../shared/credential-generator.util';
import { ActorContext, RoleAssignmentInput, UserAccessService } from './user-access.service';

@Injectable()
export class UserService {
  constructor(
    private db: DatabaseService,
    private authService: AuthService,
    private auditLog: AuditLogService,
    private userAccessService: UserAccessService,
  ) {}

  async findAll(tenantId: string, page = 1, limit = 20, accessScope: AccessScope = GLOBAL_ACCESS_SCOPE) {
    const offset = (page - 1) * limit;
    const listScope = branchScopeClause(accessScope, 'e.branch_id', 4);
    const { rows } = await this.db.query(
      `SELECT
         u.id, u.tenant_id, u.employee_id, u.email, u.phone,
         u.is_active, u.mfa_enabled, u.last_login_at, u.created_at, u.is_super_admin,
         u.is_locked, u.account_locked_at, u.failed_login_count, u.last_failed_login_at,
         u.status, u.deactivation_reason_id, dr.label AS deactivation_reason,
         dr.category AS deactivation_reason_category, u.deactivated_at, u.reactivated_at,
         COALESCE(e.first_name, '')  AS first_name,
         COALESCE(e.last_name,  '')  AS last_name,
         e.employee_code             AS employee_code,
         d.name                      AS department,
         (SELECT r.name
          FROM   user_roles ur
          JOIN   roles r ON r.id = ur.role_id
          WHERE  ur.user_id   = u.id
            AND  ur.tenant_id = u.tenant_id
          LIMIT 1)                   AS role,
         CASE WHEN u.is_super_admin THEN 'super_admin' ELSE COALESCE(ut.user_type, 'employee') END AS user_type
       FROM   users u
       LEFT JOIN employees   e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
       LEFT JOIN deactivation_reasons dr ON dr.id = u.deactivation_reason_id
       WHERE  u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_internal_staff = false
         AND  ${listScope.clause}
       ORDER  BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset, ...listScope.params],
    );
    const countScope = branchScopeClause(accessScope, 'e.branch_id', 2);
    const { rows: countRows } = await this.db.query(
      `SELECT COUNT(*) FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_internal_staff = false
         AND ${countScope.clause}`,
      [tenantId, ...countScope.params],
    );
    const total = parseInt(countRows[0].count);

    const data = await this.attachScopeSummary(rows, tenantId);

    return { data, meta: { page, limit, total, total_pages: Math.ceil(total / limit) } };
  }

  /** Attaches a small `scope` summary and `branches` array to each row. */
  private async attachScopeSummary(rows: any[], tenantId: string) {
    const branchScopedIds = rows.filter(r => r.user_type === 'branch_admin' || r.user_type === 'admin').map(r => r.id);
    const empBranchIds = rows.filter(r => r.employee_id).map(r => r.id);

    // 1. Fetch branch_user_access (for Branch Admins / Admins)
    const branchMap = new Map<string, { id: string; name: string }[]>();
    if (branchScopedIds.length) {
      const { rows: branchRows } = await this.db.query(
        `SELECT bua.user_id, b.id AS branch_id, b.name
         FROM branch_user_access bua
         JOIN branches b ON b.id = bua.branch_id
         WHERE bua.tenant_id = $1 AND bua.user_id = ANY($2::uuid[]) AND bua.role = 'branch_admin' AND bua.is_active = TRUE`,
        [tenantId, branchScopedIds],
      );
      for (const r of branchRows) {
        const list = branchMap.get(r.user_id) || [];
        list.push({ id: r.branch_id, name: r.name });
        branchMap.set(r.user_id, list);
      }
    }

    // 2. Fetch employee branch (for Employees)
    const empBranchMap = new Map<string, { id: string; name: string }>();
    if (empBranchIds.length) {
      const { rows: empBranchRows } = await this.db.query(
        `SELECT u.id AS user_id, b.id AS branch_id, b.name
         FROM users u
         JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
         JOIN branches b ON b.id = e.branch_id
         WHERE u.tenant_id = $1 AND u.id = ANY($2::uuid[])`,
        [tenantId, empBranchIds],
      );
      for (const r of empBranchRows) {
        empBranchMap.set(r.user_id, { id: r.branch_id, name: r.name });
      }
    }

    return rows.map(r => {
      let branches: { id: string; name: string }[] = [];
      let scope: any = null;

      if (r.user_type === 'branch_admin' || r.user_type === 'admin') {
        branches = branchMap.get(r.id) || [];
        scope = { type: 'branches', names: branches.map(b => b.name) };
      } else if (r.user_type === 'employee') {
        const b = empBranchMap.get(r.id);
        if (b) {
          branches = [b];
        }
      }

      return { ...r, branches, scope };
    });
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT u.*, dr.label AS deactivation_reason_label, dr.category AS deactivation_reason_category,
              e.reporting_manager_id,
              CONCAT(rm.first_name, ' ', rm.last_name) AS reporting_manager_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN employees rm ON rm.id = e.reporting_manager_id AND rm.deleted_at IS NULL
       LEFT JOIN deactivation_reasons dr ON dr.id = u.deactivation_reason_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('User not found');
    const data = await this.attachScopeSummary(rows, tenantId);
    return data[0];
  }

  async findByEmail(email: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [email, tenantId],
    );
    return rows[0] || null;
  }

  async usernameExists(tenantId: string, username: string, excludeUserId?: string): Promise<boolean> {
    const params: any[] = [tenantId, username];
    let clause = 'tenant_id = $1 AND LOWER(username) = LOWER($2) AND deleted_at IS NULL';
    if (excludeUserId) {
      clause += ' AND id <> $3';
      params.push(excludeUserId);
    }
    const { rows } = await this.db.query(`SELECT 1 FROM users WHERE ${clause} LIMIT 1`, params);
    return rows.length > 0;
  }

  /** Real-time uniqueness check for the bulk-import preview table's editable username field. */
  async checkUsernameAvailable(tenantId: string, rawUsername: string, excludeUserId?: string) {
    const username = slugifyUsername(rawUsername);
    if (!username) {
      return { available: false, username, reason: 'Username must contain at least one letter or number' };
    }
    if (username !== rawUsername) {
      return { available: false, username, reason: 'Use lowercase letters and numbers only — no spaces or special characters' };
    }
    const taken = await this.usernameExists(tenantId, username, excludeUserId);
    return { available: !taken, username, reason: taken ? 'Username already exists' : undefined };
  }

  /** Appends an incrementing numeric suffix until the candidate is free, both in `reserved` (this batch) and in the DB. */
  private async generateUniqueUsername(tenantId: string, base: string, reserved: Set<string>): Promise<string> {
    const safeBase = base || 'user';
    let candidate = safeBase;
    let suffix = 0;
    while (reserved.has(candidate) || (await this.usernameExists(tenantId, candidate))) {
      suffix += 1;
      candidate = `${safeBase}${suffix}`;
    }
    reserved.add(candidate);
    return candidate;
  }

  /**
   * Generates a unique username + default password for every row of a bulk-import
   * file and validates it (required fields, email format, dupes within the file
   * and against the database). Frontend renders this as an editable preview table
   * and re-validates individual username edits via `checkUsernameAvailable`.
   */
  async previewBulkImport(tenantId: string, rows: any[]) {
    const reservedUsernames = new Set<string>();
    const seenEmails = new Set<string>();
    const seenEmployeeCodes = new Set<string>();
    const results: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const firstName = String(row.firstName ?? row.first_name ?? '').trim();
      const lastName = String(row.lastName ?? row.last_name ?? '').trim();
      const email = String(row.email ?? '').trim();
      const employeeCode = String(row.employeeCode ?? row.employee_code ?? '').trim();
      const errors: string[] = [];

      if (!firstName) errors.push('First name is required');
      if (!lastName) errors.push('Last name is required');
      if (!email) errors.push('Email is required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');

      if (email) {
        const emailKey = email.toLowerCase();
        if (seenEmails.has(emailKey)) {
          errors.push('Duplicate email in this file');
        } else {
          seenEmails.add(emailKey);
          if (await this.findByEmail(email, tenantId)) errors.push('Email already exists');
        }
      }

      if (employeeCode) {
        const codeKey = employeeCode.toLowerCase();
        if (seenEmployeeCodes.has(codeKey)) {
          errors.push('Duplicate employee code in this file');
        } else {
          seenEmployeeCodes.add(codeKey);
          const { rows: codeRows } = await this.db.query(
            'SELECT 1 FROM employees WHERE tenant_id = $1 AND LOWER(employee_code) = LOWER($2) AND deleted_at IS NULL',
            [tenantId, employeeCode],
          );
          if (codeRows.length) errors.push('Employee code already exists');
        }
      }

      const baseUsername = slugifyUsername(`${firstName} ${lastName}`);
      const username = await this.generateUniqueUsername(tenantId, baseUsername, reservedUsernames);
      const password = generateDefaultPassword(firstName, lastName);
      validatePasswordPolicy(password).forEach(e => errors.push(`Password generation issue: ${e}`));

      results.push({
        index: i,
        firstName,
        lastName,
        email,
        phone: row.phone || null,
        departmentId: row.departmentId || row.department_id || null,
        positionId: row.positionId || row.position_id || null,
        employeeCode: employeeCode || null,
        username,
        password,
        status: errors.length ? 'error' : 'valid',
        errors,
      });
    }

    return results;
  }

  async create(tenantId: string, data: any, actor?: ActorContext) {
    const createdById = actor?.sub;
    const existing = await this.findByEmail(data.email, tenantId);
    if (existing) throw new BadRequestException('Email already exists');

    let username: string | null = null;
    if (data.username) {
      if (await this.usernameExists(tenantId, data.username)) {
        throw new BadRequestException('Username already exists');
      }
      username = data.username;
    }

    let employeeId = data.employee_id;

    if (!employeeId) {
      // 1. Generate unique employee code based on tenant's prefix and digits settings
      const { rows: tenantRows } = await this.db.query(
        'SELECT emp_code_prefix, emp_code_digits FROM tenants WHERE id = $1',
        [tenantId],
      );
      const prefix = tenantRows[0]?.emp_code_prefix || 'EMP';
      const digits = tenantRows[0]?.emp_code_digits || 4;

      const { rows: allEmpRows } = await this.db.query(
        `SELECT employee_code FROM employees WHERE tenant_id = $1 AND employee_code LIKE $2`,
        [tenantId, `${prefix}%`],
      );
      
      let maxNum = 0;
      for (const row of allEmpRows) {
        const suffix = row.employee_code.slice(prefix.length);
        const parsed = parseInt(suffix, 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }

      let nextNum = maxNum + 1;
      let employeeCode = `${prefix}${String(nextNum).padStart(digits, '0')}`;

      // Bulletproof existence check to avoid any race conditions or duplicate key violations
      let codeExists = true;
      while (codeExists) {
        const { rows: checkRows } = await this.db.query(
          'SELECT 1 FROM employees WHERE tenant_id = $1 AND employee_code = $2 AND deleted_at IS NULL',
          [tenantId, employeeCode],
        );
        if (checkRows.length === 0) {
          codeExists = false;
        } else {
          nextNum++;
          employeeCode = `${prefix}${String(nextNum).padStart(digits, '0')}`;
        }
      }

      // 2. Automatically save the new employee profile in the employees table
      const { rows: empRows } = await this.db.query(
        `INSERT INTO employees (
          tenant_id, employee_code, status, first_name, last_name,
          personal_email, personal_phone, department_id, position_id, designation_id, branch_id,
          date_of_joining, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_DATE, $12)
        RETURNING id`,
        [
          tenantId,
          employeeCode,
          data.status || 'active',
          data.first_name || '',
          data.last_name || '',
          data.email,
          data.phone || null,
          data.department_id || null,
          data.position_id || null,
          data.designation_id || null,
          data.branch_id || (Array.isArray(data.branch_ids) ? data.branch_ids[0] : null) || null,
          createdById || null,
        ],
      );
      employeeId = empRows[0].id;

      // 3. Insert onboarding/joining lifecycle event to ensure audit consistency
      await this.db.query(
        `INSERT INTO employee_lifecycle_events (
          tenant_id, employee_id, event_type, effective_date, new_values, created_by
        ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)`,
        [
          tenantId,
          employeeId,
          'joining',
          JSON.stringify({ status: 'active', date_of_joining: new Date().toISOString().split('T')[0] }),
          createdById || null,
        ],
      );
    }

    const password = data.password || `Temp@${Math.random().toString(36).slice(-8)}`;
    const passwordHash = await this.authService.hashPassword(password);
    const { rows } = await this.db.query(
      `INSERT INTO users (tenant_id, email, phone, password_hash, employee_id, username, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, email, phone, username, must_change_password, is_active, created_at`,
      [tenantId, data.email, data.phone, passwordHash, employeeId, username, !!data.must_change_password],
    );
    const newUser = rows[0];

    const userType = data.userType || data.user_type || 'employee';
    const roleAssignments: RoleAssignmentInput[] | undefined = Array.isArray(data.roles)
      ? data.roles
      : data.role_id
        ? [{ roleId: data.role_id }]
        : undefined;

    await this.userAccessService.setUserAccess(
      actor || { sub: newUser.id, isSuperAdmin: true, userType: 'super_admin' },
      newUser.id,
      tenantId,
      {
        userType,
        branchIds: Array.isArray(data.branch_ids) ? data.branch_ids.filter(Boolean) : undefined,
        positionId: data.position_id ?? data.positionId ?? null,
        reportingManagerId: data.reporting_manager_id ?? data.reports_to ?? null,
        roles: roleAssignments,
      },
    );

    return newUser;
  }

  async update(id: string, tenantId: string, data: any) {
    const target = await this.findOne(id, tenantId);

    let passwordHash: string | null = null;
    if (data.password) {
      passwordHash = await this.authService.hashPassword(data.password);
    } else if (data.newPassword) {
      if (!data.oldPassword) {
        throw new BadRequestException('Current password is required to change password');
      }
      const isMatch = await bcrypt.compare(data.oldPassword, target.password_hash);
      if (!isMatch) {
        throw new BadRequestException('Current password does not match');
      }
      passwordHash = await this.authService.hashPassword(data.newPassword);
    }

    // Handle first_name / last_name / department_id
    // These live on the employees table — create the record if missing, otherwise update.
    let linkedEmployeeId: string | null = target.employee_id ?? null;
    const hasEmployeeProfileFields =
      data.first_name !== undefined ||
      data.last_name  !== undefined ||
      data.department_id !== undefined ||
      data.branch_id !== undefined;

    if (data.branch_id) {
      const { rows: branchRows } = await this.db.query(
        'SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [data.branch_id, tenantId],
      );
      if (!branchRows.length) throw new BadRequestException('Invalid branch');
    }

    if (hasEmployeeProfileFields) {
      if (linkedEmployeeId) {
        await this.db.query(
          `UPDATE employees
             SET first_name    = COALESCE($3, first_name),
                 last_name     = COALESCE($4, last_name),
                 department_id = COALESCE($5, department_id),
                 branch_id     = COALESCE($6, branch_id),
                 updated_at    = now()
           WHERE id = $1 AND tenant_id = $2`,
          [
            linkedEmployeeId,
            tenantId,
            data.first_name || null,
            data.last_name || null,
            data.department_id || null,
            data.branch_id || null,
          ],
        );
      } else {
        // User has no employee record yet — auto-create one and link it
        const empCode = await this.generateEmployeeCode(tenantId);
        const { rows: empRows } = await this.db.query(
          `INSERT INTO employees
             (tenant_id, employee_code, status, first_name, last_name,
              personal_email, personal_phone, department_id, branch_id, date_of_joining)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, CURRENT_DATE)
           RETURNING id`,
          [
            tenantId, empCode,
            data.first_name    || '',
            data.last_name     || '',
            data.email         || target.email,
            data.phone         || target.phone || null,
            data.department_id || null,
            data.branch_id     || null,
          ],
        );
        linkedEmployeeId = empRows[0].id;
      }
    }

    const { rows } = await this.db.query(
      `UPDATE users
         SET email         = COALESCE($3, email),
             phone         = COALESCE($4, phone),
             password_hash = COALESCE($5, password_hash),
             employee_id   = COALESCE($6, employee_id),
             updated_at    = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, email, phone, is_active, mfa_enabled, created_at`,
      [id, tenantId, data.email, data.phone, passwordHash, linkedEmployeeId],
    );

    if (passwordHash) {
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [id],
      );
    }

    if (data.reporting_manager_id !== undefined || data.reports_to !== undefined) {
      await this.userAccessService.assignReportingManager(
        tenantId,
        id,
        data.reporting_manager_id ?? data.reports_to ?? null,
      );
    }

    return rows[0];
  }

  private async generateEmployeeCode(tenantId: string): Promise<string> {
    const { rows: tenantRows } = await this.db.query(
      'SELECT emp_code_prefix, emp_code_digits FROM tenants WHERE id = $1',
      [tenantId],
    );
    const prefix = tenantRows[0]?.emp_code_prefix || 'EMP';
    const digits = tenantRows[0]?.emp_code_digits || 4;

    const { rows: allEmpRows } = await this.db.query(
      'SELECT employee_code FROM employees WHERE tenant_id = $1 AND employee_code LIKE $2',
      [tenantId, `${prefix}%`],
    );
    let maxNum = 0;
    for (const row of allEmpRows) {
      const parsed = parseInt(row.employee_code.slice(prefix.length), 10);
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
    }

    let nextNum = maxNum + 1;
    let code = `${prefix}${String(nextNum).padStart(digits, '0')}`;
    let exists = true;
    while (exists) {
      const { rows: checkRows } = await this.db.query(
        'SELECT 1 FROM employees WHERE tenant_id = $1 AND employee_code = $2 AND deleted_at IS NULL',
        [tenantId, code],
      );
      if (checkRows.length === 0) { exists = false; }
      else { nextNum++; code = `${prefix}${String(nextNum).padStart(digits, '0')}`; }
    }
    return code;
  }

  async remove(
    id: string,
    tenantId: string,
    actor: { sub: string; isSuperAdmin: boolean; userType: string },
    ip?: string,
    userAgent?: string,
  ) {
    const target = await this.findOne(id, tenantId);
    if (target.is_super_admin) {
      throw new BadRequestException('Super admin account cannot be deleted');
    }
    if (target.is_active) {
      throw new BadRequestException('Users must be deactivated before they can be deleted.');
    }

    const deletionReason = target.deactivation_reason_label
      ? `${target.deactivation_reason_label}${target.deactivation_notes ? ' — ' + target.deactivation_notes : ''}`
      : null;

    await this.db.query(
      `UPDATE users
         SET deleted_at = now(), is_active = false, deleted_by = $3, deletion_reason = $4
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, actor.sub, deletionReason],
    );

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'user_deleted',
      oldValues: { status: target.status, is_active: target.is_active, email: target.email },
      newValues: { deleted_by: actor.sub, deletion_reason: deletionReason },
      ipAddress: ip,
      userAgent,
    });

    return { success: true };
  }

  async searchDirectory(tenantId: string, query: string) {
    const pattern = query ? `%${query}%` : '%';
    const { rows } = await this.db.query(
      `(
        SELECT
          u.id,
          'user'::text                                  AS source,
          u.email,
          u.phone,
          COALESCE(e.first_name, '')                    AS first_name,
          COALESCE(e.last_name,  '')                    AS last_name,
          e.employee_code,
          d.name                                        AS department,
          des.name                                      AS designation,
          u.is_active,
          1                                             AS sort_order
        FROM users u
        LEFT JOIN employees   e   ON u.employee_id = e.id   AND e.deleted_at   IS NULL
        LEFT JOIN departments d   ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE u.tenant_id = $1
          AND u.deleted_at IS NULL
          AND (
            u.email    ILIKE $2
            OR u.phone ILIKE $2
            OR CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,'')) ILIKE $2
            OR e.employee_code ILIKE $2
          )
        ORDER BY first_name
        LIMIT 50
      )
      UNION ALL
      (
        SELECT
          e.id,
          'employee'::text                              AS source,
          e.personal_email                              AS email,
          e.personal_phone                              AS phone,
          e.first_name,
          e.last_name,
          e.employee_code,
          d.name                                        AS department,
          des.name                                      AS designation,
          (e.status = 'active')::boolean                AS is_active,
          2                                             AS sort_order
        FROM employees e
        LEFT JOIN departments  d   ON e.department_id  = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE e.tenant_id = $1
          AND e.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM users u2
            WHERE u2.employee_id = e.id AND u2.deleted_at IS NULL
          )
          AND (
            CONCAT(e.first_name, ' ', e.last_name) ILIKE $2
            OR e.personal_email  ILIKE $2
            OR e.personal_phone  ILIKE $2
            OR e.employee_code   ILIKE $2
          )
        ORDER BY first_name
        LIMIT 50
      )
      ORDER BY sort_order, first_name`,
      [tenantId, pattern],
    );
    return rows;
  }

  /** Users with hierarchy standing above plain employee — eligible to be named as a specific approval-chain approver. */
  async listElevatedUsers(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email,
         COALESCE(e.first_name, '') AS first_name,
         COALESCE(e.last_name, '')  AS last_name,
         CASE WHEN u.is_super_admin THEN 'super_admin' ELSE ut.user_type END AS user_type
       FROM users u
       LEFT JOIN employees e     ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE
         AND (u.is_super_admin = TRUE OR ut.user_type IN ('org_admin', 'branch_admin', 'admin'))
       ORDER BY first_name, last_name`,
      [tenantId],
    );
    return rows;
  }

  async assignRoles(userId: string, tenantId: string, roles: { roleId: string; scopeType?: string; scopeId?: string }[]) {
    await this.findOne(userId, tenantId);
    await this.userAccessService.assignRoles(tenantId, userId, roles);
    return this.findOne(userId, tenantId);
  }

  async unlockUser(id: string, tenantId: string, actor: { sub: string; isSuperAdmin: boolean; userType: string }, ip?: string, userAgent?: string) {
    await this.findOne(id, tenantId);
    return this.authService.unlockAccount(id, tenantId, actor, ip, userAgent);
  }

  async getDeactivationReasons(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, category, code, label, maps_to_status, login_message, requires_notes
       FROM deactivation_reasons
       WHERE is_active = true AND (tenant_id IS NULL OR tenant_id = $1)
       ORDER BY sort_order`,
      [tenantId],
    );
    return rows;
  }

  async deactivate(
    id: string,
    tenantId: string,
    reasonId: string,
    notes: string | undefined,
    actor: { sub: string; isSuperAdmin: boolean; userType: string },
    ip?: string,
    userAgent?: string,
  ) {
    const target = await this.findOne(id, tenantId);
    if (target.is_super_admin) {
      throw new BadRequestException('Super admin account cannot be deactivated');
    }

    const { rows: reasonRows } = await this.db.query(
      `SELECT * FROM deactivation_reasons
       WHERE id = $1 AND is_active = true AND (tenant_id IS NULL OR tenant_id = $2)`,
      [reasonId, tenantId],
    );
    if (!reasonRows.length) throw new NotFoundException('Deactivation reason not found');
    const reason = reasonRows[0];

    if (reason.requires_notes && !notes?.trim()) {
      throw new BadRequestException('Notes are required for this deactivation reason');
    }

    const { rows } = await this.db.query(
      `UPDATE users
         SET status = $1,
             is_active = false,
             deactivation_reason_id = $2,
             deactivation_notes = $3,
             deactivated_by = $4,
             deactivated_at = now(),
             reactivated_by = NULL,
             reactivated_at = NULL,
             updated_at = now()
       WHERE id = $5 AND tenant_id = $6
       RETURNING id, status, deactivation_reason_id, deactivated_at`,
      [reason.maps_to_status, reasonId, notes || null, actor.sub, id, tenantId],
    );

    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [id],
    );

    await this.db.query(
      `INSERT INTO user_status_history (tenant_id, user_id, previous_status, new_status, reason_id, notes, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, id, target.status, reason.maps_to_status, reasonId, notes || null, actor.sub],
    );

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'user_deactivated',
      oldValues: { status: target.status, is_active: target.is_active },
      newValues: { status: reason.maps_to_status, reason: reason.label, notes: notes || null },
      ipAddress: ip,
      userAgent,
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'deactivation_reason_selected',
      newValues: { reasonId, reasonCode: reason.code, reasonLabel: reason.label },
      ipAddress: ip,
      userAgent,
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'account_status_changed',
      oldValues: { status: target.status },
      newValues: { status: reason.maps_to_status },
      ipAddress: ip,
      userAgent,
    });

    return rows[0];
  }

  async reactivate(
    id: string,
    tenantId: string,
    actor: { sub: string; isSuperAdmin: boolean; userType: string },
    notes: string | undefined,
    ip?: string,
    userAgent?: string,
  ) {
    const target = await this.findOne(id, tenantId);

    const { rows } = await this.db.query(
      `UPDATE users
         SET status = 'active',
             is_active = true,
             reactivated_by = $1,
             reactivated_at = now(),
             updated_at = now()
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, status`,
      [actor.sub, id, tenantId],
    );

    await this.db.query(
      `INSERT INTO user_status_history (tenant_id, user_id, previous_status, new_status, reason_id, notes, changed_by)
       VALUES ($1, $2, $3, 'active', NULL, $4, $5)`,
      [tenantId, id, target.status, notes || null, actor.sub],
    );

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'user_reactivated',
      oldValues: { status: target.status },
      newValues: { status: 'active' },
      ipAddress: ip,
      userAgent,
    });

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: id,
      action: 'account_status_changed',
      oldValues: { status: target.status },
      newValues: { status: 'active' },
      ipAddress: ip,
      userAgent,
    });

    return rows[0];
  }

  async getStatusHistory(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    const { rows } = await this.db.query(
      `SELECT h.id, h.previous_status, h.new_status, h.notes, h.changed_at,
              r.label AS reason_label, r.category AS reason_category,
              CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, '')) AS changed_by_name,
              cu.email AS changed_by_email
       FROM user_status_history h
       LEFT JOIN deactivation_reasons r ON r.id = h.reason_id
       LEFT JOIN users cu ON cu.id = h.changed_by
       LEFT JOIN employees e ON e.id = cu.employee_id
       WHERE h.user_id = $1 AND h.tenant_id = $2
       ORDER BY h.changed_at DESC`,
      [id, tenantId],
    );

    return rows;
  }
}
