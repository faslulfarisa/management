import { BadRequestException } from '@nestjs/common';
import { FinalSettlementService } from './final-settlement.service';

describe('FinalSettlementService', () => {
  let db: { query: jest.Mock };
  let payrollService: { getSalaryStructure: jest.Mock };
  let leaveService: { getExitEncashmentPreview: jest.Mock };
  let attendanceSummaryService: { listSummaries: jest.Mock };
  let businessDaysService: { countBusinessDays: jest.Mock };
  let approvalEngine: { submit: jest.Mock; approveByEntity: jest.Mock };
  let assetAssignmentService: { getRecoveryTotal: jest.Mock; allRecovered: jest.Mock };
  let timeline: { record: jest.Mock };
  let clearanceService: { allMandatoryCleared: jest.Mock };
  let checklistService: { progress: jest.Mock };
  let exitRequestService: { markSettled: jest.Mock };
  let orchestrator: { finalize: jest.Mock };
  let service: FinalSettlementService;

  const exitRequestRow = {
    id: 'exit-1',
    tenant_id: 't1',
    employee_id: 'emp-1',
    branch_id: 'b1',
    status: 'clearance_in_progress',
    requested_date: '2026-06-01',
    last_working_date: '2026-07-01',
    notice_period_days: 30,
    notice_period_waived_days: 0,
    date_of_joining: '2015-01-01',
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    payrollService = { getSalaryStructure: jest.fn() };
    leaveService = { getExitEncashmentPreview: jest.fn() };
    attendanceSummaryService = { listSummaries: jest.fn() };
    businessDaysService = { countBusinessDays: jest.fn() };
    approvalEngine = { submit: jest.fn().mockResolvedValue(undefined), approveByEntity: jest.fn() };
    assetAssignmentService = { getRecoveryTotal: jest.fn(), allRecovered: jest.fn().mockResolvedValue(true) };
    timeline = { record: jest.fn().mockResolvedValue(undefined) };
    clearanceService = { allMandatoryCleared: jest.fn().mockResolvedValue(true) };
    checklistService = { progress: jest.fn().mockResolvedValue({ total: 5, completed: 5, percent: 100, mandatoryOutstanding: 0 }) };
    exitRequestService = { markSettled: jest.fn().mockResolvedValue(undefined) };
    orchestrator = { finalize: jest.fn().mockResolvedValue(undefined) };

    service = new FinalSettlementService(
      db as any, payrollService as any, leaveService as any, attendanceSummaryService as any,
      businessDaysService as any, approvalEngine as any, assetAssignmentService as any,
      timeline as any, clearanceService as any, checklistService as any,
      exitRequestService as any, orchestrator as any,
    );
  });

  describe('calculate() — readiness gating', () => {
    it('rejects when the exit request has not been approved yet (still pending_approval)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ ...exitRequestRow, status: 'pending_approval' }] });
      await expect(service.calculate('t1', 'exit-1', 'actor-1')).rejects.toThrow(BadRequestException);
      // none of the per-gate checks should even run once the status gate fails
      expect(clearanceService.allMandatoryCleared).not.toHaveBeenCalled();
    });

    it('rejects when mandatory clearances are not all cleared', async () => {
      db.query.mockResolvedValueOnce({ rows: [exitRequestRow] });
      clearanceService.allMandatoryCleared.mockResolvedValueOnce(false);
      await expect(service.calculate('t1', 'exit-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects when mandatory checklist items are outstanding', async () => {
      db.query.mockResolvedValueOnce({ rows: [exitRequestRow] });
      checklistService.progress.mockResolvedValueOnce({ total: 5, completed: 3, percent: 60, mandatoryOutstanding: 2 });
      await expect(service.calculate('t1', 'exit-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects when assets are not all recovered', async () => {
      db.query.mockResolvedValueOnce({ rows: [exitRequestRow] });
      assetAssignmentService.allRecovered.mockResolvedValueOnce(false);
      await expect(service.calculate('t1', 'exit-1', 'actor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculate() — auto-calculation math', () => {
    beforeEach(() => {
      // exit_requests JOIN employees lookup
      db.query.mockResolvedValueOnce({ rows: [exitRequestRow] });
      payrollService.getSalaryStructure.mockResolvedValue({ basic: '26000', hra: '5000', da: '0', conveyance: '0', medical: '0', special_allowance: '0' });
      attendanceSummaryService.listSummaries.mockResolvedValue([{ payable_days: '13', status: 'approved' }]);
      businessDaysService.countBusinessDays.mockResolvedValue({ businessWorkingDays: 26, holidayDays: 0, weeklyOffDays: 4, calendarDays: 30 });
      leaveService.getExitEncashmentPreview.mockResolvedValue([
        { leave_type_id: 'lt1', leave_type_name: 'Earned Leave', days: 10, daily_rate: 1000, amount: 10000 },
      ]);
      assetAssignmentService.getRecoveryTotal.mockResolvedValue(0);
      // getByExitRequest() — no existing settlement
      db.query.mockResolvedValueOnce({ rows: [] });
      // INSERT ... RETURNING *
      db.query.mockResolvedValueOnce({ rows: [{ id: 'settlement-1', exit_request_id: 'exit-1' }] });
    });

    it('prorates pending salary by payable days / business working days', async () => {
      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      // basic_salary param = basic (26000) + pendingSalary (31000 * 13/26 = 15500) = 41500
      expect(insertCall![1][3]).toBe(41500);
    });

    it('is gratuity-eligible at 11.5 years of service, rounding up to 12 years for the formula', async () => {
      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      // 15 * 26000 * 12 / 26 = 180000
      expect(insertCall![1][5]).toBe(180000);
    });

    it('carries the leave encashment preview total through as leave_encashment', async () => {
      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      expect(insertCall![1][6]).toBe(10000);
    });

    it('charges no notice-pay recovery when last_working_date matches the full agreed notice period', async () => {
      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      // requested_date -> last_working_date is exactly 30 days, matching notice_period_days
      expect(insertCall![1][7]).toBe(0);
    });

    it('charges notice-pay recovery proportional to the shortfall when leaving before full notice is served', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ ...exitRequestRow, last_working_date: '2026-06-11' }] }); // only 10 of 30 days served
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'settlement-1', exit_request_id: 'exit-1' }] });

      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      // dailyBasicRate = 26000/26 = 1000; shortfall = 30 - 10 = 20 days -> 20000 recovery
      expect(insertCall![1][7]).toBe(20000);
    });

    it('rolls asset recovery cost into total deductions', async () => {
      assetAssignmentService.getRecoveryTotal.mockResolvedValueOnce(3000);
      await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      expect(insertCall![1][8]).toBe(3000);
      // total_deductions = notice_recovery (0) + asset_recovery (3000)
      expect(insertCall![1][10]).toBe(3000);
    });

    it('computes net_payable as total_payable minus total_deductions and submits for ff_settlement approval', async () => {
      const result = await service.calculate('t1', 'exit-1', 'actor-1');
      const insertCall = db.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO final_settlements'));
      const [, , , basicAndPending, allowances, gratuity, leaveEncashment, , , totalPayable, totalDeductions, netPayable] = insertCall![1];
      expect(totalPayable).toBe(basicAndPending + allowances + gratuity + leaveEncashment);
      expect(netPayable).toBe(totalPayable - totalDeductions);
      expect(result).toEqual({ id: 'settlement-1', exit_request_id: 'exit-1' });
      expect(approvalEngine.submit).toHaveBeenCalledWith(expect.objectContaining({ workflowType: 'ff_settlement', entityTable: 'final_settlements' }));
    });
  });

  describe('approve()', () => {
    it('finalizes offboarding via the orchestrator once the settlement is fully approved', async () => {
      approvalEngine.approveByEntity.mockResolvedValueOnce({ fullyApproved: true, entity: { exit_request_id: 'exit-1' } });
      const actor = { sub: 'actor-1', isSuperAdmin: false, userType: 'admin' };

      await service.approve('t1', 'settlement-1', actor, 'Approved by Finance');

      expect(exitRequestService.markSettled).toHaveBeenCalledWith('t1', 'exit-1');
      expect(orchestrator.finalize).toHaveBeenCalledWith('t1', 'exit-1', actor, undefined, undefined);
    });

    it('does not finalize offboarding while approval is still mid-chain', async () => {
      approvalEngine.approveByEntity.mockResolvedValueOnce({ fullyApproved: false, entity: { exit_request_id: 'exit-1' } });
      const actor = { sub: 'actor-1', isSuperAdmin: false, userType: 'admin' };

      await service.approve('t1', 'settlement-1', actor, 'Step 1 approved');

      expect(orchestrator.finalize).not.toHaveBeenCalled();
    });
  });

  describe('markPaid()', () => {
    it('rejects marking a settlement paid before it has been approved', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'settlement-1', payment_status: 'pending_approval', exit_request_id: 'exit-1' }] });
      await expect(service.markPaid('t1', 'settlement-1', undefined, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('marks an approved settlement as paid', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'settlement-1', payment_status: 'approved', exit_request_id: 'exit-1' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'settlement-1', payment_status: 'paid' }] });
      const result = await service.markPaid('t1', 'settlement-1', '2026-07-15', 'actor-1');
      expect(result.payment_status).toBe('paid');
      expect(timeline.record).toHaveBeenCalledWith('t1', 'exit-1', 'settlement_paid', 'actor-1');
    });
  });
});
