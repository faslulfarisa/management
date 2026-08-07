import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause, isBranchInScope } from '../../../shared/scope.util';
import { EMPLOYEE_STATUSES } from '../../../shared/employee-status.constants';
import { mapAttendanceStatus } from '../../../shared/attendance-status.util';
import { attendanceFilterSql } from '../../../shared/attendance-filter.util';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { DependencyCheckService } from '../../platform/services/dependency-check.service';
import { BreakSessionService } from './break-session.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeeService {
  constructor(
    private db: DatabaseService,
    private auditLogService: AuditLogService,
    private dependencyCheckService: DependencyCheckService,
    private breakSessionService: BreakSessionService,
  ) {}

  async findManagerCandidates(tenantId: string, filters: any) {
    const { search, branch_id, limit = 50 } = filters;

    const baseSelect = `
      SELECT DISTINCT e.id, e.first_name, e.last_name, e.employee_code,
        pos.name as position_name,
        d.name  as department_name,
        b.name  as branch_name
      FROM employees e
      LEFT JOIN positions  pos ON pos.id = e.position_id
      LEFT JOIN departments d  ON d.id  = e.department_id
      LEFT JOIN branches    b  ON b.id  = e.branch_id
    `;
    const baseWhere = `WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND e.status = 'active'`;
    const baseParams: any[] = [tenantId];

    const buildQuery = (extraWhere: string, params: any[]) => {
      let idx = params.length + 1;
      let q = `${baseSelect} ${baseWhere} ${extraWhere}`;
      if (branch_id) { q += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
      q += ` ORDER BY e.first_name ASC, e.last_name ASC LIMIT $${idx}`;
      params.push(parseInt(limit));
      return q;
    };

    if (search) {
      // Search mode: return all matching active employees regardless of role
      const params = [...baseParams];
      let idx = params.length + 1;
      let q = `${baseSelect} ${baseWhere}`;
      if (branch_id) { q += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
      q += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
      q += ` ORDER BY e.first_name ASC, e.last_name ASC LIMIT $${idx}`;
      params.push(parseInt(limit));
      const { rows } = await this.db.query(q, params);
      return rows;
    }

    // Default: employees who have a manager-level app role OR are already someone's reporting manager
    const hierarchyFilter = `
      AND (
        EXISTS (
          SELECT 1 FROM employees sub
          WHERE sub.reporting_manager_id = e.id
            AND sub.tenant_id = e.tenant_id
            AND sub.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM users    u
          JOIN user_roles ur ON ur.user_id   = u.id  AND ur.tenant_id = u.tenant_id
          JOIN roles     r  ON r.id          = ur.role_id
                            AND r.tenant_id  = u.tenant_id
                            AND r.deleted_at IS NULL
          WHERE u.employee_id = e.id
            AND u.tenant_id   = e.tenant_id
            AND u.deleted_at  IS NULL
            AND r.name IN ('hr', 'manager', 'admin', 'finance')
        )
      )
    `;

    const hierarchyParams = [...baseParams];
    const hierarchyQuery = buildQuery(hierarchyFilter, hierarchyParams);
    const { rows: hierarchyRows } = await this.db.query(hierarchyQuery, hierarchyParams);

    // If the org has manager-role employees, return them; otherwise fall back to all active employees
    if (hierarchyRows.length > 0) return hierarchyRows;

    const allParams = [...baseParams];
    const allQuery = buildQuery('', allParams);
    const { rows: allRows } = await this.db.query(allQuery, allParams);
    return allRows;
  }

  async findAll(tenantId: string, filters: any) {
    const { page = 1, limit = 20, department_id, property_id, branch_id, status, search, attendance, accessScope = GLOBAL_ACCESS_SCOPE as AccessScope } = filters;
    const attendanceClause = attendanceFilterSql(attendance);
    let query = `SELECT e.*, d.name as department_name, des.name as designation_name,
      p.name as property_name, et.name as employment_type_name,
      rm.first_name || ' ' || rm.last_name as manager_name,
      pos.name as position_name,
      b.name as branch_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN designations des ON e.designation_id = des.id
      LEFT JOIN properties p ON e.property_id = p.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
      LEFT JOIN positions pos ON e.position_id = pos.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.tenant_id = $1 AND e.deleted_at IS NULL`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (department_id) { query += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (property_id) { query += ` AND e.property_id = $${idx++}`; params.push(property_id); }
    if (branch_id) { query += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (status) { query += ` AND e.status = $${idx++}`; params.push(status); }
    if (search) { query += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (attendanceClause) query += ` AND ${attendanceClause}`;
    {
      const scopeClause = branchScopeClause(accessScope, 'e.branch_id', idx);
      query += ` AND ${scopeClause.clause}`; params.push(...scopeClause.params); idx += scopeClause.params.length;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY e.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    let countQuery = 'SELECT COUNT(*) FROM employees e WHERE e.tenant_id = $1 AND e.deleted_at IS NULL';
    const countParams: any[] = [tenantId];
    let cIdx = 2;
    if (department_id) { countQuery += ` AND e.department_id = $${cIdx++}`; countParams.push(department_id); }
    if (property_id) { countQuery += ` AND e.property_id = $${cIdx++}`; countParams.push(property_id); }
    if (branch_id) { countQuery += ` AND e.branch_id = $${cIdx++}`; countParams.push(branch_id); }
    if (status) { countQuery += ` AND e.status = $${cIdx++}`; countParams.push(status); }
    if (search) { countQuery += ` AND (e.first_name ILIKE $${cIdx} OR e.last_name ILIKE $${cIdx} OR e.employee_code ILIKE $${cIdx})`; countParams.push(`%${search}%`); cIdx++; }
    if (attendanceClause) countQuery += ` AND ${attendanceClause}`;
    {
      const scopeClause = branchScopeClause(accessScope, 'branch_id', cIdx);
      countQuery += ` AND ${scopeClause.clause}`; countParams.push(...scopeClause.params); cIdx += scopeClause.params.length;
    }

    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(query, params),
      this.db.query(countQuery, countParams),
    ]);
    const total = parseInt(countRows[0].count);

    return { data: rows, meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) } };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT e.*, d.name as department_name, des.name as designation_name,
        p.name as property_name, et.name as employment_type_name,
        rm.first_name || ' ' || rm.last_name as manager_name,
        pos.name as position_name,
        b.name as branch_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        LEFT JOIN properties p ON e.property_id = p.id
        LEFT JOIN employment_types et ON e.employment_type_id = et.id
        LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
        LEFT JOIN positions pos ON e.position_id = pos.id
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE e.id = $1 AND e.tenant_id = $2 AND e.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found');
    return rows[0];
  }

  async findMeByEmail(email: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT e.*, d.name as department_name, des.name as designation_name,
        p.name as property_name, et.name as employment_type_name,
        rm.first_name || ' ' || rm.last_name as manager_name,
        pos.name as position_name,
        b.name as branch_name
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        LEFT JOIN properties p ON e.property_id = p.id
        LEFT JOIN employment_types et ON e.employment_type_id = et.id
        LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
        LEFT JOIN positions pos ON e.position_id = pos.id
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE e.personal_email = $1 AND e.tenant_id = $2 AND e.deleted_at IS NULL`,
      [email, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee profile not found');
    return rows[0];
  }

  async generateEmployeeCode(tenantId: string): Promise<string> {
    const { rows: tenantRows } = await this.db.query(
      'SELECT emp_code_prefix, emp_code_digits FROM tenants WHERE id = $1',
      [tenantId],
    );
    const prefix = tenantRows[0]?.emp_code_prefix || 'EMP';
    const digits = tenantRows[0]?.emp_code_digits || 4;

    const { rows } = await this.db.query(
      `SELECT employee_code FROM employees
       WHERE tenant_id = $1 AND employee_code LIKE $2 AND deleted_at IS NULL
       ORDER BY CAST(NULLIF(REGEXP_REPLACE(employee_code, '^[A-Za-z]+', ''), '') AS BIGINT) DESC NULLS LAST
       LIMIT 1`,
      [tenantId, `${prefix}%`],
    );

    const lastNum = rows[0]
      ? (parseInt(rows[0].employee_code.replace(/^[A-Za-z]+/, '')) || 0)
      : 0;

    let next = lastNum + 1;
    while (true) {
      const code = `${prefix}${String(next).padStart(digits, '0')}`;
      const { rows: conflict } = await this.db.query(
        'SELECT 1 FROM employees WHERE tenant_id = $1 AND employee_code = $2 AND deleted_at IS NULL',
        [tenantId, code],
      );
      if (!conflict.length) return code;
      next++;
    }
  }

  async create(tenantId: string, createdById: string, data: any) {
    const employeeCode = data.employee_code || await this.generateEmployeeCode(tenantId);

    const existing = await this.db.query(
      'SELECT 1 FROM employees WHERE tenant_id = $1 AND employee_code = $2 AND deleted_at IS NULL',
      [tenantId, employeeCode],
    );
    if (existing.rows.length) throw new BadRequestException('Employee code already exists');

    if (data.biometric_employee_id) {
      const bioCheck = await this.db.query(
        'SELECT 1 FROM employees WHERE tenant_id = $1 AND biometric_employee_id = $2 AND deleted_at IS NULL',
        [tenantId, data.biometric_employee_id],
      );
      if (bioCheck.rows.length) throw new BadRequestException('Biometric employee ID already assigned to another employee');
    }

    if (data.reporting_manager_id) {
      const { rows: mgr } = await this.db.query(
        'SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [data.reporting_manager_id, tenantId],
      );
      if (!mgr.length) throw new BadRequestException('Selected reporting manager does not belong to this organization');
    }

    const presentAddr = data.present_address
      ? (typeof data.present_address === 'string' ? { text: data.present_address } : data.present_address)
      : null;
    const permanentAddr = data.permanent_address
      ? (typeof data.permanent_address === 'string' ? { text: data.permanent_address } : data.permanent_address)
      : null;

    const loc = this.deriveLegacyLocation(data);

    const { rows } = await this.db.query(
      `INSERT INTO employees (
          tenant_id, employee_code, status, first_name, last_name, middle_name, nickname,
          date_of_birth, gender, marital_status, blood_group, nationality, religion, photo_url,
          personal_email, personal_phone, alternate_phone, office_email, office_telephone,
          present_address, permanent_address, emergency_contact,
          city, state, country, pincode,
          property_id, department_id, designation_id, employment_type_id, cost_center_id,
          reporting_manager_id, position_id, branch_id,
          date_of_joining, probation_end_date, confirmation_date,
          bank_name, bank_account_number, ifsc_code, account_type, upi_id, salary_payment_method,
          pf_number, uan_number, esic_number, pan_number, aadhaar_number,
          passport_number, driving_license_number, voter_id, employee_card_number,
          biometric_employee_id, device_code, card_number,
          created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,$19,
          $20,$21,$22,
          $23,$24,$25,$26,
          $27,$28,$29,$30,$31,
          $32,$33,$34,
          $35,$36,$37,
          $38,$39,$40,$41,$42,$43,
          $44,$45,$46,$47,$48,
          $49,$50,$51,$52,
          $53,$54,$55,
          $56
        ) RETURNING *`,
      [
        tenantId, employeeCode, data.status || 'active',
        data.first_name, data.last_name, data.middle_name || null, data.nickname || null,
        data.date_of_birth || null, data.gender || null, data.marital_status || null,
        data.blood_group || null, data.nationality || 'Indian', data.religion || null, data.photo_url || null,
        data.personal_email || null, data.personal_phone || null,
        data.alternate_phone || null, data.office_email || null, data.office_telephone || null,
        presentAddr, permanentAddr, data.emergency_contact || null,
        loc.city, loc.state, loc.country, loc.pincode,
        data.property_id || null, data.department_id || null, data.designation_id || null,
        data.employment_type_id || null, data.cost_center_id || null,
        data.reporting_manager_id || null, data.position_id || null, data.branch_id || null,
        data.date_of_joining, data.probation_end_date || null, data.confirmation_date || null,
        data.bank_name || null, data.bank_account_number || null, data.ifsc_code || null,
        data.account_type || null, data.upi_id || null, data.salary_payment_method || null,
        data.pf_number || null, data.uan_number || null, data.esic_number || null,
        data.pan_number || null, data.aadhaar_number || null,
        data.passport_number || null, data.driving_license_number || null,
        data.voter_id || null, data.employee_card_number || null,
        data.biometric_employee_id || null, data.device_code || null, data.card_number || null,
        createdById,
      ],
    );

    const employee = rows[0];

    await this.db.query(
      'INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, new_values, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [tenantId, employee.id, 'joining', data.date_of_joining, JSON.stringify({ status: employee.status, date_of_joining: data.date_of_joining }), createdById],
    );

    // Optionally create application user account
    if (data.enable_login && data.login_email && data.login_password) {
      const userEmail = data.login_email.trim().toLowerCase();

      // Check uniqueness within this tenant (users.UNIQUE(tenant_id, email))
      const emailCheck = await this.db.query(
        'SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL',
        [tenantId, userEmail],
      );

      if (emailCheck.rows.length) {
        // Email already exists in this tenant — link the existing user
        const userId = emailCheck.rows[0].id;
        await this.db.query('UPDATE employees SET user_id = $1 WHERE id = $2', [userId, employee.id]);
        await this.db.query(
          'INSERT INTO user_tenants (user_id, tenant_id, is_org_admin) VALUES ($1,$2,false) ON CONFLICT DO NOTHING',
          [userId, tenantId],
        );
      } else {
        const passwordHash = await bcrypt.hash(data.login_password, 10);

        const { rows: newUserRows } = await this.db.query(
          `INSERT INTO users (tenant_id, email, phone, password_hash, is_active, employee_id)
            VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
          [tenantId, userEmail, data.personal_phone || null, passwordHash, employee.id],
        );
        const newUserId = newUserRows[0].id;

        await this.db.query(
          'INSERT INTO user_tenants (user_id, tenant_id, is_org_admin) VALUES ($1,$2,false)',
          [newUserId, tenantId],
        );

        if (data.login_role) {
          const { rows: roleRows } = await this.db.query(
            'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1',
            [tenantId, data.login_role],
          );
          if (roleRows.length) {
            await this.db.query(
              'INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
              [newUserId, roleRows[0].id, tenantId],
            );
          }
        }

        await this.db.query('UPDATE employees SET user_id = $1 WHERE id = $2', [newUserId, employee.id]);
        employee.user_id = newUserId;
      }
    }

    return employee;
  }

  async addDocument(employeeId: string, tenantId: string, createdById: string, data: any) {
    await this.findOne(employeeId, tenantId);
    const fileUrl = data.file_data || data.file_url || '';
    const { rows } = await this.db.query(
      `INSERT INTO employee_documents (tenant_id, employee_id, document_type, name, file_url, file_size_bytes, mime_type, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, employeeId, data.document_type, data.name, fileUrl, data.file_size_bytes || null, data.mime_type || null, createdById],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any, changedById?: string) {
    const existing = await this.findOne(id, tenantId);

    if (data.reporting_manager_id) {
      const { rows: mgr } = await this.db.query(
        'SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [data.reporting_manager_id, tenantId],
      );
      if (!mgr.length) throw new BadRequestException('Selected reporting manager does not belong to this organization');
    }

    let employeeCodeParam: string | null = null;
    if (data.employee_code && data.employee_code !== existing.employee_code) {
      if (existing.status === 'confirmed') {
        throw new BadRequestException('Employee code cannot be changed once the employee is confirmed');
      }
      const { rows: dup } = await this.db.query(
        'SELECT 1 FROM employees WHERE tenant_id = $1 AND employee_code = $2 AND deleted_at IS NULL AND id != $3',
        [tenantId, data.employee_code, id],
      );
      if (dup.length) throw new BadRequestException('Employee code already exists');
      employeeCodeParam = data.employee_code;
    }

    const loc = this.deriveLegacyLocation(data);

    const { rows } = await this.db.query(
      `UPDATE employees SET
        employee_code = COALESCE($37, employee_code),
        first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name),
        middle_name = COALESCE($5, middle_name), date_of_birth = COALESCE($6, date_of_birth),
        gender = COALESCE($7, gender), marital_status = COALESCE($8, marital_status),
        blood_group = COALESCE($9, blood_group), nationality = COALESCE($10, nationality),
        photo_url = COALESCE($11, photo_url), personal_email = COALESCE($12, personal_email),
        personal_phone = COALESCE($13, personal_phone), present_address = COALESCE($14, present_address),
        permanent_address = COALESCE($15, permanent_address), emergency_contact = COALESCE($16, emergency_contact),
        property_id = COALESCE($17, property_id), department_id = COALESCE($18, department_id),
        designation_id = COALESCE($19, designation_id), employment_type_id = COALESCE($20, employment_type_id),
        cost_center_id = COALESCE($21, cost_center_id), reporting_manager_id = COALESCE($22, reporting_manager_id),
        position_id = COALESCE($23, position_id),
        date_of_joining = COALESCE($24, date_of_joining), probation_end_date = COALESCE($25, probation_end_date),
        confirmation_date = COALESCE($26, confirmation_date), bank_name = COALESCE($27, bank_name),
        bank_account_number = COALESCE($28, bank_account_number), ifsc_code = COALESCE($29, ifsc_code),
        account_type = COALESCE($30, account_type), pf_number = COALESCE($31, pf_number),
        uan_number = COALESCE($32, uan_number), esic_number = COALESCE($33, esic_number),
        pan_number = COALESCE($34, pan_number), aadhaar_number = COALESCE($35, aadhaar_number),
        status = COALESCE($36, status),
        branch_id = COALESCE($38, branch_id),
        city = COALESCE($39, city), state = COALESCE($40, state),
        country = COALESCE($41, country), pincode = COALESCE($42, pincode),
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.first_name, data.last_name, data.middle_name, data.date_of_birth,
        data.gender, data.marital_status, data.blood_group, data.nationality, data.photo_url,
        data.personal_email, data.personal_phone, data.present_address, data.permanent_address, data.emergency_contact,
        data.property_id, data.department_id, data.designation_id, data.employment_type_id, data.cost_center_id,
        data.reporting_manager_id, data.position_id || null, data.date_of_joining, data.probation_end_date, data.confirmation_date,
        data.bank_name, data.bank_account_number, data.ifsc_code, data.account_type,
        data.pf_number, data.uan_number, data.esic_number, data.pan_number, data.aadhaar_number, data.status,
        employeeCodeParam, data.branch_id || null, loc.city, loc.state, loc.country, loc.pincode],
    );

    if (employeeCodeParam) {
      await this.db.query(
        'INSERT INTO employee_code_history (tenant_id, employee_id, previous_code, new_code, changed_by) VALUES ($1,$2,$3,$4,$5)',
        [tenantId, id, existing.employee_code, employeeCodeParam, changedById || null],
      );
    }

    const updated = rows[0];
    if (data.branch_id && updated.branch_id) {
      await this.backfillPendingLeaveApprovalBranches(tenantId, id, updated.branch_id);
    }

    return updated;
  }

  private async backfillPendingLeaveApprovalBranches(tenantId: string, employeeId: string, branchId: string) {
    await this.db.query(
      `UPDATE approval_requests ar
       SET branch_id = $3, updated_at = now()
       FROM leave_requests lr
       WHERE ar.tenant_id = $1
         AND ar.entity_table = 'leave_requests'
         AND ar.entity_id = lr.id
         AND ar.workflow_type = 'leave'
         AND ar.status IN ('pending','under_review','escalated')
         AND ar.branch_id IS NULL
         AND lr.employee_id = $2`,
      [tenantId, employeeId, branchId],
    );

    await this.db.query(
      `UPDATE approval_requests ar
       SET branch_id = $3, updated_at = now()
       FROM leave_encashment_requests ler
       WHERE ar.tenant_id = $1
         AND ar.entity_table = 'leave_encashment_requests'
         AND ar.entity_id = ler.id
         AND ar.workflow_type = 'leave_encashment'
         AND ar.status IN ('pending','under_review','escalated')
         AND ar.branch_id IS NULL
         AND ler.employee_id = $2`,
      [tenantId, employeeId, branchId],
    );
  }

  /** Derives the flat city/state/country/pincode columns from explicit data fields, falling back to the structured present_address JSON. */
  private deriveLegacyLocation(data: any): { city: string | null; state: string | null; country: string | null; pincode: string | null } {
    const addr = data.present_address && typeof data.present_address === 'object' ? data.present_address : {};
    return {
      city: data.city ?? addr.city ?? null,
      state: data.state ?? addr.state ?? null,
      country: data.country ?? addr.country ?? null,
      pincode: data.pincode ?? addr.pincode ?? null,
    };
  }

  async getEmployeeCodeHistory(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      `SELECT h.*, ce.first_name as changed_by_first_name, ce.last_name as changed_by_last_name
       FROM employee_code_history h
       LEFT JOIN users u ON u.id = h.changed_by
       LEFT JOIN employees ce ON ce.id = u.employee_id
       WHERE h.employee_id = $1 AND h.tenant_id = $2
       ORDER BY h.changed_at DESC`,
      [id, tenantId],
    );
    return rows;
  }

  async remove(id: string, tenantId: string, actor: { sub: string }) {
    await this.assertOrgAdminCanDelete(tenantId, actor);
    await this.findOne(id, tenantId);
    await this.db.query('UPDATE employees SET deleted_at = now(), status = $3 WHERE id = $1 AND tenant_id = $2', [id, tenantId, 'inactive']);
    return { success: true };
  }

  async getLifecycle(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM employee_lifecycle_events WHERE employee_id = $1 AND tenant_id = $2 ORDER BY effective_date DESC',
      [id, tenantId],
    );
    return rows;
  }

  async transfer(id: string, tenantId: string, data: { property_id?: string; department_id?: string; effective_date: string; remarks?: string }) {
    const existing = await this.findOne(id, tenantId);
    const oldValues = { property_id: existing.property_id, department_id: existing.department_id };

    const { rows } = await this.db.query(
      'UPDATE employees SET property_id = COALESCE($3, property_id), department_id = COALESCE($4, department_id), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.property_id, data.department_id],
    );

    await this.db.query(
      'INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, old_values, new_values, remarks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [tenantId, id, 'transfer', data.effective_date, JSON.stringify(oldValues), JSON.stringify({ property_id: data.property_id, department_id: data.department_id }), data.remarks, null],
    );

    return rows[0];
  }

  async promote(id: string, tenantId: string, data: { designation_id: string; effective_date: string; remarks?: string }) {
    const existing = await this.findOne(id, tenantId);

    const { rows } = await this.db.query(
      'UPDATE employees SET designation_id = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.designation_id],
    );

    await this.db.query(
      'INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, old_values, new_values, remarks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [tenantId, id, 'promotion', data.effective_date, JSON.stringify({ designation_id: existing.designation_id }), JSON.stringify({ designation_id: data.designation_id }), data.remarks, null],
    );

    return rows[0];
  }

  async confirm(id: string, tenantId: string, data: { confirmation_date: string; remarks?: string }) {
    const { rows } = await this.db.query(
      'UPDATE employees SET status = $3, confirmation_date = $4, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, 'confirmed', data.confirmation_date],
    );

    await this.db.query(
      'INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, new_values, remarks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [tenantId, id, 'confirmation', data.confirmation_date, JSON.stringify({ status: 'confirmed', confirmation_date: data.confirmation_date }), data.remarks, null],
    );

    return rows[0];
  }

  async getCount(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT status, COUNT(*) as count FROM employees WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY status`,
      [tenantId],
    );
    return rows;
  }

  async getDocuments(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'SELECT * FROM employee_documents WHERE employee_id = $1 AND tenant_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
      [id, tenantId],
    );
    return rows;
  }

  async updateStatus(id: string, tenantId: string, newStatus: string, changedById: string) {
    if (!(EMPLOYEE_STATUSES as readonly string[]).includes(newStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${EMPLOYEE_STATUSES.join(', ')}`);
    }

    const existing = await this.findOne(id, tenantId);
    const oldStatus = existing.status;

    const { rows } = await this.db.query(
      'UPDATE employees SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, newStatus],
    );

    await this.db.query(
      `INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, old_values, new_values, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6)`,
      [tenantId, id, 'status_change', JSON.stringify({ status: oldStatus }), JSON.stringify({ status: newStatus }), changedById],
    );

    await this.auditLogService.log({
      tenantId,
      userId: changedById,
      entityType: 'employee',
      entityId: id,
      action: 'employee_status_changed',
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
    });

    return rows[0];
  }

  async getAttendanceStatus(id: string, tenantId: string, requestedById: string, accessScope: AccessScope) {
    const { rows } = await this.db.query(
      'SELECT id, branch_id, first_name, last_name FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found');
    const employee = rows[0];

    if (!isBranchInScope(accessScope, employee.branch_id)) {
      throw new ForbiddenException('Employee is outside your branch scope');
    }

    const record = await this.breakSessionService.getTodayStatus(tenantId, id);
    const result = mapAttendanceStatus(record);

    await this.auditLogService.log({
      tenantId,
      userId: requestedById,
      entityType: 'employee',
      entityId: id,
      action: 'employee_attendance_status_checked',
      newValues: { status: result.code, checkedAt: new Date().toISOString() },
    });

    return result;
  }

  async permanentDelete(
    id: string,
    tenantId: string,
    deleteCategories: string[],
    confirm: string,
    adminUser: { sub: string },
  ) {
    if (confirm !== 'DELETE') {
      throw new BadRequestException('You must type DELETE to confirm this action.');
    }

    const { rows } = await this.db.query(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found');
    const employee = rows[0];

    if (employee.status !== 'inactive') {
      throw new BadRequestException('Only inactive employees can be permanently removed from the system.');
    }

    await this.assertOrgAdminCanDelete(tenantId, adminUser);

    const report = await this.dependencyCheckService.checkEmployee(id, tenantId);
    await this.auditLogService.log({
      tenantId,
      userId: adminUser.sub,
      entityType: 'employee',
      entityId: id,
      action: 'employee_dependency_reviewed',
      newValues: { report },
    });

    const DELETABLE_CATEGORIES = ['documents', 'notifications', 'shifts'];
    const deletedModules: string[] = [];
    for (const category of deleteCategories ?? []) {
      if (!DELETABLE_CATEGORIES.includes(category)) continue;
      if (category === 'documents') {
        await this.db.query(
          'UPDATE employee_documents SET deleted_at = now() WHERE employee_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
          [id, tenantId],
        );
      } else if (category === 'notifications') {
        await this.db.query(
          'DELETE FROM notifications WHERE tenant_id = $1 AND user_id = $2',
          [tenantId, employee.user_id],
        );
      } else if (category === 'shifts') {
        await this.db.query(
          'DELETE FROM shift_assignments WHERE tenant_id = $1 AND employee_id = $2',
          [tenantId, id],
        );
      }
      deletedModules.push(category);
    }

    const retainedModules = report.dependencies
      .map((d) => d.module)
      .filter((m) => !deletedModules.includes(m));

    await this.db.query(
      `UPDATE employees SET
         first_name = 'Deleted', last_name = 'Employee', middle_name = NULL, nickname = NULL,
         personal_email = NULL, personal_phone = NULL, alternate_phone = NULL,
         office_email = NULL, office_telephone = NULL,
         present_address = NULL, permanent_address = NULL, emergency_contact = NULL, photo_url = NULL,
         bank_name = NULL, bank_account_number = NULL, ifsc_code = NULL, upi_id = NULL,
         pan_number = NULL, aadhaar_number = NULL, passport_number = NULL,
         driving_license_number = NULL, voter_id = NULL,
         is_anonymized = true, anonymized_at = now(), deleted_at = COALESCE(deleted_at, now()), updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    await this.db.query(
      `INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, new_values, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5)`,
      [tenantId, id, 'permanent_deletion', JSON.stringify({ retainedModules, deletedModules }), adminUser.sub],
    );

    await this.auditLogService.log({
      tenantId,
      userId: adminUser.sub,
      entityType: 'employee',
      entityId: id,
      action: 'employee_deleted',
      oldValues: { status: employee.status, employee_code: employee.employee_code },
      newValues: { retainedModules, deletedModules, anonymized: true },
    });

    return { success: true, retainedModules, deletedModules };
  }

  private async assertOrgAdminCanDelete(tenantId: string, actor: { sub: string }) {
    const { rows } = await this.db.query(
      `SELECT 1 FROM user_tenants
       WHERE user_id = $1 AND tenant_id = $2
         AND (is_org_admin = true OR user_type = 'org_admin')`,
      [actor.sub, tenantId],
    );

    if (!rows.length) {
      throw new ForbiddenException('Only Organization Admin can delete employees');
    }
  }
}
