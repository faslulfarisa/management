import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { EmailService } from '../../auth/email.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import {
  CreateCommunicationTemplateDto, SendCommunicationDto, UpdateCommunicationTemplateDto,
} from '../dto/pipeline.dto';

const COMMUNICATION_CHANNELS = ['email', 'sms', 'whatsapp', 'phone_note', 'internal_note'] as const;
type CommunicationChannel = typeof COMMUNICATION_CHANNELS[number];
type CommunicationStatus = 'sent' | 'failed' | 'logged';

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

@Injectable()
export class CommunicationService {
  constructor(
    private db: DatabaseService,
    private email: EmailService,
    private notifications: NotificationEmitterService,
  ) {}

  // ── Templates ──────────────────────────────────────────────────────────
  async listTemplates(tenantId: string, includeInactive = false) {
    const where = includeInactive ? 'WHERE tenant_id = $1' : 'WHERE tenant_id = $1 AND is_active = true';
    const { rows } = await this.db.query(`SELECT * FROM communication_templates ${where} ORDER BY created_at DESC`, [tenantId]);
    return rows;
  }

  async createTemplate(tenantId: string, createdById: string, dto: CreateCommunicationTemplateDto) {
    const { rows } = await this.db.query(
      `INSERT INTO communication_templates (tenant_id, name, category, subject, body, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, dto.name, dto.category ?? 'custom', dto.subject, dto.body, createdById],
    );
    return rows[0];
  }

  async updateTemplate(id: string, tenantId: string, dto: UpdateCommunicationTemplateDto) {
    const { rows } = await this.db.query(
      `UPDATE communication_templates SET
         name = COALESCE($3, name), category = COALESCE($4, category), subject = COALESCE($5, subject),
         body = COALESCE($6, body), is_active = COALESCE($7, is_active), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.name ?? null, dto.category ?? null, dto.subject ?? null, dto.body ?? null, dto.is_active ?? null],
    );
    if (!rows.length) throw new NotFoundException('Template not found');
    return rows[0];
  }

  // ── Send + log ─────────────────────────────────────────────────────────
  async listForApplication(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT cc.*, u.email AS sent_by_email FROM candidate_communications cc
       LEFT JOIN users u ON u.id = cc.sent_by
       WHERE cc.application_id = $1 AND cc.tenant_id = $2 ORDER BY cc.sent_at DESC`,
      [applicationId, tenantId],
    );
    return rows;
  }

  async listForCandidate(candidateId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT cc.*, u.email AS sent_by_email FROM candidate_communications cc
       LEFT JOIN users u ON u.id = cc.sent_by
       WHERE cc.candidate_id = $1 AND cc.tenant_id = $2 ORDER BY cc.sent_at DESC`,
      [candidateId, tenantId],
    );
    return rows;
  }

  private async getApplicationContext(applicationId: string, tenantId: string) {
    const { rows: appRows } = await this.db.query(
      `SELECT a.*, c.id AS candidate_id, c.email AS candidate_email, c.phone AS candidate_phone,
              c.first_name, c.last_name, jp.title AS job_title
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN job_postings jp ON jp.id = a.job_posting_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [applicationId, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');
    return appRows[0];
  }

  private async renderCommunication(tenantId: string, dto: SendCommunicationDto, vars: Record<string, string>) {
    let subject = dto.subject;
    let body = dto.body;
    if (dto.template_id) {
      const { rows: tplRows } = await this.db.query(
        'SELECT * FROM communication_templates WHERE id = $1 AND tenant_id = $2 AND is_active = true',
        [dto.template_id, tenantId],
      );
      if (!tplRows.length) throw new NotFoundException('Template not found');
      subject = subject || tplRows[0].subject;
      body = body || tplRows[0].body;
    }
    if (!subject || !body) throw new BadRequestException('subject and body are required (or pick a template)');

    return {
      subject: renderTemplate(subject, vars),
      body: renderTemplate(body, vars),
    };
  }

  private async notifyStakeholders(tenantId: string, applicationId: string, actorId: string, channel: CommunicationChannel, subject: string) {
    const { rows } = await this.db.query(
      `SELECT u.id
       FROM applications a
       JOIN vacancies v ON v.id = a.vacancy_id
       JOIN users u ON u.employee_id IN (v.recruiter_id, v.hiring_manager_id)
        AND u.tenant_id = a.tenant_id
        AND u.deleted_at IS NULL
       WHERE a.id = $1 AND a.tenant_id = $2 AND u.id <> $3`,
      [applicationId, tenantId, actorId],
    );
    const userIds = rows.map((row: any) => row.id);
    if (!userIds.length) return;

    await this.notifications.emit(tenantId, {
      userIds,
      title: 'Candidate communication logged',
      message: `${channel.replace(/_/g, ' ')}: ${subject}`,
      type: 'info',
      priority: 'low',
      sourceModule: 'recruitment',
      entityType: 'application',
      entityId: applicationId,
      actionUrl: `/dashboard/hr/recruitment/pipeline/${applicationId}`,
    });
  }

  async send(applicationId: string, tenantId: string, sentById: string, dto: SendCommunicationDto) {
    const channel = (dto.channel ?? 'email') as CommunicationChannel;
    if (!COMMUNICATION_CHANNELS.includes(channel)) throw new BadRequestException('Unsupported communication channel');

    const application = await this.getApplicationContext(applicationId, tenantId);
    const vars = {
      candidate_name: `${application.first_name} ${application.last_name}`,
      job_title: application.job_title,
      company_name: 'Ai-HRMS',
    };
    const rendered = await this.renderCommunication(tenantId, dto, vars);

    let status: CommunicationStatus = channel === 'email' ? 'sent' : 'logged';
    let errorMessage: string | null = null;

    if (channel === 'email') {
      try {
        await this.email.sendGenericEmail(application.candidate_email, rendered.subject, rendered.body);
      } catch (err: any) {
        status = 'failed';
        errorMessage = err?.message ?? 'Failed to send email';
      }
    }

    const { rows } = await this.db.query(
      `INSERT INTO candidate_communications (
         tenant_id, candidate_id, application_id, template_id, channel, subject, body, status, error_message, sent_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, application.candidate_id, applicationId, dto.template_id ?? null, channel, rendered.subject, rendered.body, status, errorMessage, sentById],
    );

    if (channel === 'internal_note' || channel === 'phone_note') {
      this.notifyStakeholders(tenantId, applicationId, sentById, channel, rendered.subject).catch(() => undefined);
    }

    return rows[0];
  }
}
