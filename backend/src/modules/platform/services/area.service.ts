import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { assertUniqueCode, translateUniqueViolation } from '../../../shared/unique-code.validator';

@Injectable()
export class AreaService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, filters: { branch_id?: string } = {}) {
    const { branch_id } = filters;
    const params: any[] = [tenantId];
    let branchCondition = '';
    if (branch_id) {
      params.push(branch_id);
      branchCondition = `AND a.branch_id = $${params.length}`;
    }

    const { rows } = await this.db.query(
      `SELECT
         a.*,
         parent.name AS parent_name,
         b.name      AS branch_name,
         d.name      AS department_name,
         COUNT(DISTINCT bd.id)  FILTER (WHERE bd.is_active = true)                            AS device_count,
         COUNT(DISTINCT e.id)   FILTER (WHERE e.status = 'active'   AND e.deleted_at IS NULL) AS employee_count,
         COUNT(DISTINCT e.id)   FILTER (WHERE e.status = 'resigned' AND e.deleted_at IS NULL) AS resigned_count,
         COALESCE(SUM((bd.metadata->>'fp_capacity')::INT)     FILTER (WHERE bd.is_active = true), 0) AS fp_count,
         COALESCE(SUM((bd.metadata->>'face_capacity')::INT)   FILTER (WHERE bd.is_active = true), 0) AS face_count,
         COALESCE(SUM((bd.metadata->>'vlface_capacity')::INT) FILTER (WHERE bd.is_active = true), 0) AS vlface_count
       FROM areas a
       LEFT JOIN areas parent        ON a.parent_id      = parent.id
       LEFT JOIN branches b          ON a.branch_id      = b.id
       LEFT JOIN departments d       ON a.department_id  = d.id
       LEFT JOIN biometric_devices bd ON bd.area_id      = a.id AND bd.tenant_id = $1
       LEFT JOIN employees e          ON e.area_id       = a.id AND e.tenant_id  = $1
       WHERE a.tenant_id = $1 AND a.deleted_at IS NULL ${branchCondition}
       GROUP BY a.id, parent.name, b.name, d.name
       ORDER BY a.name ASC`,
      params,
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM areas WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Area not found');
    return rows[0];
  }

  async create(tenantId: string, data: any) {
    if (data.code) {
      await assertUniqueCode(this.db, 'areas', tenantId, 'code', data.code, { label: 'Area code' });
    }
    try {
      const { rows } = await this.db.query(
        `INSERT INTO areas (tenant_id, parent_id, branch_id, department_id, name, code)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          tenantId,
          data.parent_id    || null,
          data.branch_id    || null,
          data.department_id || null,
          data.name,
          data.code         || null,
        ],
      );
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Area code');
      throw e;
    }
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    if (data.code) {
      await assertUniqueCode(this.db, 'areas', tenantId, 'code', data.code, { excludeId: id, label: 'Area code' });
    }
    try {
      const { rows } = await this.db.query(
        `UPDATE areas
         SET name          = COALESCE($3, name),
             code          = COALESCE($4, code),
             parent_id     = $5,
             branch_id     = $6,
             department_id = $7,
             updated_at    = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [
          id,
          tenantId,
          data.name,
          data.code,
          data.parent_id     || null,
          data.branch_id     || null,
          data.department_id || null,
        ],
      );
      return rows[0];
    } catch (e: any) {
      translateUniqueViolation(e, 'Area code');
      throw e;
    }
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE areas SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId],
    );
    return rows[0];
  }
}
