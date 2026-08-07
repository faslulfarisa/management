import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';

/**
 * Polls active break_sessions for overdue breaks and raises in-app
 * notifications (via the existing `notifications` table) to the
 * employee, their reporting manager, and tenant HR/Admin users.
 *
 * Purely additive: reads/writes only the new break_sessions table and
 * the new attendance_records.total_overdue_break_minutes column.
 */
@Injectable()
export class BreakMonitorService {
  private readonly logger = new Logger(BreakMonitorService.name);

  constructor(private readonly db: DatabaseService) {}

  @Cron('*/1 * * * *')
  async checkOverdueBreaks() {
    const { rows: overdue } = await this.db.query(
      `SELECT bs.*, e.first_name, e.last_name, e.reporting_manager_id,
              EXTRACT(EPOCH FROM (now() - bs.started_at)) / 60 AS elapsed_minutes
       FROM break_sessions bs
       JOIN employees e ON bs.employee_id = e.id
       WHERE bs.status = 'active'
         AND bs.alert_sent_at IS NULL
         AND bs.allowed_minutes IS NOT NULL
         AND EXTRACT(EPOCH FROM (now() - bs.started_at)) / 60 > bs.allowed_minutes`,
    );

    for (const session of overdue) {
      try {
        await this._raiseOverdueAlert(session);
      } catch (err: any) {
        this.logger.error(`Failed to raise overdue break alert for session ${session.id}: ${err?.message}`);
      }
    }
  }

  private async _raiseOverdueAlert(session: any) {
    const elapsedMinutes = Math.round(session.elapsed_minutes);
    const overdueMinutes = Math.max(0, elapsedMinutes - session.allowed_minutes);

    await this.db.query(
      `UPDATE break_sessions SET is_overdue = true, overdue_minutes = $2, alert_sent_at = now(), updated_at = now()
       WHERE id = $1`,
      [session.id, overdueMinutes],
    );
    await this.db.query(
      `UPDATE attendance_records SET total_overdue_break_minutes = COALESCE(total_overdue_break_minutes, 0) + $2, updated_at = now()
       WHERE id = $1`,
      [session.attendance_record_id, overdueMinutes],
    );

    const employeeName = `${session.first_name} ${session.last_name}`.trim();
    const title = 'Break time exceeded';
    const message = `${employeeName} has exceeded ${session.reason_label} limit by ${overdueMinutes} minute${overdueMinutes === 1 ? '' : 's'}.`;

    const recipients = await this._resolveAlertRecipients(session.tenant_id, session.employee_id, session.reporting_manager_id);
    for (const userId of recipients) {
      await this.db.query(
        `INSERT INTO notifications (tenant_id, user_id, title, message, type) VALUES ($1, $2, $3, $4, 'warning')`,
        [session.tenant_id, userId, title, message],
      );
    }
  }

  /** Employee, their reporting manager, and tenant HR/Admin users. */
  private async _resolveAlertRecipients(tenantId: string, employeeId: string, managerEmployeeId: string | null): Promise<string[]> {
    const employeeIds = [employeeId, ...(managerEmployeeId ? [managerEmployeeId] : [])];
    const { rows: directRows } = await this.db.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND employee_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
      [tenantId, employeeIds],
    );

    const { rows: hrRows } = await this.db.query(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
         AND (r.name ILIKE '%admin%' OR r.name ILIKE '%hr%')`,
      [tenantId],
    );

    const ids = new Set<string>([...directRows.map((r: any) => r.id), ...hrRows.map((r: any) => r.id)]);
    return Array.from(ids);
  }
}
