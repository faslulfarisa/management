import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../../../shared/database.service';
import { REDIS_CLIENT } from '../../../shared/redis.provider';

export interface ShiftRow {
  shift_id: string | null;
  start_time: string;
  end_time: string;
  break_minutes: string;
  grace_period_minutes: string;
  is_overnight: boolean;
}

@Injectable()
export class ShiftCacheService {
  private readonly logger = new Logger(ShiftCacheService.name);
  private readonly TTL = 300; // 5 minutes — shifts change rarely

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  async getShift(
    tenantId: string,
    employeeId: string,
    dateStr: string,
  ): Promise<ShiftRow | null> {
    const key = `shift:${tenantId}:${employeeId}:${dateStr}`;

    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached) as ShiftRow;
    } catch (e) {
      this.logger.warn(`Redis get failed for key ${key}, falling back to DB`);
    }

    const shift = await this._queryDb(tenantId, employeeId, dateStr);

    if (shift) {
      try {
        await this.redis.setex(key, this.TTL, JSON.stringify(shift));
      } catch (e) {
        // Cache write failure is non-fatal
      }
    }

    return shift;
  }

  async invalidate(tenantId: string, employeeId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`shift:${tenantId}:${employeeId}:*`);
      if (keys.length) await this.redis.del(...keys);
    } catch (e) {
      this.logger.warn(`Redis invalidation failed for employee ${employeeId}`);
    }
  }

  private async _queryDb(
    tenantId: string,
    employeeId: string,
    dateStr: string,
  ): Promise<ShiftRow | null> {
    const overrideRes = await this.db.query(
      `SELECT so.shift_id, 
              COALESCE(so.start_time, sd.start_time) as start_time,
              COALESCE(so.end_time, sd.end_time) as end_time,
              COALESCE(so.custom_break_minutes, sd.break_minutes, 0) as break_minutes,
              COALESCE(so.grace_period_minutes, sd.grace_period_minutes) as grace_period_minutes,
              COALESCE(so.is_overnight, sd.is_overnight, false) as is_overnight,
              so.override_type
       FROM shift_overrides so
       LEFT JOIN shift_definitions sd ON so.shift_id = sd.id
       WHERE so.tenant_id = $1 AND so.employee_id = $2 AND so.date = $3
       LIMIT 1`,
      [tenantId, employeeId, dateStr],
    );
    if (overrideRes.rows.length > 0) {
      const override = overrideRes.rows[0];
      if (['cancelled', 'leave', 'replaced'].includes(override.override_type)) {
        return null;
      }
      return {
        shift_id: override.shift_id,
        start_time: override.start_time,
        end_time: override.end_time,
        break_minutes: String(override.break_minutes ?? 0),
        grace_period_minutes: String(override.grace_period_minutes ?? 15),
        is_overnight: !!override.is_overnight,
      };
    }

    const schedRes = await this.db.query(
      `SELECT ss.shift_id, sd.start_time, sd.end_time, sd.break_minutes, sd.grace_period_minutes,
              COALESCE(sd.is_overnight, false) as is_overnight
       FROM shift_schedules ss
       JOIN shift_definitions sd ON ss.shift_id = sd.id
       WHERE ss.tenant_id = $1 AND ss.employee_id = $2 AND ss.date = $3
       LIMIT 1`,
      [tenantId, employeeId, dateStr],
    );
    if (schedRes.rows.length > 0) return schedRes.rows[0];

    const assignRes = await this.db.query(
      `SELECT sa.shift_id, sd.start_time, sd.end_time, sd.break_minutes, sd.grace_period_minutes,
              COALESCE(sd.is_overnight, false) as is_overnight
       FROM shift_assignments sa
       JOIN shift_definitions sd ON sa.shift_id = sd.id
       WHERE sa.tenant_id = $1 AND sa.employee_id = $2
         AND sa.is_active = true
         AND sa.start_date <= $3
         AND (sa.end_date IS NULL OR sa.end_date >= $3)
       ORDER BY sa.start_date DESC
       LIMIT 1`,
      [tenantId, employeeId, dateStr],
    );
    return assignRes.rows[0] ?? null;
  }
}
