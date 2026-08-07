import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { SaveReportDto } from '../dto/save-report.dto';

@Injectable()
export class SavedReportsService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, userId: string) {
    const { rows } = await this.db.query(`
      SELECT id, name, category, report_key, filters, is_shared, created_at, updated_at
      FROM saved_reports
      WHERE tenant_id = $1
        AND (user_id = $2 OR is_shared = TRUE)
      ORDER BY updated_at DESC
    `, [tenantId, userId]);

    return rows;
  }

  async save(tenantId: string, userId: string, dto: SaveReportDto) {
    const { rows } = await this.db.query(`
      INSERT INTO saved_reports (tenant_id, user_id, name, category, report_key, filters, is_shared)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, category, report_key, filters, is_shared, created_at
    `, [tenantId, userId, dto.name, dto.category, dto.report_key, JSON.stringify(dto.filters), dto.is_shared ?? false]);

    return rows[0];
  }

  async update(tenantId: string, userId: string, id: string, dto: Partial<SaveReportDto>) {
    const fields: string[] = [];
    const params: any[] = [tenantId, userId, id];
    let idx = 4;

    if (dto.name !== undefined)      { fields.push(`name = $${idx++}`);      params.push(dto.name); }
    if (dto.filters !== undefined)   { fields.push(`filters = $${idx++}`);   params.push(JSON.stringify(dto.filters)); }
    if (dto.is_shared !== undefined) { fields.push(`is_shared = $${idx++}`); params.push(dto.is_shared); }
    if (fields.length === 0)         return this.getById(tenantId, userId, id);

    fields.push(`updated_at = NOW()`);

    const { rows } = await this.db.query(`
      UPDATE saved_reports
      SET ${fields.join(', ')}
      WHERE tenant_id = $1 AND user_id = $2 AND id = $3
      RETURNING id, name, category, report_key, filters, is_shared, updated_at
    `, params);

    if (!rows[0]) throw new NotFoundException('Saved report not found');
    return rows[0];
  }

  async delete(tenantId: string, userId: string, id: string) {
    const { rowCount } = await this.db.query(`
      DELETE FROM saved_reports
      WHERE tenant_id = $1 AND user_id = $2 AND id = $3
    `, [tenantId, userId, id]);

    if (!rowCount) throw new NotFoundException('Saved report not found');
    return { deleted: true };
  }

  private async getById(tenantId: string, userId: string, id: string) {
    const { rows } = await this.db.query(`
      SELECT id, name, category, report_key, filters, is_shared, created_at, updated_at
      FROM saved_reports
      WHERE tenant_id = $1 AND user_id = $2 AND id = $3
    `, [tenantId, userId, id]);
    return rows[0];
  }
}
