import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { assertUniqueCode, translateUniqueViolation } from '../../../shared/unique-code.validator';
import { AccessScope, branchScopeClause, isBranchInScope } from '../../../shared/scope.util';
import { TemplateService } from '../../platform/services/template.service';

@Injectable()
export class ShiftService {
  constructor(
    private db: DatabaseService,
    private templateService: TemplateService,
  ) {}

  async getShifts(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM shift_definitions WHERE tenant_id = $1 ORDER BY name',
      [tenantId],
    );
    return rows;
  }

  async createShift(tenantId: string, data: any) {
    if (data.code) {
      await assertUniqueCode(this.db, 'shift_definitions', tenantId, 'code', data.code, {
        label: 'Shift code',
        deletionField: 'is_active',
      });
    }
    try {
      const { rows } = await this.db.query(
        `INSERT INTO shift_definitions (tenant_id, name, code, start_time, end_time, break_minutes, grace_period_minutes)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tenantId, data.name, data.code, data.start_time, data.end_time, data.break_minutes || 0, data.grace_period_minutes || 15],
      );
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Shift code');
      throw e;
    }
  }

  async updateShift(id: string, tenantId: string, data: any) {
    if (data.code) {
      await assertUniqueCode(this.db, 'shift_definitions', tenantId, 'code', data.code, {
        excludeId: id,
        label: 'Shift code',
        deletionField: 'is_active',
      });
    }
    try {
      const { rows } = await this.db.query(
        `UPDATE shift_definitions SET name = COALESCE($3, name), code = COALESCE($4, code),
          start_time = COALESCE($5, start_time), end_time = COALESCE($6, end_time),
          break_minutes = COALESCE($7, break_minutes), grace_period_minutes = COALESCE($8, grace_period_minutes),
          is_active = COALESCE($9, is_active), updated_at = now()
          WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, tenantId, data.name, data.code, data.start_time, data.end_time, data.break_minutes, data.grace_period_minutes, data.is_active],
      );
      if (!rows.length) throw new NotFoundException('Shift not found');
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Shift code');
      throw e;
    }
  }

  async deleteShift(id: string, tenantId: string) {
    await this.db.query('UPDATE shift_definitions SET is_active = false, updated_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async getAssignments(tenantId: string, filters: any) {
    const { employee_id, is_active, accessScope } = filters;
    let query = `SELECT sa.*, sd.name as shift_name, sd.code as shift_code,
      e.first_name, e.last_name, e.employee_code
      FROM shift_assignments sa
      JOIN shift_definitions sd ON sa.shift_id = sd.id
      JOIN employees e ON sa.employee_id = e.id
      WHERE sa.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND sa.employee_id = $${idx++}`; params.push(employee_id); }
    if (is_active !== undefined) { query += ` AND sa.is_active = $${idx++}`; params.push(is_active === 'true'); }
    if (accessScope) {
      const scope = branchScopeClause(accessScope, 'e.branch_id', idx);
      query += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    query += ' ORDER BY sa.created_at DESC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  private async assertEmployeeInScope(tenantId: string, employeeId: string, accessScope: AccessScope) {
    if (accessScope.isGlobalAccess) return;
    const { rows } = await this.db.query(
      'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );
    if (!rows.length || !isBranchInScope(accessScope, rows[0].branch_id)) {
      throw new ForbiddenException('Employee is outside your assigned branch scope');
    }
  }

  async assignShift(tenantId: string, data: any, accessScope: AccessScope) {
    await this.assertEmployeeInScope(tenantId, data.employee_id, accessScope);
    const { rows } = await this.db.query(
      `INSERT INTO shift_assignments (tenant_id, employee_id, shift_id, start_date, end_date)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, data.employee_id, data.shift_id, data.start_date, data.end_date || null],
    );
    return rows[0];
  }

  async getSchedules(tenantId: string, filters: any) {
    const { employee_id, date_from, date_to, accessScope } = filters;
    let query = `SELECT ss.*, sd.name as shift_name, sd.code as shift_code,
      sd.start_time, sd.end_time, e.first_name, e.last_name
      FROM shift_schedules ss
      JOIN shift_definitions sd ON ss.shift_id = sd.id
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND ss.employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND ss.date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND ss.date <= $${idx++}`; params.push(date_to); }
    if (accessScope) {
      const scope = branchScopeClause(accessScope, 'e.branch_id', idx);
      query += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    query += ' ORDER BY ss.date';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createSchedule(tenantId: string, data: any, accessScope: AccessScope) {
    await this.assertEmployeeInScope(tenantId, data.employee_id, accessScope);
    const { rows } = await this.db.query(
      `INSERT INTO shift_schedules (tenant_id, employee_id, shift_id, date, notes)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET shift_id = $3, notes = $5, updated_at = now()
        RETURNING *`,
      [tenantId, data.employee_id, data.shift_id, data.date, data.notes],
    );
    return rows[0];
  }

  async bulkCreateSchedule(tenantId: string, schedules: any[], accessScope: AccessScope) {
    if (!accessScope.isGlobalAccess) {
      const employeeIds = [...new Set(schedules.map((s) => s.employee_id))];
      if (employeeIds.length) {
        const { rows } = await this.db.query(
          'SELECT id, branch_id FROM employees WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
          [tenantId, employeeIds],
        );
        const outOfScope = rows.find((r) => !isBranchInScope(accessScope, r.branch_id));
        if (outOfScope || rows.length !== employeeIds.length) {
          throw new ForbiddenException('One or more employees are outside your assigned branch scope');
        }
      }
    }
    const results: any[] = [];
    for (const s of schedules) {
      const { rows } = await this.db.query(
        `INSERT INTO shift_schedules (tenant_id, employee_id, shift_id, date, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET shift_id = $3, notes = $5, updated_at = now()
          RETURNING *`,
        [tenantId, s.employee_id, s.shift_id, s.date, s.notes || ''],
      );
      results.push(rows[0]);
    }
    return results;
  }

  async getTodayShiftForEmployee(tenantId: string, employeeId: string): Promise<any | null> {
    const today = this.getLocalDate();

    // Check day-specific schedule first
    const { rows: scheduleRows } = await this.db.query(
      `SELECT ss.*, sd.name as shift_name, sd.code as shift_code,
        sd.start_time, sd.end_time, sd.break_minutes, sd.grace_period_minutes
        FROM shift_schedules ss
        JOIN shift_definitions sd ON ss.shift_id = sd.id
        WHERE ss.tenant_id = $1
          AND ss.employee_id = $2 AND ss.date = $3`,
      [tenantId, employeeId, today],
    );
    if (scheduleRows.length) return scheduleRows[0];

    // Fall back to standing shift assignment
    const { rows: assignRows } = await this.db.query(
      `SELECT sa.*, sd.name as shift_name, sd.code as shift_code,
        sd.start_time, sd.end_time, sd.break_minutes, sd.grace_period_minutes
        FROM shift_assignments sa
        JOIN shift_definitions sd ON sa.shift_id = sd.id
        WHERE sa.tenant_id = $1
          AND sa.employee_id = $2
          AND sa.is_active = true
          AND sa.start_date <= $3
          AND (sa.end_date IS NULL OR sa.end_date >= $3)
        ORDER BY sa.start_date DESC
        LIMIT 1`,
      [tenantId, employeeId, today],
    );
    if (assignRows.length) return assignRows[0];

    return this.getShiftFromTemplate(tenantId, employeeId, today);
  }

  private getLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getShiftFromTemplate(tenantId: string, employeeId: string, today: string) {
    const template = await this.templateService.getResolved(
      tenantId,
      'shift_management',
      'employee',
      employeeId,
    );
    const config = template?.config ?? null;
    if (!config || this.isWeeklyOff(config, today)) return null;

    const preset = this.getDefaultShiftPreset(config.default_shift);
    const startTime = this.normalizeTime(config.shift_start_time ?? preset?.start_time);
    const endTime = this.normalizeTime(config.shift_end_time ?? preset?.end_time);
    if (!startTime || !endTime) return null;

    return {
      id: template.id,
      tenant_id: tenantId,
      employee_id: employeeId,
      date: today,
      shift_name: config.shift_name ?? template.name,
      shift_code: config.shift_code ?? preset?.shift_code ?? null,
      start_time: startTime,
      end_time: endTime,
      break_minutes: this.getBreakMinutes(config),
      grace_period_minutes: Number(config.grace_period_minutes ?? 15),
      source: 'template',
    };
  }

  private getDefaultShiftPreset(defaultShift?: string) {
    const presets: Record<string, { shift_code: string; start_time: string; end_time: string }> = {
      general: { shift_code: 'GEN', start_time: '09:00:00', end_time: '18:00:00' },
      morning: { shift_code: 'MRN', start_time: '07:00:00', end_time: '15:00:00' },
      afternoon: { shift_code: 'AFT', start_time: '15:00:00', end_time: '23:00:00' },
      evening: { shift_code: 'EVE', start_time: '15:00:00', end_time: '23:00:00' },
      night: { shift_code: 'NGT', start_time: '23:00:00', end_time: '07:00:00' },
    };
    return defaultShift ? presets[String(defaultShift).toLowerCase()] : null;
  }

  private normalizeTime(value?: string | null) {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    const hour = match[1].padStart(2, '0');
    const minute = match[2];
    const second = match[3] ?? '00';
    return `${hour}:${minute}:${second}`;
  }

  private getBreakMinutes(config: Record<string, any>) {
    if (config.break_enabled === false) return 0;
    const configured = Number(config.break_duration_minutes);
    if (Number.isFinite(configured) && configured > 0) return configured;

    const start = this.timeToMinutes(config.break_start_time);
    const end = this.timeToMinutes(config.break_end_time);
    if (start == null || end == null) return 0;
    const duration = end >= start ? end - start : end + 24 * 60 - start;
    return Math.max(0, duration);
  }

  private timeToMinutes(value?: string | null) {
    const normalized = this.normalizeTime(value);
    if (!normalized) return null;
    const [hours, minutes] = normalized.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private isWeeklyOff(config: Record<string, any>, today: string) {
    const date = new Date(`${today}T00:00:00`);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const configuredDays = typeof config.weekly_off_days === 'string'
      ? config.weekly_off_days
        .split(',')
        .map((day: string) => day.trim().toLowerCase())
        .filter(Boolean)
      : [];

    if (configuredDays.length) return configuredDays.includes(dayName);
    return config.weekly_off_pattern === 'fixed' && dayName === 'sunday';
  }
}
