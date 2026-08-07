import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG } from '../types/attendance-behaviour-config.types';

describe('PerformanceService', () => {
  let db: { query: jest.Mock };
  let auditLog: { log: jest.Mock };
  let attendanceBehaviourEngine: { generateForCycle: jest.Mock; freezeSnapshots: jest.Mock };
  let attendanceBehaviourConfig: { getConfig: jest.Mock };
  let scoreEngine: { computeKraScore: jest.Mock; computeKpiScore: jest.Mock; computeOverallScore: jest.Mock };
  let service: PerformanceService;

  const configRow = { id: 'cfg-1', version: 1, config: DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG };

  beforeEach(() => {
    db = { query: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    attendanceBehaviourEngine = {
      generateForCycle: jest.fn().mockResolvedValue({ generated: 5, failed: 0 }),
      freezeSnapshots: jest.fn().mockResolvedValue(5),
    };
    attendanceBehaviourConfig = { getConfig: jest.fn().mockResolvedValue(configRow) };
    scoreEngine = {
      computeKraScore: jest.fn().mockResolvedValue(null),
      computeKpiScore: jest.fn().mockResolvedValue(null),
      computeOverallScore: jest.fn().mockReturnValue({ overallScore: 0, rating: 'Unsatisfactory' }),
    };
    service = new PerformanceService(
      db as any, auditLog as any, attendanceBehaviourEngine as any, attendanceBehaviourConfig as any, scoreEngine as any,
    );
  });

  describe('updateCycle() — attendance lifecycle hooks', () => {
    it('triggers generateForCycle and audit-logs "activated" on draft -> active', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'draft' }] }) // before
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'active' }] }); // after UPDATE

      const result = await service.updateCycle('c1', 't1', 'user-1', { status: 'active' });

      expect(result.status).toBe('active');
      expect(attendanceBehaviourEngine.generateForCycle).toHaveBeenCalledWith('t1', 'c1', 'user-1');
      expect(attendanceBehaviourEngine.freezeSnapshots).not.toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'activated' }));
    });

    it('freezes snapshots and locks reviews on -> locked, without re-triggering generateForCycle', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'active' }] }) // before
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'locked' }] }) // after UPDATE
        .mockResolvedValueOnce({ rows: [] }); // lock performance_reviews

      await service.updateCycle('c1', 't1', 'user-1', { status: 'locked' });

      expect(attendanceBehaviourEngine.freezeSnapshots).toHaveBeenCalledWith('t1', 'c1', 'user-1');
      expect(attendanceBehaviourEngine.generateForCycle).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'locked' }));
    });

    it('does nothing extra when the status is unchanged (e.g. renaming the cycle)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'active' }] });

      await service.updateCycle('c1', 't1', 'user-1', { name: 'Renamed cycle' });

      expect(attendanceBehaviourEngine.generateForCycle).not.toHaveBeenCalled();
      expect(attendanceBehaviourEngine.freezeSnapshots).not.toHaveBeenCalled();
      expect(auditLog.log).not.toHaveBeenCalled();
    });
  });

  describe('createReview() — score blending', () => {
    it('blends KRA/KPI/Attendance scores via the score engine before inserting', async () => {
      scoreEngine.computeKraScore.mockResolvedValue(80);
      scoreEngine.computeKpiScore.mockResolvedValue(90);
      scoreEngine.computeOverallScore.mockReturnValue({ overallScore: 88, rating: 'Excellent' });

      db.query
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // _assertCycleNotLocked
        .mockResolvedValueOnce({ rows: [{ id: 'snap-1', behaviour_score: 95 }] }) // snapshot lookup
        .mockResolvedValueOnce({ rows: [{ id: 'review-1', overall_score: 88, rating: 'Excellent' }] }); // INSERT

      const result = await service.createReview('t1', 'reviewer-1', { employee_id: 'emp-1', cycle_id: 'c1' });

      expect(scoreEngine.computeOverallScore).toHaveBeenCalledWith(80, 90, 95, configRow.config.overallWeights, configRow.config.ratingBuckets);
      expect(result.id).toBe('review-1');
    });

    it('refuses to create/update a review for a locked cycle', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ status: 'locked' }] });
      await expect(service.createReview('t1', 'reviewer-1', { employee_id: 'emp-1', cycle_id: 'c1' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateReview() — lock guard', () => {
    it('refuses to modify a review once it is locked', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'review-1', locked_at: '2026-01-01T00:00:00Z', cycle_id: 'c1', employee_id: 'emp-1' }] });
      await expect(service.updateReview('review-1', 't1', 'user-1', { status: 'approved' })).rejects.toThrow(ForbiddenException);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('overrideAttendanceScore() — manager override workflow', () => {
    it('requires a non-blank reason', async () => {
      await expect(service.overrideAttendanceScore('t1', 'review-1', 'user-1', 75, '  ')).rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('requires the adjusted score to be within 0-100', async () => {
      await expect(service.overrideAttendanceScore('t1', 'review-1', 'user-1', 150, 'Biometric outage')).rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('refuses to override once the review is locked', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'review-1', locked_at: '2026-01-01T00:00:00Z' }] });
      await expect(service.overrideAttendanceScore('t1', 'review-1', 'user-1', 75, 'Biometric outage')).rejects.toThrow(ForbiddenException);
    });

    it('stores the original score once, recomputes the overall score, and audit-logs the override', async () => {
      scoreEngine.computeOverallScore.mockReturnValue({ overallScore: 84, rating: 'Good' });
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'review-1', locked_at: null, cycle_id: 'c1',
            kra_score: 80, kpi_score: 90, attendance_score: 60, attendance_score_overridden: false, attendance_score_original: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // _assertCycleNotLocked
        .mockResolvedValueOnce({ rows: [{ id: 'review-1', attendance_score: 75, attendance_score_original: 60, overall_score: 84 }] }); // UPDATE

      const result = await service.overrideAttendanceScore('t1', 'review-1', 'user-1', 75, 'Biometric device outage during cycle');

      expect(scoreEngine.computeOverallScore).toHaveBeenCalledWith(80, 90, 75, configRow.config.overallWeights, configRow.config.ratingBuckets);
      expect(result.attendance_score_original).toBe(60);
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'attendance_score_overridden' }));
    });

    it('preserves the original original_score across a second override', async () => {
      scoreEngine.computeOverallScore.mockReturnValue({ overallScore: 70, rating: 'Needs Improvement' });
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'review-1', locked_at: null, cycle_id: 'c1',
            kra_score: 80, kpi_score: 90, attendance_score: 75, attendance_score_overridden: true, attendance_score_original: 60,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'review-1', attendance_score: 50, attendance_score_original: 60 }] });

      await service.overrideAttendanceScore('t1', 'review-1', 'user-1', 50, 'Correcting prior override');

      const updateCall = db.query.mock.calls[2];
      expect(updateCall[1]).toEqual(expect.arrayContaining([60])); // original_score stays 60, not 75
    });
  });

  describe('getPerformanceTimeline()', () => {
    it('merges cycle/snapshot/review audit events in chronological order', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ action: 'activated', created_at: '2026-01-01T00:00:00Z', user_id: 'u1', new_values: {} }] })
        .mockResolvedValueOnce({ rows: [{ action: 'score_generated', created_at: '2026-01-03T00:00:00Z', user_id: 'u1', new_values: {} }] })
        .mockResolvedValueOnce({ rows: [{ action: 'approved', created_at: '2026-01-02T00:00:00Z', user_id: 'u2', new_values: {} }] });

      const timeline = await service.getPerformanceTimeline('t1', 'emp-1', 'c1');

      expect(timeline.map((e) => e.action)).toEqual(['activated', 'approved', 'score_generated']);
      expect(timeline[0].label).toBe('Review Cycle Started');
    });
  });
});
