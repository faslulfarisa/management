import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { TemplateService } from '../../platform/services/template.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';
import { CreateOtRequestDto } from '../dto/overtime.dto';

export interface OtEligibilityResult {
  eligible: boolean;
  policy: Record<string, any> | null;
  templateId: string | null;
}

export interface ApprovedOtForPayroll {
  eligible: boolean;
  approvedHours: number;
  policyMultiplier: number;
  policyRate?: number | null;
  policyFormula?: string | null;
  policySnapshot?: Record<string, any>;
  approvalTimestamp?: string | null;
}

@Injectable()
export class OvertimeService {
  constructor(
    private db: DatabaseService,
    private templateService: TemplateService,
    private approvalEngine: ApprovalEngineService,
    private payrollLock: PayrollLockService,
  ) {}

  /**
   * Resolve an employee's overtime eligibility from their assigned overtime_policy template.
   * Returns eligible=false if no template or ot_applicable is not true.
   */
  async checkEligibility(tenantId: string, employeeId: string): Promise<OtEligibilityResult> {
    const template = await this.templateService.getResolved(
      tenantId, 'overtime_policy', 'employee', employeeId,
    );
    if (!template) return { eligible: false, policy: null, templateId: null };
    const cfg: Record<string, any> = template.config ?? {};
    if (!cfg.ot_applicable) return { eligible: false, policy: cfg, templateId: template.id };
    return { eligible: true, policy: cfg, templateId: template.id };
  }

  /**
   * Submit an overtime request.
   * Validates eligibility, daily cap, and duplicate guard before inserting.
   * Automatically submits the created record into the approval engine.
   */
  async createRequest(
    tenantId: string,
    data: CreateOtRequestDto,
    submittedBy: string,
  ): Promise<any> {
    await this.payrollLock.assertPeriodUnlocked(tenantId, data.employee_id, data.ot_date);

    const { eligible, policy, templateId } = await this.checkEligibility(tenantId, data.employee_id);
    if (!eligible) {
      throw new ForbiddenException(
        'Employee does not have an Overtime Policy assigned or OT is not applicable for this employee',
      );
    }

    // Daily cap validation
    if (policy?.ot_daily_cap_hours && data.requested_hours > policy.ot_daily_cap_hours) {
      throw new BadRequestException(
        `Requested ${data.requested_hours} hrs exceeds the daily OT cap of ${policy.ot_daily_cap_hours} hrs`,
      );
    }

    const otDate = new Date(data.ot_date);
    const payrollMonth = otDate.getMonth() + 1;
    const payrollYear = otDate.getFullYear();

    // Monthly cap check (if configured)
    if (policy?.ot_weekly_cap_hours) {
      // Could add week-level cap here in the future
    }

    // Duplicate guard — one active request per employee per date
    const { rows: dupes } = await this.db.query(
      `SELECT id FROM overtime_requests
       WHERE tenant_id = $1 AND employee_id = $2 AND ot_date = $3
         AND status NOT IN ('rejected','cancelled') AND deleted_at IS NULL`,
      [tenantId, data.employee_id, data.ot_date],
    );
    if (dupes.length > 0) {
      throw new ConflictException('An active overtime request already exists for this date');
    }

    // Employee branch/department for approval chain routing
    const { rows: empRows } = await this.db.query(
      `SELECT branch_id, department_id FROM employees
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [data.employee_id, tenantId],
    );
    if (!empRows.length) throw new NotFoundException('Employee not found');
    const emp = empRows[0];

    // Attendance snapshot on the OT date
    const { rows: attRows } = await this.db.query(
      `SELECT clock_in, clock_out, overtime_minutes
       FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date = $3 LIMIT 1`,
      [tenantId, data.employee_id, data.ot_date],
    );
    const att = attRows[0] ?? null;

    const { rows } = await this.db.query(
      `INSERT INTO overtime_requests (
         tenant_id, employee_id, branch_id, department_id,
         ot_date, shift_id, requested_hours, reason, notes,
         clock_in, clock_out, attendance_ot_minutes,
         ot_policy_template_id, payroll_month, payroll_year
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tenantId, data.employee_id, emp.branch_id ?? null, emp.department_id ?? null,
        data.ot_date, data.shift_id ?? null,
        data.requested_hours, data.reason.trim(), data.notes?.trim() ?? null,
        att?.clock_in ?? null, att?.clock_out ?? null, att?.overtime_minutes ?? 0,
        templateId, payrollMonth, payrollYear,
      ],
    );
    const request = rows[0];

    // Submit into the central approval engine
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'overtime',
      entityId: request.id,
      entityTable: 'overtime_requests',
      submittedBy,
      branchId: emp.branch_id ?? null,
      departmentId: emp.department_id ?? null,
      title: `OT Request – ${data.ot_date} (${data.requested_hours} hrs)`,
      description: data.reason,
      priority: data.priority || 'normal',
    });

    return request;
  }

  /**
   * Paginated list of OT requests (admin / manager view).
   */
  async getRequests(
    tenantId: string,
    filters: Record<string, any>,
  ): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 20, status, branch_id, employee_id, month, year } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    const params: any[] = [tenantId];
    let where = `WHERE otr.tenant_id = $1 AND otr.deleted_at IS NULL`;
    let idx = 2;

    if (status) { where += ` AND otr.status = $${idx++}`; params.push(status); }
    if (branch_id) { where += ` AND otr.branch_id = $${idx++}`; params.push(branch_id); }
    if (employee_id) { where += ` AND otr.employee_id = $${idx++}`; params.push(employee_id); }
    if (month) { where += ` AND otr.payroll_month = $${idx++}`; params.push(Number(month)); }
    if (year) { where += ` AND otr.payroll_year = $${idx++}`; params.push(Number(year)); }

    const base = `
      FROM overtime_requests otr
      LEFT JOIN employees e ON e.id = otr.employee_id AND e.deleted_at IS NULL
      ${where}`;

    const [countRes, dataRes] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${base}`, params),
      this.db.query(
        `SELECT
           otr.*,
           e.first_name, e.last_name, e.employee_code,
           e.designation_id
         ${base}
         ORDER BY otr.ot_date DESC, otr.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);

    return {
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
    };
  }

  /**
   * Employee self-service: own OT request history.
   */
  async getMyRequests(
    tenantId: string,
    employeeId: string,
    filters: Record<string, any>,
  ): Promise<{ data: any[]; total: number }> {
    return this.getRequests(tenantId, { ...filters, employee_id: employeeId });
  }

  /**
   * Cancel a pending or under-review OT request.
   * Routes through the approval engine so the audit trail is maintained.
   */
  async cancelRequest(id: string, tenantId: string, cancelledBy: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT * FROM overtime_requests WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Overtime request not found');
    const req = rows[0];

    if (!['pending', 'under_review'].includes(req.status)) {
      throw new BadRequestException(
        `Cannot cancel a request with status '${req.status}'`,
      );
    }

    // Find the active approval_requests row and cancel via the engine
    const { rows: arRows } = await this.db.query(
      `SELECT id FROM approval_requests
       WHERE entity_id = $1 AND entity_table = 'overtime_requests'
         AND tenant_id = $2 AND status IN ('pending','under_review')
       ORDER BY created_at DESC LIMIT 1`,
      [id, tenantId],
    );

    if (arRows.length) {
      await this.approvalEngine.cancel(arRows[0].id, tenantId, cancelledBy, 'Cancelled by requester');
    } else {
      // Fallback: direct update if no approval_requests row exists
      await this.db.query(
        `UPDATE overtime_requests
         SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
    }

    const { rows: updated } = await this.db.query(
      `SELECT * FROM overtime_requests WHERE id = $1`, [id],
    );
    return updated[0];
  }

  /**
   * Single request detail with employee info and the linked approval_requests row.
   */
  async getRequestDetail(id: string, tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT
         otr.*,
         e.first_name, e.last_name, e.employee_code,
         ar.id AS approval_request_id, ar.current_step, ar.total_steps,
         ar.due_at, ar.approval_log AS ar_log
       FROM overtime_requests otr
       LEFT JOIN employees e ON e.id = otr.employee_id
       LEFT JOIN approval_requests ar
         ON ar.entity_id = otr.id AND ar.entity_table = 'overtime_requests'
         AND ar.tenant_id = otr.tenant_id
       WHERE otr.id = $1 AND otr.tenant_id = $2 AND otr.deleted_at IS NULL
       ORDER BY ar.created_at DESC
       LIMIT 1`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Overtime request not found');
    return rows[0];
  }

  /**
   * Called by PayrollService during payslip generation.
   * Returns the total approved OT hours and the applicable rate multiplier
   * for an employee in a given month/year.
   *
   * Returns eligible=false when no OT policy is assigned — payroll engine
   * must then set overtime = 0, never auto-paying from raw attendance data.
   */
  async getApprovedOtForPayroll(
    tenantId: string,
    employeeId: string,
    month: number,
    year: number,
  ): Promise<ApprovedOtForPayroll> {
    const { eligible, policy } = await this.checkEligibility(tenantId, employeeId);
    if (!eligible) return { eligible: false, approvedHours: 0, policyMultiplier: 1.5 };

    const { rows } = await this.db.query(
      `SELECT
         COALESCE(SUM(COALESCE(approved_hours, requested_hours)), 0) AS total_approved,
         MAX(updated_at) AS approval_timestamp
       FROM overtime_requests
       WHERE tenant_id = $1 AND employee_id = $2
         AND payroll_month = $3 AND payroll_year = $4
         AND status = 'approved' AND deleted_at IS NULL`,
      [tenantId, employeeId, month, year],
    );

    return {
      eligible: true,
      approvedHours: parseFloat(rows[0]?.total_approved ?? 0),
      policyMultiplier: policy?.ot_rate_multiplier ?? 1.5,
      policyRate: policy?.ot_hourly_rate ?? null,
      policyFormula: policy?.ot_formula ?? 'hourly_rate * approved_ot_hours * multiplier',
      policySnapshot: policy ?? {},
      approvalTimestamp: rows[0]?.approval_timestamp ?? null,
    };
  }

  /**
   * After payslip is generated, link approved OT requests to the payslip
   * so OT is traceable from both the payslip and the OT request record.
   */
  async linkPayslipToApprovedRequests(
    tenantId: string,
    employeeId: string,
    month: number,
    year: number,
    payslipId: string,
    otAmount: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE overtime_requests
       SET payslip_id = $1, ot_amount = $2, updated_at = now()
       WHERE tenant_id = $3 AND employee_id = $4
         AND payroll_month = $5 AND payroll_year = $6
         AND status = 'approved' AND payslip_id IS NULL AND deleted_at IS NULL`,
      [payslipId, otAmount, tenantId, employeeId, month, year],
    );
  }

  /**
   * Summary analytics for OT requests — used by the manager dashboard.
   */
  async getAnalytics(tenantId: string, filters: Record<string, any>): Promise<any> {
    const { branch_id, month, year } = filters;
    const params: any[] = [tenantId];
    let where = `WHERE otr.tenant_id = $1 AND otr.deleted_at IS NULL`;
    let idx = 2;

    if (branch_id) { where += ` AND otr.branch_id = $${idx++}`; params.push(branch_id); }
    if (month) { where += ` AND otr.payroll_month = $${idx++}`; params.push(Number(month)); }
    if (year) { where += ` AND otr.payroll_year = $${idx++}`; params.push(Number(year)); }

    const { rows: summary } = await this.db.query(
      `SELECT
         COUNT(*)::int                                                               AS total_requests,
         SUM(CASE WHEN otr.status = 'approved'                     THEN 1 ELSE 0 END)::int AS approved_count,
         SUM(CASE WHEN otr.status = 'rejected'                     THEN 1 ELSE 0 END)::int AS rejected_count,
         SUM(CASE WHEN otr.status IN ('pending','under_review')     THEN 1 ELSE 0 END)::int AS pending_count,
         COALESCE(SUM(CASE WHEN otr.status = 'approved'
           THEN COALESCE(otr.approved_hours, otr.requested_hours) ELSE 0 END), 0)   AS total_approved_hours,
         COALESCE(SUM(CASE WHEN otr.status = 'approved'
           THEN COALESCE(otr.ot_amount, 0) ELSE 0 END), 0)                          AS total_ot_cost
       FROM overtime_requests otr
       ${where}`,
      params,
    );

    // Branch breakdown
    const { rows: byBranch } = await this.db.query(
      `SELECT
         b.name AS branch_name,
         COUNT(*)::int AS total,
         SUM(CASE WHEN otr.status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
         COALESCE(SUM(CASE WHEN otr.status = 'approved'
           THEN COALESCE(otr.approved_hours, otr.requested_hours) ELSE 0 END), 0) AS approved_hours
       FROM overtime_requests otr
       LEFT JOIN branches b ON b.id = otr.branch_id
       ${where}
       GROUP BY b.id, b.name
       ORDER BY total DESC
       LIMIT 10`,
      params,
    );

    return {
      ...summary[0],
      by_branch: byBranch,
    };
  }
}
