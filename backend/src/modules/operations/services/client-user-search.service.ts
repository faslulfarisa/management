import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class ClientUserSearchService {
  constructor(private db: DatabaseService) {}

  async search(query = '', limit = 20) {
    const normalizedQuery = query.trim();
    const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
    const params: any[] = [safeLimit];
    let searchClause = '';

    if (normalizedQuery) {
      params.push(`%${normalizedQuery}%`);
      searchClause = `
        AND (
          u.email ILIKE $2
          OR u.phone ILIKE $2
          OR u.username ILIKE $2
          OR u.full_name ILIKE $2
          OR e.first_name ILIKE $2
          OR e.last_name ILIKE $2
          OR e.employee_code ILIKE $2
          OR t.name ILIKE $2
          OR t.legal_name ILIKE $2
        )`;
    }

    const { rows } = await this.db.query(
      `SELECT
         u.id,
         u.email,
         u.phone,
         u.username,
         u.full_name,
         u.is_active,
         u.created_at,
         COALESCE(NULLIF(u.full_name, ''), NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''), u.email) AS display_name,
         e.employee_code,
         COALESCE(ut.user_type, CASE WHEN u.is_super_admin THEN 'super_admin' ELSE 'employee' END) AS user_type,
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.legal_name AS tenant_legal_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
       LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = COALESCE(t.id, u.tenant_id)
       WHERE u.deleted_at IS NULL
         AND u.is_internal_staff = false
         ${searchClause}
       ORDER BY
         CASE WHEN u.is_active THEN 0 ELSE 1 END,
         COALESCE(NULLIF(u.full_name, ''), NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''), u.email) ASC
       LIMIT $1`,
      params,
    );

    return rows;
  }
}
