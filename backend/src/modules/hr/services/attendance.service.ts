import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { BreakSessionService } from './break-session.service';

export interface AttendancePunchInput {
  timestamp?: string;
  source?: 'mobile_app' | 'web_kiosk' | 'tablet' | 'trusted_terminal' | 'web' | 'manual';
  deviceId?: string;
  deviceToken?: string;
  requestId?: string;
  nonce?: string;
  gps?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    recordedAt?: string | Date;
  };
  photo?: Record<string, unknown>;
  locationMetadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  reason?: { reason_code?: string; note?: string };
}

type ManualPunchDirection = 'IN' | 'OUT';

interface EmployeeAttendanceLookup {
  id: string;
  branch_id: string | null;
}

interface ManualPunch {
  time: string;
  type: ManualPunchDirection;
  provider: string;
  source: string;
  method: string;
  device: string | null;
  request_id: string;
  work_code: string | null;
  punch_state: ManualPunchDirection;
  gps: AttendancePunchInput['gps'] | null;
  photo: AttendancePunchInput['photo'] | null;
  location_metadata: Record<string, unknown> | null;
  actor_id: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(
    private db: DatabaseService,
    private breakSessionService: BreakSessionService,
  ) { }

  async findAll(tenantId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, date_from, date_to, status, branch_id, accessScope = GLOBAL_ACCESS_SCOPE as AccessScope } = filters;
    let query = `SELECT
        a.id, a.tenant_id, a.employee_id, a.date, a.clock_in, a.clock_out,
        a.status, a.late_minutes, a.overtime_minutes, a.remarks, a.location,
        a.branch_id, a.provider_name, a.source_device_id, a.verify_method,
        a.attendance_source, a.terminal_id, a.terminal_serial_number,
        a.work_code, a.punch_state, a.raw_verify_type, a.request_id,
        a.correlation_id, a.gps_latitude, a.gps_longitude,
        a.gps_accuracy_meters, a.gps_recorded_at, a.source_ip,
        a.source_user_agent, a.punch_sequence, a.punch_count,
        a.created_at, a.updated_at,
        e.first_name, e.last_name, e.employee_code
      FROM attendance_records a
      JOIN employees e ON a.employee_id = e.id WHERE a.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (employee_id) { query += ` AND a.employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND a.date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND a.date <= $${idx++}`; params.push(date_to); }
    if (status) { query += ` AND a.status = $${idx++}`; params.push(status); }
    if (branch_id) { query += ` AND a.branch_id = $${idx++}`; params.push(branch_id); }
    {
      const scopeClause = branchScopeClause(accessScope, 'a.branch_id', idx);
      query += ` AND ${scopeClause.clause}`; params.push(...scopeClause.params); idx += scopeClause.params.length;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY a.date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM attendance_records WHERE tenant_id = $1';
    const countParams: any[] = [tenantId];
    let cIdx = 2;
    if (employee_id) { countQuery += ` AND employee_id = $${cIdx++}`; countParams.push(employee_id); }
    if (date_from) { countQuery += ` AND date >= $${cIdx++}`; countParams.push(date_from); }
    if (date_to) { countQuery += ` AND date <= $${cIdx++}`; countParams.push(date_to); }
    if (status) { countQuery += ` AND status = $${cIdx++}`; countParams.push(status); }
    if (branch_id) { countQuery += ` AND branch_id = $${cIdx++}`; countParams.push(branch_id); }
    {
      const scopeClause = branchScopeClause(accessScope, 'branch_id', cIdx);
      countQuery += ` AND ${scopeClause.clause}`; countParams.push(...scopeClause.params); cIdx += scopeClause.params.length;
    }

    const { rows: countRows } = await this.db.query(countQuery, countParams);
    const total = parseInt(countRows[0].count);

    return { data: rows, meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) } };
  }

  async clockIn(tenantId: string, employeeId: string, data: AttendancePunchInput = {}, userId?: string, requestMeta: any = {}) {
    return this.recordManualPunch(tenantId, employeeId, 'IN', data, userId, requestMeta);
  }

  async clockOut(
    tenantId: string,
    employeeId: string,
    input: AttendancePunchInput | { reason_code?: string; note?: string } = {},
    userId?: string,
    requestMeta: any = {},
  ) {
    // Safety net: if the employee forgot to "return" from a break, close it
    // now (no overdue alert) so break_sessions/attendance_records stay consistent.
    const activeBreak = await this.breakSessionService.getActiveBreak(tenantId, employeeId);
    if (activeBreak) {
      await this.breakSessionService._closeBreakSession(tenantId, activeBreak);
    }

    return this.recordManualPunch(tenantId, employeeId, 'OUT', this.normalizePunchInput(input), userId, requestMeta);
  }

  private async recordManualPunch(
    tenantId: string,
    employeeId: string,
    punchType: ManualPunchDirection,
    data: AttendancePunchInput = {},
    userId?: string,
    requestMeta: any = {},
  ) {
    const timestamp = this.resolvePunchTimestamp(data.timestamp);
    const punchDate = timestamp.toISOString().split('T')[0];
    const requestId = data.requestId ?? data.nonce ?? randomUUID();
    const providerName = this.sourceProvider(data.source);
    const attendanceSource = this.sourceToAttendanceSource(data.source);
    const reason = data.reason;

    return this.db.transaction(async (client) => {
      const employee = await this.getEmployeeForAttendance(client, tenantId, employeeId);
      const existing = await this.getAttendanceForUpdate(client, tenantId, employeeId, punchDate);
      const punch = this.buildManualPunch({
        data,
        timestamp,
        punchType,
        providerName,
        attendanceSource,
        requestId,
        userId,
      });
      const punchSequence = this.mergeManualPunchSequence(existing?.punch_sequence, punch);
      const clockIn = this.resolveClockIn(punchSequence, timestamp, punchType, existing?.clock_in);
      const clockOut = this.resolveClockOut(punchSequence, clockIn, punchType, existing?.clock_out);
      const lateMinutes = existing?.late_minutes ?? 0;
      const totalBreakMinutes = Number(existing?.total_break_minutes ?? 0) || 0;
      const unpaidBreakMinutes = Number(existing?.unpaid_break_minutes ?? 0) || 0;

      const { rows } = await client.query(
        `INSERT INTO attendance_records (
           tenant_id, employee_id, date, clock_in, clock_out,
           status, late_minutes, provider_name, source_device_id,
           remarks, branch_id, verify_method, attendance_source,
           work_code, punch_state, request_id, source_ip, source_user_agent,
           location, punch_sequence, punch_count, total_break_minutes,
           unpaid_break_minutes, last_punch_out_reason_code, last_punch_out_note,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           'present', $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16::inet, $17,
           $18::jsonb, $19::jsonb, $20, $21,
           $22, $23, $24,
           now()
         )
         ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET
           clock_in = EXCLUDED.clock_in,
           clock_out = EXCLUDED.clock_out,
           status = 'present',
           late_minutes = EXCLUDED.late_minutes,
           provider_name = EXCLUDED.provider_name,
           source_device_id = EXCLUDED.source_device_id,
           remarks = EXCLUDED.remarks,
           branch_id = EXCLUDED.branch_id,
           verify_method = EXCLUDED.verify_method,
           attendance_source = EXCLUDED.attendance_source,
           work_code = EXCLUDED.work_code,
           punch_state = EXCLUDED.punch_state,
           request_id = EXCLUDED.request_id,
           source_ip = EXCLUDED.source_ip,
           source_user_agent = EXCLUDED.source_user_agent,
           location = EXCLUDED.location,
           punch_sequence = EXCLUDED.punch_sequence,
           punch_count = EXCLUDED.punch_count,
           total_break_minutes = EXCLUDED.total_break_minutes,
           unpaid_break_minutes = EXCLUDED.unpaid_break_minutes,
           last_punch_out_reason_code = COALESCE(EXCLUDED.last_punch_out_reason_code, attendance_records.last_punch_out_reason_code),
           last_punch_out_note = COALESCE(EXCLUDED.last_punch_out_note, attendance_records.last_punch_out_note),
           updated_at = now()
         RETURNING *, (clock_in IS NOT NULL AND clock_out IS NULL) AS is_punched_in`,
        [
          tenantId,
          employeeId,
          punchDate,
          clockIn,
          clockOut,
          lateMinutes,
          providerName,
          data.deviceId ?? null,
          `Recorded from ${providerName} punch button`,
          employee.branch_id,
          'other',
          attendanceSource,
          reason?.reason_code ?? null,
          punchType,
          requestId,
          requestMeta.ip ?? null,
          requestMeta.userAgent ?? null,
          JSON.stringify(this.buildManualLocation(data)),
          JSON.stringify(punchSequence),
          punchSequence.length,
          totalBreakMinutes,
          unpaidBreakMinutes,
          punchType === 'OUT' ? reason?.reason_code ?? null : null,
          punchType === 'OUT' ? reason?.note ?? null : null,
        ],
      );

      await this.writeManualAttendanceAudit(client, {
        tenantId,
        employeeId,
        attendanceRecordId: rows[0].id,
        actorId: userId,
        eventType: existing ? 'record_updated' : 'record_created',
        beforeState: existing,
        afterState: rows[0],
        metadata: {
          request_id: requestId,
          punch_type: punchType,
          source: attendanceSource,
          provider: providerName,
        },
      });

      return rows[0];
    });
  }

  private async getEmployeeForAttendance(client: any, tenantId: string, employeeId: string): Promise<EmployeeAttendanceLookup> {
    const { rows } = await client.query(
      'SELECT id, branch_id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [employeeId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Employee not found');
    return rows[0];
  }

  private async getAttendanceForUpdate(client: any, tenantId: string, employeeId: string, date: string): Promise<any | null> {
    const { rows } = await client.query(
      `SELECT *
       FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date = $3
       FOR UPDATE`,
      [tenantId, employeeId, date],
    );
    return rows[0] ?? null;
  }

  private resolvePunchTimestamp(timestamp?: string): Date {
    const punchTime = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(punchTime.getTime())) throw new BadRequestException('Punch timestamp must be a valid ISO timestamp');
    return punchTime;
  }

  private buildManualPunch(input: {
    data: AttendancePunchInput;
    timestamp: Date;
    punchType: ManualPunchDirection;
    providerName: string;
    attendanceSource: string;
    requestId: string;
    userId?: string;
  }): ManualPunch {
    return {
      time: input.timestamp.toISOString(),
      type: input.punchType,
      provider: input.providerName,
      source: input.attendanceSource,
      method: 'other',
      device: input.data.deviceId ?? null,
      request_id: input.requestId,
      work_code: input.data.reason?.reason_code ?? null,
      punch_state: input.punchType,
      gps: input.data.gps ?? null,
      photo: input.data.photo ?? null,
      location_metadata: input.data.locationMetadata ?? null,
      actor_id: input.userId ?? null,
    };
  }

  private mergeManualPunchSequence(existingSequence: unknown, punch: ManualPunch): ManualPunch[] {
    const sequence = this.parseManualPunchSequence(existingSequence);
    const alreadyRecorded = sequence.some((entry) => entry.request_id === punch.request_id);
    const merged = alreadyRecorded ? sequence : [...sequence, punch];
    return merged.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  private parseManualPunchSequence(existingSequence: unknown): ManualPunch[] {
    const raw = Array.isArray(existingSequence)
      ? existingSequence
      : typeof existingSequence === 'string'
        ? this.safeJsonArray(existingSequence)
        : [];

    return raw
      .map((entry: any): ManualPunch | null => {
        const time = new Date(entry.time ?? entry.timestamp);
        if (isNaN(time.getTime())) return null;
        const type = String(entry.type ?? entry.punch_state ?? '').toUpperCase() === 'OUT' ? 'OUT' : 'IN';
        return {
          time: time.toISOString(),
          type,
          provider: String(entry.provider ?? 'manual'),
          source: String(entry.source ?? 'manual_attendance'),
          method: String(entry.method ?? 'other'),
          device: entry.device ?? null,
          request_id: String(entry.request_id ?? `${time.toISOString()}:${type}`),
          work_code: entry.work_code ?? null,
          punch_state: type,
          gps: entry.gps ?? null,
          photo: entry.photo ?? null,
          location_metadata: entry.location_metadata ?? null,
          actor_id: entry.actor_id ?? null,
        };
      })
      .filter((entry): entry is ManualPunch => entry !== null);
  }

  private resolveClockIn(
    sequence: ManualPunch[],
    timestamp: Date,
    punchType: ManualPunchDirection,
    existingClockIn?: Date | string | null,
  ): Date {
    const firstIn = sequence.find((punch) => punch.type === 'IN');
    if (firstIn) return new Date(firstIn.time);
    if (existingClockIn) return new Date(existingClockIn);
    return punchType === 'IN' ? timestamp : new Date(sequence[0].time);
  }

  private resolveClockOut(
    sequence: ManualPunch[],
    clockIn: Date,
    punchType: ManualPunchDirection,
    existingClockOut?: Date | string | null,
  ): Date | null {
    const lastOut = [...sequence]
      .reverse()
      .find((punch) => punch.type === 'OUT' && new Date(punch.time) >= clockIn);
    if (lastOut) return new Date(lastOut.time);
    if (punchType === 'OUT') return new Date(sequence[sequence.length - 1].time);
    return existingClockOut ? new Date(existingClockOut) : null;
  }

  private buildManualLocation(data: AttendancePunchInput): Record<string, unknown> {
    return {
      ...(data.locationMetadata ?? {}),
      gps: data.gps ?? null,
      photo: data.photo ?? null,
      metadata: data.metadata ?? {},
      source: data.source ?? 'web',
    };
  }

  private async writeManualAttendanceAudit(client: any, input: {
    tenantId: string;
    employeeId: string;
    attendanceRecordId: string;
    actorId?: string;
    eventType: 'record_created' | 'record_updated';
    beforeState: any | null;
    afterState: any;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await client.query(
      `INSERT INTO attendance_audit_logs (
         tenant_id, employee_id, attendance_record_id,
         event_type, actor_type, actor_id,
         before_state, after_state, metadata
       ) VALUES (
         $1, $2, $3,
         $4, 'user', $5,
         $6::jsonb, $7::jsonb, $8::jsonb
       )`,
      [
        input.tenantId,
        input.employeeId,
        input.attendanceRecordId,
        input.eventType,
        input.actorId ?? null,
        input.beforeState ? JSON.stringify(this.pickAttendanceAuditState(input.beforeState)) : null,
        JSON.stringify(this.pickAttendanceAuditState(input.afterState)),
        JSON.stringify(input.metadata),
      ],
    );
  }

  private pickAttendanceAuditState(row: any): Record<string, unknown> {
    return {
      date: row.date,
      clock_in: row.clock_in,
      clock_out: row.clock_out,
      status: row.status,
      late_minutes: row.late_minutes,
      punch_count: row.punch_count,
      provider_name: row.provider_name,
      attendance_source: row.attendance_source,
      request_id: row.request_id,
    };
  }

  private safeJsonArray(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async getTodayStatus(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `SELECT *, (clock_in IS NOT NULL AND clock_out IS NULL) AS is_punched_in
       FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, today],
    );
    return rows[0] || null;
  }

  async getSummary(tenantId: string, filters: any) {
    const { employee_id, date_from, date_to, branch_id } = filters;
    let query = `
      SELECT 
        CASE WHEN late_minutes > 0 THEN 'late' ELSE status END as status, 
        COUNT(*) as count, 
        SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600) as total_hours 
      FROM attendance_records WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { query += ` AND branch_id = $${idx++}`; params.push(branch_id); }
    query += ' GROUP BY CASE WHEN late_minutes > 0 THEN \'late\' ELSE status END';

    const { rows } = await this.db.query(query, params);

    if (employee_id) {
      return rows;
    }

    // Calculate absent dynamically
    let empQuery = `SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'active'`;
    const empParams: any[] = [tenantId];
    let eIdx = 2;
    if (branch_id) { empQuery += ` AND branch_id = $${eIdx++}`; empParams.push(branch_id); }
    if (employee_id) { empQuery += ` AND id = $${eIdx++}`; empParams.push(employee_id); }
    const { rows: empRows } = await this.db.query(empQuery, empParams);
    const totalActiveEmployees = parseInt(empRows[0].count);

    let presentCount = 0;
    const presentRow = rows.find(r => r.status === 'present');
    if (presentRow) presentCount += parseInt(presentRow.count);
    const lateRow = rows.find(r => r.status === 'late');
    if (lateRow) presentCount += parseInt(lateRow.count);
    const halfDayRow = rows.find(r => r.status === 'half_day');
    if (halfDayRow) presentCount += parseInt(halfDayRow.count);

    let absentCount = totalActiveEmployees - presentCount;
    if (absentCount < 0) absentCount = 0;

    const absentRowIndex = rows.findIndex(r => r.status === 'absent');
    if (absentRowIndex >= 0) {
      rows[absentRowIndex].count = absentCount.toString();
    } else {
      rows.push({ status: 'absent', count: absentCount.toString() });
    }

    return rows;
  }

  async getRequests(tenantId: string, filters: any) {
    const { page = 1, limit = 20, status } = filters;
    let query = `SELECT ar.*, e.first_name, e.last_name, e.employee_code FROM attendance_requests ar
      JOIN employees e ON ar.employee_id = e.id WHERE ar.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { query += ` AND ar.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ar.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createRequest(tenantId: string, employeeId: string, data: any) {
    if (!data.date || !String(data.date).trim()) {
      throw new BadRequestException('date is required');
    }
    if (!data.request_type || !String(data.request_type).trim()) {
      throw new BadRequestException('request_type is required');
    }
    if (!employeeId) {
      throw new BadRequestException('User account is not linked to an employee record');
    }
    const requestedClockIn = this.normalizeRequestedTime(data.requested_clock_in ?? data.clock_in);
    const requestedClockOut = this.normalizeRequestedTime(data.requested_clock_out ?? data.clock_out);
    const { rows } = await this.db.query(
      `INSERT INTO attendance_requests
         (tenant_id, employee_id, date, request_type, reason, requested_clock_in, requested_clock_out)
       VALUES ($1, $2, $3, $4, $5, $6::time, $7::time)
       RETURNING *`,
      [tenantId, employeeId, data.date, data.request_type, data.reason || null, requestedClockIn, requestedClockOut],
    );
    return rows[0];
  }

  async approveRequest(id: string, tenantId: string, approvedBy: string) {
    return this.db.transaction(async (client) => {
      const { rows: requestRows } = await client.query(
        `SELECT ar.*, e.branch_id, e.employee_code
         FROM attendance_requests ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.id = $1 AND ar.tenant_id = $2
         FOR UPDATE`,
        [id, tenantId],
      );
      const request = requestRows[0];
      if (!request) throw new NotFoundException('Request not found');
      if (request.status !== 'pending') {
        throw new BadRequestException(`Cannot approve a request with status '${request.status}'`);
      }

      const applied = await this.applyApprovedCorrectionRequest(client, request);
      const { rows } = await client.query(
        `UPDATE attendance_requests
         SET status = 'approved',
             approved_by = $2,
             approved_at = now(),
             applied_at = CASE WHEN $4::boolean THEN now() ELSE applied_at END,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $3
         RETURNING *`,
        [id, approvedBy, tenantId, applied],
      );
      return rows[0];
    });
  }

  async rejectRequest(id: string, tenantId: string, rejectionReason?: string) {
    const { rows } = await this.db.query(
      `UPDATE attendance_requests SET status = 'rejected', reason = COALESCE($3, reason), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, rejectionReason],
    );
    if (!rows.length) throw new NotFoundException('Request not found');
    return rows[0];
  }

  private normalizeRequestedTime(value: any): string | null {
    if (value == null || String(value).trim() === '') return null;
    const normalized = String(value).trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(normalized)) {
      throw new BadRequestException('Requested clock time must be in HH:mm format');
    }
    return normalized.length === 5 ? `${normalized}:00` : normalized;
  }

  private async applyApprovedCorrectionRequest(client: any, request: any): Promise<boolean> {
    if (request.request_type !== 'correction') return false;
    if (!request.requested_clock_in && !request.requested_clock_out) return false;

    const baseDate = request.date instanceof Date
      ? request.date.toISOString().split('T')[0]
      : String(request.date).split('T')[0];
    const existing = await this.getAttendanceForUpdate(client, request.tenant_id, request.employee_id, baseDate);
    const sequence = this.parseManualPunchSequence(existing?.punch_sequence);

    if (request.requested_clock_in) {
      sequence.push(this.buildCorrectionManualPunch(request, baseDate, request.requested_clock_in, 'IN'));
    }
    if (request.requested_clock_out) {
      sequence.push(this.buildCorrectionManualPunch(request, baseDate, request.requested_clock_out, 'OUT'));
    }

    const punchSequence = sequence.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const requestedClockIn = request.requested_clock_in
      ? this.buildCorrectionTimestamp(baseDate, request.requested_clock_in)
      : existing?.clock_in ?? null;
    const requestedClockOut = request.requested_clock_out
      ? this.buildCorrectionTimestamp(baseDate, request.requested_clock_out)
      : existing?.clock_out ?? null;
    const clockIn = requestedClockIn ?? (punchSequence.find((punch) => punch.type === 'IN') ? new Date(punchSequence.find((punch) => punch.type === 'IN')!.time) : null);
    const clockOut = requestedClockOut ?? ([...punchSequence].reverse().find((punch) => punch.type === 'OUT') ? new Date([...punchSequence].reverse().find((punch) => punch.type === 'OUT')!.time) : null);

    const { rows } = await client.query(
      `INSERT INTO attendance_records (
         tenant_id, employee_id, date, clock_in, clock_out,
         status, provider_name, remarks, branch_id, verify_method,
         attendance_source, request_id, punch_sequence, punch_count, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'present', 'manual', $6, $7, 'other',
         'manual_attendance', $8, $9::jsonb, $10, now()
       )
       ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET
         clock_in = COALESCE(EXCLUDED.clock_in, attendance_records.clock_in),
         clock_out = COALESCE(EXCLUDED.clock_out, attendance_records.clock_out),
         status = 'present',
         provider_name = 'manual',
         remarks = EXCLUDED.remarks,
         branch_id = COALESCE(EXCLUDED.branch_id, attendance_records.branch_id),
         verify_method = 'other',
         attendance_source = 'manual_attendance',
         request_id = EXCLUDED.request_id,
         punch_sequence = EXCLUDED.punch_sequence,
         punch_count = EXCLUDED.punch_count,
         updated_at = now()
       RETURNING *`,
      [
        request.tenant_id,
        request.employee_id,
        baseDate,
        clockIn,
        clockOut,
        `Applied approved attendance correction request ${request.id}`,
        request.branch_id ?? null,
        `attendance-request:${request.id}`,
        JSON.stringify(punchSequence),
        punchSequence.length,
      ],
    );

    await this.writeManualAttendanceAudit(client, {
      tenantId: request.tenant_id,
      employeeId: request.employee_id,
      attendanceRecordId: rows[0].id,
      actorId: request.approved_by,
      eventType: existing ? 'record_updated' : 'record_created',
      beforeState: existing,
      afterState: rows[0],
      metadata: {
        attendance_request_id: request.id,
        correction: true,
        source: 'manual_attendance',
      },
    });

    return true;
  }

  private buildCorrectionManualPunch(
    request: any,
    date: string,
    time: string,
    punchType: ManualPunchDirection,
  ): ManualPunch {
    const timestamp = this.buildCorrectionTimestamp(date, time);
    return {
      time: timestamp.toISOString(),
      type: punchType,
      provider: 'manual',
      source: 'manual_attendance',
      method: 'other',
      device: null,
      request_id: `attendance-request:${request.id}:${punchType}:${time}`,
      work_code: null,
      punch_state: punchType,
      gps: null,
      photo: null,
      location_metadata: {
        attendance_request_id: request.id,
        requested_time: time,
        reason: request.reason ?? null,
      },
      actor_id: request.approved_by ?? null,
    };
  }

  private buildCorrectionTimestamp(date: string, time: string): Date {
    const timestamp = new Date(`${date}T${time}`);
    if (isNaN(timestamp.getTime())) {
      throw new BadRequestException('Requested clock time must be valid');
    }
    return timestamp;
  }

  private normalizePunchInput(input: AttendancePunchInput | { reason_code?: string; note?: string }): AttendancePunchInput {
    if ('reason_code' in input || 'note' in input) {
      return { reason: { reason_code: input.reason_code, note: input.note } };
    }
    return input as AttendancePunchInput;
  }

  private sourceProvider(source?: AttendancePunchInput['source']): string {
    switch (source) {
      case 'mobile_app': return 'mobile-app';
      case 'web_kiosk': return 'web-kiosk';
      case 'tablet': return 'tablet';
      case 'trusted_terminal': return 'terminal';
      case 'web':
      case 'manual':
      default: return 'manual';
    }
  }

  private sourceToAttendanceSource(source?: AttendancePunchInput['source']): string {
    switch (source) {
      case 'mobile_app': return 'mobile_terminal';
      case 'web_kiosk': return 'web_kiosk';
      case 'tablet': return 'tablet_terminal';
      case 'trusted_terminal': return 'kiosk_terminal';
      case 'web':
      case 'manual':
      default: return 'manual_attendance';
    }
  }
}
