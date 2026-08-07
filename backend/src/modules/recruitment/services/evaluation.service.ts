import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreateEvaluationDto } from '../dto/pipeline.dto';

@Injectable()
export class EvaluationService {
  constructor(private db: DatabaseService) {}

  async list(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT e.*, u.email AS reviewer_email, u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name
       FROM candidate_evaluations e
       LEFT JOIN users u ON u.id = e.reviewer_id
       WHERE e.application_id = $1 AND e.tenant_id = $2
       ORDER BY e.created_at DESC`,
      [applicationId, tenantId],
    );
    return rows;
  }

  async create(applicationId: string, tenantId: string, reviewerId: string, dto: CreateEvaluationDto) {
    const { rows: appRows } = await this.db.query('SELECT id FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [applicationId, tenantId]);
    if (!appRows.length) throw new NotFoundException('Application not found');

    const { rows } = await this.db.query(
      `INSERT INTO candidate_evaluations (
         tenant_id, application_id, interview_id, evaluation_type, reviewer_id,
         ratings, overall_rating, strengths, concerns, recommendation
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
      [
        tenantId, applicationId, dto.interview_id ?? null, dto.evaluation_type ?? 'technical', reviewerId,
        JSON.stringify(dto.ratings ?? []), dto.overall_rating ?? null, dto.strengths ?? null, dto.concerns ?? null,
        dto.recommendation ?? 'neutral',
      ],
    );
    return rows[0];
  }
}
