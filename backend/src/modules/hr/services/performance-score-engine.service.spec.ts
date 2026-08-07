import { PerformanceScoreEngineService } from './performance-score-engine.service';
import { DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG } from '../types/attendance-behaviour-config.types';

describe('PerformanceScoreEngineService', () => {
  let db: { query: jest.Mock };
  let service: PerformanceScoreEngineService;

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new PerformanceScoreEngineService(db as any);
  });

  describe('computeKraScore()', () => {
    it('returns null when the employee has no KRAs for the cycle', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      expect(await service.computeKraScore('t1', 'e1', 'c1')).toBeNull();
    });

    it('weights manager_score by weightage, falling back to self_score', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { weightage: 60, manager_score: 90, self_score: 80 },
          { weightage: 40, manager_score: null, self_score: 70 },
        ],
      });
      // (90*60 + 70*40) / 100 = 82
      expect(await service.computeKraScore('t1', 'e1', 'c1')).toBe(82);
    });

    it('returns null when no KRA has a score yet (weight total is zero)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ weightage: 50, manager_score: null, self_score: null }] });
      expect(await service.computeKraScore('t1', 'e1', 'c1')).toBeNull();
    });
  });

  describe('computeKpiScore()', () => {
    it('returns null when the employee has no KPIs for the cycle', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      expect(await service.computeKpiScore('t1', 'e1', 'c1')).toBeNull();
    });

    it('averages each KPI achievement ratio, capped at 100%', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { target_value: 100, actual_value: 120 }, // capped at 100
          { target_value: 100, actual_value: 50 },  // 50
        ],
      });
      expect(await service.computeKpiScore('t1', 'e1', 'c1')).toBe(75);
    });

    it('treats a zero/missing target as 0% achievement rather than throwing', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ target_value: 0, actual_value: 10 }] });
      expect(await service.computeKpiScore('t1', 'e1', 'c1')).toBe(0);
    });
  });

  describe('computeOverallScore()', () => {
    const weights = DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG.overallWeights; // kra 40 / kpi 40 / attendance 20
    const buckets = DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG.ratingBuckets;

    it('blends all three components per their configured weights', () => {
      const result = service.computeOverallScore(80, 90, 100, weights, buckets);
      // (80*40 + 90*40 + 100*20) / 100 = 88
      expect(result.overallScore).toBe(88);
      expect(result.rating).toBe('Excellent');
    });

    it('re-normalizes remaining weights when KRA/KPI have not been entered yet', () => {
      const result = service.computeOverallScore(null, null, 90, weights, buckets);
      expect(result.overallScore).toBe(90); // attendance alone carries the score
    });

    it('re-normalizes when only KPI is missing', () => {
      const result = service.computeOverallScore(80, null, 100, weights, buckets);
      // (80*40 + 100*20) / 60 = 86.67
      expect(result.overallScore).toBeCloseTo(86.67, 1);
    });

    it('returns 0 when no component has data', () => {
      const result = service.computeOverallScore(null, null, null, weights, buckets);
      expect(result.overallScore).toBe(0);
      expect(result.rating).toBe('Unsatisfactory');
    });
  });
});
