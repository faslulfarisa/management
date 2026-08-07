import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class AssetTypeService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM asset_types WHERE tenant_id = $1 AND is_active = true ORDER BY name',
      [tenantId],
    );
    return rows;
  }

  async create(tenantId: string, data: { name: string; category?: string; depreciation_applicable?: boolean }) {
    const { rows } = await this.db.query(
      `INSERT INTO asset_types (tenant_id, name, category, depreciation_applicable)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, data.name, data.category ?? 'it_equipment', data.depreciation_applicable ?? false],
    );
    return rows[0];
  }

  async update(tenantId: string, id: string, data: { name?: string; category?: string; is_active?: boolean }) {
    const { rows } = await this.db.query(
      `UPDATE asset_types SET name = COALESCE($1, name), category = COALESCE($2, category),
       is_active = COALESCE($3, is_active) WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [data.name ?? null, data.category ?? null, data.is_active ?? null, id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Asset type not found');
    return rows[0];
  }
}
