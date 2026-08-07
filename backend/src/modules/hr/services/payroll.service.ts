import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { PayrollPaymentService } from './payroll-payment.service';
import { PayslipService } from './payslip.service';
import { OvertimeService } from './overtime.service';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private db: DatabaseService,
    private paymentService: PayrollPaymentService,
    private payslipService: PayslipService,
    private overtimeService: OvertimeService,
  ) {}

  async getSalaryStructure(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM salary_structures WHERE tenant_id = $1 AND employee_id = $2
        AND (effective_to IS NULL OR effective_to >= now()) ORDER BY effective_from DESC LIMIT 1`,
      [tenantId, employeeId],
    );
    return rows[0] || null;
  }

  async setSalaryStructure(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO salary_structures (tenant_id, employee_id, basic, hra, da, conveyance, medical,
        special_allowance, pf_employer, pf_employee, esi_employer, esi_employee, professional_tax, tds, effective_from)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [tenantId, data.employee_id, data.basic, data.hra || 0, data.da || 0, data.conveyance || 0,
        data.medical || 0, data.special_allowance || 0, data.pf_employer || 0, data.pf_employee || 0,
        data.esi_employer || 0, data.esi_employee || 0, data.professional_tax || 0, data.tds || 0, data.effective_from],
    );
    return rows[0];
  }

  async getPayrollRuns(tenantId: string, filters: { branch_id?: string } = {}) {
    const { branch_id } = filters;
    const params: any[] = [tenantId];
    let query = 'SELECT * FROM payroll_runs WHERE tenant_id = $1';
    if (branch_id) {
      params.push(branch_id);
      query += ` AND branch_id = $${params.length}`;
    }
    query += ' ORDER BY year DESC, month DESC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createPayrollRun(tenantId: string, month: number, year: number, branchId?: string) {
    const { rows } = await this.db.query(
      `INSERT INTO payroll_runs (tenant_id, month, year, branch_id) VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, month, year) DO NOTHING RETURNING *`,
      [tenantId, month, year, branchId ?? null],
    );
    return rows[0] || await this.db.query('SELECT * FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3', [tenantId, month, year]).then(r => r.rows[0]);
  }

  /**
   * Generate payslips for a month. Only employees with an approved or
   * payroll_locked attendance summary for the period are paid — there is no
   * payroll without an approved attendance summary. Employees lacking one
   * (or a salary structure) are skipped and reported back, not paid in full.
   *
   * Proration formula: gross * min(payable_days / business_working_days, 1)
   * Overtime premium:  (basic / (business_working_days × 8)) × approved_ot_hours × policy_multiplier
   * approved_ot_hours is read from the summary's stored snapshot, not re-queried live,
   * so payroll always matches what was actually approved/audited on the locked summary.
   */
  async generatePayslips(tenantId: string, month: number, year: number, branchId?: string) {
    // Reset previously deducted fines for draft payslips in this cycle
    const resetPayslipsResult = await this.db.query(
      `SELECT id FROM payslips
       WHERE tenant_id = $1 AND month = $2 AND year = $3 AND status = 'draft'
         AND ($4::uuid IS NULL OR branch_id = $4)`,
      [tenantId, month, year, branchId ?? null],
    );
    const draftPayslipIds = resetPayslipsResult.rows.map((r: any) => r.id);

    if (draftPayslipIds.length > 0) {
      // 1. Delete associated 'payroll_deduction' payments
      await this.db.query(
        `DELETE FROM deduction_payments
         WHERE tenant_id = $1 AND payslip_id = ANY($2) AND payment_type = 'payroll_deduction'`,
        [tenantId, draftPayslipIds],
      );

      // 2. Revert employee_fines status back to 'approved' and clear amount/payslip linkage
      await this.db.query(
        `UPDATE employee_fines
         SET status = 'approved',
             amount_deducted = 0,
             payslip_id = NULL,
             approval_log = COALESCE(
               (SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(approval_log) elem
                WHERE elem->>'action' != 'payroll_deducted'),
               '[]'::jsonb
             ),
             updated_at = now()
         WHERE tenant_id = $1 AND payslip_id = ANY($2)`,
        [tenantId, draftPayslipIds],
      );
    }

    const empParams: any[] = [tenantId, 'active', 'confirmed', 'probation'];
    let empQuery = 'SELECT id, branch_id FROM employees WHERE tenant_id = $1 AND status IN ($2, $3, $4) AND deleted_at IS NULL';
    if (branchId) {
      empParams.push(branchId);
      empQuery += ` AND branch_id = $${empParams.length}`;
    }
    const employees = await this.db.query(empQuery, empParams);

    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];

    // Bulk-load approved/locked attendance summaries for this period — payroll
    // is only generated against these; no summary means no payslip (see below).
    const { rows: summaryRows } = await this.db.query(
      `SELECT * FROM payroll_attendance_summary
       WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3
         AND status IN ('approved','payroll_locked')`,
      [tenantId, periodStart, periodEnd],
    );
    const summaryMap = new Map<string, any>(summaryRows.map((s: any) => [s.employee_id, s]));
    if (summaryMap.size === 0) {
      throw new BadRequestException(
        'No approved attendance summaries found for this period. Compute and approve attendance summaries before generating payroll.',
      );
    }

    // Resolve (or create) the payroll run up front so payslips can be linked to it.
    const payrollRun = await this.createPayrollRun(tenantId, month, year, branchId);
    const payrollRunId = payrollRun.id;

    // Bulk-load approved fines targeted at this payroll cycle (additive, non-invasive)
    const fineParams: any[] = [tenantId, month, year, 'approved', 'payroll'];
    let fineQuery = `SELECT id, employee_id, fine_amount FROM employee_fines
      WHERE tenant_id = $1 AND payroll_month = $2 AND payroll_year = $3
        AND status = $4 AND deduction_mode = $5`;
    if (branchId) { fineQuery += ` AND branch_id = $6`; fineParams.push(branchId); }
    const { rows: fineRows } = await this.db.query(fineQuery, fineParams);
    const finesMap = new Map<string, any[]>();
    for (const f of fineRows) {
      if (!finesMap.has(f.employee_id)) finesMap.set(f.employee_id, []);
      finesMap.get(f.employee_id)!.push(f);
    }

    const results: any[] = [];
    const skipped: { employee_id: string; reason: string }[] = [];

    for (const emp of employees.rows) {
      const summary = summaryMap.get(emp.id);
      if (!summary) {
        skipped.push({ employee_id: emp.id, reason: 'no_approved_attendance_summary' });
        continue;
      }

      const structure = await this.db.query(
        `SELECT * FROM salary_structures WHERE tenant_id = $1 AND employee_id = $2
          AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $4) ORDER BY effective_from DESC LIMIT 1`,
        [tenantId, emp.id, periodEnd, periodStart],
      );

      if (!structure.rows.length) {
        skipped.push({ employee_id: emp.id, reason: 'no_salary_structure' });
        continue;
      }
      const s = structure.rows[0];

      let gross = parseFloat(s.basic) + parseFloat(s.hra) + parseFloat(s.da) +
        parseFloat(s.conveyance) + parseFloat(s.medical) + parseFloat(s.special_allowance);

      let overtime = 0;
      const businessWorkingDays = summary.business_working_days || summary.total_working_days || 0;

      if (businessWorkingDays > 0) {
        // Prorate gross by payable days (present + paid leave + holidays + weekly offs) over
        // business working days — not raw present/calendar days.
        const payableDays = parseFloat(summary.payable_days ?? summary.present_days ?? 0);
        const ratio = Math.min(payableDays / businessWorkingDays, 1);
        gross = gross * ratio;

        // approved_ot_hours is the snapshot taken when the summary was computed — not re-queried
        // live — so payroll always matches what was actually approved/audited on the summary.
        const approvedHours = parseFloat(summary.approved_ot_hours ?? 0);
        if (approvedHours > 0) {
          const otResult = await this.overtimeService.getApprovedOtForPayroll(tenantId, emp.id, month, year);
          const hourlyRate = parseFloat(s.basic) / (businessWorkingDays * 8);
          overtime = hourlyRate * approvedHours * (otResult.policyMultiplier ?? 1.5);
        }
      }

      const baseDeductions = parseFloat(s.pf_employee) + parseFloat(s.esi_employee) +
        parseFloat(s.professional_tax) + parseFloat(s.tds);

      // Aggregate approved fines for this employee's payroll cycle (additive, non-invasive)
      const empFines = finesMap.get(emp.id) ?? [];
      const fineDeductionTotal = empFines.reduce((sum: number, f: any) => sum + parseFloat(f.fine_amount), 0);
      const fineDeductionRefs = empFines.map((f: any) => f.id);

      const totalDeductions = baseDeductions + fineDeductionTotal;
      const net = gross + overtime - totalDeductions;

      const { rows } = await this.db.query(
        `INSERT INTO payslips (tenant_id, employee_id, month, year, basic, hra, da, conveyance, medical,
          special_allowance, overtime, gross_salary, pf, esi, professional_tax, tds,
          fine_deductions, fine_deduction_refs, total_deductions, net_salary, branch_id, payroll_run_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::uuid[],$19,$20,$21,$22)
          ON CONFLICT (tenant_id, employee_id, month, year) DO UPDATE SET
            basic=$5, hra=$6, da=$7, conveyance=$8, medical=$9, special_allowance=$10,
            overtime=$11, gross_salary=$12, pf=$13, esi=$14, professional_tax=$15, tds=$16,
            fine_deductions=$17, fine_deduction_refs=$18::uuid[],
            total_deductions=$19, net_salary=$20,
            branch_id=COALESCE(payslips.branch_id, $21), payroll_run_id=$22, updated_at=now()
          WHERE payslips.status = 'draft'
          RETURNING *`,
        [
          tenantId, emp.id, month, year,
          s.basic, s.hra, s.da, s.conveyance, s.medical, s.special_allowance,
          overtime, gross + overtime,
          s.pf_employee, s.esi_employee, s.professional_tax, s.tds,
          fineDeductionTotal, `{${fineDeductionRefs.join(',')}}`,
          totalDeductions, net, emp.branch_id ?? null, payrollRunId,
        ],
      );

      if (!rows.length) {
        // An existing payslip for this employee/period is already processed/paid/rejected —
        // never silently overwrite a finalized payslip.
        skipped.push({ employee_id: emp.id, reason: 'payslip_already_finalized' });
        continue;
      }
      results.push(rows[0]);

      // Link approved OT requests to this payslip so OT is traceable from both sides
      if (overtime > 0) {
        await this.overtimeService.linkPayslipToApprovedRequests(
          tenantId, emp.id, month, year, rows[0].id, overtime,
        ).catch(err => this.logger.error(`OT payslip link failed for ${emp.id}: ${err.message}`));
      }

      // Mark deducted fines as payroll_deducted and create payment records
      if (empFines.length) {
        const payslipId = rows[0].id;

        for (const fine of empFines) {
          await this.db.query(
            `UPDATE employee_fines
             SET status = 'payroll_deducted', amount_deducted = fine_amount,
                 payslip_id = $2,
                 approval_log = approval_log || $3::jsonb,
                 updated_at = now()
             WHERE id = $1`,
            [
              fine.id, payslipId,
              JSON.stringify([{
                action: 'payroll_deducted',
                timestamp: new Date().toISOString(),
                payslip_id: payslipId,
                payroll_run_id: payrollRunId,
                amount: fine.fine_amount,
              }]),
            ],
          );
          await this.db.query(
            `INSERT INTO deduction_payments
               (tenant_id, fine_id, employee_id, payment_type, amount, status,
                payroll_run_id, payslip_id, created_by)
             VALUES ($1,$2,$3,'payroll_deduction',$4,'verified',$5,$6,$7)`,
            [tenantId, fine.id, emp.id, fine.fine_amount, payrollRunId, payslipId, null],
          );
        }
      }
    }

    const totalGross = results.reduce((sum, r) => sum + parseFloat(r.gross_salary || 0), 0);
    const totalDeductions = results.reduce((sum, r) => sum + parseFloat(r.total_deductions || 0), 0);
    const totalNet = results.reduce((sum, r) => sum + parseFloat(r.net_salary || 0), 0);

    await this.db.query(
      `UPDATE payroll_runs SET total_gross = $3, total_deductions = $4, total_net = $5, updated_at = now()
        WHERE tenant_id = $1 AND month = $2 AND year = $6`,
      [tenantId, month, totalGross, totalDeductions, totalNet, year],
    );

    return { payroll_run_id: payrollRunId, payslips: results, skipped };
  }

  async getPayslips(tenantId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, month, year, status, branch_id, accessScope = GLOBAL_ACCESS_SCOPE as AccessScope } = filters;
    let query = `SELECT p.*, e.first_name, e.last_name, e.employee_code FROM payslips p
      JOIN employees e ON p.employee_id = e.id WHERE p.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND p.employee_id = $${idx++}`; params.push(employee_id); }
    if (month) { query += ` AND p.month = $${idx++}`; params.push(parseInt(month)); }
    if (year) { query += ` AND p.year = $${idx++}`; params.push(parseInt(year)); }
    if (status) { query += ` AND p.status = $${idx++}`; params.push(status); }
    if (branch_id) { query += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    {
      const scopeClause = branchScopeClause(accessScope, 'e.branch_id', idx);
      query += ` AND ${scopeClause.clause}`; params.push(...scopeClause.params); idx += scopeClause.params.length;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY p.year DESC, p.month DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getPayslipDetail(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT p.*, e.first_name, e.last_name, e.employee_code FROM payslips p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Payslip not found');
    return rows[0];
  }

  async markPaid(id: string, tenantId: string | null, userId?: string) {
    if (userId) {
      return this.paymentService.markPaidLegacy(id, tenantId, userId);
    }
    // Fallback: direct update when called outside an HTTP context (no user available)
    const { rows } = await this.db.query(
      `UPDATE payslips SET status = 'paid', paid_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Payslip not found');
    return rows[0];
  }

  async processPayrollRun(id: string, tenantId: string, processedBy: string) {
    const { rows: existing } = await this.db.query(
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Payroll run not found');
    if (existing[0].status === 'processed') {
      throw new BadRequestException('This payroll run has already been processed');
    }

    const { rows } = await this.db.query(
      `UPDATE payroll_runs SET status = 'processed', processed_by = $2, processed_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $3 RETURNING *`,
      [id, processedBy, tenantId],
    );

    await this.db.query(`UPDATE payslips SET status = 'processed' WHERE payroll_run_id = $1`, [id]);

    const { rows: psRows } = await this.db.query(
      `SELECT id, employee_id FROM payslips WHERE payroll_run_id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    for (const ps of psRows) {
      await this.payslipService.takeSnapshot(ps.id, tenantId, processedBy).catch(err =>
        this.logger.error(`Snapshot failed for ${ps.id}: ${err.message}`),
      );
    }

    // Move the attendance summaries backing this run to Payroll Processed —
    // permanently linking them to this run and blocking further recompute/edits.
    const { month, year } = existing[0];
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
    const employeeIds = psRows.map((p: any) => p.employee_id);
    if (employeeIds.length) {
      await this.db.query(
        `UPDATE payroll_attendance_summary
         SET status = 'payroll_processed', payroll_run_id = $1, payslip_count = $2,
             processed_by = $3, processed_at = now(), updated_at = now()
         WHERE tenant_id = $4 AND period_start = $5 AND period_end = $6
           AND employee_id = ANY($7::uuid[]) AND status IN ('approved', 'payroll_locked')`,
        [id, psRows.length, processedBy, tenantId, periodStart, periodEnd, employeeIds],
      );
    }

    return rows[0];
  }
}
