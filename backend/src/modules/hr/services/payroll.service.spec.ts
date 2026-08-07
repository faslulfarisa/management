import { BadRequestException } from '@nestjs/common';
import { PayrollService } from './payroll.service';

const STRUCTURE_ROW = (basic: string) => ({
  basic, hra: '0', da: '0', conveyance: '0', medical: '0', special_allowance: '0',
  pf_employee: '0', esi_employee: '0', professional_tax: '0', tds: '0',
});

describe('PayrollService — generatePayslips()', () => {
  let db: { query: jest.Mock };
  let overtimeService: { getApprovedOtForPayroll: jest.Mock; linkPayslipToApprovedRequests: jest.Mock };
  let service: PayrollService;

  beforeEach(() => {
    db = { query: jest.fn() };
    overtimeService = {
      getApprovedOtForPayroll: jest.fn().mockResolvedValue({ eligible: false, approvedHours: 0, policyMultiplier: 1.5 }),
      linkPayslipToApprovedRequests: jest.fn().mockResolvedValue(undefined),
    };
    service = new PayrollService(db as any, {} as any, {} as any, overtimeService as any);
  });

  const findCall = (sqlFragment: string) =>
    db.query.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes(sqlFragment));

  it('throws when no approved/locked attendance summaries exist for the period — no payroll without an approved summary', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // reset draft payslips
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] }) // employees
      .mockResolvedValueOnce({ rows: [] }); // qualifying summaries -> none

    await expect(service.generatePayslips('t1', 1, 2026)).rejects.toThrow(BadRequestException);
  });

  it('prorates gross by payable_days/business_working_days and skips overtime when approved_ot_hours is 0', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 18, approved_ot_hours: 0, status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', month: 1, year: 2026 }] }) // createPayrollRun
      .mockResolvedValueOnce({ rows: [] }) // fines
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '9000', net_salary: '9000', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] }); // totals update

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
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 5, status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('8000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '8500', net_salary: '8500', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await service.generatePayslips('t1', 1, 2026);

    // hourlyRate = 8000 / (20*8) = 50; overtime = 50 * 5 (snapshot, not the 999 from the live query) * 2 = 500
    const payslipInsert = findCall('INSERT INTO payslips');
    expect(payslipInsert![1][10]).toBeCloseTo(500);
  });

  it('skips an employee with no qualifying attendance summary while still paying employees who have one', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }, { id: 'emp-2', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 0, status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', gross_salary: '10000', net_salary: '10000', total_deductions: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(1);
    expect(result.skipped).toEqual([{ employee_id: 'emp-2', reason: 'no_approved_attendance_summary' }]);
  });

  it('does not overwrite an already-finalized payslip when the conflict update is suppressed', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', business_working_days: 20, payable_days: 20, approved_ot_hours: 0, status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [STRUCTURE_ROW('10000')] })
      .mockResolvedValueOnce({ rows: [] }); // INSERT...ON CONFLICT DO UPDATE WHERE status='draft' matched nothing

    const result = await service.generatePayslips('t1', 1, 2026);

    expect(result.payslips).toHaveLength(0);
    expect(result.skipped).toEqual([{ employee_id: 'emp-1', reason: 'payslip_already_finalized' }]);
  });
});

describe('PayrollService — processPayrollRun()', () => {
  let db: { query: jest.Mock };
  let payslipService: { takeSnapshot: jest.Mock };
  let service: PayrollService;

  beforeEach(() => {
    db = { query: jest.fn() };
    payslipService = { takeSnapshot: jest.fn().mockResolvedValue(undefined) };
    service = new PayrollService(db as any, {} as any, payslipService as any, {} as any);
  });

  it('blocks re-processing a payroll run that has already been processed', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'processed', month: 1, year: 2026 }] });
    await expect(service.processPayrollRun('run-1', 't1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('stamps the backing attendance summaries to payroll_processed with run id and payslip count', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'draft', month: 1, year: 2026 }] }) // existing run
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'processed' }] }) // UPDATE payroll_runs
      .mockResolvedValueOnce({ rows: [] }) // UPDATE payslips SET status='processed'
      .mockResolvedValueOnce({ rows: [{ id: 'ps-1', employee_id: 'emp-1' }] }) // SELECT payslips for snapshotting
      .mockResolvedValueOnce({ rows: [] }); // UPDATE payroll_attendance_summary

    await service.processPayrollRun('run-1', 't1', 'user-1');

    const summaryUpdate = db.query.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('UPDATE payroll_attendance_summary'));
    expect(summaryUpdate![1]).toEqual(['run-1', 1, 'user-1', 't1', '2026-01-01', '2026-01-31', ['emp-1']]);
    expect(payslipService.takeSnapshot).toHaveBeenCalledWith('ps-1', 't1', 'user-1');
  });
});
