import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { ExitTimelineService } from './exit-timeline.service';

/** Department clearances are inherently parallel/independent — each one clears on its own, not as a sequential chain. */
const DEFAULT_CLEARANCE_DEPARTMENTS = ['HR', 'Payroll', 'Finance', 'IT', 'Administration', 'Reporting Manager'];

@Injectable()
export class ExitClearanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly timeline: ExitTimelineService,
  ) {}

  async applyDefaultDepartments(tenantId: string, exitRequestId: string) {
    const { rows: existing } = await this.db.query('SELECT 1 FROM exit_clearances WHERE exit_request_id = $1 LIMIT 1', [exitRequestId]);
    if (existing.length) return this.list(tenantId, exitRequestId);

    for (const [i, department] of DEFAULT_CLEARANCE_DEPARTMENTS.entries()) {
      await this.db.query(
        `INSERT INTO exit_clearances (tenant_id, exit_request_id, department, status, is_mandatory, sort_order)
         VALUES ($1, $2, $3, 'pending', true, $4)`,
        [tenantId, exitRequestId, department, i],
      );
    }
    return this.list(tenantId, exitRequestId);
  }

  async list(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT ec.*, u.email AS cleared_by_email
       FROM exit_clearances ec
       LEFT JOIN users u ON ec.cleared_by = u.id
       WHERE ec.tenant_id = $1 AND ec.exit_request_id = $2
       ORDER BY ec.sort_order, ec.created_at`,
      [tenantId, exitRequestId],
    );
    return rows;
  }

  async create(tenantId: string, exitRequestId: string, data: { department: string; is_mandatory?: boolean; due_date?: string }) {
    const { rows } = await this.db.query(
      `INSERT INTO exit_clearances (tenant_id, exit_request_id, department, status, is_mandatory, due_date, sort_order)
       VALUES ($1,$2,$3,'pending',$4,$5, COALESCE((SELECT MAX(sort_order)+1 FROM exit_clearances WHERE exit_request_id = $2), 0))
       RETURNING *`,
      [tenantId, exitRequestId, data.department, data.is_mandatory ?? true, data.due_date ?? null],
    );
    return rows[0];
  }

  async update(tenantId: string, id: string, data: { status: string; remarks?: string; cleared_by: string }) {
    const { rows: existing } = await this.db.query('SELECT * FROM exit_clearances WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Clearance not found');

    const { rows } = await this.db.query(
      `UPDATE exit_clearances
       SET status = $1, remarks = $2, cleared_by = $3,
           cleared_at = ${data.status === 'cleared' ? 'now()' : 'cleared_at'}
       WHERE id = $4 RETURNING *`,
      [data.status, data.remarks ?? null, data.cleared_by, id],
    );
    const updated = rows[0];

    if (data.status === 'cleared') {
      await this.timeline.record(existing[0].tenant_id, existing[0].exit_request_id, 'clearance_cleared', data.cleared_by, `${existing[0].department} cleared`);
      const allCleared = await this.allMandatoryCleared(tenantId, existing[0].exit_request_id);
      if (allCleared) {
        await this.timeline.record(tenantId, existing[0].exit_request_id, 'clearances_completed', data.cleared_by);
      }
    }
    return updated;
  }

  async delete(tenantId: string, id: string) {
    const { rows } = await this.db.query('DELETE FROM exit_clearances WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Clearance not found');
    return { id };
  }

  /** Gate used before allowing FnF settlement / offboarding completion. */
  async allMandatoryCleared(tenantId: string, exitRequestId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) AS outstanding FROM exit_clearances
       WHERE tenant_id = $1 AND exit_request_id = $2 AND is_mandatory AND status != 'cleared'`,
      [tenantId, exitRequestId],
    );
    return parseInt(rows[0].outstanding, 10) === 0;
  }
}
