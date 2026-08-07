import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class AutomationService {
  constructor(private db: DatabaseService) {}

  async getRules(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM automation_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows;
  }

  async createRule(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO automation_rules (tenant_id, name, trigger_type, trigger_config, actions)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, data.name, data.trigger_type, JSON.stringify(data.trigger_config || {}), JSON.stringify(data.actions || [])],
    );
    return rows[0];
  }

  async updateRule(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE automation_rules SET name = COALESCE($3, name), trigger_type = COALESCE($4, trigger_type),
        trigger_config = COALESCE($5, trigger_config), actions = COALESCE($6, actions),
        is_active = COALESCE($7, is_active), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.name, data.trigger_type, data.trigger_config ? JSON.stringify(data.trigger_config) : null, data.actions ? JSON.stringify(data.actions) : null, data.is_active],
    );
    if (!rows.length) throw new NotFoundException('Rule not found');
    return rows[0];
  }

  async deleteRule(id: string, tenantId: string) {
    await this.db.query('DELETE FROM automation_rules WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async getLogs(tenantId: string, filters: any) {
    const { page = 1, limit = 20, rule_id, status } = filters;
    let query = 'SELECT al.*, ar.name as rule_name FROM automation_logs al LEFT JOIN automation_rules ar ON al.rule_id = ar.id WHERE al.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (rule_id) { query += ` AND al.rule_id = $${idx++}`; params.push(rule_id); }
    if (status) { query += ` AND al.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY al.triggered_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getTasks(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM scheduled_tasks WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows;
  }

  async createTask(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO scheduled_tasks (tenant_id, name, cron_expression, task_type, config)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, data.name, data.cron_expression, data.task_type, JSON.stringify(data.config || {})],
    );
    return rows[0];
  }

  async updateTask(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE scheduled_tasks SET name = COALESCE($3, name), cron_expression = COALESCE($4, cron_expression),
        task_type = COALESCE($5, task_type), config = COALESCE($6, config), is_active = COALESCE($7, is_active), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.name, data.cron_expression, data.task_type, data.config ? JSON.stringify(data.config) : null, data.is_active],
    );
    if (!rows.length) throw new NotFoundException('Task not found');
    return rows[0];
  }

  async deleteTask(id: string, tenantId: string) {
    await this.db.query('DELETE FROM scheduled_tasks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async getNotifications(tenantId: string, userId?: string) {
    let query = 'SELECT * FROM notifications WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (userId) { query += ` AND user_id = $${idx++}`; params.push(userId); }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createNotification(tenantId: string, data: { user_id?: string; title: string; message: string; type?: string }) {
    const { rows } = await this.db.query(
      'INSERT INTO notifications (tenant_id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tenantId, data.user_id || null, data.title, data.message, data.type || 'info'],
    );
    return rows[0];
  }

  async markRead(id: string, tenantId: string, userId: string) {
    const { rows } = await this.db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING *',
      [id, tenantId, userId],
    );
    if (!rows.length) throw new NotFoundException('Notification not found');
    return rows[0];
  }

  async markAllRead(userId: string, tenantId: string) {
    await this.db.query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    return { success: true };
  }

  async getUnreadCount(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND tenant_id = $2 AND is_read = false',
      [userId, tenantId],
    );
    return parseInt(rows[0].count);
  }
}
