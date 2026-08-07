import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class AssetItemService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, filters: { status?: string; branch_id?: string; asset_type_id?: string; search?: string }) {
    const params: any[] = [tenantId];
    let where = 'ai.tenant_id = $1';
    let idx = 2;
    if (filters.status) { where += ` AND ai.status = $${idx++}`; params.push(filters.status); }
    if (filters.branch_id) { where += ` AND ai.branch_id = $${idx++}`; params.push(filters.branch_id); }
    if (filters.asset_type_id) { where += ` AND ai.asset_type_id = $${idx++}`; params.push(filters.asset_type_id); }
    if (filters.search) { where += ` AND (ai.name ILIKE $${idx} OR ai.asset_code ILIKE $${idx} OR ai.serial_number ILIKE $${idx})`; params.push(`%${filters.search}%`); idx++; }

    const { rows } = await this.db.query(
      `SELECT ai.*, at.name AS asset_type_name, at.category
       FROM asset_items ai JOIN asset_types at ON ai.asset_type_id = at.id
       WHERE ${where} ORDER BY ai.created_at DESC`,
      params,
    );
    return rows;
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO asset_items (tenant_id, branch_id, asset_type_id, asset_code, name, serial_number, purchase_date, purchase_value, current_value, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'available') RETURNING *`,
      [tenantId, data.branch_id ?? null, data.asset_type_id, data.asset_code, data.name, data.serial_number ?? null,
        data.purchase_date ?? null, data.purchase_value ?? null, data.current_value ?? data.purchase_value ?? null],
    );
    return rows[0];
  }

  async findOne(tenantId: string, id: string) {
    const { rows } = await this.db.query('SELECT * FROM asset_items WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Asset not found');
    return rows[0];
  }

  async setStatus(tenantId: string, id: string, status: string) {
    const { rows } = await this.db.query(
      'UPDATE asset_items SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [status, id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Asset not found');
    return rows[0];
  }

  async assertAvailable(tenantId: string, id: string) {
    const asset = await this.findOne(tenantId, id);
    if (asset.status !== 'available') {
      throw new BadRequestException(`Asset is not available for assignment (current status: ${asset.status})`);
    }
    return asset;
  }
}
