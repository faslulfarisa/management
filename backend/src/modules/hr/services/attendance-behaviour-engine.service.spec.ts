import { ForbiddenException } from '@nestjs/common';
import { AttendanceBehaviourEngineService, AttendanceBehaviourMetrics } from './attendance-behaviour-engine.service';
import { DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, AttendanceBehaviourConfig } from '../types/attendance-behaviour-config.types';

describe('AttendanceBehaviourEngineService', () => {
  let db: { query: jest.Mock };
  let businessDays: { classifyPeriod: jest.Mock };
  let overtimeService: { getApprovedOtForPayroll: jest.Mock };
  let configService: { getConfig: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: AttendanceBehaviourEngineService;

  const baseMetrics: AttendanceBehaviourMetrics = {
    businessWorkingDays: 20, presentDays: 20, halfDayCount: 0, lateCount: 0, unapprovedAbsenceDays: 0,
    paidLeaveDays: 0, unpaidLeaveDays: 0, approvedOtHours: 0, otEligible: false, correctionsCount: 0,
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    businessDays = { classifyPeriod: jest.fn() };
    overtimeService = { getApprovedOtForPayroll: jest.fn() };
    configService = { getConfig: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceBehaviourEngineService(db as any, businessDays as any, overtimeService as any, configService as any, auditLog as any);
  });

  describe('scoreMetrics() — formula', () => {
    const config = DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG;

    it('scores perfect attendance as 100 / Outstanding', () => {
      const result = service.scoreMetrics(baseMetrics, config);
      expect(result.behaviourScore).toBe(100);
      expect(result.behaviourRating).toBe('Outstanding');
      expect(result.attendancePercentage).toBe(100);
      expect(result.attendanceCompliancePercentage).toBe(100);
    });

    it('penalizes heavy lates via punctuality and consistency, dropping the rating to Excellent', () => {
      const metrics = { ...baseMetrics, lateCount: 10 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.componentScores.punctuality).toBe(50); // 100 - 10*5
      expect(result.componentScores.consistency).toBe(50); // 100 - 10/20*100
      expect(result.behaviourScore).toBe(85);
      expect(result.behaviourRating).toBe('Excellent');
    });

    it('never penalizes approved paid leave — attendance percentage stays at 100', () => {
      const metrics = { ...baseMetrics, presentDays: 15, paidLeaveDays: 5 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.attendancePercentage).toBe(100);
      expect(result.behaviourScore).toBe(100);
    });

    it('penalizes unapproved absence but not the days already counted as leave', () => {
      const metrics = { ...baseMetrics, presentDays: 18, unapprovedAbsenceDays: 2 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.componentScores.unapprovedAbsence).toBe(70); // 100 - 2*15
      expect(result.attendancePercentage).toBe(90); // 18/20*100
    });

    it('counts half days as 0.5 toward attendance percentage and penalizes the half-day component', () => {
      const metrics = { ...baseMetrics, presentDays: 18, halfDayCount: 2 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.attendancePercentage).toBe(95); // (18 + 1)/20*100
      expect(result.componentScores.halfDayBehaviour).toBe(84); // 100 - 2*8
    });

    it('caps the overtime bonus at otCapHours', () => {
      const metrics = { ...baseMetrics, otEligible: true, approvedOtHours: 30 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.componentScores.approvedOvertime).toBe(100); // min(30,20)/20*100
    });

    it('scores partial overtime proportionally below the cap', () => {
      const metrics = { ...baseMetrics, otEligible: true, approvedOtHours: 10 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.componentScores.approvedOvertime).toBe(50); // 10/20*100
    });

    it('treats OT-ineligible employees as neutral (100), never penalized', () => {
      const metrics = { ...baseMetrics, otEligible: false, approvedOtHours: 0 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.componentScores.approvedOvertime).toBe(100);
    });

    it('applies a correction grace period before penalizing', () => {
      const withinGrace = service.scoreMetrics({ ...baseMetrics, correctionsCount: 2 }, config);
      expect(withinGrace.componentScores.attendanceCorrections).toBe(100);

      const beyondGrace = service.scoreMetrics({ ...baseMetrics, correctionsCount: 5 }, config);
      expect(beyondGrace.componentScores.attendanceCorrections).toBe(85); // 100 - (5-2)*5
    });

    it('respects custom weights — isolating a single weighted component', () => {
      const customConfig: AttendanceBehaviourConfig = {
        ...config,
        weights: { attendancePercentage: 100, punctuality: 0, consistency: 0, halfDayBehaviour: 0, unapprovedAbsence: 0, approvedOvertime: 0, attendanceCorrections: 0 },
      };
      const metrics = { ...baseMetrics, presentDays: 16, lateCount: 10 }; // punctuality would normally drag score down
      const result = service.scoreMetrics(metrics, customConfig);
      expect(result.behaviourScore).toBe(80); // attendancePercentage = 16/20*100, fully isolated
    });

    it('treats a zero business-working-days period as a neutral 100 (e.g. new joiner mid-cycle)', () => {
      const metrics = { ...baseMetrics, businessWorkingDays: 0, presentDays: 0 };
      const result = service.scoreMetrics(metrics, config);
      expect(result.behaviourScore).toBe(100);
    });
  });

  describe('generateSnapshot() — freeze guard', () => {
    it('refuses to regenerate a frozen snapshot', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'cycle-1', start_date: '2026-01-01', end_date: '2026-03-31', status: 'active' }] }) // _getCycle
        .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: null }] }) // _getEmployee
        .mockResolvedValueOnce({ rows: [{ id: 'snap-1', status: 'frozen', generation_version: 1 }] }); // _getSnapshot

      await expect(service.generateSnapshot('t1', 'cycle-1', 'emp-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(configService.getConfig).not.toHaveBeenCalled();
    });
  });

  describe('recalculateSnapshot() — lifecycle guard', () => {
    it.each(['approved', 'locked'])('refuses to recalculate when the cycle is %s', async (status) => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'cycle-1', start_date: '2026-01-01', end_date: '2026-03-31', status }] });
      await expect(service.recalculateSnapshot('t1', 'cycle-1', 'emp-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('allows recalculation while the cycle is still active', async () => {
      const cycleRow = { id: 'cycle-1', start_date: '2026-01-01', end_date: '2026-01-01', status: 'active' };
      configService.getConfig.mockResolvedValue({ id: 'cfg-1', version: 1, config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG });
      businessDays.classifyPeriod.mockResolvedValue(new Map([['2026-01-01', 'business']]));
      overtimeService.getApprovedOtForPayroll.mockResolvedValue({ eligible: false, approvedHours: 0, policyMultiplier: 1.5 });

      db.query
        .mockResolvedValueOnce({ rows: [cycleRow] }) // _getCycle (recalculateSnapshot's own guard check)
        .mockResolvedValueOnce({ rows: [cycleRow] }) // _getCycle (inside generateSnapshot)
        .mockResolvedValueOnce({ rows: [{ id: 'emp-1', branch_id: null }] }) // _getEmployee
        .mockResolvedValueOnce({ rows: [] }) // _getSnapshot -> none yet
        .mockResolvedValueOnce({ rows: [] }) // attendance_records
        .mockResolvedValueOnce({ rows: [] }) // leave_requests
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // attendance_corrections count
        .mockResolvedValueOnce({ rows: [{ id: 'snap-1', generation_version: 1 }] }); // INSERT ... RETURNING

      const result = await service.recalculateSnapshot('t1', 'cycle-1', 'emp-1', 'user-1');
      expect(result.id).toBe('snap-1');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'score_generated' }));
    });
  });
});
