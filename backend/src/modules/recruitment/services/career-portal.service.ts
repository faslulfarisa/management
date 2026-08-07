import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { FileUploadService } from '../../../shared/file-upload.service';
import { DocumentService } from '../../platform/services/document.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CandidateService, CandidateContactInput } from './candidate.service';
import { ApplicationService } from './application.service';

const PUBLIC_APPLICATION_SOURCES = new Set([
  'career_portal',
  'linkedin',
  'indeed',
  'naukri',
  'monster',
  'glassdoor',
  'foundit',
  'ziprecruiter',
  'other_job_board',
]);

function normalizeApplicationSource(source?: string | null) {
  if (!source) return 'career_portal';
  const normalized = source.trim().toLowerCase();
  if (normalized === 'other') return 'other_job_board';
  return PUBLIC_APPLICATION_SOURCES.has(normalized) ? normalized : 'career_portal';
}

@Injectable()
export class CareerPortalService {
  constructor(
    private db: DatabaseService,
    private fileUpload: FileUploadService,
    private documents: DocumentService,
    private auditLog: AuditLogService,
    private notifications: NotificationEmitterService,
    private candidates: CandidateService,
    private applications: ApplicationService,
  ) {}

  async resolveTenant(slug: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, logo_url FROM tenants WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
      [slug],
    );
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  async listJobs(tenantId: string, filters: { q?: string; departmentId?: string }) {
    const { q, departmentId } = filters;
    let where = `WHERE jp.tenant_id = $1 AND jp.status = 'open' AND jp.visibility = 'public'`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (departmentId) { where += ` AND jp.department_id = $${idx++}`; params.push(departmentId); }
    if (q) { where += ` AND jp.title ILIKE $${idx++}`; params.push(`%${q}%`); }

    const { rows } = await this.db.query(
      `SELECT jp.id, jp.title, jp.openings, jp.salary_min, jp.salary_max, jp.closes_at, jp.published_at,
              d.name AS department_name, jd.summary, jd.work_location, et.name AS employment_type_name
       FROM job_postings jp
       LEFT JOIN departments d ON jp.department_id = d.id
       LEFT JOIN job_descriptions jd ON jp.job_description_id = jd.id
       LEFT JOIN employment_types et ON jp.employment_type_id = et.id
       ${where} ORDER BY jp.published_at DESC`,
      params,
    );
    return rows;
  }

  async getJob(tenantId: string, idOrToken: string) {
    const { rows } = await this.db.query(
      `SELECT jp.*, d.name AS department_name, et.name AS employment_type_name,
              jd.summary, jd.responsibilities, jd.kras, jd.kpis, jd.skills, jd.competencies, jd.benefits,
              jd.qualifications, jd.certifications, jd.work_location
       FROM job_postings jp
       LEFT JOIN departments d ON jp.department_id = d.id
       LEFT JOIN employment_types et ON jp.employment_type_id = et.id
       LEFT JOIN job_descriptions jd ON jp.job_description_id = jd.id
       WHERE jp.tenant_id = $1 AND (jp.id::text = $2 OR jp.share_token = $2) AND jp.status = 'open'`,
      [tenantId, idOrToken],
    );
    if (!rows.length) throw new NotFoundException('This job is no longer accepting applications');
    return rows[0];
  }

  async apply(
    tenantId: string,
    jobIdOrToken: string,
    input: CandidateContactInput & { cover_note?: string; source?: string },
    file?: { buffer: Buffer; mimetype: string; originalname: string },
    campaignId?: string,
  ) {
    const job = await this.getJob(tenantId, jobIdOrToken);
    const source = normalizeApplicationSource(input.source);

    let resumeDocumentId: string | undefined;
    if (file) {
      this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
      const { url, sizeBytes } = await this.fileUpload.uploadDocument(file.buffer, file.mimetype, 'candidates', tenantId, file.originalname);
      const { candidate } = await this.candidates.findOrCreateByContact(tenantId, { ...input, source }, null);
      const doc = await this.documents.create(tenantId, null as any, {
        entity_type: 'candidate', entity_id: candidate.id, document_type: 'resume',
        name: file.originalname, file_url: url, file_size_bytes: sizeBytes, mime_type: file.mimetype,
      });
      resumeDocumentId = doc.id;
      return this.finishApplication(tenantId, candidate.id, job.id, input.cover_note, resumeDocumentId, campaignId, source);
    }

    const { candidate } = await this.candidates.findOrCreateByContact(tenantId, { ...input, source }, null);
    return this.finishApplication(tenantId, candidate.id, job.id, input.cover_note, resumeDocumentId, campaignId, source);
  }

  private async finishApplication(tenantId: string, candidateId: string, jobPostingId: string, coverNote?: string, resumeDocumentId?: string, campaignId?: string, source = 'career_portal') {
    const application = await this.applications.create(tenantId, {
      candidateId, jobPostingId, source, resumeDocumentId, coverNote, campaignId,
    });

    await this.auditLog.log({ tenantId, userId: null, entityType: 'application', entityId: application.id, action: 'submitted_via_career_portal' });

    const { rows: jpRows } = await this.db.query(
      'SELECT vacancy_id, title FROM job_postings WHERE id = $1 AND tenant_id = $2',
      [jobPostingId, tenantId],
    );
    if (jpRows[0]?.vacancy_id) {
      const { rows: vacancyRows } = await this.db.query(
        'SELECT recruiter_id, hiring_manager_id FROM vacancies WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [jpRows[0].vacancy_id, tenantId],
      );
      const vacancy = vacancyRows[0];
      if (vacancy) {
        const userIds = (await Promise.all(
          [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId: string | null) => this.resolveUserIdForEmployee(tenantId, empId)),
        )).filter((id): id is string => !!id);
        if (userIds.length) {
          await this.notifications.emit(tenantId, {
            userIds, title: 'New application received', message: `A new application was submitted for "${jpRows[0].title}".`,
            type: 'success', sourceModule: 'recruitment', entityType: 'application', entityId: application.id,
            actionUrl: `/dashboard/hr/recruitment/candidates/${candidateId}`,
          });
        }
      }
    }

    return { applicationId: application.id, candidateId };
  }

  async getApplicationStatus(tenantId: string, applicationId: string, email: string) {
    const { rows } = await this.db.query(
      `SELECT a.id, a.status, a.applied_at, jp.title AS job_title, c.email
       FROM applications a
       JOIN candidates c ON a.candidate_id = c.id
       JOIN job_postings jp ON a.job_posting_id = jp.id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
      [applicationId, tenantId],
    );
    if (!rows.length || rows[0].email.toLowerCase() !== email.trim().toLowerCase()) {
      throw new NotFoundException('Application not found');
    }
    const { email: _omit, ...rest } = rows[0];
    return rest;
  }

  private async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query('SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1', [tenantId, employeeId]);
    return rows[0]?.id ?? null;
  }
}
