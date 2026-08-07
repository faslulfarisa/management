import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { EmailService } from '../../auth/email.service';
import {
  CreateCommunicationTemplateDto, SendCommunicationDto, UpdateCommunicationTemplateDto,
} from '../dto/pipeline.dto';

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

@Injectable()
export class CommunicationService {
  constructor(private db: DatabaseService, private email: EmailService) {}

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

  async send(applicationId: string, tenantId: string, sentById: string, dto: SendCommunicationDto) {
    const { rows: appRows } = await this.db.query(
      `SELECT a.*, c.id AS candidate_id, c.email AS candidate_email, c.first_name, c.last_name, jp.title AS job_title
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN job_postings jp ON jp.id = a.job_posting_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [applicationId, tenantId],
    );
    if (!appRows.length) throw new NotFoundException('Application not found');
    const application = appRows[0];

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

    const vars = { candidate_name: `${application.first_name} ${application.last_name}`, job_title: application.job_title, company_name: 'Ai-HRMS' };
    const renderedSubject = renderTemplate(subject, vars);
    const renderedBody = renderTemplate(body, vars);

    let status: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;
    try {
      await this.email.sendGenericEmail(application.candidate_email, renderedSubject, renderedBody);
    } catch (err: any) {
      status = 'failed';
      errorMessage = err?.message ?? 'Failed to send email';
    }

    const { rows } = await this.db.query(
      `INSERT INTO candidate_communications (
         tenant_id, candidate_id, application_id, template_id, channel, subject, body, status, error_message, sent_by
       ) VALUES ($1,$2,$3,$4,'email',$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, application.candidate_id, applicationId, dto.template_id ?? null, renderedSubject, renderedBody, status, errorMessage, sentById],
    );
    return rows[0];
  }
}
