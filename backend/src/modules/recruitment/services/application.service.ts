import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { AuditLogService } from '../../platform/services/audit-log.service';

const VALID_STATUSES = ['applied', 'under_review', 'shortlisted', 'rejected', 'withdrawn', 'hired'];

export interface MoveStageResult {
  application: any;
  history: any;
}

@Injectable()
export class ApplicationService {
  constructor(
    private db: DatabaseService,
    private notifications: NotificationEmitterService,
    private auditLog?: AuditLogService,
  ) {}

  async list(tenantId: string, filters: { q?: string; candidateId?: string; jobPostingId?: string; vacancyId?: string; status?: string; stageId?: string; campaignId?: string; eligibleForOffer?: boolean; page?: number; limit?: number }) {
    const { q, candidateId, jobPostingId, vacancyId, status, stageId, campaignId, eligibleForOffer, page = 1, limit = 20 } = filters;
    let where = 'WHERE a.tenant_id = $1 AND a.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (candidateId) { where += ` AND a.candidate_id = $${idx++}`; params.push(candidateId); }
    if (jobPostingId) { where += ` AND a.job_posting_id = $${idx++}`; params.push(jobPostingId); }
    if (vacancyId) { where += ` AND a.vacancy_id = $${idx++}`; params.push(vacancyId); }
    if (status) { where += ` AND a.status = $${idx++}`; params.push(status); }
    if (stageId) { where += ` AND a.current_stage_id = $${idx++}`; params.push(stageId); }
    if (campaignId) { where += ` AND a.campaign_id = $${idx++}`; params.push(campaignId); }
    if (eligibleForOffer) {
      where += ` AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.application_id = a.id AND o.deleted_at IS NULL AND o.status NOT IN ('draft', 'pending_approval', 'rejected', 'declined', 'withdrawn', 'expired'))`;
    }
    if (q) { where += ` AND EXISTS (SELECT 1 FROM candidates qc WHERE qc.id = a.candidate_id AND qc.tenant_id = a.tenant_id AND (qc.first_name ILIKE $${idx} OR qc.last_name ILIKE $${idx} OR qc.email ILIKE $${idx}))`; params.push(`%${q}%`); idx++; }

    const countResult = await this.db.query(`SELECT COUNT(*) FROM applications a ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `SELECT a.*, c.first_name, c.last_name, c.email AS candidate_email, jp.title AS job_title, v.title AS vacancy_title,
         ps.name AS stage_name, ps.stage_category AS stage_category, ps.color AS stage_color
       FROM applications a
       JOIN candidates c ON a.candidate_id = c.id
       LEFT JOIN job_postings jp ON a.job_posting_id = jp.id
       LEFT JOIN vacancies v ON a.vacancy_id = v.id
       LEFT JOIN pipeline_stages ps ON ps.id = a.current_stage_id
       ${where} ORDER BY a.applied_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT a.*, c.first_name, c.last_name, c.email AS candidate_email, c.phone AS candidate_phone,
         jp.title AS job_title, v.title AS vacancy_title, jp.vacancy_id, ps.name AS stage_name, ps.stage_category AS stage_category
       FROM applications a
       JOIN candidates c ON a.candidate_id = c.id
       LEFT JOIN job_postings jp ON a.job_posting_id = jp.id
       LEFT JOIN vacancies v ON a.vacancy_id = v.id
       LEFT JOIN pipeline_stages ps ON ps.id = a.current_stage_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Application not found');
    return rows[0];
  }

  async create(tenantId: string, data: {
    candidateId: string; jobPostingId: string; source?: string; referredByEmployeeId?: string;
    resumeDocumentId?: string; coverNote?: string; campaignId?: string;
  }) {
    const { rows: jpRows } = await this.db.query('SELECT vacancy_id FROM job_postings WHERE id = $1 AND tenant_id = $2', [data.jobPostingId, tenantId]);
    if (!jpRows.length) throw new NotFoundException('Job posting not found');

    const { rows } = await this.db.query(
      `INSERT INTO applications (tenant_id, candidate_id, job_posting_id, vacancy_id, source, referred_by_employee_id, resume_document_id, cover_note, campaign_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, data.candidateId, data.jobPostingId, jpRows[0].vacancy_id, data.source ?? 'career_portal',
        data.referredByEmployeeId ?? null, data.resumeDocumentId ?? null, data.coverNote ?? null, data.campaignId ?? null],
    );
    return rows[0];
  }

  /** Attribute (or re-attribute) an application to a recruitment campaign — set null to clear. */
  async createForVacancy(tenantId: string, data: {
    candidateId: string; vacancyId: string; source?: string; referredByEmployeeId?: string;
    resumeDocumentId?: string; coverNote?: string; campaignId?: string; actorId?: string | null;
  }) {
    const { rows: vacancyRows } = await this.db.query(
      `SELECT *
       FROM vacancies
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [data.vacancyId, tenantId],
    );
    if (!vacancyRows.length) throw new NotFoundException('Vacancy not found');

    const vacancy = vacancyRows[0];
    if (!['open', 'reopened'].includes(vacancy.status)) {
      throw new BadRequestException(`Cannot apply to a vacancy with status '${vacancy.status}'`);
    }

    const jobPosting = await this.ensureInternalJobPostingForVacancy(tenantId, vacancy, data.actorId ?? null);

    const { rows } = await this.db.query(
      `INSERT INTO applications (tenant_id, candidate_id, job_posting_id, vacancy_id, source, referred_by_employee_id, resume_document_id, cover_note, campaign_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tenantId, data.candidateId, jobPosting.id, vacancy.id, data.source ?? 'manual',
        data.referredByEmployeeId ?? null, data.resumeDocumentId ?? null, data.coverNote ?? null, data.campaignId ?? null,
      ],
    );
    return rows[0];
  }

  async setCampaign(id: string, tenantId: string, campaignId: string | null) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      'UPDATE applications SET campaign_id = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, campaignId],
    );
    return rows[0];
  }

  async updateStatus(id: string, tenantId: string, reviewerId: string | null, status: string, rejectionReason?: string) {
    if (!VALID_STATUSES.includes(status)) throw new BadRequestException(`Invalid status '${status}'`);
    const application = await this.findOne(id, tenantId);

    const { rows } = await this.db.query(
      `UPDATE applications SET status = $3, reviewed_by = $4, reviewed_at = now(), rejection_reason = $5, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, status, reviewerId, status === 'rejected' ? rejectionReason ?? null : null],
    );

    // Notify the recruiter/hiring manager on the linked vacancy, if any.
    if (application.vacancy_id) {
      const { rows: vacancyRows } = await this.db.query(
        'SELECT recruiter_id, hiring_manager_id, title FROM vacancies WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [application.vacancy_id, tenantId],
      );
      const vacancy = vacancyRows[0];
      if (vacancy) {
        const userIds = (await Promise.all(
          [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
        )).filter((uid): uid is string => !!uid && uid !== reviewerId);
        if (userIds.length) {
          await this.notifications.emit(tenantId, {
            userIds,
            title: 'Application status updated',
            message: `${application.first_name} ${application.last_name}'s application for "${vacancy.title}" is now '${status}'.`,
            type: 'info',
            sourceModule: 'recruitment',
            entityType: 'application',
            entityId: id,
            actionUrl: `/dashboard/hr/recruitment/candidates/${application.candidate_id}`,
          });
        }
      }
    }

    return rows[0];
  }

  private async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query('SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1', [tenantId, employeeId]);
    return rows[0]?.id ?? null;
  }

  /** Granular pipeline-stage transition — layered on top of the coarse `status` column above. */
  private async ensureInternalJobPostingForVacancy(tenantId: string, vacancy: any, actorId: string | null) {
    const { rows: existingRows } = await this.db.query(
      `SELECT *
       FROM job_postings
       WHERE tenant_id = $1 AND vacancy_id = $2 AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, vacancy.id],
    );
    if (existingRows.length) return existingRows[0];

    const { rows } = await this.db.query(
      `INSERT INTO job_postings (
         tenant_id, vacancy_id, title, department_id, employment_type_id,
         salary_min, salary_max, openings, status, posted_by, closes_at, visibility
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,'unlisted')
       RETURNING *`,
      [
        tenantId, vacancy.id, vacancy.title, vacancy.department_id, vacancy.employment_type_id,
        vacancy.salary_min, vacancy.salary_max, vacancy.number_of_positions ?? 1, actorId,
        vacancy.target_close_date ?? null,
      ],
    );
    return rows[0];
  }

  async moveStage(applicationId: string, tenantId: string, actorId: string, toStageId: string, comment?: string): Promise<MoveStageResult> {
    const application = await this.findOne(applicationId, tenantId);

    const { rows: stageRows } = await this.db.query(
      'SELECT * FROM pipeline_stages WHERE id = $1 AND tenant_id = $2 AND is_active = true',
      [toStageId, tenantId],
    );
    if (!stageRows.length) throw new NotFoundException('Pipeline stage not found');
    const targetStage = stageRows[0];
    const nextStatus = this.statusForStage(targetStage, application.status);

    const { rows } = await this.db.query(
      'UPDATE applications SET current_stage_id = $3, status = $4, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [applicationId, tenantId, toStageId, nextStatus],
    );

    const { rows: historyRows } = await this.db.query(
      `INSERT INTO candidate_pipeline_history (tenant_id, application_id, from_stage_id, to_stage_id, actor_id, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, applicationId, application.current_stage_id ?? null, toStageId, actorId, comment ?? null],
    );

    await this.auditLog?.log({
      tenantId,
      userId: actorId,
      entityType: 'application',
      entityId: applicationId,
      action: 'pipeline_stage_changed',
      oldValues: {
        stage_id: application.current_stage_id ?? null,
        stage_name: application.stage_name ?? null,
        status: application.status,
      },
      newValues: {
        stage_id: toStageId,
        stage_name: targetStage.name,
        status: nextStatus,
        comment: comment ?? null,
      },
    });

    if (application.vacancy_id) {
      const { rows: vacancyRows } = await this.db.query(
        'SELECT recruiter_id, hiring_manager_id, title FROM vacancies WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [application.vacancy_id, tenantId],
      );
      const vacancy = vacancyRows[0];
      if (vacancy) {
        const userIds = (await Promise.all(
          [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
        )).filter((uid): uid is string => !!uid && uid !== actorId);
        if (userIds.length) {
          await this.notifications.emit(tenantId, {
            userIds,
            title: 'Candidate moved to a new stage',
            message: `${application.first_name} ${application.last_name} moved to "${stageRows[0].name}" for "${vacancy.title}".`,
            type: 'info', sourceModule: 'recruitment', entityType: 'application', entityId: applicationId,
            actionUrl: `/dashboard/hr/recruitment/pipeline/${applicationId}`,
          });
        }
      }
    }

    return { application: rows[0], history: historyRows[0] };
  }

  private statusForStage(stage: any, currentStatus: string): string {
    const normalized = `${stage.name ?? ''} ${stage.stage_category ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    if (normalized.includes('reject')) return 'rejected';
    if (normalized.includes('joined') || normalized.includes('hired')) return 'hired';
    if (normalized.includes('archive') || normalized.includes('withdraw')) return 'withdrawn';
    if (normalized.includes('offer') || normalized.includes('interview') || normalized.includes('manager') || normalized.includes('technical') || normalized.includes('hr round')) {
      return 'shortlisted';
    }
    if (normalized.includes('screen') || normalized.includes('assessment') || normalized.includes('preboarding')) {
      return 'under_review';
    }
    return VALID_STATUSES.includes(currentStatus) ? currentStatus : 'under_review';
  }

  async getStageHistory(applicationId: string, tenantId: string) {
    await this.findOne(applicationId, tenantId);
    const { rows } = await this.db.query(
      `SELECT h.*, u.email AS actor_email, fs.name AS from_stage_name, ts.name AS to_stage_name
       FROM candidate_pipeline_history h
       LEFT JOIN users u ON u.id = h.actor_id AND u.tenant_id = h.tenant_id
       LEFT JOIN pipeline_stages fs ON fs.id = h.from_stage_id AND fs.tenant_id = h.tenant_id
       LEFT JOIN pipeline_stages ts ON ts.id = h.to_stage_id AND ts.tenant_id = h.tenant_id
       WHERE h.application_id = $1 AND h.tenant_id = $2
       ORDER BY h.created_at ASC`,
      [applicationId, tenantId],
    );
    return rows;
  }
}
