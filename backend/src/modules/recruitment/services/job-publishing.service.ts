import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { DatabaseService } from '../../../shared/database.service';

/**
 * Provider-based publishing: today only `career_portal` (this app's own
 * public Career Portal) is supported. Adding a real external job board later
 * means adding a branch here (and, if it needs outbound API calls, a
 * dedicated provider service) — the `provider` column and this service's
 * shape already carry that extension point without a speculative plugin
 * registry for a single implementation.
 */
const SUPPORTED_PROVIDERS = ['career_portal'];

@Injectable()
export class JobPublishingService {
  constructor(private db: DatabaseService) {}

  private async getTenantSlug(tenantId: string): Promise<string> {
    const { rows } = await this.db.query('SELECT slug FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]?.slug;
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
}
