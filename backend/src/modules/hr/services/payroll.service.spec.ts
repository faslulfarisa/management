import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

const STRUCTURE_ROW = (basic: string) => ({
  basic, hra: '0', da: '0', conveyance: '0', medical: '0', special_allowance: '0',
  pf_employee: '0', esi_employee: '0', professional_tax: '0', tds: '0',
});

describe('PayrollService — generatePayslips()', () => {
  let db: { query: jest.Mock; transaction: jest.Mock };
  let overtimeService: { getApprovedOtForPayroll: jest.Mock; linkPayslipToApprovedRequests: jest.Mock };
  let currencyService: { getTenantCurrencySnapshot: jest.Mock };
  let service: PayrollService;

  beforeEach(() => {
    db = { query: jest.fn(), transaction: jest.fn((fn) => fn(db)) };
    overtimeService = {
      getApprovedOtForPayroll: jest.fn().mockResolvedValue({ eligible: false, approvedHours: 0, policyMultiplier: 1.5 }),
      linkPayslipToApprovedRequests: jest.fn().mockResolvedValue(undefined),
    };
    currencyService = { getTenantCurrencySnapshot: jest.fn() };
    service = new PayrollService(db as any, {} as any, {} as any, overtimeService as any, currencyService as any, undefined, { getResolved: jest.fn().mockResolvedValue(null) } as any);
  });

  const mockRun = {
    id: 'run-1',
    status: 'draft',
    generation_status: 'completed',
    lock_version: 0,
    month: 1,
    year: 2026,
    currency: 'INR',
    currency_symbol: '₹',
    exchange_rate: '1',
    base_currency: 'INR',
    exchange_rate_to_base: '1',
    exchange_rate_source: 'test',
    exchange_rate_as_of: '2026-01-31T00:00:00.000Z',
    currency_snapshot: {},
  };
  const mockRunningRun = { ...mockRun, generation_status: 'running', lock_version: 1 };
  const mockRunStart = () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    db.query.mockResolvedValueOnce({ rows: [mockRun] });
    db.query.mockResolvedValueOnce({ rows: [mockRunningRun] });
  };

  const findCall = (sqlFragment: string) =>
    db.query.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes(sqlFragment));

  it('throws when no approved/locked attendance summaries exist for the period — no payroll without an approved summary', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] }) // reset draft payslips
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] }) // employees
      .mockResolvedValueOnce({ rows: [] }); // qualifying summaries -> none

    await expect(service.generatePayslips('t1', 1, 2026)).rejects.toThrow(BadRequestException);
  });

  it('prorates gross by payable_days/business_working_days and skips overtime when approved_ot_hours is 0', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 18, approved_ot_hours: 0, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] }) // fines
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '9000', net_salary: '9000', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] }) // totals update
      .mockResolvedValueOnce({ rows: [] }) // summary run linkage
      .mockResolvedValueOnce({ rows: [] }); // audit

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    const payslipInsert = findCall('INSERT INTO payslips');
    expect(payslipInsert![1][11]).toBeCloseTo(9000); // gross_salary = 10000 * (18/20)
    expect(payslipInsert![1][10]).toBe(0); // overtime
    expect(overtimeService.getApprovedOtForPayroll).not.toHaveBeenCalled(); // no live re-query when approved_ot_hours is 0
  });

  it('computes the overtime premium from business_working_days and the stored approved_ot_hours snapshot, not a live re-query', async () => {
    overtimeService.getApprovedOtForPayroll.mockResolvedValueOnce({ eligible: true, approvedHours: 999, policyMultiplier: 2 });
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 5, overtime_multiplier: 2, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('8000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '8500', net_salary: '8500', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] }) // OT link
      .mockResolvedValueOnce({ rows: [] }) // totals
      .mockResolvedValueOnce({ rows: [] }) // summary run linkage
      .mockResolvedValueOnce({ rows: [] }); // audit

    await service.generatePayslips('t1', 1, 2026);

    // hourlyRate = 8000 / (20*8) = 50; overtime = 50 * 5 (snapshot, not the 999 from the live query) * 2 = 500
    const payslipInsert = findCall('INSERT INTO payslips');
    expect(payslipInsert![1][10]).toBeCloseTo(500);
  });

  it('skips an employee with no qualifying attendance summary while still paying employees who have one', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }, { id: 'emp-2', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 0, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '10000', net_salary: '10000', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(1);
    expect(result.skipped).toEqual([{ employee_id: 'emp-2', reason: 'no_approved_attendance_summary' }]);
  });

  it('does not overwrite an already-finalized payslip when the conflict update is suppressed', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 0, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [] }) // INSERT...ON CONFLICT DO UPDATE WHERE status='draft' matched nothing
      .mockResolvedValueOnce({ rows: [] }) // totals
      .mockResolvedValueOnce({ rows: [] }); // audit

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(0);
    expect(result.skipped).toEqual([{ employee_id: 'emp-1', reason: 'payslip_already_finalized' }]);
  });

  it('correctly calculates pay basis for an hourly worker using resolved template config', async () => {
    overtimeService.getApprovedOtForPayroll.mockResolvedValueOnce({ eligible: true, approvedHours: 5, policyMultiplier: 2 });
    const mockTemplateService = {
      getResolved: jest.fn().mockResolvedValue({
        config: {
          pay_basis: 'hourly_wage',
          hourly_rate: 350,
          ot_eligible: true,
          pf_applicable: false,
          esi_applicable: false,
          pt_applicable: false,
        },
      }),
    };
    service = new PayrollService(db as any, {} as any, {} as any, overtimeService as any, currencyService as any, undefined, mockTemplateService as any);

    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 5, overtime_multiplier: 2, total_hours: 182, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no salary structure row (should fallback to virtual structure)
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '67200', net_salary: '67200', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] }) // OT link
      .mockResolvedValueOnce({ rows: [] }) // totals
      .mockResolvedValueOnce({ rows: [] }) // summary run linkage
      .mockResolvedValueOnce({ rows: [] }); // audit

    await service.generatePayslips('t1', 1, 2026);

    const payslipInsert = findCall('INSERT INTO payslips');
    // Hourly Gross = 182 * 350 = 63,700
    // Hourly OT = 5 * 350 * 2 (multiplier) = 3,500
    // Total Gross = 63,700 + 3,500 = 67,200
    expect(payslipInsert![1][11]).toBeCloseTo(67200); // gross_salary
    expect(payslipInsert![1][10]).toBeCloseTo(3500); // overtime
    expect(payslipInsert![1][22]).toBe('hourly_wage'); // pay_basis
    expect(payslipInsert![1][23]).toBe(350); // rate
    expect(payslipInsert![1][24]).toBe(182); // worked_units
    expect(payslipInsert![1][25]).toBe('Hourly Wage'); // calculation_method
  });

  it('uses a resolved monthly salary template when no legacy salary structure row exists', async () => {
    const mockTemplateService = {
      getResolved: jest.fn().mockResolvedValue({
        config: {
          pay_basis: 'monthly_salary',
          salary_input_mode: 'monthly_ctc',
          monthly_ctc_input: 50000,
          basic_percent_of_ctc: 40,
          hra_percent_of_basic: 40,
          conveyance_fixed: 1600,
          medical_fixed: 1250,
          pf_applicable: false,
          esi_applicable: false,
          pt_applicable: false,
          tds_applicable: false,
          bonus_applicable: false,
          gratuity_applicable: false,
        },
      }),
    };
    service = new PayrollService(db as any, {} as any, {} as any, overtimeService as any, currencyService as any, undefined, mockTemplateService as any);

    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockRun] })
      .mockResolvedValueOnce({ rows: [mockRunningRun] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 25, payable_days: 20, approved_ot_hours: 0, status: 'payroll_locked', generation_version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no salary_structures row; monthly template must drive the salary
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '40000', net_salary: '40000', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    const payslipInsert = findCall('INSERT INTO payslips');
    expect(payslipInsert![1][4]).toBe(20000); // basic = 40% of 50,000
    expect(payslipInsert![1][5]).toBe(8000); // hra = 40% of basic
    expect(payslipInsert![1][9]).toBe(19150); // special allowance balances the 50,000 gross target
    expect(payslipInsert![1][11]).toBeCloseTo(40000); // prorated by payable/business days: 50,000 * 20/25
    expect(payslipInsert![1][19]).toBeCloseTo(40000); // net salary
    expect(payslipInsert![1][22]).toBe('monthly_salary');
    expect(payslipInsert![1][23]).toBe(50000); // monthly rate shown on payslip
  });
});

describe('PayrollService — processPayrollRun()', () => {
  let db: { query: jest.Mock; transaction: jest.Mock };
  let payslipService: { takeSnapshot: jest.Mock };
  let service: PayrollService;

  beforeEach(() => {
    db = { query: jest.fn(), transaction: jest.fn((fn) => fn(db)) };
    payslipService = { takeSnapshot: jest.fn().mockResolvedValue(undefined) };
    service = new PayrollService(db as any, {} as any, payslipService as any, {} as any, {} as any, undefined, { getResolved: jest.fn().mockResolvedValue(null) } as any);
  });

  it('blocks re-processing a payroll run that has already been processed', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'processed', month: 1, year: 2026 }] });
    await expect(service.processPayrollRun('run-1', 't1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('stamps the backing attendance summaries to payroll_processed with run id and payslip count', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'draft', generation_status: 'completed', month: 1, year: 2026 }] }) // existing run
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'processed' }] }) // UPDATE payroll_runs
      .mockResolvedValueOnce({ rows: [] }) // UPDATE payslips SET status='processed'
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', employee_id: 'emp-1' }] }) // SELECT payslips for snapshotting
      .mockResolvedValueOnce({ rows: [] }) // UPDATE payroll_attendance_summary
      .mockResolvedValueOnce({ rows: [] }); // audit

    await service.processPayrollRun('run-1', 't1', 'user-1');

    const summaryUpdate = db.query.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('UPDATE payroll_attendance_summary'));
    expect(summaryUpdate![1]).toEqual(['run-1', 1, 'user-1', 't1', '2026-01-01', '2026-01-31', ['emp-1']]);
    expect(payslipService.takeSnapshot).toHaveBeenCalledWith('ps-1', 't1', 'user-1');
  });
});
