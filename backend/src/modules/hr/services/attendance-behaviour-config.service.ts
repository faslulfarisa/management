import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { AttendanceBehaviourConfig, DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG } from '../types/attendance-behaviour-config.types';

const WEIGHT_SUM_TOLERANCE = 0.5;

export interface AttendanceBehaviourConfigRow {
  id: string;
  tenant_id: string;
  config: AttendanceBehaviourConfig;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AttendanceBehaviourConfigService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Returns the tenant's config, lazily persisting the default on first read. */
  async getConfig(tenantId: string): Promise<AttendanceBehaviourConfigRow> {
    const { rows } = await this.db.query(
      `SELECT * FROM performance_configuration WHERE tenant_id = $1`,
      [tenantId],
    );
    if (rows.length) return rows[0];

    const { rows: inserted } = await this.db.query(
      `INSERT INTO performance_configuration (tenant_id, config, version)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING *`,
      [tenantId, JSON.stringify(DEFAULT_ATTENDANCE_BEHAVIOUR_CONFIG)],
    );
    return inserted[0];
  }

  async updateConfig(
    tenantId: string,
    userId: string,
    partialConfig: Partial<AttendanceBehaviourConfig>,
  ): Promise<AttendanceBehaviourConfigRow> {
    const existing = await this.getConfig(tenantId);
    const merged: AttendanceBehaviourConfig = {
      ...existing.config,
      ...partialConfig,
      weights: { ...existing.config.weights, ...partialConfig.weights },
      overallWeights: { ...existing.config.overallWeights, ...partialConfig.overallWeights },
    };
    this._validate(merged);

    const { rows } = await this.db.query(
      `UPDATE performance_configuration
       SET config = $3::jsonb, version = version + 1, updated_by = $2, updated_at = now()
       WHERE tenant_id = $1
       RETURNING *`,
      [tenantId, userId, JSON.stringify(merged)],
    );
    const updated = rows[0];

    const weightsChanged = JSON.stringify(existing.config.weights) !== JSON.stringify(merged.weights)
      || JSON.stringify(existing.config.overallWeights) !== JSON.stringify(merged.overallWeights);

    await this.auditLog.log({
      tenantId, userId,
      entityType: 'performance_configuration', entityId: updated.id,
      action: weightsChanged ? 'weightage_updated' : 'config_updated',
      oldValues: existing.config, newValues: merged,
    });

    return updated;
  }

  private _validate(config: AttendanceBehaviourConfig): void {
    const weightSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 100) > WEIGHT_SUM_TOLERANCE) {
      throw new BadRequestException(`Attendance behaviour component weights must sum to 100 (currently ${weightSum})`);
    }
    const overallSum = Object.values(config.overallWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(overallSum - 100) > WEIGHT_SUM_TOLERANCE) {
      throw new BadRequestException(`Overall score weights (KRA/KPI/Attendance) must sum to 100 (currently ${overallSum})`);
    }
    if (!config.ratingBuckets?.length) {
      throw new BadRequestException('At least one rating bucket is required');
    }
    for (const bucket of config.ratingBuckets) {
      if (bucket.min > bucket.max) {
        throw new BadRequestException(`Rating bucket "${bucket.label}" has min greater than max`);
      }
    }
  }

  /** Generic rating-bucket evaluator — reused for both attendance and overall scores. */
  static resolveRating(score: number, buckets: { label: string; min: number; max: number }[]): string {
    const match = buckets.find((b) => score >= b.min && score <= b.max);
    return match?.label ?? buckets[buckets.length - 1]?.label ?? 'Unrated';
  }
}
