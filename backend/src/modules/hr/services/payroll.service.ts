import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { PayrollPaymentService } from './payroll-payment.service';
import { PayslipService } from './payslip.service';
import { OvertimeService } from './overtime.service';
import { TemplateService } from '../../platform/services/template.service';
import { CurrencyService } from '../../../shared/currency.service';
import { AuditLogService } from '../../platform/services/audit-log.service';

const PAYROLL_FORMULA_VERSION = 'legacy-v1';
type Queryable = Pick<DatabaseService, 'query'>;

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private db: DatabaseService,
    private paymentService: PayrollPaymentService,
    private payslipService: PayslipService,
    private overtimeService: OvertimeService,
    private currencyService: CurrencyService,
    @Optional() private auditLog?: AuditLogService,
    @Optional() private templateService?: TemplateService,
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
    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId, data.currency);
    const currencySnapshot = JSON.stringify(currency.snapshot);
    const { rows } = await this.db.query(
      `INSERT INTO salary_structures (tenant_id, employee_id, basic, hra, da, conveyance, medical,
        special_allowance, pf_employer, pf_employee, esi_employer, esi_employee, professional_tax, tds,
        currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base, exchange_rate_source,
        exchange_rate_as_of, currency_snapshot, effective_from)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23) RETURNING *`,
      [tenantId, data.employee_id, data.basic, data.hra || 0, data.da || 0, data.conveyance || 0,
        data.medical || 0, data.special_allowance || 0, data.pf_employer || 0, data.pf_employee || 0,
        data.esi_employer || 0, data.esi_employee || 0, data.professional_tax || 0, data.tds || 0,
        currency.currencyCode, currency.currencySymbol, currency.exchangeRate, currency.baseCurrency,
        currency.exchangeRateToBase, currency.exchangeRateSource, currency.exchangeRateAsOf,
        currencySnapshot, data.effective_from],
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

  async createPayrollRun(tenantId: string, month: number, year: number, branchId?: string, client: Queryable = this.db) {
    const existing = await this.findPayrollRunForUpdate(client, tenantId, month, year, branchId, false);
    if (existing) return existing;

    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId);
    const currencySnapshot = JSON.stringify(currency.snapshot);
    const { rows } = await client.query(
      `INSERT INTO payroll_runs (
        tenant_id, month, year, branch_id, currency, currency_symbol, exchange_rate,
        base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of, currency_snapshot,
        formula_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        RETURNING *`,
      [tenantId, month, year, branchId ?? null, currency.currencyCode, currency.currencySymbol,
        currency.exchangeRate, currency.baseCurrency, currency.exchangeRateToBase,
        currency.exchangeRateSource, currency.exchangeRateAsOf, currencySnapshot, PAYROLL_FORMULA_VERSION],
    );
    return rows[0];
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
  async generatePayslips(tenantId: string, month: number, year: number, branchId?: string, generatedBy?: string | null, requestId?: string | null) {
    return this.db.transaction((client) => this.generatePayslipsInTransaction(client, tenantId, month, year, branchId, generatedBy ?? null, requestId ?? null));
  }

  private async generatePayslipsInTransaction(client: Queryable, tenantId: string, month: number, year: number, branchId?: string, generatedBy?: string | null, requestId?: string | null) {
    await this.acquirePayrollGenerationLock(client, tenantId, month, year, branchId);

    let payrollRun = await this.findPayrollRunForUpdate(client, tenantId, month, year, branchId, true);
    if (!payrollRun) {
      payrollRun = await this.createPayrollRun(tenantId, month, year, branchId, client);
      payrollRun = await this.findPayrollRunForUpdate(client, tenantId, month, year, branchId, true);
    }
    if (!payrollRun) throw new BadRequestException('Payroll run could not be initialized');
    if (['processed', 'paid'].includes(payrollRun.status)) {
      throw new BadRequestException('Processed or paid payroll runs are immutable and cannot be regenerated');
    }
    if (payrollRun.generation_status === 'running') {
      throw new BadRequestException('Payroll generation is already running for this payroll run');
    }

    const lockResult = await client.query(
      `UPDATE payroll_runs
       SET generation_status = 'running',
           generation_started_at = now(),
           generation_completed_at = NULL,
           generation_failed_at = NULL,
           generation_error = NULL,
           generated_by = $4,
           request_id = $5,
           lock_version = lock_version + 1,
           updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND lock_version = $3 AND status NOT IN ('processed', 'paid')
       RETURNING *`,
      [payrollRun.id, tenantId, payrollRun.lock_version ?? 0, generatedBy ?? null, requestId ?? null],
    );
    if (!lockResult.rows.length) {
      throw new BadRequestException('Payroll run changed while generation was starting. Please retry.');
    }
    payrollRun = lockResult.rows[0];

    // Reset previously deducted fines for draft payslips in this cycle
    const resetPayslipsResult = await client.query(
      `SELECT id FROM payslips
       WHERE tenant_id = $1 AND month = $2 AND year = $3 AND status = 'draft'
         AND ($4::uuid IS NULL OR branch_id = $4)`,
      [tenantId, month, year, branchId ?? null],
    );
    const draftPayslipIds = resetPayslipsResult.rows.map((r: any) => r.id);

    if (draftPayslipIds.length > 0) {
      // 1. Delete associated 'payroll_deduction' payments
      await client.query(
        `DELETE FROM deduction_payments
         WHERE tenant_id = $1 AND payslip_id = ANY($2) AND payment_type = 'payroll_deduction'`,
        [tenantId, draftPayslipIds],
      );

      // 2. Revert employee_fines status back to 'approved' and clear amount/payslip linkage
      await client.query(
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
    const employees = await client.query(empQuery, empParams);

    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];

    // Bulk-load approved/locked attendance summaries for this period — payroll
    // is only generated against these; no summary means no payslip (see below).
    const { rows: summaryRows } = await client.query(
      `SELECT * FROM payroll_attendance_summary
       WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3
         AND status = 'payroll_locked'
         AND ($4::uuid IS NULL OR branch_id = $4)
       FOR UPDATE`,
      [tenantId, periodStart, periodEnd, branchId ?? null],
    );
    const summaryMap = new Map<string, any>(summaryRows.map((s: any) => [s.employee_id, s]));
    if (summaryMap.size === 0) {
      throw new BadRequestException(
        'No payroll-locked attendance summaries found for this period. Lock approved attendance summaries before generating payroll.',
      );
    }

    const payrollRunId = payrollRun.id;

    // Bulk-load approved fines targeted at this payroll cycle (additive, non-invasive)
    const fineParams: any[] = [tenantId, month, year, 'approved', 'payroll'];
    let fineQuery = `SELECT id, employee_id, fine_amount FROM employee_fines
      WHERE tenant_id = $1 AND payroll_month = $2 AND payroll_year = $3
        AND status = $4 AND deduction_mode = $5`;
    if (branchId) { fineQuery += ` AND branch_id = $6`; fineParams.push(branchId); }
    const { rows: fineRows } = await client.query(fineQuery, fineParams);
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

      const structure = await client.query(
        `SELECT * FROM salary_structures WHERE tenant_id = $1 AND employee_id = $2
          AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $4) ORDER BY effective_from DESC LIMIT 1`,
        [tenantId, emp.id, periodEnd, periodStart],
      );

      // Try resolving template
      let template: any = null;
      if (this.templateService) {
        try {
          template = await this.templateService.getResolved(tenantId, 'salary_structure', 'employee', emp.id);
        } catch (err) {
          this.logger.error(`Failed to resolve salary structure template for employee ${emp.id}: ${err.message}`);
        }
      }

      if (!structure.rows.length && !template) {
        skipped.push({ employee_id: emp.id, reason: 'no_salary_structure' });
        continue;
      }
      const config = template?.config || {};
      const payBasis = config.pay_basis || 'monthly_salary';
      const structureRow = structure.rows[0] || null;
      const structureBaseGross = structureRow
        ? this.sumNumbers(structureRow.basic, structureRow.hra, structureRow.da, structureRow.conveyance, structureRow.medical, structureRow.special_allowance)
        : 0;
      const fallbackObj = {
        basic: '0', hra: '0', da: '0', conveyance: '0', medical: '0', special_allowance: '0',
        pf_employer: '0', pf_employee: '0', esi_employer: '0', esi_employee: '0',
        professional_tax: '0', tds: '0'
      };

      const s = template
        ? (payBasis === 'monthly_salary' ? this.buildMonthlySalaryFromTemplate(config) : fallbackObj)
        : structureBaseGross > 0
          ? structureRow
          : fallbackObj;

      let gross = 0;
      let basic = 0;
      let hra = 0;
      let da = 0;
      let conveyance = 0;
      let medical = 0;
      let special_allowance = 0;

      let pf_employee = 0;
      let esi_employee = 0;
      let professional_tax = 0;
      let tds = 0;

      let rate = 0;
      let workedUnits = 0;
      let calculationMethod = 'Monthly Salary';
      let overtime = 0;

      const daysInPeriod = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const payableDays = parseFloat(summary.payable_days ?? summary.present_days ?? 0);
      const approvedHours = parseFloat(summary.total_hours || 0);
      const halfDayCount = parseFloat(summary.half_day_count || 0);

      if (payBasis === 'monthly_salary') {
        const baseGross = parseFloat(s.basic ?? 0) + parseFloat(s.hra ?? 0) + parseFloat(s.da ?? 0) +
          parseFloat(s.conveyance ?? 0) + parseFloat(s.medical ?? 0) + parseFloat(s.special_allowance ?? 0);
        
        gross = baseGross;
        basic = parseFloat(s.basic ?? 0);
        hra = parseFloat(s.hra ?? 0);
        da = parseFloat(s.da ?? 0);
        conveyance = parseFloat(s.conveyance ?? 0);
        medical = parseFloat(s.medical ?? 0);
        special_allowance = parseFloat(s.special_allowance ?? 0);

        pf_employee = parseFloat(s.pf_employee ?? s.pf ?? 0);
        esi_employee = parseFloat(s.esi_employee ?? s.esi ?? 0);
        professional_tax = parseFloat(s.professional_tax ?? 0);
        tds = parseFloat(s.tds ?? 0);

        const businessWorkingDays = summary.business_working_days || summary.total_working_days || 0;
        if (businessWorkingDays > 0) {
          const ratio = Math.min(payableDays / businessWorkingDays, 1);
          gross = gross * ratio;

          const approvedOtHours = parseFloat(summary.approved_ot_hours ?? 0);
          if (approvedOtHours > 0) {
            const hourlyRate = basic / (businessWorkingDays * 8);
            const multiplier = this.number(summary.overtime_multiplier, 1.5);
            overtime = hourlyRate * approvedOtHours * multiplier;
          }
        }
        
        rate = baseGross;
        workedUnits = payableDays;
        calculationMethod = 'Monthly Salary';
      } else if (payBasis === 'weekly_salary') {
        const weeklyRate = parseFloat(config.weekly_salary || config.weekly_rate || 0);
        const completedWeeks = Math.floor(daysInPeriod / 7);
        gross = weeklyRate * completedWeeks;
        basic = gross;
        rate = weeklyRate;
        workedUnits = completedWeeks;
        calculationMethod = 'Weekly Salary';
      } else if (payBasis === 'daily_wage' || payBasis === 'daily_weekly_payroll' || payBasis === 'daily_monthly_payroll') {
        const dailyRate = parseFloat(config.daily_rate || config.daily_wage || 0);
        gross = dailyRate * payableDays;
        basic = gross;
        rate = dailyRate;
        workedUnits = payableDays;
        calculationMethod = payBasis === 'daily_wage' ? 'Daily Wage' : payBasis === 'daily_weekly_payroll' ? 'Daily (Weekly)' : 'Daily (Monthly)';
      } else if (payBasis === 'hourly_wage' || payBasis === 'hourly_weekly_payroll' || payBasis === 'hourly_monthly_payroll') {
        const hourlyRateVal = parseFloat(config.hourly_rate || 0);
        gross = hourlyRateVal * approvedHours;
        basic = gross;
        rate = hourlyRateVal;
        workedUnits = approvedHours;
        calculationMethod = payBasis === 'hourly_wage' ? 'Hourly Wage' : payBasis === 'hourly_weekly_payroll' ? 'Hourly (Weekly)' : 'Hourly (Monthly)';
      } else if (payBasis === 'half_day_rate') {
        const halfDayRateVal = parseFloat(config.half_day_rate || 0);
        gross = halfDayRateVal * halfDayCount;
        basic = gross;
        rate = halfDayRateVal;
        workedUnits = halfDayCount;
        calculationMethod = 'Half-Day Rate';
      } else {
        // custom or other fallback
        const customRate = parseFloat(config.custom_rate || 0);
        gross = customRate * payableDays;
        basic = gross;
        rate = customRate;
        workedUnits = payableDays;
        calculationMethod = 'Custom Pay';
      }

      // Statutory deductions for non-monthly pay basis
      if (payBasis !== 'monthly_salary') {
        if (config.pf_applicable !== false) {
          const pfEmpePct = parseFloat(config.pf_employee_percent || 12);
          const pfCap = parseFloat(config.pf_wage_cap || 15000);
          const pfCapOn = config.pf_cap_enabled !== false;
          const pfBase = pfCapOn ? Math.min(basic, pfCap) : basic;
          pf_employee = Math.round((pfEmpePct / 100) * pfBase);
        }
        if (config.esi_applicable !== false) {
          const esiEmpePct = parseFloat(config.esi_employee_percent || 0.75);
          const esiCeiling = parseFloat(config.esi_wage_ceiling || 21000);
          if (gross <= esiCeiling) {
            esi_employee = Math.round((esiEmpePct / 100) * gross);
          }
        }
        if (config.pt_applicable !== false) {
          if (config.pt_manual_override === true) {
            professional_tax = parseFloat(config.pt_monthly_amount || 0);
          } else if (config.pt_state) {
            professional_tax = this.lookupPT(config.pt_state, gross);
          }
        }
        if (config.tds_applicable === true) {
          tds = parseFloat(config.tds_monthly_estimated || 0);
        }

        // Calculate overtime for non-monthly pay basis
        if (config.ot_eligible !== false) {
          const approvedOtHours = parseFloat(summary.approved_ot_hours ?? 0);
          if (approvedOtHours > 0) {
            let hourlyRate = 0;
            if (payBasis === 'hourly_wage' || payBasis === 'hourly_weekly_payroll' || payBasis === 'hourly_monthly_payroll') {
              hourlyRate = parseFloat(config.hourly_rate || 0);
            } else if (payBasis === 'daily_wage' || payBasis === 'daily_weekly_payroll' || payBasis === 'daily_monthly_payroll') {
              const stdHours = parseFloat(config.standard_hours_per_day || 8);
              const dailyRate = parseFloat(config.daily_rate || config.daily_wage || 0);
              hourlyRate = dailyRate / (stdHours || 8);
            } else if (payBasis === 'weekly_salary') {
              const stdHours = parseFloat(config.standard_hours_per_day || 8);
              const stdDaysWeek = parseFloat(config.standard_working_days_per_week || 6);
              const weeklyRate = parseFloat(config.weekly_salary || config.weekly_rate || 0);
              hourlyRate = weeklyRate / ((stdDaysWeek || 6) * (stdHours || 8));
            } else if (payBasis === 'half_day_rate') {
              const halfDayHours = parseFloat(config.half_day_hours || 4);
              const halfDayRate = parseFloat(config.half_day_rate || 0);
              hourlyRate = halfDayRate / (halfDayHours || 4);
            }
            const multiplier = this.number(summary.overtime_multiplier, 1.5);
            overtime = hourlyRate * approvedOtHours * multiplier;
          }
        }
      }

      const baseDeductions = pf_employee + esi_employee + professional_tax + tds;

      // Aggregate approved fines for this employee's payroll cycle (additive, non-invasive)
      const empFines = finesMap.get(emp.id) ?? [];
      const fineDeductionTotal = empFines.reduce((sum: number, f: any) => sum + parseFloat(f.fine_amount), 0);
      const fineDeductionRefs = empFines.map((f: any) => f.id);

      const totalDeductions = baseDeductions + fineDeductionTotal;
      const net = gross + overtime - totalDeductions;

      const salarySnapshot = this.buildSalarySnapshot(structureRow, template, config, s);
      const overtimeSnapshot = this.buildOvertimeSnapshot(summary, overtime);
      const payrollHash = this.buildPayrollHash({
        employeeId: emp.id,
        attendanceVersion: summary.generation_version ?? 1,
        salaryVersion: salarySnapshot.version,
        formulaVersion: PAYROLL_FORMULA_VERSION,
        overtimeVersion: overtimeSnapshot.version,
        leaveVersion: summary.generation_version ?? 1,
        currencyVersion: payrollRun.exchange_rate_as_of ?? payrollRun.updated_at ?? payrollRun.created_at,
        month,
        year,
      });

      const { rows } = await client.query(
        `INSERT INTO payslips (tenant_id, employee_id, month, year, basic, hra, da, conveyance, medical,
          special_allowance, overtime, gross_salary, pf, esi, professional_tax, tds,
          fine_deductions, fine_deduction_refs, total_deductions, net_salary, branch_id, payroll_run_id,
          pay_basis, rate, worked_units, calculation_method, currency, currency_symbol, exchange_rate,
          base_currency, exchange_rate_to_base, exchange_rate_source, exchange_rate_as_of, currency_snapshot,
          salary_snapshot, template_snapshot, calculation_snapshot, formula_version,
          attendance_version, salary_version, overtime_version, leave_version, currency_version,
          overtime_policy_snapshot, overtime_multiplier, overtime_rate, overtime_formula, overtime_approved_at,
          payroll_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::uuid[],$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb,
            $35::jsonb,$36::jsonb,$37::jsonb,$38,$39,$40,$41,$42,$43,$44::jsonb,$45,$46,$47,$48,$49)
          ON CONFLICT (tenant_id, employee_id, month, year) DO UPDATE SET
            basic=$5, hra=$6, da=$7, conveyance=$8, medical=$9, special_allowance=$10,
            overtime=$11, gross_salary=$12, pf=$13, esi=$14, professional_tax=$15, tds=$16,
            fine_deductions=$17, fine_deduction_refs=$18::uuid[],
            total_deductions=$19, net_salary=$20,
            branch_id=COALESCE(payslips.branch_id, $21), payroll_run_id=$22,
            pay_basis=$23, rate=$24, worked_units=$25, calculation_method=$26,
            currency=$27, currency_symbol=$28, exchange_rate=$29,
            base_currency=$30, exchange_rate_to_base=$31, exchange_rate_source=$32,
            exchange_rate_as_of=$33, currency_snapshot=$34::jsonb,
            salary_snapshot=$35::jsonb, template_snapshot=$36::jsonb, calculation_snapshot=$37::jsonb,
            formula_version=$38, attendance_version=$39, salary_version=$40, overtime_version=$41,
            leave_version=$42, currency_version=$43, overtime_policy_snapshot=$44::jsonb,
            overtime_multiplier=$45, overtime_rate=$46, overtime_formula=$47, overtime_approved_at=$48,
            payroll_hash=$49, updated_at=now()
          WHERE payslips.status = 'draft'
          RETURNING *`,
        [
          tenantId, emp.id, month, year,
          basic, hra, da, conveyance, medical, special_allowance,
          overtime, gross + overtime,
          pf_employee, esi_employee, professional_tax, tds,
          fineDeductionTotal, `{${fineDeductionRefs.join(',')}}`,
          totalDeductions, net, emp.branch_id ?? null, payrollRunId,
          payBasis, rate, workedUnits, calculationMethod,
          payrollRun.currency, payrollRun.currency_symbol, payrollRun.exchange_rate,
          payrollRun.base_currency ?? payrollRun.currency,
          payrollRun.exchange_rate_to_base ?? payrollRun.exchange_rate ?? null,
          payrollRun.exchange_rate_source ?? 'payroll_run_snapshot',
          payrollRun.exchange_rate_as_of ?? new Date().toISOString(),
          JSON.stringify(payrollRun.currency_snapshot ?? {}),
          JSON.stringify(salarySnapshot),
          JSON.stringify(template ?? {}),
          JSON.stringify({
            payBasis, rate, workedUnits, calculationMethod,
            payableDays, businessWorkingDays: summary.business_working_days,
            baseDeductions, fineDeductionTotal, totalDeductions,
          deterministicInputs: true,
          statutoryDeductionProration: 'full',
          }),
          PAYROLL_FORMULA_VERSION,
          summary.generation_version ?? 1,
          salarySnapshot.version,
          overtimeSnapshot.version,
          summary.generation_version ?? 1,
          payrollRun.exchange_rate_as_of ?? payrollRun.updated_at ?? payrollRun.created_at ?? null,
          JSON.stringify(overtimeSnapshot),
          overtimeSnapshot.multiplier,
          overtimeSnapshot.rate,
          overtimeSnapshot.formula,
          overtimeSnapshot.approvedAt,
          payrollHash,
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
        await client.query(
          `UPDATE overtime_requests
           SET payslip_id = $1, ot_amount = $2, updated_at = now()
           WHERE tenant_id = $3 AND employee_id = $4
             AND payroll_month = $5 AND payroll_year = $6
             AND status = 'approved' AND payslip_id IS NULL AND deleted_at IS NULL`,
          [rows[0].id, overtime, tenantId, emp.id, month, year],
        );
      }

      // Mark deducted fines as payroll_deducted and create payment records
      if (empFines.length) {
        const payslipId = rows[0].id;

        for (const fine of empFines) {
          await client.query(
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
          await client.query(
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

    await client.query(
      `UPDATE payroll_runs
       SET total_gross = $3, total_deductions = $4, total_net = $5,
           generation_status = 'completed', generation_completed_at = now(),
           generated_at = now(), formula_version = $6, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [payrollRunId, tenantId, totalGross, totalDeductions, totalNet, PAYROLL_FORMULA_VERSION],
    );

    const employeeIds = results.map((p: any) => p.employee_id);
    if (employeeIds.length) {
      await client.query(
        `UPDATE payroll_attendance_summary
         SET payroll_run_id = $1, payslip_count = $2, updated_at = now()
         WHERE tenant_id = $3 AND period_start = $4 AND period_end = $5
           AND employee_id = ANY($6::uuid[]) AND status = 'payroll_locked'`,
        [payrollRunId, results.length, tenantId, periodStart, periodEnd, employeeIds],
      );
    }

    await this.insertPayrollAuditEvent(client, {
      tenantId, branchId: branchId ?? null, payrollRunId, eventType: 'payroll_generated',
      userId: generatedBy ?? null, previousState: 'running', newState: 'completed',
      reason: 'Payroll generated from locked attendance summaries', requestId,
      metadata: { month, year, payslipCount: results.length, skippedCount: skipped.length },
    });

    return { payroll_run_id: payrollRunId, payslips: results, skipped };
  }

  async getPayslips(tenantId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, month, year, status, branch_id, accessScope = GLOBAL_ACCESS_SCOPE as AccessScope } = filters;
    let query = `SELECT p.*, p.basic AS basic_salary,
        e.first_name, e.last_name, e.employee_code,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
        b.name AS branch_name,
        d.name AS department_name
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN branches b ON b.id = COALESCE(p.branch_id, e.branch_id) AND b.tenant_id = p.tenant_id
      LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1`;
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
    const { run, psRows } = await this.db.transaction(async (client) => {
      const { rows: existing } = await client.query(
        `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      );
      if (!existing.length) throw new NotFoundException('Payroll run not found');
      if (['processed', 'paid'].includes(existing[0].status)) {
        throw new BadRequestException('This payroll run has already been processed');
      }
      if (existing[0].generation_status && existing[0].generation_status !== 'completed') {
        throw new BadRequestException('Payroll run must be generated successfully before processing');
      }

      const { rows } = await client.query(
        `UPDATE payroll_runs SET status = 'processed', processed_by = $2, processed_at = now(), updated_at = now()
          WHERE id = $1 AND tenant_id = $3 RETURNING *`,
        [id, processedBy, tenantId],
      );

      await client.query(
        `UPDATE payslips SET status = 'processed', updated_at = now()
         WHERE payroll_run_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [id, tenantId],
      );

      const { rows: selectedPayslips } = await client.query(
        `SELECT id, employee_id FROM payslips WHERE payroll_run_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );

      const { month, year } = existing[0];
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
      const employeeIds = selectedPayslips.map((p: any) => p.employee_id);
      if (employeeIds.length) {
        await client.query(
          `UPDATE payroll_attendance_summary
           SET status = 'payroll_processed', payroll_run_id = $1, payslip_count = $2,
               processed_by = $3, processed_at = now(), updated_at = now()
           WHERE tenant_id = $4 AND period_start = $5 AND period_end = $6
             AND employee_id = ANY($7::uuid[]) AND status = 'payroll_locked'`,
          [id, selectedPayslips.length, processedBy, tenantId, periodStart, periodEnd, employeeIds],
        );
      }

      await this.insertPayrollAuditEvent(client, {
        tenantId,
        branchId: rows[0].branch_id ?? null,
        payrollRunId: id,
        eventType: 'payroll_processed',
        userId: processedBy,
        previousState: existing[0].status,
        newState: 'processed',
        reason: 'Payroll run processed',
        requestId: rows[0].request_id ?? null,
        metadata: { payslipCount: selectedPayslips.length },
      });

      return { run: rows[0], psRows: selectedPayslips };
    });

    for (const ps of psRows) {
      await this.payslipService.takeSnapshot(ps.id, tenantId, processedBy).catch(err =>
        this.logger.error(`Snapshot failed for ${ps.id}: ${err.message}`),
      );
    }

    return run;
  }

  async processPayrollRunLegacy(id: string, tenantId: string, processedBy: string) {
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
           AND employee_id = ANY($7::uuid[]) AND status = 'payroll_locked'`,
        [id, psRows.length, processedBy, tenantId, periodStart, periodEnd, employeeIds],
      );
    }

    return rows[0];
  }

  private async findPayrollRunForUpdate(
    client: Queryable,
    tenantId: string,
    month: number,
    year: number,
    branchId: string | undefined,
    forUpdate: boolean,
  ) {
    const { rows } = await client.query(
      `SELECT * FROM payroll_runs
       WHERE tenant_id = $1 AND month = $2 AND year = $3
         AND (($4::uuid IS NULL AND branch_id IS NULL) OR branch_id = $4)
       LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [tenantId, month, year, branchId ?? null],
    );
    return rows[0] ?? null;
  }

  private async acquirePayrollGenerationLock(client: Queryable, tenantId: string, month: number, year: number, branchId?: string) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [tenantId, `${branchId ?? 'org'}:${year}:${month}`],
    );
  }

  private buildSalarySnapshot(structureRow: any, template: any, config: Record<string, any>, resolvedSalary: Record<string, any>) {
    const version = template?.version
      ?? template?.updated_at
      ?? structureRow?.updated_at
      ?? structureRow?.effective_from
      ?? 'unversioned';
    return {
      source: template ? 'template' : 'salary_structure',
      version: String(version),
      salaryStructureId: structureRow?.id ?? null,
      templateId: template?.id ?? null,
      effectiveFrom: structureRow?.effective_from ?? null,
      effectiveTo: structureRow?.effective_to ?? null,
      config,
      resolvedSalary,
      capturedAt: new Date().toISOString(),
    };
  }

  private buildOvertimeSnapshot(summary: any, overtimeAmount: number) {
    const policySnapshot = summary.overtime_policy_snapshot ?? {};
    const version = policySnapshot.version
      ?? policySnapshot.template_id
      ?? summary.overtime_approved_at
      ?? summary.generation_version
      ?? 'unversioned';
    return {
      ...policySnapshot,
      version: String(version),
      approvedHours: this.number(summary.approved_ot_hours),
      multiplier: this.number(summary.overtime_multiplier, 1.5),
      rate: summary.overtime_rate === null || summary.overtime_rate === undefined ? null : this.number(summary.overtime_rate),
      formula: summary.overtime_formula ?? 'hourly_rate * approved_ot_hours * multiplier',
      approvedAt: summary.overtime_approved_at ?? null,
      amount: overtimeAmount,
      capturedAt: new Date().toISOString(),
    };
  }

  private buildPayrollHash(input: {
    employeeId: string;
    attendanceVersion: any;
    salaryVersion: any;
    formulaVersion: string;
    overtimeVersion: any;
    leaveVersion: any;
    currencyVersion: any;
    month: number;
    year: number;
  }) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private async insertPayrollAuditEvent(client: Queryable, data: {
    tenantId: string;
    branchId?: string | null;
    payrollRunId?: string | null;
    payslipId?: string | null;
    employeeId?: string | null;
    eventType: string;
    userId?: string | null;
    previousState?: string | null;
    newState?: string | null;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, any>;
  }) {
    await client.query(
      `INSERT INTO payroll_audit_events (
         tenant_id, branch_id, payroll_run_id, payslip_id, employee_id, event_type,
         user_id, previous_state, new_state, reason, request_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        data.tenantId,
        data.branchId ?? null,
        data.payrollRunId ?? null,
        data.payslipId ?? null,
        data.employeeId ?? null,
        data.eventType,
        data.userId ?? null,
        data.previousState ?? null,
        data.newState ?? null,
        data.reason ?? null,
        data.requestId ?? null,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
  }

  private lookupPT(state: string, gross: number): number {
    const PT_STATES: Record<string, Array<{ min: number; max: number; amount: number }>> = {
      karnataka: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 200 }],
      maharashtra: [{ min: 0, max: 7500, amount: 0 }, { min: 7501, max: 10000, amount: 175 }, { min: 10001, max: Infinity, amount: 200 }],
      kerala: [{ min: 0, max: 11999, amount: 0 }, { min: 12000, max: 17999, amount: 120 }, { min: 18000, max: 29999, amount: 180 }, { min: 30000, max: Infinity, amount: 200 }],
      tamil_nadu: [{ min: 0, max: 21000, amount: 0 }, { min: 21001, max: Infinity, amount: 208 }],
      andhra_pradesh: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: 19999, amount: 150 }, { min: 20000, max: Infinity, amount: 200 }],
      telangana: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: 19999, amount: 150 }, { min: 20000, max: Infinity, amount: 200 }],
      west_bengal: [{ min: 0, max: 8499, amount: 0 }, { min: 8500, max: 9999, amount: 90 }, { min: 10000, max: 14999, amount: 110 }, { min: 15000, max: 24999, amount: 130 }, { min: 25000, max: 39999, amount: 150 }, { min: 40000, max: Infinity, amount: 200 }],
      madhya_pradesh: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 208 }],
      odisha: [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: Infinity, amount: 200 }],
      assam: [{ min: 0, max: 9999, amount: 0 }, { min: 10000, max: Infinity, amount: 208 }],
    };
    const slabs = PT_STATES[state.toLowerCase()];
    if (!slabs) return 0;
    return slabs.find(sl => gross >= sl.min && gross <= sl.max)?.amount ?? 0;
  }

  private buildMonthlySalaryFromTemplate(config: Record<string, any>) {
    const ov: Record<string, boolean> = config.manual_overrides ?? {};
    const monthlyGross = this.resolveMonthlyTemplateGross(config);

    const basicPct = this.number(config.basic_percent_of_ctc, 40);
    const basic = ov.basic
      ? this.number(config._basic)
      : config.salary_input_mode === 'basic_salary'
        ? this.number(config.basic_monthly_input)
        : Math.round((basicPct / 100) * monthlyGross);

    const hra = ov.hra
      ? this.number(config._hra)
      : Math.round((this.number(config.hra_percent_of_basic, 40) / 100) * basic);
    const da = ov.da
      ? this.number(config._da)
      : Math.round((this.number(config.da_percent_of_basic) / 100) * basic);
    const conveyance = ov.conveyance ? this.number(config._conveyance) : this.number(config.conveyance_fixed, 1600);
    const medical = ov.medical ? this.number(config._medical) : this.number(config.medical_fixed, 1250);
    const food = ov.food ? this.number(config._food) : this.number(config.food_allowance_fixed);
    const travel = ov.travel ? this.number(config._travel) : this.number(config.travel_allowance_fixed);
    const shift = ov.shift ? this.number(config._shift) : this.number(config.shift_allowance_fixed);
    const bonus = config.bonus_applicable === false
      ? 0
      : ov.bonus
        ? this.number(config._bonus)
        : config.bonus_type === 'fixed'
          ? Math.round(this.number(config.bonus_fixed_annual) / 12)
          : Math.round((this.number(config.bonus_percent_of_basic, 8.33) / 100) * basic);

    const pfEmployer = this.computePf(config, basic, 'employer');
    const gratuity = config.gratuity_applicable === false
      ? 0
      : Math.round((this.number(config.gratuity_percent_of_basic, 4.81) / 100) * basic);
    const lwfEmployer = config.lwf_applicable ? this.number(config.lwf_employer) : 0;
    const baseSum = basic + hra + da + conveyance + medical + food + travel + shift + bonus;
    const estimatedGross = monthlyGross - pfEmployer - gratuity - lwfEmployer;
    const esiEmployer = config.esi_applicable !== false && estimatedGross <= this.number(config.esi_wage_ceiling, 21000)
      ? Math.round((this.number(config.esi_employer_percent, 3.25) / 100) * estimatedGross)
      : 0;
    const targetGross = monthlyGross - pfEmployer - gratuity - lwfEmployer - esiEmployer;
    const special = ov.special
      ? this.number(config._special)
      : config.special_allowance_auto !== false
        ? Math.max(0, Math.round(targetGross - baseSum))
        : this.number(config.special_allowance_fixed);

    const gross = baseSum + special;
    const pfEmployee = this.computePf(config, basic, 'employee');
    const esiEmployee = config.esi_applicable !== false && gross <= this.number(config.esi_wage_ceiling, 21000)
      ? Math.round((this.number(config.esi_employee_percent, 0.75) / 100) * gross)
      : 0;
    const professionalTax = config.pt_applicable === false
      ? 0
      : config.pt_manual_override === true
        ? this.number(config.pt_monthly_amount)
        : config.pt_state
          ? this.lookupPT(config.pt_state, gross)
          : this.number(config.professional_tax);
    const tds = config.tds_applicable === true ? this.number(config.tds_monthly_estimated) : 0;

    return {
      basic,
      hra,
      da,
      conveyance,
      medical,
      special_allowance: food + travel + shift + bonus + special,
      pf_employer: pfEmployer,
      pf_employee: pfEmployee,
      esi_employer: esiEmployer,
      esi_employee: esiEmployee,
      professional_tax: professionalTax,
      tds,
    };
  }

  private resolveMonthlyTemplateGross(config: Record<string, any>): number {
    if (this.number(config.monthly_gross_target) > 0) return this.number(config.monthly_gross_target);
    if (this.number(config.monthly_ctc_input) > 0) return this.number(config.monthly_ctc_input);
    if (this.number(config.annual_ctc_amount) > 0) return this.number(config.annual_ctc_amount) / 12;
    if (this.number(config.annual_ctc_lpa) > 0) return this.number(config.annual_ctc_lpa) / 12;

    if (config.salary_input_mode === 'basic_salary') {
      const basic = this.number(config.basic_monthly_input);
      const basicPct = this.number(config.basic_percent_of_ctc, 40);
      return basicPct > 0 ? (basic * 100) / basicPct : 0;
    }

    return 0;
  }

  private computePf(config: Record<string, any>, basic: number, side: 'employee' | 'employer'): number {
    if (config.pf_applicable === false) return 0;
    const pct = side === 'employee'
      ? this.number(config.pf_employee_percent, 12)
      : this.number(config.pf_employer_percent, 12);
    const pfCap = this.number(config.pf_wage_cap, 15000);
    const pfBase = config.pf_cap_enabled !== false ? Math.min(basic, pfCap) : basic;
    return Math.round((pct / 100) * pfBase);
  }

  private sumNumbers(...values: any[]): number {
    return values.reduce((sum, value) => sum + this.number(value), 0);
  }

  private number(value: any, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
