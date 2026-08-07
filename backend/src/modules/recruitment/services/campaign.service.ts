import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';

const VALID_STATUSES = ['planned', 'active', 'paused', 'completed', 'cancelled'];

@Injectable()
export class CampaignService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, filters: { q?: string; status?: string; campaign_type?: string; page?: number; limit?: number }) {
    const { q, status, campaign_type, page = 1, limit = 20 } = filters;
    let where = 'WHERE c.tenant_id = $1 AND c.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { where += ` AND c.status = $${idx++}`; params.push(status); }
    if (campaign_type) { where += ` AND c.campaign_type = $${idx++}`; params.push(campaign_type); }
    if (q) { where += ` AND c.name ILIKE $${idx++}`; params.push(`%${q}%`); }

    const countResult = await this.db.query(`SELECT COUNT(*) FROM recruitment_campaigns c ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM applications a WHERE a.campaign_id = c.id AND a.deleted_at IS NULL) AS application_count,
         (SELECT COUNT(*) FROM applications a WHERE a.campaign_id = c.id AND a.status = 'hired' AND a.deleted_at IS NULL) AS hired_count
       FROM recruitment_campaigns c
       ${where} ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM recruitment_campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Campaign not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, dto: CreateCampaignDto) {
    const { rows } = await this.db.query(
      `INSERT INTO recruitment_campaigns (
        tenant_id, name, campaign_type, vacancy_ids, start_date, end_date, budget_amount, actual_spend, description, created_by, last_updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
      [
        tenantId, dto.name, dto.campaign_type ?? 'other', dto.vacancy_ids ?? [], dto.start_date ?? null, dto.end_date ?? null,
        dto.budget_amount ?? null, dto.actual_spend ?? 0, dto.description ?? null, createdById,
      ],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateCampaignDto) {
    await this.findOne(id, tenantId);
    if (dto.status && !VALID_STATUSES.includes(dto.status)) throw new BadRequestException(`Invalid status '${dto.status}'`);
    const { rows } = await this.db.query(
      `UPDATE recruitment_campaigns SET
        name = COALESCE($3, name), campaign_type = COALESCE($4, campaign_type),
        vacancy_ids = COALESCE($5, vacancy_ids), start_date = COALESCE($6, start_date), end_date = COALESCE($7, end_date),
        budget_amount = COALESCE($8, budget_amount), actual_spend = COALESCE($9, actual_spend),
        status = COALESCE($10, status), description = COALESCE($11, description),
        last_updated_by = $12, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        id, tenantId, dto.name, dto.campaign_type, dto.vacancy_ids, dto.start_date, dto.end_date,
        dto.budget_amount, dto.actual_spend, dto.status, dto.description, updatedById,
      ],
    );
    return rows[0];
  }

  async softDelete(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.db.query('UPDATE recruitment_campaigns SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /** Conversion/cost-effectiveness snapshot for a single campaign's detail page. */
  async getStats(id: string, tenantId: string) {
    const campaign = await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) AS total_applications,
         COUNT(*) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
         COUNT(*) FILTER (WHERE a.status = 'rejected') AS rejected,
         COUNT(*) FILTER (WHERE a.status = 'hired') AS hired
       FROM applications a
       WHERE a.campaign_id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [id, tenantId],
    );
    const stats = rows[0];
    const hired = parseInt(stats.hired, 10) || 0;
    const spend = Number(campaign.actual_spend) || 0;
    return {
      ...stats,
      total_applications: parseInt(stats.total_applications, 10) || 0,
      conversion_rate: stats.total_applications > 0 ? Math.round((hired / parseInt(stats.total_applications, 10)) * 1000) / 10 : 0,
      cost_per_hire: hired > 0 ? Math.round((spend / hired) * 100) / 100 : null,
    };
  }
}
