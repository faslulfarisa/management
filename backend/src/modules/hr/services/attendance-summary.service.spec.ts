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

      expect(result).toEqual({ computed: 0, skippedLocked: 1, skippedNoStructureChange: 0 });
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

      expect(result).toEqual({ computed: 1, skippedLocked: 0, skippedNoStructureChange: 0 });
      expect(db.query).toHaveBeenCalledTimes(7);
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
