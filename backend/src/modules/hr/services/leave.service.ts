import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { assertUniqueCode, translateUniqueViolation } from '../../../shared/unique-code.validator';
import { BranchApprovalChainService } from '../../platform/services/branch-approval-chain.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';
import { HolidayPolicyTemplateService } from '../../platform/services/holiday-policy-template.service';

@Injectable()
export class LeaveService {
  constructor(
    private db: DatabaseService,
    @Inject(forwardRef(() => BranchApprovalChainService))
    private approvalChainService: BranchApprovalChainService,
    @Inject(forwardRef(() => ApprovalEngineService))
    private approvalEngine: ApprovalEngineService,
    private payrollLock: PayrollLockService,
    @Optional() private holidayPolicy?: HolidayPolicyTemplateService,
  ) {}

  // ── Leave Types ──────────────────────────────────────────────────────────────

  async getLeaveTypes(tenantId: string, employeeId?: string) {
    // Proactively check if leave types exist for this tenant, if not, seed defaults
    const { rows: countRows } = await this.db.query(
      'SELECT count(*)::int FROM leave_types WHERE tenant_id = $1 AND is_active = true',
      [tenantId],
    );
    if (countRows[0].count === 0) {
      await this.seedDefaultLeaveTypes(tenantId);
    }

    // Keep the dropdown discoverable: employees can see active leave types,
    // while request validation and balances enforce the assigned policy.
    if (employeeId) {
      const { rows: empRows } = await this.db.query(
        'SELECT gender FROM employees WHERE id = $1 AND tenant_id = $2',
        [employeeId, tenantId],
      );
      const gender: string | null = empRows[0]?.gender?.toLowerCase() ?? null;

      const { rows: allTypes } = await this.db.query(
        `SELECT * FROM leave_types
          WHERE tenant_id = $1
            AND is_active = true
            AND (gender_eligibility = 'all'
                 OR ($2::text IS NOT NULL AND gender_eligibility = $2))
          ORDER BY name`,
        [tenantId, gender],
      );

      return allTypes;
    }

    const { rows } = await this.db.query(
      'SELECT * FROM leave_types WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [tenantId],
    );
    return rows;
  }

  private async seedDefaultLeaveTypes(tenantId: string) {
    const defaults = [
      { name: 'Casual Leave', code: 'CL', max: 12 },
      { name: 'Sick Leave', code: 'SL', max: 12 },
      { name: 'Privilege Leave', code: 'PL', max: 18 },
      { name: 'Maternity Leave', code: 'ML', max: 90 },
      { name: 'Compensatory Off', code: 'CO', max: 5 },
    ];
    for (const d of defaults) {
      await this.db.query(
        `INSERT INTO leave_types (tenant_id, name, code, paid, max_days_per_year, gender_eligibility)
         VALUES ($1, $2, $3, true, $4, 'all')`,
        [tenantId, d.name, d.code, d.max],
      );
    }
  }

  // ── Leave Balances ────────────────────────────────────────────────────────────

  async getBalances(tenantId: string, employeeId?: string) {
    if (employeeId) {
      const policy = await this.resolveLeavePolicy(tenantId, employeeId);
      if (!policy || Object.keys(policy).length === 0) {
        return [];
      }
      await this.syncEmployeeBalances(tenantId, employeeId, policy);
    } else {
      const { rows: emps } = await this.db.query(
        `SELECT id FROM employees WHERE tenant_id = $1 AND status = 'active' AND deleted_at IS NULL`,
        [tenantId]
      );
      for (const emp of emps) {
        await this.syncEmployeeBalances(tenantId, emp.id);
      }
    }

    let query = `SELECT lb.*, lt.name as leave_type_name, lt.code as leave_type_code,
      lt.gender_eligibility,
      e.first_name, e.last_name
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      JOIN employees e ON lb.employee_id = e.id
      WHERE lb.tenant_id = $1 AND lb.allocated > 0`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employeeId) { query += ` AND lb.employee_id = $${idx++}`; params.push(employeeId); }
    query += ' ORDER BY e.first_name, lt.name';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  private async syncEmployeeBalances(tenantId: string, employeeId: string, policyConfig?: any) {
    const policy = policyConfig ?? await this.resolveLeavePolicy(tenantId, employeeId);
    if (!policy || Object.keys(policy).length === 0) {
      return; // No template policy resolved, skip sync
    }

    // Fetch all active leave types
    const { rows: leaveTypes } = await this.db.query(
      'SELECT * FROM leave_types WHERE tenant_id = $1 AND is_active = true',
      [tenantId],
    );

    const year = new Date().getFullYear();

    for (const lt of leaveTypes) {
      const allocated = this.getLimitFromPolicy(policy, lt.code, lt.name);

      // Upsert the balance for this leave type, preserving the used days
      await this.db.query(
        `INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, year, allocated, used, available)
         VALUES ($1, $2, $3, $4, $5, 0, $5)
         ON CONFLICT (tenant_id, employee_id, leave_type_id, year)
         DO UPDATE SET
           allocated = $5,
           available = $5 - leave_balances.used,
           updated_at = now()`,
        [tenantId, employeeId, lt.id, year, allocated],
      );
    }
  }

  private getLimitFromPolicy(config: any, code: string, name: string): number {
    const c = (code ?? '').toUpperCase();
    const n = (name ?? '').toLowerCase();

    if (c === 'CL' || n.includes('casual')) {
      return config.casual_leave_days || 0;
    }
    if (c === 'SL' || n.includes('sick')) {
      return config.sick_leave_days || 0;
    }
    if (c === 'PL' || n.includes('privilege')) {
      return config.privilege_leave_days || 0;
    }
    if (c === 'ML' || n.includes('maternity')) {
      return config.maternity_leave_days || 0;
    }
    if (c === 'CO' || n.includes('compensatory')) {
      return config.compensatory_off_enabled ? (config.compensatory_off_days || 5) : 0;
    }
    if (c === 'PATL' || n.includes('paternity')) {
      return config.paternity_leave_days || 0;
    }
    return 0;
  }




  // ── Leave Requests ────────────────────────────────────────────────────────────

  async getRequests(tenantId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, status } = filters;
    let query = `SELECT lr.*, lt.name as leave_type_name, e.first_name, e.last_name, e.employee_code
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      WHERE lr.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND lr.employee_id = $${idx++}`; params.push(employee_id); }
    if (status) { query += ` AND lr.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY lr.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createRequest(tenantId: string, employeeId: string, data: any) {
    await this.payrollLock.assertPeriodUnlocked(tenantId, employeeId, data.start_date, data.end_date);

    let days = this.calculateDays(data.start_date, data.end_date);

    if (data.duration === 'half_day') {
      if (days !== 1) {
        throw new BadRequestException('Half day leave can only be requested for a single day.');
      }
      days = 0.5;
    }

    // Sync employee balances with the assigned policy template first
    await this.syncEmployeeBalances(tenantId, employeeId);

    // Centralized validation against the policy
    await this.validateLeaveAgainstPolicy(tenantId, employeeId, data.leave_type_id, days, 0, data.start_date, data.end_date);

    // BUG FIX: resolve submitter user ID and branch BEFORE the INSERT so
    // that a failed lookup never leaves an orphaned leave_requests row
    // stuck in 'pending' with no corresponding approval_requests entry.
    const { rows: empRows } = await this.db.query(
      'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );
    const branchId = empRows[0]?.branch_id ?? null;
    if (!branchId) {
      throw new BadRequestException('Employee must be assigned to a branch before submitting a leave request for approval');
    }
    const submittedByUserId = await this.resolveSubmitterUserId(tenantId, employeeId);

    const { rows } = await this.db.query(
      `INSERT INTO leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, employeeId, data.leave_type_id, data.start_date, data.end_date, days, data.reason],
    );

    const leaveRequest = rows[0];

    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'leave',
      entityId: leaveRequest.id,
      entityTable: 'leave_requests',
      submittedBy: submittedByUserId,
      branchId,
      title: `Leave request: ${data.start_date} – ${data.end_date} (${days} day${days !== 1 ? 's' : ''})`,
      description: data.reason,
      priority: data.priority,
      metadata: { leave_type_id: data.leave_type_id, days, employee_id: employeeId },
    });

    return leaveRequest;
  }

  /**
   * approval_requests.submitted_by has an FK to users(id), but callers only
   * have the employee_id on hand — resolve the linked user account here so
   * submission doesn't fail with a foreign key violation.
   */
  private async resolveSubmitterUserId(tenantId: string, employeeId: string): Promise<string> {
    const { rows } = await this.db.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 LIMIT 1',
      [tenantId, employeeId],
    );
    if (!rows.length) {
      throw new BadRequestException('No user account is linked to this employee; cannot submit for approval');
    }
    return rows[0].id;
  }

  async approveRequest(id: string, tenantId: string, approvedBy: string, reason: string) {
    const { rows: reqRows } = await this.db.query(
      'SELECT * FROM leave_requests WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (!reqRows.length) throw new NotFoundException('Leave request not found');
    const req = reqRows[0];

    if (req.leave_type_id) {
      // Re-validate against policy to prevent race conditions during approval
      await this.validateLeaveAgainstPolicy(tenantId, req.employee_id, req.leave_type_id, req.days, 0, req.start_date, req.end_date);
    }

    const result = await this.approvalEngine.approveByEntity(
      id, 'leave_requests', tenantId, approvedBy, reason,
    );

    if (result.fullyApproved && req.leave_type_id) {
      await this.deductLeaveBalance(tenantId, req.employee_id, req.leave_type_id, req.days, new Date().getFullYear());
    }

    return result;
  }

  async rejectRequest(id: string, tenantId: string, rejecterId: string, reason: string) {
    return this.approvalEngine.rejectByEntity(id, 'leave_requests', tenantId, rejecterId, reason);
  }

  // ── Leave Encashment ──────────────────────────────────────────────────────────

  async getEncashmentRequests(tenantId: string, filters: { employee_id?: string; status?: string; year?: number }) {
    let query = `
      SELECT ler.*, lt.name AS leave_type_name, lt.code AS leave_type_code,
             e.first_name, e.last_name, e.employee_code
      FROM leave_encashment_requests ler
      JOIN leave_types lt ON ler.leave_type_id = lt.id
      JOIN employees e ON ler.employee_id = e.id
      WHERE ler.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters.employee_id) { query += ` AND ler.employee_id = $${idx++}`; params.push(filters.employee_id); }
    if (filters.status) { query += ` AND ler.status = $${idx++}`; params.push(filters.status); }
    if (filters.year) { query += ` AND ler.year = $${idx++}`; params.push(filters.year); }
    query += ' ORDER BY ler.created_at DESC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  /** Cascading leave_policy resolution: employee -> designation -> department -> property. */
  private async resolveLeavePolicy(tenantId: string, employeeId: string): Promise<any> {
    const { rows: tplRows } = await this.db.query(
      `SELECT t.config FROM template_assignments ta
       JOIN templates t ON ta.template_id = t.id
       WHERE ta.tenant_id = $1
         AND ta.template_type = 'leave_policy'
         AND ta.deleted_at IS NULL AND t.deleted_at IS NULL
         AND (ta.effective_from IS NULL OR ta.effective_from <= now())
         AND (ta.effective_to IS NULL OR ta.effective_to >= now())
         AND (
           (ta.scope_type = 'employee' AND ta.scope_id = $2)
           OR (ta.scope_type = 'designation' AND ta.scope_id IN (SELECT designation_id FROM employees WHERE id = $2 AND tenant_id = $1))
           OR (ta.scope_type = 'department' AND ta.scope_id IN (SELECT department_id FROM employees WHERE id = $2 AND tenant_id = $1))
           OR (ta.scope_type = 'property' AND ta.scope_id IN (SELECT property_id FROM employees WHERE id = $2 AND tenant_id = $1))
         )
       ORDER BY ta.priority DESC LIMIT 1`,
      [tenantId, employeeId],
    );

    if (tplRows.length) return tplRows[0].config ?? null;
    return null;
  }

  private async dailyRateForEmployee(tenantId: string, employeeId: string, basis: 'basic' | 'gross'): Promise<number> {
    const { rows: ssRows } = await this.db.query(
      `SELECT basic, hra, da, conveyance, medical, special_allowance
       FROM salary_structures
       WHERE employee_id = $1 AND tenant_id = $2
         AND (effective_to IS NULL OR effective_to >= now())
       ORDER BY effective_from DESC LIMIT 1`,
      [employeeId, tenantId],
    );
    if (!ssRows.length) return 0;
    const ss = ssRows[0];
    const monthly = basis === 'gross'
      ? [ss.basic, ss.hra, ss.da, ss.conveyance, ss.medical, ss.special_allowance]
          .reduce((sum: number, v: any) => sum + parseFloat(v ?? 0), 0)
      : parseFloat(ss.basic);
    return monthly / 26;
  }

  /**
   * Read-only preview of exit-time leave encashment for every paid leave
   * type with a remaining balance — used by FinalSettlementService.calculate()
   * and does not touch leave_balances or insert any request rows.
   */
  async getExitEncashmentPreview(tenantId: string, employeeId: string): Promise<Array<{ leave_type_id: string; leave_type_name: string; days: number; daily_rate: number; amount: number }>> {
    const policyConfig = await this.resolveLeavePolicy(tenantId, employeeId);
    if (!policyConfig?.encashment_enabled) return [];

    const basis: 'basic' | 'gross' = policyConfig.encashment_basis === 'gross' ? 'gross' : 'basic';
    const dailyRate = await this.dailyRateForEmployee(tenantId, employeeId, basis);
    if (dailyRate <= 0) return [];

    const { rows: balances } = await this.db.query(
      `SELECT lb.leave_type_id, lb.available, lt.name AS leave_type_name
       FROM leave_balances lb JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.tenant_id = $1 AND lb.employee_id = $2 AND lb.year = $3 AND lt.paid = true AND lb.available > 0`,
      [tenantId, employeeId, new Date().getFullYear()],
    );

    return balances.map((b: any) => {
      const days = parseFloat(b.available);
      return {
        leave_type_id: b.leave_type_id,
        leave_type_name: b.leave_type_name,
        days,
        daily_rate: Math.round(dailyRate * 100) / 100,
        amount: Math.round(dailyRate * days * 100) / 100,
      };
    });
  }

  /**
   * Finalizes exit-time encashment: zeroes the balances and records approved
   * leave_encashment_requests rows tied to the exit. Unlike createEncashmentRequest,
   * this is the *only* path that runs when leave_policy.encashment_timing === 'on_exit'
   * (that method explicitly rejects on_exit timing — it's reserved for this flow).
   */
  async processExitEncashment(tenantId: string, employeeId: string, exitRequestId: string, actorId: string): Promise<number> {
    const preview = await this.getExitEncashmentPreview(tenantId, employeeId);
    let total = 0;
    const year = new Date().getFullYear();

    for (const item of preview) {
      if (item.days <= 0) continue;
      await this.db.query(
        `INSERT INTO leave_encashment_requests
           (tenant_id, employee_id, leave_type_id, days, daily_rate, total_amount, year, status, remarks, processed_by, processed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9, now())`,
        [tenantId, employeeId, item.leave_type_id, item.days, item.daily_rate, item.amount, year, `Exit settlement encashment (exit_request_id=${exitRequestId})`, actorId],
      );
      await this.deductLeaveBalance(tenantId, employeeId, item.leave_type_id, item.days, year);
      total += item.amount;
    }
    return Math.round(total * 100) / 100;
  }

  async createEncashmentRequest(tenantId: string, employeeId: string, data: { leave_type_id: string; days: number; remarks?: string }) {
    const year = new Date().getFullYear();
    const minRetain = (await this.resolveLeavePolicy(tenantId, employeeId))?.encashment_min_retain_days ?? 0;
    
    // Centralized validation handles balance check, minimum retain, and gender eligibility
    const policyConfig = await this.validateLeaveAgainstPolicy(tenantId, employeeId, data.leave_type_id, data.days, minRetain);

    if (!policyConfig.encashment_enabled) {
      throw new BadRequestException('Leave encashment is not allowed under your current leave policy');
    }

    // Timing restriction check
    const timing: string = policyConfig.encashment_timing ?? 'anytime';
    if (timing === 'on_exit') {
      throw new BadRequestException('Leave encashment is only allowed during exit settlement for your policy');
    }
    if (timing === 'year_end') {
      const month = new Date().getMonth() + 1;
      if (month !== 12) {
        throw new BadRequestException('Leave encashment is only allowed in December (year-end) under your policy');
      }
    }

    // Per-year cap check
    const maxDaysPerYear: number = policyConfig.encashment_max_days_per_year ?? 0;
    if (maxDaysPerYear > 0) {
      const { rows: usedRows } = await this.db.query(
        `SELECT COALESCE(SUM(days), 0)::DECIMAL AS total FROM leave_encashment_requests
         WHERE tenant_id = $1 AND employee_id = $2 AND year = $3 AND status != 'rejected'`,
        [tenantId, employeeId, year],
      );
      const alreadyEncashed = parseFloat(usedRows[0]?.total ?? '0');
      if (alreadyEncashed + data.days > maxDaysPerYear) {
        const remaining = maxDaysPerYear - alreadyEncashed;
        throw new BadRequestException(
          `Encashment limit exceeded. Remaining quota: ${remaining} day(s) (policy max: ${maxDaysPerYear}/year)`,
        );
      }
    }

    // Daily rate from salary_structures
    const basis: 'basic' | 'gross' = policyConfig.encashment_basis === 'gross' ? 'gross' : 'basic';
    const dailyRate = await this.dailyRateForEmployee(tenantId, employeeId, basis);
    const totalAmount = parseFloat((dailyRate * data.days).toFixed(2));

    const requiresApproval: boolean = Boolean(policyConfig.encashment_requires_approval);
    const initialStatus = requiresApproval ? 'pending' : 'approved';

    const { rows } = await this.db.query(
      `INSERT INTO leave_encashment_requests
         (tenant_id, employee_id, leave_type_id, days, daily_rate, total_amount, year, status, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, employeeId, data.leave_type_id, data.days, dailyRate, totalAmount, year, initialStatus, data.remarks ?? null],
    );
    const request = rows[0];

    if (initialStatus === 'approved') {
      // Auto-approved by policy: deduct leave balance immediately
      await this.deductLeaveBalance(tenantId, employeeId, data.leave_type_id, data.days, year);
    } else {
      // Requires approval: route through the approval engine so approvers are
      // notified and the request shows up in their inbox, same as leave requests.
      const { rows: empRows } = await this.db.query(
        'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
        [employeeId, tenantId],
      );
      const branchId = empRows[0]?.branch_id ?? null;
      if (!branchId) {
        throw new BadRequestException('Employee must be assigned to a branch before submitting leave encashment for approval');
      }
      const submittedByUserId = await this.resolveSubmitterUserId(tenantId, employeeId);

      // BUG FIX: use 'leave_encashment' as the workflowType (not 'leave') so
      // encashment requests are tracked as a distinct workflow and can have
      // their own approval chain configuration independent of leave requests.
      await this.approvalEngine.submit({
        tenantId,
        workflowType: 'leave_encashment',
        entityId: request.id,
        entityTable: 'leave_encashment_requests',
        submittedBy: submittedByUserId,
        branchId,
        title: `Leave encashment: ${data.days} day(s) (₹${totalAmount})`,
        description: data.remarks,
        metadata: { leave_type_id: data.leave_type_id, days: data.days, employee_id: employeeId },
      });
    }

    return request;
  }

  async approveEncashmentRequest(id: string, tenantId: string, approvedBy: string, reason: string) {
    const { rows: reqRows } = await this.db.query(
      `SELECT * FROM leave_encashment_requests WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!reqRows.length) throw new NotFoundException('Encashment request not found');
    const req = reqRows[0];
    if (req.status !== 'pending') {
      throw new BadRequestException(`Cannot approve a request with status: ${req.status}`);
    }

    const result = await this.approvalEngine.approveByEntity(
      id, 'leave_encashment_requests', tenantId, approvedBy, reason,
    );

    if (result.fullyApproved) {
      await this.deductLeaveBalance(tenantId, req.employee_id, req.leave_type_id, req.days, req.year);
    }

    return result;
  }

  async rejectEncashmentRequest(id: string, tenantId: string, rejectedBy: string, reason: string) {
    const { rows: reqRows } = await this.db.query(
      `SELECT * FROM leave_encashment_requests WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!reqRows.length) throw new NotFoundException('Encashment request not found');
    const req = reqRows[0];
    if (req.status !== 'pending') {
      throw new BadRequestException(`Cannot reject a request with status: ${req.status}`);
    }

    return this.approvalEngine.rejectByEntity(id, 'leave_encashment_requests', tenantId, rejectedBy, reason);
  }

  // ── Centralized Validation & Deduction ─────────────────────────────────────────

  private async deductLeaveBalance(tenantId: string, employeeId: string, leaveTypeId: string, days: number, year: number) {
    await this.db.query(
      `UPDATE leave_balances
       SET used = used + $1, available = available - $1, updated_at = now()
       WHERE tenant_id = $2 AND employee_id = $3 AND leave_type_id = $4 AND year = $5`,
      [days, tenantId, employeeId, leaveTypeId, year],
    );
  }

  private async validateLeaveAgainstPolicy(
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    days: number,
    checkMinimumRetain: number = 0,
    startDate?: string,
    endDate?: string,
  ) {
    const year = new Date().getFullYear();
    const policy = await this.resolveLeavePolicy(tenantId, employeeId);
    if (!policy || Object.keys(policy).length === 0) {
      throw new BadRequestException('No active leave policy template has been assigned to you. Contact HR to assign a leave policy template before applying.');
    }

    const { rows: typeRows } = await this.db.query(
      'SELECT code, name, gender_eligibility, paid FROM leave_types WHERE id = $1',
      [leaveTypeId],
    );
    if (!typeRows.length) throw new BadRequestException('Invalid leave type');

    const policyLimit = this.getLimitFromPolicy(policy, typeRows[0].code, typeRows[0].name);
    if (policyLimit <= 0) {
      throw new BadRequestException(
        'This leave type is not available under your assigned leave policy template.',
      );
    }

    if (startDate && endDate && this.holidayPolicy) {
      const blockedHolidays = await this.holidayPolicy.blocksLeaveRequest(tenantId, employeeId, startDate, endDate);
      if (blockedHolidays.length) {
        const names = blockedHolidays.map((holiday) => `${holiday.name} (${holiday.date})`).join(', ');
        throw new BadRequestException(`Leave is not required on paid holidays: ${names}`);
      }
    }

    const ge: string = typeRows[0].gender_eligibility;
    if (ge !== 'all') {
      const { rows: empRows } = await this.db.query(
        'SELECT gender FROM employees WHERE id = $1',
        [employeeId],
      );
      const empGender = empRows[0]?.gender?.toLowerCase();
      if (empGender && empGender !== ge) {
        throw new BadRequestException(`This leave type is only available for ${ge} employees`);
      }
    }

    const balance = await this.db.query(
      'SELECT available FROM leave_balances WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3 AND year = $4',
      [tenantId, employeeId, leaveTypeId, year],
    );

    if (balance.rows.length) {
      const available = parseFloat(balance.rows[0].available);
      if (available < days) {
        throw new BadRequestException(`Insufficient leave balance. Available: ${available} day(s), required: ${days} day(s).`);
      }
      if (available - days < checkMinimumRetain) {
        throw new BadRequestException(`You must retain at least ${checkMinimumRetain} day(s) in your balance. Available: ${available}, requested: ${days}`);
      }
    } else {
      const isPaidType = typeRows[0].paid !== false;
      if (isPaidType) {
        throw new BadRequestException(
          'No leave balance is available for this leave type based on your assigned leave policy template. Contact HR if you believe this is an error.',
        );
      }
    }

    return policy;
  }

  private calculateDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    const diff = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
    return diff + 1;
  }
}
