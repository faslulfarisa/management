import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/compliance-category.dto';

/** Admin-manageable document taxonomy. tenant_id IS NULL rows are system defaults shared by every tenant. */
@Injectable()
export class ComplianceCategoryService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, scope?: string) {
    let query = `SELECT * FROM compliance_categories
      WHERE (tenant_id IS NULL OR tenant_id = $1) AND is_active = true`;
    const params: any[] = [tenantId];
    if (scope) { query += ' AND scope = $2'; params.push(scope); }
    query += ' ORDER BY scope, sort_order, name';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM compliance_categories WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Category not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, dto: CreateCategoryDto) {
    const code = dto.code.trim().toLowerCase().replace(/\s+/g, '_');
    const { rows: existing } = await this.db.query(
      `SELECT 1 FROM compliance_categories WHERE tenant_id = $1 AND scope = $2 AND code = $3`,
      [tenantId, dto.scope, code],
    );
    if (existing.length) throw new BadRequestException('A category with this code already exists');

    const { rows } = await this.db.query(
      `INSERT INTO compliance_categories
        (tenant_id, scope, group_label, name, code, is_system, extra_field_schema, created_by)
       VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, $7) RETURNING *`,
      [tenantId, dto.scope, dto.group_label, dto.name, code, JSON.stringify(dto.extra_field_schema ?? []), createdById],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(id, tenantId);
    if (category.is_system) throw new BadRequestException('System categories cannot be modified');

    const { rows } = await this.db.query(
      `UPDATE compliance_categories SET
        group_label = COALESCE($3, group_label),
        name = COALESCE($4, name),
        is_active = COALESCE($5, is_active),
        extra_field_schema = COALESCE($6::jsonb, extra_field_schema),
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.group_label ?? null, dto.name ?? null, dto.is_active ?? null,
        dto.extra_field_schema ? JSON.stringify(dto.extra_field_schema) : null],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    const category = await this.findOne(id, tenantId);
    if (category.is_system) throw new BadRequestException('System categories cannot be deleted');
    const { rows: inUse } = await this.db.query(
      `SELECT 1 FROM compliance_documents WHERE category_id = $1 LIMIT 1`, [id],
    );
    if (inUse.length) throw new BadRequestException('Category is in use by existing documents and cannot be deleted');
    await this.db.query(`DELETE FROM compliance_categories WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return { success: true };
  }
}
