import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { DatabaseService } from '../../../shared/database.service';

const SUPPORTED_PROVIDERS = ['career_portal'];
const EXTERNAL_JOB_BOARD_PROVIDERS = ['linkedin', 'indeed', 'naukri', 'monster', 'glassdoor', 'foundit', 'ziprecruiter', 'other'];
const EXTERNAL_POSTING_STATUSES = ['ready_to_post', 'published', 'failed', 'unpublished', 'expired'];

@Injectable()
export class JobPublishingService {
  constructor(private db: DatabaseService) {}

  private async getTenantSlug(tenantId: string): Promise<string> {
    const { rows } = await this.db.query('SELECT slug FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]?.slug;
  }

  private async buildCareerApplyUrl(tenantId: string, shareToken: string, source?: string): Promise<string> {
    const slug = await this.getTenantSlug(tenantId);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const url = new URL(`${baseUrl}/career/${slug}/jobs/${shareToken}`);
    if (source) url.searchParams.set('source', source);
    return url.toString();
  }

  /** Creates (or reuses) the job_posting for an approved vacancy + approved job description, and publishes it. */
  async publishFromVacancy(
    tenantId: string,
    vacancyId: string,
    jobDescriptionId: string,
    publishedById: string,
    opts: { provider?: string; visibility?: string; closesAt?: string },
  ) {
    const provider = opts.provider || 'career_portal';
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new BadRequestException(`Publishing provider '${provider}' is not yet supported`);
    }

    const { rows: vacancyRows } = await this.db.query('SELECT * FROM vacancies WHERE id = $1 AND tenant_id = $2', [vacancyId, tenantId]);
    if (!vacancyRows.length) throw new NotFoundException('Vacancy not found');
    const vacancy = vacancyRows[0];
    if (!['open', 'reopened', 'on_hold'].includes(vacancy.status)) {
      throw new BadRequestException(`Vacancy must be approved/open before its job description can be published (current status: '${vacancy.status}')`);
    }

    const { rows: jdRows } = await this.db.query('SELECT * FROM job_descriptions WHERE id = $1 AND tenant_id = $2', [jobDescriptionId, tenantId]);
    if (!jdRows.length) throw new NotFoundException('Job description not found');
    const jd = jdRows[0];
    if (jd.status !== 'approved') {
      throw new BadRequestException(`Job description must be approved before it can be published (current status: '${jd.status}')`);
    }

    const { rows: existing } = await this.db.query(
      'SELECT * FROM job_postings WHERE vacancy_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1',
      [vacancyId, tenantId],
    );

    const shareToken = existing[0]?.share_token || crypto.randomBytes(12).toString('hex');
    const visibility = opts.visibility === 'unlisted' ? 'unlisted' : 'public';

    if (existing.length) {
      const { rows } = await this.db.query(
        `UPDATE job_postings SET
           job_description_id = $3, title = $4, department_id = $5, employment_type_id = $6,
           salary_min = $7, salary_max = $8, openings = $9, closes_at = $10,
           status = 'open', published_at = now(), unpublished_at = NULL,
           visibility = $11, provider = $12, share_token = $13, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [
          existing[0].id, tenantId, jobDescriptionId, vacancy.title, vacancy.department_id, vacancy.employment_type_id,
          vacancy.salary_min, vacancy.salary_max, vacancy.number_of_positions, opts.closesAt ?? vacancy.target_close_date,
          visibility, provider, shareToken,
        ],
      );
      return rows[0];
    }

    const { rows } = await this.db.query(
      `INSERT INTO job_postings (
         tenant_id, vacancy_id, job_description_id, title, department_id, employment_type_id,
         salary_min, salary_max, openings, status, posted_by, closes_at, published_at,
         visibility, provider, share_token
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,now(),$12,$13,$14)
       RETURNING *`,
      [
        tenantId, vacancyId, jobDescriptionId, vacancy.title, vacancy.department_id, vacancy.employment_type_id,
        vacancy.salary_min, vacancy.salary_max, vacancy.number_of_positions, publishedById,
        opts.closesAt ?? vacancy.target_close_date, visibility, provider, shareToken,
      ],
    );
    return rows[0];
  }

  async unpublish(tenantId: string, jobPostingId: string) {
    const { rows } = await this.db.query(
      `UPDATE job_postings SET status = 'closed', unpublished_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [jobPostingId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Job posting not found');
    return rows[0];
  }

  async republish(tenantId: string, jobPostingId: string) {
    const { rows } = await this.db.query(
      `UPDATE job_postings SET status = 'open', published_at = now(), unpublished_at = NULL, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [jobPostingId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Job posting not found');
    return rows[0];
  }

  async getShareInfo(tenantId: string, jobPostingId: string) {
    const { rows } = await this.db.query('SELECT share_token FROM job_postings WHERE id = $1 AND tenant_id = $2', [jobPostingId, tenantId]);
    if (!rows.length) throw new NotFoundException('Job posting not found');
    if (!rows[0].share_token) throw new BadRequestException('This job posting has not been published yet');

    const slug = await this.getTenantSlug(tenantId);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const url = `${baseUrl}/career/${slug}/jobs/${rows[0].share_token}`;
    const qrCodeDataUrl = await qrcode.toDataURL(url);
    return { url, qrCodeDataUrl };
  }

  async listExternalPostings(tenantId: string, vacancyId: string) {
    const { rows } = await this.db.query(
      `SELECT jbp.*, jp.title AS job_title, jd.title AS job_description_title
       FROM job_board_postings jbp
       JOIN job_postings jp ON jp.id = jbp.job_posting_id
       JOIN job_descriptions jd ON jd.id = jbp.job_description_id
       WHERE jbp.tenant_id = $1
         AND jbp.vacancy_id = $2
         AND jbp.deleted_at IS NULL
       ORDER BY jbp.created_at DESC`,
      [tenantId, vacancyId],
    );
    return rows;
  }

  async createExternalPosting(
    tenantId: string,
    vacancyId: string,
    jobDescriptionId: string,
    actorId: string,
    opts: { provider: string; externalUrl?: string; externalJobId?: string; payload?: Record<string, any>; closesAt?: string },
  ) {
    const provider = opts.provider;
    if (!EXTERNAL_JOB_BOARD_PROVIDERS.includes(provider)) {
      throw new BadRequestException(`Unsupported external job board '${provider}'`);
    }

    const jobPosting = await this.publishFromVacancy(tenantId, vacancyId, jobDescriptionId, actorId, {
      provider: 'career_portal',
      visibility: 'public',
      closesAt: opts.closesAt,
    });

    const applyUrl = await this.buildCareerApplyUrl(tenantId, jobPosting.share_token, provider);
    const status = opts.externalUrl ? 'published' : 'ready_to_post';

    const { rows } = await this.db.query(
      `INSERT INTO job_board_postings (
         tenant_id, vacancy_id, job_description_id, job_posting_id, provider, status,
         apply_url, external_job_id, external_url, provider_payload,
         published_at, last_synced_at, created_by, last_updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,
         CASE WHEN $6 = 'published' THEN now() ELSE NULL END,
         now(),$11,$11)
       ON CONFLICT (tenant_id, vacancy_id, provider)
       DO UPDATE SET
         job_description_id = EXCLUDED.job_description_id,
         job_posting_id = EXCLUDED.job_posting_id,
         status = EXCLUDED.status,
         apply_url = EXCLUDED.apply_url,
         external_job_id = COALESCE(EXCLUDED.external_job_id, job_board_postings.external_job_id),
         external_url = COALESCE(EXCLUDED.external_url, job_board_postings.external_url),
         provider_payload = EXCLUDED.provider_payload,
         published_at = CASE
           WHEN EXCLUDED.status = 'published' THEN COALESCE(job_board_postings.published_at, now())
           ELSE job_board_postings.published_at
         END,
         last_synced_at = now(),
         last_updated_by = EXCLUDED.last_updated_by,
         updated_at = now(),
         deleted_at = NULL
       RETURNING *`,
      [
        tenantId, vacancyId, jobDescriptionId, jobPosting.id, provider, status, applyUrl,
        opts.externalJobId ?? null, opts.externalUrl ?? null, JSON.stringify(opts.payload ?? {}), actorId,
      ],
    );
    return rows[0];
  }

  async updateExternalPosting(
    tenantId: string,
    postingId: string,
    actorId: string,
    data: { status?: string; externalUrl?: string | null; externalJobId?: string | null; errorMessage?: string | null; payload?: Record<string, any> },
  ) {
    if (data.status && !EXTERNAL_POSTING_STATUSES.includes(data.status)) {
      throw new BadRequestException(`Unsupported posting status '${data.status}'`);
    }

    const { rows } = await this.db.query(
      `UPDATE job_board_postings
       SET status = COALESCE($3, status),
           external_url = COALESCE($4, external_url),
           external_job_id = COALESCE($5, external_job_id),
           error_message = $6,
           provider_payload = COALESCE($7::jsonb, provider_payload),
           published_at = CASE
             WHEN COALESCE($3, status) = 'published' THEN COALESCE(published_at, now())
             ELSE published_at
           END,
           last_synced_at = now(),
           last_updated_by = $8,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [
        postingId,
        tenantId,
        data.status ?? null,
        data.externalUrl ?? null,
        data.externalJobId ?? null,
        data.errorMessage ?? null,
        data.payload ? JSON.stringify(data.payload) : null,
        actorId,
      ],
    );
    if (!rows.length) throw new NotFoundException('External job board posting not found');
    return rows[0];
  }

  async unpublishExternalPosting(tenantId: string, postingId: string, actorId: string) {
    return this.updateExternalPosting(tenantId, postingId, actorId, { status: 'unpublished' });
  }
}
