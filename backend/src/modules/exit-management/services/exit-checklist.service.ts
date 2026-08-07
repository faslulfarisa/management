import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { TemplateService } from '../../platform/services/template.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { ExitTimelineService } from './exit-timeline.service';

interface ExitChecklistTemplateItem {
  key?: string;
  item: string;
  department: string;
  is_mandatory?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  sort_order?: number;
  due_in_days?: number;
}

/** Built-in fallback so checklist generation works with zero template setup. */
const DEFAULT_TEMPLATE_ITEMS: ExitChecklistTemplateItem[] = [
  { item: 'Return Laptop', department: 'IT', is_mandatory: true, priority: 'high', sort_order: 1 },
  { item: 'Disable Email', department: 'IT', is_mandatory: true, priority: 'high', sort_order: 2 },
  { item: 'Disable VPN', department: 'IT', is_mandatory: true, priority: 'high', sort_order: 3 },
  { item: 'Disable Git / Source Control Access', department: 'IT', is_mandatory: true, priority: 'high', sort_order: 4 },
  { item: 'Clear Advances', department: 'Finance', is_mandatory: true, priority: 'medium', sort_order: 5 },
  { item: 'Settle Expense Claims', department: 'Finance', is_mandatory: true, priority: 'medium', sort_order: 6 },
  { item: 'Full & Final Settlement', department: 'Payroll', is_mandatory: true, priority: 'high', sort_order: 7 },
  { item: 'Leave Encashment', department: 'Payroll', is_mandatory: true, priority: 'medium', sort_order: 8 },
  { item: 'Return ID Card', department: 'Administration', is_mandatory: true, priority: 'medium', sort_order: 9 },
  { item: 'Return Parking Pass', department: 'Administration', is_mandatory: false, priority: 'low', sort_order: 10 },
  { item: 'Return Office Keys', department: 'Administration', is_mandatory: false, priority: 'low', sort_order: 11 },
  { item: 'Conduct Exit Interview', department: 'HR', is_mandatory: true, priority: 'medium', sort_order: 12 },
  { item: 'Policy Acknowledgement', department: 'HR', is_mandatory: false, priority: 'low', sort_order: 13 },
];

@Injectable()
export class ExitChecklistService {
  constructor(
    private readonly db: DatabaseService,
    private readonly templateService: TemplateService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly timeline: ExitTimelineService,
  ) {}

  /** Auto-generates checklist items on exit-request approval — org/branch/department/role templates cascade via TemplateService. */
  async applyTemplate(tenantId: string, exitRequestId: string, employeeId: string) {
    const { rows: existing } = await this.db.query(
      'SELECT 1 FROM exit_checklist WHERE exit_request_id = $1 LIMIT 1',
      [exitRequestId],
    );
    if (existing.length) return this.list(tenantId, exitRequestId);

    const template = await this.templateService.getResolved(tenantId, 'exit_checklist', 'employee', employeeId);
    const items: ExitChecklistTemplateItem[] = template?.config?.items?.length ? template.config.items : DEFAULT_TEMPLATE_ITEMS;

    for (const it of items) {
      const dueDate = it.due_in_days != null
        ? new Date(Date.now() + it.due_in_days * 86400000).toISOString().slice(0, 10)
        : null;
      await this.db.query(
        `INSERT INTO exit_checklist
           (tenant_id, exit_request_id, item, department, status, template_item_key, sort_order, is_mandatory, priority, due_date)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)`,
        [tenantId, exitRequestId, it.item, it.department, it.key ?? null, it.sort_order ?? 0, it.is_mandatory ?? true, it.priority ?? 'medium', dueDate],
      );
    }

    if (template?.id) {
      await this.db.query('UPDATE exit_requests SET template_id = $1 WHERE id = $2 AND tenant_id = $3', [template.id, exitRequestId, tenantId]);
    }

    return this.list(tenantId, exitRequestId);
  }

  async list(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT ec.*, u.email AS assigned_to_email
       FROM exit_checklist ec
       LEFT JOIN users u ON ec.assigned_to = u.id
       WHERE ec.tenant_id = $1 AND ec.exit_request_id = $2
       ORDER BY ec.sort_order, ec.created_at`,
      [tenantId, exitRequestId],
    );
    return rows;
  }

  async create(tenantId: string, exitRequestId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO exit_checklist (tenant_id, exit_request_id, item, department, assigned_to, status, is_mandatory, priority, due_date, sort_order)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8, COALESCE((SELECT MAX(sort_order)+1 FROM exit_checklist WHERE exit_request_id = $2), 0))
       RETURNING *`,
      [tenantId, exitRequestId, data.item, data.department, data.assigned_to ?? null, data.is_mandatory ?? true, data.priority ?? 'medium', data.due_date ?? null],
    );
    if (data.assigned_to) {
      await this.notificationEmitter.emit(tenantId, {
        userIds: [data.assigned_to], title: 'Exit checklist task assigned',
        message: data.item, type: 'info', sourceModule: 'exit_management',
        entityType: 'exit_checklist', entityId: rows[0].id,
      });
    }
    return rows[0];
  }

  async update(tenantId: string, id: string, data: { status?: string; remarks?: string; assigned_to?: string; due_date?: string; priority?: string; actorId?: string }) {
    const { rows: existing } = await this.db.query('SELECT * FROM exit_checklist WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Checklist item not found');

    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); params.push(data.status); }
    if (data.remarks !== undefined) { fields.push(`remarks = $${idx++}`); params.push(data.remarks); }
    if (data.assigned_to !== undefined) { fields.push(`assigned_to = $${idx++}`); params.push(data.assigned_to); }
    if (data.due_date !== undefined) { fields.push(`due_date = $${idx++}`); params.push(data.due_date); }
    if (data.priority !== undefined) { fields.push(`priority = $${idx++}`); params.push(data.priority); }
    if (data.status === 'completed') fields.push(`completed_at = now()`);
    params.push(id, tenantId);

    const { rows } = await this.db.query(
      `UPDATE exit_checklist SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );
    const updated = rows[0];

    if (data.status === 'completed') {
      await this.timeline.record(existing[0].tenant_id, existing[0].exit_request_id, 'checklist_completed', data.actorId, `${existing[0].item} (${existing[0].department})`);
      await this.maybeMarkAllComplete(tenantId, existing[0].exit_request_id);
    }
    return updated;
  }

  async delete(tenantId: string, id: string) {
    const { rows } = await this.db.query('DELETE FROM exit_checklist WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Checklist item not found');
    return { id };
  }

  async progress(tenantId: string, exitRequestId: string): Promise<{ total: number; completed: number; percent: number; mandatoryOutstanding: number }> {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status != 'completed' AND is_mandatory) AS mandatory_outstanding
       FROM exit_checklist WHERE tenant_id = $1 AND exit_request_id = $2`,
      [tenantId, exitRequestId],
    );
    const total = parseInt(rows[0].total, 10);
    const completed = parseInt(rows[0].completed, 10);
    return {
      total, completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      mandatoryOutstanding: parseInt(rows[0].mandatory_outstanding, 10),
    };
  }

  private async maybeMarkAllComplete(tenantId: string, exitRequestId: string) {
    const p = await this.progress(tenantId, exitRequestId);
    if (p.mandatoryOutstanding === 0 && p.total > 0) {
      await this.timeline.record(tenantId, exitRequestId, 'checklist_completed', undefined, 'All mandatory checklist items completed');
    }
  }
}
