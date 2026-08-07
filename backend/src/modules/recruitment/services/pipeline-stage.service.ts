import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreatePipelineStageDto, UpdatePipelineStageDto } from '../dto/pipeline.dto';

/** Tenant-configurable pipeline stages — org admins/recruiters self-serve these, same precedent as POSITION_PRESETS. */
@Injectable()
export class PipelineStageService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, includeInactive = false) {
    const where = includeInactive ? 'WHERE tenant_id = $1' : 'WHERE tenant_id = $1 AND is_active = true';
    const { rows } = await this.db.query(`SELECT * FROM pipeline_stages ${where} ORDER BY stage_order ASC`, [tenantId]);
    return rows;
  }

  async create(tenantId: string, createdById: string, dto: CreatePipelineStageDto) {
    const { rows } = await this.db.query(
      `INSERT INTO pipeline_stages (tenant_id, name, stage_category, stage_order, color, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, dto.name, dto.stage_category ?? 'custom', dto.stage_order, dto.color ?? null, createdById],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, dto: UpdatePipelineStageDto) {
    const { rows } = await this.db.query(
      `UPDATE pipeline_stages SET
         name = COALESCE($3, name), stage_category = COALESCE($4, stage_category),
         stage_order = COALESCE($5, stage_order), color = COALESCE($6, color),
         is_active = COALESCE($7, is_active), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.name ?? null, dto.stage_category ?? null, dto.stage_order ?? null, dto.color ?? null, dto.is_active ?? null],
    );
    if (!rows.length) throw new NotFoundException('Pipeline stage not found');
    return rows[0];
  }

  /** Soft-disable rather than hard delete — stages may already be referenced by applications/history. */
  async deactivate(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE pipeline_stages SET is_active = false, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Pipeline stage not found');
    return rows[0];
  }
}
