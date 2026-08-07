import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class PropertyService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Property not found');
    return rows[0];
  }

  async create(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO properties (tenant_id, name, code, property_type, address, gstin, timezone, geo_lat, geo_lng, geofence_radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [tenantId, data.name, data.code, data.property_type, data.address, data.gstin, data.timezone || 'Asia/Kolkata', data.geo_lat, data.geo_lng, data.geofence_radius_meters || 200],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      `UPDATE properties SET name = COALESCE($3, name), code = COALESCE($4, code),
       property_type = COALESCE($5, property_type), address = COALESCE($6, address),
       gstin = COALESCE($7, gstin), timezone = COALESCE($8, timezone),
       geo_lat = COALESCE($9, geo_lat), geo_lng = COALESCE($10, geo_lng),
       geofence_radius_meters = COALESCE($11, geofence_radius_meters),
       is_active = COALESCE($12, is_active), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.name, data.code, data.property_type, data.address, data.gstin, data.timezone, data.geo_lat, data.geo_lng, data.geofence_radius_meters, data.is_active],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE properties SET deleted_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId],
    );
    return rows[0];
  }
}
