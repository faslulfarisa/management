import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AttendanceBehaviourConfigService } from './attendance-behaviour-config.service';
import { OverallScoreWeights, RatingBucket } from '../types/attendance-behaviour-config.types';

export interface OverallScoreResult {
  kraScore: number | null;
  kpiScore: number | null;
  attendanceScore: number | null;
  overallScore: number;
  rating: string;
  weightsUsed: OverallScoreWeights;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Blends KRA achievement, KPI achievement, and the Attendance Behaviour
 * Score into a single Overall Performance Score. KRA/KPI scoring didn't
 * exist before this engine — performance_reviews.overall_score was a free
 * passthrough field with no formula behind it.
 */
@Injectable()
export class PerformanceScoreEngineService {
  constructor(private readonly db: DatabaseService) {}

  /** Weighted average of manager_score (fallback self_score), weighted by each KRA's `weightage`. */
  async computeKraScore(tenantId: string, employeeId: string, cycleId: string): Promise<number | null> {
    const { rows } = await this.db.query(
      `SELECT weightage, manager_score, self_score FROM kras
       WHERE tenant_id = $1 AND employee_id = $2 AND cycle_id = $3`,
      [tenantId, employeeId, cycleId],
    );
    if (!rows.length) return null;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const kra of rows) {
      const score = kra.manager_score ?? kra.self_score;
      if (score == null) continue;
      const weight = Number(kra.weightage) || 0;
      weightedSum += Number(score) * weight;
      weightTotal += weight;
    }
    if (weightTotal === 0) return null;
    return round2(weightedSum / weightTotal);
  }

  /** Unweighted average of each KPI's achievement ratio (actual/target, capped at 100%). */
  async computeKpiScore(tenantId: string, employeeId: string, cycleId: string): Promise<number | null> {
    const { rows } = await this.db.query(
      `SELECT target_value, actual_value FROM kpis
       WHERE tenant_id = $1 AND employee_id = $2 AND cycle_id = $3 AND deleted_at IS NULL`,
      [tenantId, employeeId, cycleId],
    );
    if (!rows.length) return null;

    const ratios = rows.map((kpi: any) => {
      const target = Number(kpi.target_value);
      const actual = Number(kpi.actual_value);
      if (!target || target <= 0) return 0;
      return Math.max(0, Math.min(actual / target, 1)) * 100;
    });
    return round2(ratios.reduce((a, b) => a + b, 0) / ratios.length);
  }

  /**
   * Blends KRA/KPI/Attendance into the overall score. A component with no
   * data (no KRAs/KPIs entered yet, or no attendance snapshot) is excluded
   * and the remaining weights are re-normalized, so attendance alone can
   * carry the score before KRAs/KPIs are filled in.
   */
  computeOverallScore(
    kraScore: number | null,
    kpiScore: number | null,
    attendanceScore: number | null,
    weights: OverallScoreWeights,
    ratingBuckets: RatingBucket[],
  ): OverallScoreResult {
    const components: { score: number; weight: number }[] = [];
    if (kraScore != null) components.push({ score: kraScore, weight: weights.kra });
    if (kpiScore != null) components.push({ score: kpiScore, weight: weights.kpi });
    if (attendanceScore != null) components.push({ score: attendanceScore, weight: weights.attendanceBehaviour });

    const weightTotal = components.reduce((sum, c) => sum + c.weight, 0);
    const overallScore = weightTotal > 0
      ? round2(components.reduce((sum, c) => sum + c.score * c.weight, 0) / weightTotal)
      : 0;

    return {
      kraScore, kpiScore, attendanceScore, overallScore,
      rating: AttendanceBehaviourConfigService.resolveRating(overallScore, ratingBuckets),
      weightsUsed: weights,
    };
  }
}
