import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PayrollService } from '../../hr/services/payroll.service';
import { LeaveService } from '../../hr/services/leave.service';
import { AttendanceSummaryService } from '../../hr/services/attendance-summary.service';
import { BusinessDaysService } from '../../hr/services/business-days.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AssetAssignmentService } from '../../assets/services/asset-assignment.service';
import { ExitTimelineService } from './exit-timeline.service';
import { ExitClearanceService } from './exit-clearance.service';
import { ExitChecklistService } from './exit-checklist.service';
import { ExitRequestService } from './exit-request.service';
import { ExitOffboardingOrchestratorService } from './exit-offboarding-orchestrator.service';
import { calculateGratuity } from '../utils/gratuity.util';
import { calculateNoticePayRecovery, daysBetween, toDateOnlyString } from '../utils/notice-period.util';

@Injectable()
export class FinalSettlementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly payrollService: PayrollService,
    private readonly leaveService: LeaveService,
    private readonly attendanceSummaryService: AttendanceSummaryService,
    private readonly businessDaysService: BusinessDaysService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly assetAssignmentService: AssetAssignmentService,
    private readonly timeline: ExitTimelineService,
    private readonly clearanceService: ExitClearanceService,
    private readonly checklistService: ExitChecklistService,
    private readonly exitRequestService: ExitRequestService,
    private readonly orchestrator: ExitOffboardingOrchestratorService,
  ) {}

  async list(tenantId: string, filters: { employee_id?: string; payment_status?: string } = {}) {
    const params: any[] = [tenantId];
    let where = 'fs.tenant_id = $1';
    let idx = 2;
    if (filters.employee_id) { where += ` AND fs.employee_id = $${idx++}`; params.push(filters.employee_id); }
    if (filters.payment_status) { where += ` AND fs.payment_status = $${idx++}`; params.push(filters.payment_status); }

    const { rows } = await this.db.query(
      `SELECT fs.*, e.first_name, e.last_name, e.employee_code
       FROM final_settlements fs JOIN employees e ON fs.employee_id = e.id
       WHERE ${where} ORDER BY fs.created_at DESC`,
      params,
    );
    return rows;
  }

  async getByExitRequest(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query('SELECT * FROM final_settlements WHERE tenant_id = $1 AND exit_request_id = $2', [tenantId, exitRequestId]);
    return rows[0] ?? null;
  }

  private static readonly CALCULABLE_STATUSES = ['notice_period', 'clearance_in_progress', 'pending_settlement'];

  private async assertReadyToCalculate(tenantId: string, exitRequestId: string, exitRequestStatus: string) {
    if (!FinalSettlementService.CALCULABLE_STATUSES.includes(exitRequestStatus)) {
      throw new BadRequestException(
        `Exit request must be approved (and notice period started) before the settlement can be calculated — current status: '${exitRequestStatus}'`,
      );
    }

    const clearancesDone = await this.clearanceService.allMandatoryCleared(tenantId, exitRequestId);
    if (!clearancesDone) throw new BadRequestException('All mandatory department clearances must be cleared before settlement can be calculated');

    const checklistProgress = await this.checklistService.progress(tenantId, exitRequestId);
    if (checklistProgress.mandatoryOutstanding > 0) {
      throw new BadRequestException(`${checklistProgress.mandatoryOutstanding} mandatory checklist item(s) are still pending`);
    }

    const assetsDone = await this.assetAssignmentService.allRecovered(tenantId, exitRequestId);
    if (!assetsDone) throw new BadRequestException('All assigned assets must be recovered before settlement can be calculated');
  }

  /**
   * Auto-calculates the Full & Final settlement from payroll, leave, and
   * attendance integrations plus asset recovery and notice-pay recovery.
   * Every input is persisted in calc_breakdown for audit; manual overrides
   * are applied as a delta on top via `applyManualAdjustment`.
   */
  async calculate(tenantId: string, exitRequestId: string, actorId: string) {
    const { rows: erRows } = await this.db.query(
      `SELECT er.*, e.date_of_joining FROM exit_requests er JOIN employees e ON er.employee_id = e.id
       WHERE er.id = $1 AND er.tenant_id = $2`,
      [exitRequestId, tenantId],
    );
    if (!erRows.length) throw new NotFoundException('Exit request not found');
    const exitRequest = erRows[0];
    const employeeId = exitRequest.employee_id;

    await this.assertReadyToCalculate(tenantId, exitRequestId, exitRequest.status);

    const salary = await this.payrollService.getSalaryStructure(tenantId, employeeId);
    if (!salary) throw new BadRequestException('No salary structure found for this employee — cannot auto-calculate settlement');

    const basic = parseFloat(salary.basic ?? 0);
    const allowances = ['hra', 'da', 'conveyance', 'medical', 'special_allowance']
      .reduce((sum, k) => sum + parseFloat(salary[k] ?? 0), 0);

    // Pending salary for the final (partial) month worked, prorated by attendance
    const lastWorkingDate = toDateOnlyString(exitRequest.last_working_date);
    const [year, month] = lastWorkingDate.split('-').map(Number);
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    const summaries = await this.attendanceSummaryService.listSummaries(tenantId, year, month, { employee_id: employeeId });
    const summary = summaries[0];
    const { businessWorkingDays } = await this.businessDaysService.countBusinessDays(tenantId, exitRequest.branch_id ?? null, periodStart, periodEnd);

    let pendingSalary = 0;
    if (summary && businessWorkingDays > 0 && summary.status !== 'payroll_processed') {
      const payableDays = Number(summary.payable_days ?? 0);
      pendingSalary = Math.round(((basic + allowances) * (payableDays / businessWorkingDays)) * 100) / 100;
    }

    // Leave encashment (auto, from leave module — no manual entry)
    const encashmentPreview = await this.leaveService.getExitEncashmentPreview(tenantId, employeeId);
    const leaveEncashment = Math.round(encashmentPreview.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

    // Gratuity (Payment of Gratuity Act formula, >=5 years eligibility)
    const gratuityResult = calculateGratuity(basic, exitRequest.date_of_joining, lastWorkingDate);

    // Notice pay recovery if the actual last working date falls short of the
    // full notice period, net of any waiver. Measured against last_working_date
    // (not wall-clock "today") so this is correct and deterministic whether
    // settlement is calculated right at departure or weeks later.
    const dailyBasicRate = Math.round((basic / 26) * 100) / 100;
    const daysServed = Math.min(
      daysBetween(exitRequest.requested_date, lastWorkingDate),
      exitRequest.notice_period_days,
    );
    const noticePayRecovery = calculateNoticePayRecovery(
      dailyBasicRate, exitRequest.notice_period_days, daysServed, exitRequest.notice_period_waived_days,
    );

    // Asset recovery (auto, from asset module — no manual entry)
    const assetRecovery = await this.assetAssignmentService.getRecoveryTotal(tenantId, exitRequestId);

    const totalPayable = Math.round((basic + allowances + pendingSalary + gratuityResult.amount + leaveEncashment) * 100) / 100;
    const totalDeductions = Math.round((noticePayRecovery + assetRecovery) * 100) / 100;
    const netPayable = Math.round((totalPayable - totalDeductions) * 100) / 100;

    const calcBreakdown = {
      basic_salary: basic,
      allowances,
      pending_salary: pendingSalary,
      attendance_period: { start: periodStart, end: periodEnd, payable_days: summary?.payable_days ?? null, business_working_days: businessWorkingDays },
      gratuity: gratuityResult,
      leave_encashment_breakdown: encashmentPreview,
      notice: { daily_rate: dailyBasicRate, notice_period_days: exitRequest.notice_period_days, days_served: daysServed, waived_days: exitRequest.notice_period_waived_days, recovery: noticePayRecovery },
      asset_recovery: assetRecovery,
      calculated_at: new Date().toISOString(),
    };

    const existing = await this.getByExitRequest(tenantId, exitRequestId);
    let settlement;
    if (existing) {
      const { rows } = await this.db.query(
        `UPDATE final_settlements SET
           basic_salary = $1, allowances = $2, gratuity = $3, leave_encashment = $4, bonus = 0,
           deductions = $5, notice_pay_recovery = $6, asset_recovery = $7,
           total_payable = $8, total_deductions = $9, net_payable = $10,
           branch_id = $11, submitted_by = $12, calc_breakdown = $13::jsonb, is_auto_calculated = true,
           payment_status = 'pending_approval', updated_at = now()
         WHERE id = $14 RETURNING *`,
        [basic + pendingSalary, allowances, gratuityResult.amount, leaveEncashment, 0, noticePayRecovery, assetRecovery,
          totalPayable, totalDeductions, netPayable, exitRequest.branch_id, actorId, JSON.stringify(calcBreakdown), existing.id],
      );
      settlement = rows[0];
    } else {
      const { rows } = await this.db.query(
        `INSERT INTO final_settlements
           (tenant_id, exit_request_id, employee_id, basic_salary, allowances, gratuity, leave_encashment, bonus,
            deductions, notice_pay_recovery, asset_recovery, total_payable, total_deductions, net_payable,
            branch_id, submitted_by, calc_breakdown, is_auto_calculated, payment_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,true,'pending_approval')
         RETURNING *`,
        [tenantId, exitRequestId, employeeId, basic + pendingSalary, allowances, gratuityResult.amount, leaveEncashment,
          noticePayRecovery, assetRecovery, totalPayable, totalDeductions, netPayable,
          exitRequest.branch_id, actorId, JSON.stringify(calcBreakdown)],
      );
      settlement = rows[0];
    }

    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'ff_settlement',
      entityId: settlement.id,
      entityTable: 'final_settlements',
      submittedBy: actorId,
      branchId: exitRequest.branch_id,
      title: `Full & Final settlement — net payable ₹${netPayable}`,
      description: `Exit request ${exitRequestId}`,
      metadata: { exit_request_id: exitRequestId, employee_id: employeeId },
    });

    await this.timeline.record(tenantId, exitRequestId, 'settlement_calculated', actorId, `Net payable: ₹${netPayable}`);
    return settlement;
  }

  async applyManualAdjustment(tenantId: string, id: string, data: { field: 'bonus' | 'deductions' | 'tax_deduction' | 'loan_recovery'; amount: number; reason: string }, actorId: string) {
    if (!data.reason?.trim()) throw new BadRequestException('A reason is required for manual settlement adjustments');

    const { rows: existing } = await this.db.query('SELECT * FROM final_settlements WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Settlement not found');
    const s = existing[0];

    const totalPayable = parseFloat(s.basic_salary) + parseFloat(s.allowances) + parseFloat(s.gratuity) + parseFloat(s.leave_encashment)
      + (data.field === 'bonus' ? data.amount : parseFloat(s.bonus));
    const totalDeductions = parseFloat(s.notice_pay_recovery) + parseFloat(s.asset_recovery)
      + (data.field === 'deductions' ? data.amount : parseFloat(s.deductions))
      + (data.field === 'tax_deduction' ? data.amount : parseFloat(s.tax_deduction))
      + (data.field === 'loan_recovery' ? data.amount : parseFloat(s.loan_recovery));

    const { rows } = await this.db.query(
      `UPDATE final_settlements SET ${data.field} = $1, total_payable = $2, total_deductions = $3, net_payable = $4,
       manual_adjustment_reason = $5, updated_at = now() WHERE id = $6 RETURNING *`,
      [data.amount, totalPayable, totalDeductions, totalPayable - totalDeductions, data.reason, id],
    );
    return rows[0];
  }

  async approve(tenantId: string, id: string, actor: { sub: string; isSuperAdmin: boolean; userType: string }, reason: string, ip?: string, userAgent?: string) {
    const result = await this.approvalEngine.approveByEntity(id, 'final_settlements', tenantId, actor.sub, reason, undefined, ip);
    if (result.fullyApproved) {
      const exitRequestId = result.entity.exit_request_id;
      await this.timeline.record(tenantId, exitRequestId, 'settlement_approved', actor.sub, reason);
      await this.exitRequestService.markSettled(tenantId, exitRequestId);
      await this.orchestrator.finalize(tenantId, exitRequestId, actor, ip, userAgent);
    }
    return result;
  }

  async reject(tenantId: string, id: string, rejecterId: string, reason: string) {
    return this.approvalEngine.rejectByEntity(id, 'final_settlements', tenantId, rejecterId, reason);
  }

  async markPaid(tenantId: string, id: string, paymentDate: string | undefined, actorId: string) {
    const { rows: existing } = await this.db.query('SELECT * FROM final_settlements WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Settlement not found');
    if (existing[0].payment_status !== 'approved') {
      throw new BadRequestException('Settlement must be approved before it can be marked as paid');
    }

    const { rows } = await this.db.query(
      `UPDATE final_settlements SET payment_status = 'paid', payment_date = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [paymentDate ?? new Date().toISOString().slice(0, 10), id],
    );
    await this.timeline.record(tenantId, existing[0].exit_request_id, 'settlement_paid', actorId);
    return rows[0];
  }

  async delete(tenantId: string, id: string) {
    const { rows } = await this.db.query('DELETE FROM final_settlements WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Settlement not found');
    return { id };
  }
}
