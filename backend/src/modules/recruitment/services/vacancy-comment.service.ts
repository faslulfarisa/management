import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { VacancyService } from './vacancy.service';

@Injectable()
export class VacancyCommentService {
  constructor(
    private db: DatabaseService,
    private notifications: NotificationEmitterService,
    private vacancies: VacancyService,
  ) {}

  async list(vacancyId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT c.*, u.email AS author_email
       FROM vacancy_comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.vacancy_id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
      [vacancyId, tenantId],
    );
    return rows;
  }

  async add(vacancyId: string, tenantId: string, authorId: string, comment: string) {
    const vacancy = await this.vacancies.getRaw(vacancyId, tenantId);
    const { rows } = await this.db.query(
      `INSERT INTO vacancy_comments (tenant_id, vacancy_id, author_id, comment) VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, vacancyId, authorId, comment],
    );

    const stakeholderUserIds = (await Promise.all(
      [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.vacancies.resolveUserIdForEmployee(tenantId, empId)),
    )).filter((id): id is string => !!id && id !== authorId);
    if (stakeholderUserIds.length) {
      await this.notifications.emit(tenantId, {
        userIds: stakeholderUserIds,
        title: 'New comment on vacancy',
        message: `A new comment was added to "${vacancy.title}".`,
        type: 'info',
        sourceModule: 'recruitment',
        entityType: 'vacancy',
        entityId: vacancyId,
        actionUrl: `/dashboard/hr/recruitment/vacancies/${vacancyId}`,
      });
    }

    return rows[0];
  }

  async softDelete(commentId: string, tenantId: string, actorId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM vacancy_comments WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [commentId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Comment not found');
    if (rows[0].author_id !== actorId) {
      throw new ForbiddenException('Only the comment author can delete this comment');
    }
    await this.db.query('UPDATE vacancy_comments SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [commentId, tenantId]);
    return { success: true };
  }
}
