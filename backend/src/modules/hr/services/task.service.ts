import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class TaskService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, filters: {
    status?: string;
    priority?: string;
    assigned_to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, priority, assigned_to, search, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['t.tenant_id = $1'];
    const params: any[] = [tenantId];
    let p = 2;

    if (status) { conditions.push(`t.status = $${p++}`); params.push(status); }
    if (priority) { conditions.push(`t.priority = $${p++}`); params.push(priority); }
    if (assigned_to) { conditions.push(`t.assigned_to = $${p++}`); params.push(assigned_to); }
    if (search) {
      conditions.push(`(t.title ILIKE $${p} OR t.description ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = conditions.join(' AND ');

    const { rows } = await this.db.query(
      `SELECT
         t.*,
         COALESCE(e.first_name || ' ' || e.last_name, u.email) AS assigned_to_name,
         e.employee_code AS assigned_to_employee_id,
         dept.name AS assigned_to_department,
         COALESCE(ec.first_name || ' ' || ec.last_name, c.email) AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN departments dept ON dept.id = e.department_id
       LEFT JOIN users c ON c.id = t.created_by
       LEFT JOIN employees ec ON ec.id = c.employee_id AND ec.deleted_at IS NULL
       WHERE ${where}
       ORDER BY
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.due_date ASC NULLS LAST,
         t.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset],
    );

    const { rows: countRows } = await this.db.query(
      `SELECT COUNT(*) FROM tasks t WHERE ${where}`,
      params,
    );

    return { data: rows, total: parseInt(countRows[0].count, 10), page, limit };
  }

  async getStats(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'cancelled') AS total,
         COUNT(*) FILTER (WHERE parent_id IS NULL AND status != 'cancelled') AS main_total,
         COUNT(*) FILTER (WHERE parent_id IS NOT NULL AND status != 'cancelled') AS sub_total,
         COUNT(*) FILTER (WHERE status = 'todo') AS todo,
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE status = 'done') AS done,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE status != 'done' AND status != 'cancelled' AND due_date < CURRENT_DATE) AS overdue
       FROM tasks WHERE tenant_id = $1`,
      [tenantId],
    );
    return rows[0];
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT
         t.*,
         COALESCE(e.first_name || ' ' || e.last_name, u.email) AS assigned_to_name,
         e.employee_code AS assigned_to_employee_id,
         dept.name AS assigned_to_department,
         COALESCE(ec.first_name || ' ' || ec.last_name, c.email) AS created_by_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN departments dept ON dept.id = e.department_id
       LEFT JOIN users c ON c.id = t.created_by
       LEFT JOIN employees ec ON ec.id = c.employee_id AND ec.deleted_at IS NULL
       WHERE t.id = $1 AND t.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Task not found');
    return rows[0];
  }

  async create(tenantId: string, userId: string, data: {
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assigned_to?: string;
    due_date?: string;
    subtasks?: any[];
  }) {
    const subtasks = data.subtasks;
    if (!subtasks || subtasks.length === 0) {
      throw new BadRequestException('A task must have at least one subtask.');
    }

    return this.db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO tasks (tenant_id, created_by, title, description, status, priority, assigned_to, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tenantId,
          userId,
          data.title,
          data.description || null,
          data.status || 'todo',
          data.priority || 'medium',
          data.assigned_to || null,
          data.due_date || null,
        ],
      );
      const parentTask = rows[0];

      for (const sub of subtasks) {
        await client.query(
          `INSERT INTO tasks (tenant_id, created_by, title, description, status, priority, assigned_to, due_date, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            userId,
            sub.title,
            sub.description || null,
            sub.status || 'todo',
            sub.priority || 'medium',
            sub.assigned_to || null,
            sub.due_date || null,
            parentTask.id,
          ],
        );
      }
      return parentTask;
    });
  }

  async update(id: string, tenantId: string, data: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    assigned_to: string;
    due_date: string;
  }>) {
    const task = await this.findOne(id, tenantId);

    const completedAt =
      data.status === 'done' && task.status !== 'done'
        ? 'NOW()'
        : data.status && data.status !== 'done' && task.status === 'done'
        ? 'NULL'
        : undefined;

    const { rows } = await this.db.query(
      `UPDATE tasks SET
         title       = COALESCE($3, title),
         description = COALESCE($4, description),
         status      = COALESCE($5, status),
         priority    = COALESCE($6, priority),
         assigned_to = $7,
         due_date    = $8,
         completed_at = ${completedAt ?? 'completed_at'},
         updated_at  = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        data.title ?? null,
        data.description ?? null,
        data.status ?? null,
        data.priority ?? null,
        data.assigned_to !== undefined ? data.assigned_to || null : task.assigned_to,
        data.due_date !== undefined ? data.due_date || null : task.due_date,
      ],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.db.query(
      `UPDATE tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return { success: true };
  }
}
