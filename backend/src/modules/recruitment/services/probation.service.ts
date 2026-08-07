import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AddGoalDto, AddReviewEntryDto, CreateProbationReviewDto, SetRecommendationDto } from '../dto/probation.dto';

const EDITABLE_STATUSES = ['draft', 'rejected'];

@Injectable()
export class ProbationService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, filters: { employeeId?: string; status?: string; page?: number; limit?: number }) {
    const { employeeId, status, page = 1, limit = 20 } = filters;
    let where = 'WHERE pr.tenant_id = $1 AND pr.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (employeeId) { where += ` AND pr.employee_id = $${idx++}`; params.push(employeeId); }
    if (status) { where += ` AND pr.status = $${idx++}`; params.push(status); }

    const countResult = await this.db.query(`SELECT COUNT(*) FROM probation_reviews pr ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `SELECT pr.*, e.first_name, e.last_name, e.employee_code, u.email AS reviewer_email
       FROM probation_reviews pr
       JOIN employees e ON e.id = pr.employee_id
       LEFT JOIN users u ON u.id = pr.reviewer_id
       ${where} ORDER BY pr.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT pr.*, e.first_name, e.last_name, e.employee_code, e.probation_end_date AS employee_probation_end_date, u.email AS reviewer_email
       FROM probation_reviews pr
       JOIN employees e ON e.id = pr.employee_id
       LEFT JOIN users u ON u.id = pr.reviewer_id
       WHERE pr.id = $1 AND pr.tenant_id = $2 AND pr.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Probation review not found');
    return rows[0];
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM probation_reviews WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Probation review not found');
    return rows[0];
  }

  async findByEmployee(employeeId: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM probation_reviews WHERE employee_id = $1 AND tenant_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
      [employeeId, tenantId],
    );
    return rows;
  }

  async create(tenantId: string, createdById: string, dto: CreateProbationReviewDto) {
    const { rows: empRows } = await this.db.query(
      'SELECT id, probation_end_date FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [dto.employee_id, tenantId],
    );
    if (!empRows.length) throw new NotFoundException('Employee not found');

    const { rows } = await this.db.query(
      `INSERT INTO probation_reviews (tenant_id, employee_id, application_id, goals, probation_end_date, reviewer_id, created_by, last_updated_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$7) RETURNING *`,
      [
        tenantId, dto.employee_id, dto.application_id ?? null, JSON.stringify(dto.goals ?? []),
        dto.probation_end_date ?? empRows[0].probation_end_date ?? null, dto.reviewer_id ?? null, createdById,
      ],
    );
    return rows[0];
  }

  async addGoal(id: string, tenantId: string, dto: AddGoalDto, actorId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) throw new BadRequestException(`Cannot edit a probation review with status '${existing.status}'`);
    const goals = [...(existing.goals ?? []), { description: dto.description, target_date: dto.target_date ?? null }];
    const { rows } = await this.db.query(
      'UPDATE probation_reviews SET goals = $3::jsonb, last_updated_by = $4, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, JSON.stringify(goals), actorId],
    );
    return rows[0];
  }

  async addReviewEntry(id: string, tenantId: string, dto: AddReviewEntryDto, actorId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) throw new BadRequestException(`Cannot edit a probation review with status '${existing.status}'`);
    const entries = [...(existing.review_entries ?? []), {
      date: new Date().toISOString(), reviewer_id: actorId, type: dto.type, feedback: dto.feedback, rating: dto.rating ?? null,
    }];
    const { rows } = await this.db.query(
      'UPDATE probation_reviews SET review_entries = $3::jsonb, last_updated_by = $4, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, JSON.stringify(entries), actorId],
    );
    return rows[0];
  }

  async setRecommendation(id: string, tenantId: string, dto: SetRecommendationDto, actorId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) throw new BadRequestException(`Cannot edit a probation review with status '${existing.status}'`);
    const { rows } = await this.db.query(
      `UPDATE probation_reviews SET recommendation = $3, recommendation_notes = $4, extended_probation_end_date = $5, last_updated_by = $6, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.recommendation, dto.recommendation_notes ?? null, dto.extended_probation_end_date ?? null, actorId],
    );
    return rows[0];
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft probation reviews can be deleted');
    await this.db.query('UPDATE probation_reviews SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /** Simple generated-text confirmation letter — same plain-text pattern as offers.offer_letter_content. */
  async generateConfirmationLetter(id: string, tenantId: string) {
    const review = await this.findOne(id, tenantId);
    const confirmationDate = review.confirmation_date || new Date().toISOString().slice(0, 10);
    const content = `Dear ${review.first_name} ${review.last_name},\n\nWe are pleased to confirm your employment with effect from ${confirmationDate}, following the successful completion of your probation period.\n\nCongratulations and welcome aboard as a confirmed member of our team.`;
    const { rows } = await this.db.query(
      'UPDATE probation_reviews SET confirmation_letter_content = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, content],
    );
    return rows[0];
  }
}
