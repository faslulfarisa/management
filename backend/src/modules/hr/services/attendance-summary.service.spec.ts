import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceSummaryService } from './attendance-summary.service';

describe('AttendanceSummaryService', () => {
  let db: { query: jest.Mock };
  let businessDays: { classifyPeriod: jest.Mock };
  let overtimeService: { getApprovedOtForPayroll: jest.Mock };
  let auditLog: { log: jest.Mock };
  let attendanceBehaviourEngine: { onAttendanceSummaryApproved: jest.Mock };
  let service: AttendanceSummaryService;

  beforeEach(() => {
    db = { query: jest.fn() };
    businessDays = { classifyPeriod: jest.fn() };
    overtimeService = { getApprovedOtForPayroll: jest.fn().mockResolvedValue({ eligible: false, approvedHours: 0, policyMultiplier: 1.5 }) };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    attendanceBehaviourEngine = { onAttendanceSummaryApproved: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceSummaryService(db as any, businessDays as any, overtimeService as any, auditLog as any, attendanceBehaviourEngine as any);
  });

  // _computeFigures is private — these tests exercise it directly (a common,
  // valid pattern at runtime since TS privacy is compile-time only) because
  // it's the actual calculation engine; compute() around it is just DB plumbing.
  const computeFigures = (emp: any, periodStart: string, periodEnd: string, month = 1, year = 2026) =>
    (service as any)._computeFigures('t1', emp, periodStart, periodEnd, month, year);

  describe('_computeFigures() — day-bucket classification', () => {
    it('buckets present/holiday/weekly-off/paid-leave days and computes payable_days', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([
        ['2026-01-01', 'business'], ['2026-01-02', 'holiday'],
        ['2026-01-03', 'weekly_off'], ['2026-01-04', 'business'],
      ]));
      db.query
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', status: 'present', late_minutes: 0, hours: '8' }] }) // attendance_records
        .mockResolvedValueOnce({ rows: [{ start_date: '2026-01-04', end_date: '2026-01-04', paid: true }] }) // leave_requests
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] }); // raw OT sum

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-01', '2026-01-04');

      expect(figures.business_working_days).toBe(2); // 01-01 and 01-04
      expect(figures.present_days).toBe(1);
      expect(figures.holiday_days).toBe(1);
      expect(figures.weekly_off_days).toBe(1);
      expect(figures.paid_leave_days).toBe(1);
      expect(figures.unpaid_leave_days).toBe(0);
      expect(figures.absent_days).toBe(0);
      expect(figures.payable_days).toBe(4); // present(1) + paid_leave(1) + holiday(1) + weekly_off(1)
    });

    it('lets an explicit attendance record override a weekly-off classification (worked on a day off)', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-03', 'weekly_off']]));
      db.query
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-03', status: 'on_duty', late_minutes: 0, hours: '4' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] });

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-03', '2026-01-03');

      expect(figures.present_days).toBe(1);
      expect(figures.weekly_off_days).toBe(0);
    });

    it('does not count unpaid leave toward payable_days', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-05', 'business']]));
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ start_date: '2026-01-05', end_date: '2026-01-05', paid: false }] })
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] });

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-05', '2026-01-05');

      expect(figures.unpaid_leave_days).toBe(1);
      expect(figures.paid_leave_days).toBe(0);
      expect(figures.payable_days).toBe(0);
    });

    it('counts a half day as 0.5 toward payable_days', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-06', 'business']]));
      db.query
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-06', status: 'half_day', late_minutes: 0, hours: '4' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] });

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-06', '2026-01-06');

      expect(figures.half_day_count).toBe(1);
      expect(figures.payable_days).toBe(0.5);
    });

    it('defaults to absent on a business day with no record and no approved leave', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-07', 'business']]));
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] });

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-07', '2026-01-07');

      expect(figures.absent_days).toBe(1);
      expect(figures.payable_days).toBe(0);
    });

    it('snapshots approved_ot_hours from OvertimeService only when eligible', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-08', 'business']]));
      overtimeService.getApprovedOtForPayroll.mockResolvedValueOnce({ eligible: true, approvedHours: 3.5, policyMultiplier: 1.5 });
      db.query
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-08', status: 'present', late_minutes: 0, hours: '8' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] });

      const figures = await computeFigures({ id: 'emp-1', branch_id: 'b1' }, '2026-01-08', '2026-01-08');

      expect(figures.approved_ot_hours).toBe(3.5);
    });
  });

  describe('compute() — scope orchestration', () => {
    it('skips employees whose existing summary is already payroll_locked/payroll_processed', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: 'b1', department_id: 'd1' }] }) // resolveScopeEmployees
        .mockResolvedValueOnce({ rows: [{ id: 's1', status: 'payroll_locked', generation_version: 2 }] }); // getExisting

      const result = await service.compute('t1', 2026, 1, { type: 'employee', employeeIds: ['emp-1'] }, 'user-1');

      expect(result).toEqual({ computed: 0, skippedLocked: 1, skippedNoStructureChange: 0, skippedFailed: 0, failures: [] });
      expect(businessDays.classifyPeriod).not.toHaveBeenCalled();
    });

    it('computes a first-time summary as version 1 and writes a version-history row', async () => {
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-01', 'business']]));
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: null, department_id: null }] }) // resolveScopeEmployees
        .mockResolvedValueOnce({ rows: [] }) // getExisting -> none
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', status: 'present', late_minutes: 0, hours: '8' }] }) // attendance
        .mockResolvedValueOnce({ rows: [] }) // leave
        .mockResolvedValueOnce({ rows: [{ ot_hours: '0' }] }) // raw OT
        .mockResolvedValueOnce({ rows: [{ id: 's1', tenant_id: 't1', employee_id: 'emp-1', generation_version: 1 }] }) // upsert RETURNING
        .mockResolvedValueOnce({ rows: [] }); // version insert

      const result = await service.compute('t1', 2026, 1, { type: 'employee', employeeIds: ['emp-1'] }, 'user-1');

      expect(result).toEqual({ computed: 1, skippedLocked: 0, skippedNoStructureChange: 0, skippedFailed: 0, failures: [] });
      expect(db.query).toHaveBeenCalledTimes(7);
    });
  });

  describe('listSummaries() and getKpis() scope filters', () => {
    it('restricts attendance summary rows to the caller branch scope', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await service.listSummaries('t1', 2026, 7, {
        accessScope: { isGlobalAccess: false, branchIds: ['branch-1', 'branch-2'] },
      });

      expect(db.query.mock.calls[0][0]).toContain('s.branch_id = ANY($4::uuid[])');
      expect(db.query.mock.calls[0][1]).toEqual(['t1', '2026-07-01', '2026-07-31', ['branch-1', 'branch-2']]);
    });

    it('restricts KPI aggregates to the caller branch scope', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] });

      await service.getKpis('t1', 2026, 7, {
        branch_id: 'branch-1',
        accessScope: { isGlobalAccess: false, branchIds: ['branch-1'] },
      });

      expect(db.query.mock.calls[0][0]).toContain('branch_id = $4 AND branch_id = ANY($5::uuid[])');
      expect(db.query.mock.calls[0][1]).toEqual(['t1', '2026-07-01', '2026-07-31', 'branch-1', ['branch-1']]);
      expect(db.query.mock.calls[1][0]).toContain('branch_id = $4 AND branch_id = ANY($5::uuid[])');
      expect(db.query.mock.calls[1][1]).toEqual(['t1', '2026-07-01', '2026-07-31', 'branch-1', ['branch-1']]);
    });
  });

  describe('recompute()', () => {
    it('derives the payroll period when the database returns DATE columns as Date objects', async () => {
      const existing = {
        id: 's1',
        tenant_id: 't1',
        employee_id: 'emp-1',
        period_start: new Date(2026, 6, 1),
        period_end: new Date(2026, 6, 31),
        status: 'pending_review',
        generation_version: 1,
      } as any;
      const computeSpy = jest.spyOn(service, 'compute').mockResolvedValue({
        computed: 0,
        skippedLocked: 0,
        skippedNoStructureChange: 1,
        skippedFailed: 0,
        failures: [],
      });

      db.query
        .mockResolvedValueOnce({ rows: [existing] }) // initial _getById
        .mockResolvedValueOnce({ rows: [existing] }) // _markRecomputedForReview
        .mockResolvedValueOnce({ rows: [] }); // _writeVersion

      await service.recompute('t1', 's1', 'user-1');

      expect(computeSpy).toHaveBeenCalledWith('t1', 2026, 7, { type: 'employee', employeeIds: ['emp-1'] }, 'user-1');
    });

    it('moves a draft summary back to pending_review after a successful manual recompute', async () => {
      const existing = {
        id: 's1',
        tenant_id: 't1',
        employee_id: 'emp-1',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        status: 'draft',
        generation_version: 1,
      } as any;
      const updated = { ...existing, status: 'pending_review', correction_notes: null };
      jest.spyOn(service, 'compute').mockResolvedValue({
        computed: 0,
        skippedLocked: 0,
        skippedNoStructureChange: 1,
        skippedFailed: 0,
        failures: [],
      });

      db.query
        .mockResolvedValueOnce({ rows: [existing] }) // initial _getById
        .mockResolvedValueOnce({ rows: [updated] }) // _markRecomputedForReview
        .mockResolvedValueOnce({ rows: [] }); // _writeVersion

      const result = await service.recompute('t1', 's1', 'user-1');

      expect(result.status).toBe('pending_review');
      expect(db.query.mock.calls[1][0]).toContain("status = CASE WHEN status IN ('draft', 'rejected') THEN 'pending_review'");
    });

    it('throws when the single employee recompute is skipped as failed', async () => {
      const existing = {
        id: 's1',
        tenant_id: 't1',
        employee_id: 'emp-1',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        status: 'draft',
        generation_version: 1,
      } as any;
      jest.spyOn(service, 'compute').mockResolvedValue({
        computed: 0,
        skippedLocked: 0,
        skippedNoStructureChange: 0,
        skippedFailed: 1,
        failures: [{ employeeId: 'emp-1', reason: 'No attendance calendar configured' }],
      });
      db.query.mockResolvedValueOnce({ rows: [existing] });

      await expect(service.recompute('t1', 's1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('applyManualAdjustment()', () => {
    const existingSummary = {
      id: 's1',
      tenant_id: 't1',
      employee_id: 'emp-1',
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      status: 'draft',
      generation_version: 1,
      business_working_days: 23,
      present_days: 0,
      half_day_count: 0,
      absent_days: 23,
      holiday_days: 0,
      weekly_off_days: 8,
      paid_leave_days: 0,
      unpaid_leave_days: 0,
      payable_days: '8.00',
      late_count: 0,
      total_hours: '0.00',
      overtime_hours: '0.00',
      approved_ot_hours: '0.00',
    };

    it('updates manual day figures, moves the summary to pending_review, versions, and audits', async () => {
      const updated = {
        ...existingSummary,
        status: 'pending_review',
        generation_version: 2,
        business_working_days: 24,
        present_days: 20,
        absent_days: 4,
        payable_days: '28.00',
      };
      db.query
        .mockResolvedValueOnce({ rows: [existingSummary] }) // _getById
        .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // _writeVersion

      const result = await service.applyManualAdjustment('t1', 's1', 'user-1', {
        business_working_days: 24,
        present_days: 20,
        absent_days: 4,
        payable_days: 28,
      });

      expect(result.status).toBe('pending_review');
      expect(result.generation_version).toBe(2);
      expect(db.query.mock.calls[1][0]).toContain("status = 'pending_review'");
      expect(db.query.mock.calls[1][1][2]).toBe(32); // business + holiday + weekly off
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'attendance_summary_manual_adjusted' }));
    });

    it('recalculates payable_days from attendance figures instead of trusting a stale manual value', async () => {
      const updated = {
        ...existingSummary,
        status: 'pending_review',
        generation_version: 2,
        present_days: 20,
        half_day_count: 3,
        paid_leave_days: 6,
        weekly_off_days: 0,
        absent_days: 4,
        payable_days: '27.50',
      };
      db.query
        .mockResolvedValueOnce({ rows: [existingSummary] }) // _getById
        .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // _writeVersion

      await service.applyManualAdjustment('t1', 's1', 'user-1', {
        present_days: 20,
        half_day_count: 3,
        paid_leave_days: 6,
        weekly_off_days: 0,
        absent_days: 4,
        payable_days: 8,
      });

      expect(db.query.mock.calls[1][1][12]).toBe(27.5);
    });

    it('rejects negative manual values', async () => {
      db.query.mockResolvedValueOnce({ rows: [existingSummary] });

      await expect(
        service.applyManualAdjustment('t1', 's1', 'user-1', { present_days: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks manual edits for locked summaries', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ ...existingSummary, status: 'payroll_locked' }] });

      await expect(
        service.applyManualAdjustment('t1', 's1', 'user-1', { present_days: 20 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approval workflow', () => {
    it('approve() requires the summary to be pending_review', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.approve('t1', 's1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('reject() requires a non-blank reason', async () => {
      await expect(service.reject('t1', 's1', 'user-1', '  ')).rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('requestCorrection() requires non-blank notes and moves the summary to draft', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 's1', status: 'draft' }] });
      const result = await service.requestCorrection('t1', 's1', 'user-1', 'fix the OT figure');
      expect(result.status).toBe('draft');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'attendance_correction_requested' }));
    });
  });
});
