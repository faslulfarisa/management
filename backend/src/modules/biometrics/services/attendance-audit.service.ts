import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

export type AuditEventType =
  | 'punch_received'
  | 'record_created'
  | 'record_updated'
  | 'manual_correction'
  | 'approval_granted'
  | 'approval_rejected'
  | 'record_reverted';

export type ActorType = 'system' | 'provider' | 'user' | 'api';

export interface WriteAuditParams {
  tenantId: string;
  employeeId?: string | null;
  attendanceRecordId?: string | null;
  eventType: AuditEventType;
  actorType?: ActorType;
  actorId?: string | null;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class AttendanceAuditService {
  constructor(private readonly db: DatabaseService) {}

  async write(params: WriteAuditParams): Promise<void> {
    await this.db.query(
      `INSERT INTO attendance_audit_logs
         (tenant_id, employee_id, attendance_record_id, event_type,
          actor_type, actor_id, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.tenantId,
        params.employeeId ?? null,
        params.attendanceRecordId ?? null,
        params.eventType,
        params.actorType ?? 'system',
        params.actorId ?? null,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
  }

  async getRecordHistory(tenantId: string, attendanceRecordId: string): Promise<any[]> {
    const { rows } = await this.db.query(
      `SELECT id, event_type, actor_type, actor_id,
              before_state, after_state, metadata, created_at
       FROM attendance_audit_logs
       WHERE tenant_id = $1 AND attendance_record_id = $2
       ORDER BY created_at ASC`,
      [tenantId, attendanceRecordId],
    );
    return rows;
  }

  async getEmployeeHistory(
    tenantId: string,
    employeeId: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<any[]> {
    let sql = `
      SELECT id, attendance_record_id, event_type, actor_type, actor_id,
             before_state, after_state, metadata, created_at
      FROM attendance_audit_logs
      WHERE tenant_id = $1 AND employee_id = $2`;
    const params: any[] = [tenantId, employeeId];

    if (fromDate) {
      params.push(fromDate);
      sql += ` AND created_at >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      sql += ` AND created_at < $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC LIMIT 500';

    const { rows } = await this.db.query(sql, params);
    return rows;
  }
}
