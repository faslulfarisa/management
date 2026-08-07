import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CreateAssessmentDto, UpdateAssessmentDto } from '../dto/pipeline.dto';

@Injectable()
export class AssessmentService {
  constructor(private db: DatabaseService, private notifications: NotificationEmitterService) {}

  async list(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT a.*, ab.email AS assigned_by_email, ev.email AS evaluator_email
       FROM candidate_assessments a
       LEFT JOIN users ab ON ab.id = a.assigned_by
       LEFT JOIN users ev ON ev.id = a.evaluator_id
       WHERE a.application_id = $1 AND a.tenant_id = $2
       ORDER BY a.assigned_at DESC`,
      [applicationId, tenantId],
    );
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM candidate_assessments WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Assessment not found');
    return rows[0];
  }

  async create(applicationId: string, tenantId: string, assignedById: string, dto: CreateAssessmentDto) {
    const { rows: appRows } = await this.db.query(
      'SELECT a.*, c.first_name, c.last_name FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL',
      [applicationId, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');

    const { rows } = await this.db.query(
      `INSERT INTO candidate_assessments (
         tenant_id, application_id, assessment_type, title, instructions, assigned_by, due_at, max_score
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, applicationId, dto.assessment_type ?? 'technical', dto.title, dto.instructions ?? null, assignedById, dto.due_at ?? null, dto.max_score ?? 100],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, evaluatorId: string, dto: UpdateAssessmentDto) {
    const existing = await this.findOne(id, tenantId);
    const isEvaluating = dto.score !== undefined || dto.result !== undefined || dto.status === 'evaluated';

    const { rows } = await this.db.query(
      `UPDATE candidate_assessments SET
         status = COALESCE($3, status), score = COALESCE($4, score), result = COALESCE($5, result),
         evaluation_notes = COALESCE($6, evaluation_notes),
         evaluator_id = CASE WHEN $7 THEN $8 ELSE evaluator_id END,
         evaluated_at = CASE WHEN $7 THEN now() ELSE evaluated_at END,
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.status ?? null, dto.score ?? null, dto.result ?? null, dto.evaluation_notes ?? null, isEvaluating, evaluatorId],
    );

    if (isEvaluating && existing.assigned_by && existing.assigned_by !== evaluatorId) {
      await this.notifications.emit(tenantId, {
        userIds: [existing.assigned_by],
        title: 'Assessment evaluated',
        message: `"${existing.title}" has been evaluated (${dto.result ?? rows[0].result ?? 'pending'}).`,
        type: 'info', sourceModule: 'recruitment', entityType: 'candidate_assessment', entityId: id,
        actionUrl: `/dashboard/hr/recruitment/pipeline/${existing.application_id}`,
      });
    }
    return rows[0];
  }
}
