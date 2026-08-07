import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { EmailService } from '../../auth/email.service';
import {
  CancelInterviewDto, CompleteInterviewDto, RescheduleInterviewDto,
  ScheduleInterviewDto, SubmitInterviewFeedbackDto,
} from '../dto/interview.dto';

const SELECT_WITH_JOINS = `
  SELECT i.*, c.first_name, c.last_name, c.email AS candidate_email,
    v.title AS vacancy_title, cb.email AS created_by_email
  FROM interviews i
  JOIN candidates c ON i.candidate_id = c.id
  LEFT JOIN vacancies v ON i.vacancy_id = v.id
  LEFT JOIN users cb ON i.created_by = cb.id
`;

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private db: DatabaseService,
    private notifications: NotificationEmitterService,
    private email: EmailService,
  ) {}

  async list(tenantId: string, filters: { q?: string; applicationId?: string; candidateId?: string; status?: string; page?: number; limit?: number }) {
    const { q, applicationId, candidateId, status, page = 1, limit = 20 } = filters;
    let where = 'WHERE i.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (applicationId) { where += ` AND i.application_id = $${idx++}`; params.push(applicationId); }
    if (candidateId) { where += ` AND i.candidate_id = $${idx++}`; params.push(candidateId); }
    if (status) { where += ` AND i.status = $${idx++}`; params.push(status); }
    if (q) { where += ` AND (c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR v.title ILIKE $${idx})`; params.push(`%${q}%`); idx++; }

    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM interviews i
       JOIN candidates c ON i.candidate_id = c.id
       LEFT JOIN vacancies v ON i.vacancy_id = v.id
       ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `${SELECT_WITH_JOINS} ${where} ORDER BY i.scheduled_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(`${SELECT_WITH_JOINS} WHERE i.id = $1 AND i.tenant_id = $2`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Interview not found');
    return rows[0];
  }

  async schedule(tenantId: string, scheduledById: string, dto: ScheduleInterviewDto) {
    const { rows: appRows } = await this.db.query(
      'SELECT * FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [dto.application_id, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');
    const application = appRows[0];

    const panelMemberIds = dto.panel_member_ids ?? (dto.interviewer_id ? [dto.interviewer_id] : []);

    const { rows } = await this.db.query(
      `INSERT INTO interviews (
         tenant_id, candidate_id, job_posting_id, application_id, vacancy_id, interviewer_id,
         interview_type, round_type, round_number, scheduled_at, duration_minutes, location, meeting_link,
         panel_member_ids, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        tenantId, application.candidate_id, application.job_posting_id, application.id, application.vacancy_id,
        dto.interviewer_id ?? panelMemberIds[0] ?? null, dto.interview_type ?? 'video', dto.round_type ?? 'technical',
        dto.round_number ?? 1, dto.scheduled_at, dto.duration_minutes ?? 60, dto.location ?? null, dto.meeting_link ?? null,
        panelMemberIds, scheduledById,
      ],
    );

    await this.notifyPanel(tenantId, rows[0], panelMemberIds, scheduledById, 'Interview scheduled');
    return this.findOne(rows[0].id, tenantId);
  }

  async reschedule(id: string, tenantId: string, actorId: string, dto: RescheduleInterviewDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!['scheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot reschedule an interview with status '${existing.status}'`);
    }

    await this.db.query(
      `UPDATE interviews SET status = 'rescheduled', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    const { rows } = await this.db.query(
      `INSERT INTO interviews (
         tenant_id, candidate_id, job_posting_id, application_id, vacancy_id, interviewer_id,
         interview_type, round_type, round_number, scheduled_at, duration_minutes, location, meeting_link,
         panel_member_ids, rescheduled_from_id, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        tenantId, existing.candidate_id, existing.job_posting_id, existing.application_id, existing.vacancy_id,
        existing.interviewer_id, existing.interview_type, existing.round_type, existing.round_number,
        dto.scheduled_at, existing.duration_minutes, existing.location, existing.meeting_link,
        existing.panel_member_ids, existing.id, actorId,
      ],
    );

    await this.notifyPanel(tenantId, rows[0], existing.panel_member_ids ?? [], actorId, 'Interview rescheduled');
    return this.findOne(rows[0].id, tenantId);
  }

  async cancel(id: string, tenantId: string, actorId: string, dto: CancelInterviewDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!['scheduled', 'rescheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot cancel an interview with status '${existing.status}'`);
    }
    const { rows } = await this.db.query(
      `UPDATE interviews SET status = 'cancelled', cancelled_at = now(), cancelled_by = $3, cancellation_reason = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, actorId, dto.reason ?? null],
    );
    await this.notifyPanel(tenantId, rows[0], existing.panel_member_ids ?? [], actorId, 'Interview cancelled');
    return this.findOne(id, tenantId);
  }

  /** A panelist submits their own scorecard entry — entries are keyed by panelist_id, resubmission overwrites. */
  async submitFeedback(id: string, tenantId: string, panelistId: string, dto: SubmitInterviewFeedbackDto) {
    const existing = await this.getRaw(id, tenantId);
    const scorecard: any[] = Array.isArray(existing.scorecard) ? existing.scorecard : [];
    const entry = { panelist_id: panelistId, rating: dto.rating, recommendation: dto.recommendation ?? null, comments: dto.comments ?? null, submitted_at: new Date().toISOString() };
    const next = [...scorecard.filter((e) => e.panelist_id !== panelistId), entry];

    const { rows } = await this.db.query(
      `UPDATE interviews SET scorecard = $3::jsonb, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, JSON.stringify(next)],
    );
    return rows[0];
  }

  async complete(id: string, tenantId: string, actorId: string, dto: CompleteInterviewDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!['scheduled', 'rescheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot complete an interview with status '${existing.status}'`);
    }
    const { rows } = await this.db.query(
      `UPDATE interviews SET status = 'completed', feedback = COALESCE($3, feedback), rating = COALESCE($4, rating),
         recommendation = COALESCE($5, recommendation), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.feedback ?? null, dto.rating ?? null, dto.recommendation ?? null],
    );
    return this.findOne(id, tenantId);
  }

  async markNoShow(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!['scheduled', 'rescheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot mark an interview with status '${existing.status}' as no-show`);
    }
    const { rows } = await this.db.query(
      `UPDATE interviews SET status = 'no_show', updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    return rows[0];
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM interviews WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Interview not found');
    return rows[0];
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!['scheduled', 'cancelled', 'rescheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot delete an interview with status '${existing.status}'`);
    }
    await this.db.query('DELETE FROM interviews WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /** panel_member_ids stores users.id directly (interviewer_id has always been a users FK, unlike vacancies' employee-based fields) — no employee→user resolution needed. */
  private async notifyPanel(tenantId: string, interview: any, panelMemberIds: string[], actorId: string, title: string) {
    const userIds = panelMemberIds.filter((id) => !!id && id !== actorId);
    if (!userIds.length) return;
    await this.notifications.emit(tenantId, {
      userIds, title, message: `${title} for ${interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : 'a candidate'}.`,
      type: 'info', sourceModule: 'recruitment', entityType: 'interview', entityId: interview.id,
      actionUrl: `/dashboard/hr/recruitment/interviews`,
    });
  }

  /** Daily sweep: email candidates whose interview is within the next 24h and hasn't been reminded yet. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendUpcomingInterviewReminders(): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT i.*, c.email AS candidate_email, c.first_name, c.last_name, jp.title AS job_title
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       LEFT JOIN job_postings jp ON jp.id = i.job_posting_id
       WHERE i.status = 'scheduled' AND i.reminder_sent_at IS NULL
         AND i.scheduled_at BETWEEN now() AND now() + interval '24 hours'`,
    );

    for (const interview of rows) {
      const subject = `Reminder: your interview for ${interview.job_title || 'the role'} is coming up`;
      const body = `Hi ${interview.first_name},\n\nThis is a reminder that your interview is scheduled on ${new Date(interview.scheduled_at).toLocaleString()}.\n\nLooking forward to speaking with you.`;
      try {
        await this.email.sendGenericEmail(interview.candidate_email, subject, body);
        await this.db.query(
          `INSERT INTO candidate_communications (tenant_id, candidate_id, application_id, channel, subject, body, status, sent_at)
           VALUES ($1,$2,$3,'email',$4,$5,'sent',now())`,
          [interview.tenant_id, interview.candidate_id, interview.application_id, subject, body],
        );
      } catch (err) {
        this.logger.error(`Failed to send interview reminder for interview ${interview.id}`, err as Error);
      } finally {
        await this.db.query('UPDATE interviews SET reminder_sent_at = now() WHERE id = $1', [interview.id]);
      }
    }
  }
}
