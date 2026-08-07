import { BadRequestException } from '@nestjs/common';
import { AttendanceBehaviourConfigService } from './attendance-behaviour-config.service';
import { DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG } from '../types/attendance-behaviour-config.types';

describe('AttendanceBehaviourConfigService', () => {
  let db: { query: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: AttendanceBehaviourConfigService;

  beforeEach(() => {
    db = { query: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceBehaviourConfigService(db as any, auditLog as any);
  });

  describe('getConfig()', () => {
    it('returns the existing row when one exists', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 3 }] });
      const result = await service.getConfig('t1');
      expect(result.version).toBe(3);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('lazily persists the default config when none exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 1 }] });
      const result = await service.getConfig('t1');
      expect(result.config.weights.attendancePercentage).toBe(40);
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateConfig()', () => {
    it('rejects component weights that do not sum to 100', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 1 }] });
      await expect(
        service.updateConfig('t1', 'user-1', { weights: { ...DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG.weights, attendancePercentage: 90 } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects overall weights (KRA/KPI/Attendance) that do not sum to 100', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 1 }] });
      await expect(
        service.updateConfig('t1', 'user-1', { overallWeights: { kra: 50, kpi: 50, attendanceBehaviour: 50 } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('merges, bumps version, and audit-logs weightage_updated when weights change', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', version: 2 }] });

      const newWeights = { ...DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG.weights, punctuality: 25, attendancePercentage: 35 };
      await service.updateConfig('t1', 'user-1', { weights: newWeights });

      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'weightage_updated' }));
    });

    it('audit-logs config_updated (not weightage_updated) for non-weight changes', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG, version: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', tenant_id: 't1', version: 2 }] });

      await service.updateConfig('t1', 'user-1', { otCapHours: 25 });

      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'config_updated' }));
    });
  });

  describe('resolveRating()', () => {
    const buckets = DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG.ratingBuckets;
    it.each([
      [100, 'Outstanding'], [95, 'Outstanding'],
      [94.99, 'Excellent'], [85, 'Excellent'],
      [84.99, 'Good'], [75, 'Good'],
      [74.99, 'Needs Improvement'], [60, 'Needs Improvement'],
      [59.99, 'Unsatisfactory'], [0, 'Unsatisfactory'],
    ])('maps score %s to rating %s', (score, expected) => {
      expect(AttendanceBehaviourConfigService.resolveRating(score, buckets)).toBe(expected);
    });
  });
});
