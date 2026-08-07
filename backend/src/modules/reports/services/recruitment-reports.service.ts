import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class RecruitmentReportsService {
  constructor(private db: DatabaseService) {}

  async getRecruiterPerformance(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, page = 1, limit = 50 } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND v.created_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND v.created_at::date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND v.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(
      `SELECT
         v.recruiter_id, e.first_name, e.last_name, e.employee_code,
         COUNT(DISTINCT v.id) AS vacancies_handled,
         COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'closed') AS vacancies_filled,
         COUNT(DISTINCT a.id) AS applications_reviewed,
         COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired') AS hires,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status != 'draft') AS offers_extended,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'accepted') AS offers_accepted,
         ROUND(AVG(EXTRACT(EPOCH FROM (v.closed_at - v.created_at)) / 86400) FILTER (WHERE v.closed_at IS NOT NULL)::numeric, 1) AS avg_days_to_fill
       FROM vacancies v
       LEFT JOIN employees e ON v.recruiter_id = e.id
       LEFT JOIN applications a ON a.vacancy_id = v.id AND a.deleted_at IS NULL
       LEFT JOIN offers o ON o.vacancy_id = v.id AND o.deleted_at IS NULL
       WHERE v.tenant_id = $1 AND v.recruiter_id IS NOT NULL AND v.deleted_at IS NULL ${where}
       GROUP BY v.recruiter_id, e.first_name, e.last_name, e.employee_code
       ORDER BY hires DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, (page - 1) * limit],
    );
    return { data: rows, total: rows.length, page, limit };
  }

  async getSourcePerformance(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND a.applied_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND a.applied_at::date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(
      `SELECT
         a.source,
         COUNT(*) AS applications,
         COUNT(*) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
         COUNT(*) FILTER (WHERE a.status = 'hired') AS hires,
         ROUND((COUNT(*) FILTER (WHERE a.status = 'hired')::numeric / COUNT(*)) * 100, 1) AS conversion_rate_pct
       FROM applications a
       WHERE a.tenant_id = $1 AND a.deleted_at IS NULL ${where}
       GROUP BY a.source
       ORDER BY applications DESC`,
      params,
    );
    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getHiringCost(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND c.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND c.end_date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(
      `SELECT
         c.id, c.name, c.campaign_type, c.budget_amount, c.actual_spend,
         COUNT(a.id) AS applications,
         COUNT(a.id) FILTER (WHERE a.status = 'hired') AS hires,
         CASE WHEN COUNT(a.id) FILTER (WHERE a.status = 'hired') > 0
              THEN ROUND(c.actual_spend / COUNT(a.id) FILTER (WHERE a.status = 'hired'), 2)
              ELSE NULL END AS cost_per_hire
       FROM recruitment_campaigns c
       LEFT JOIN applications a ON a.campaign_id = c.id AND a.deleted_at IS NULL
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL ${where}
       GROUP BY c.id, c.name, c.campaign_type, c.budget_amount, c.actual_spend
       ORDER BY c.actual_spend DESC`,
      params,
    );
    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getTimeToHire(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, department_id, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND a.applied_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND a.applied_at::date <= $${idx++}`; params.push(date_to); }
    if (department_id) { where += ` AND v.department_id = $${idx++}`; params.push(department_id); }
    if (branch_id) { where += ` AND v.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(
      `SELECT
         COALESCE(d.name, 'Unassigned') AS department,
         jp.title AS job_title,
         COUNT(*) AS hires,
         ROUND(AVG(EXTRACT(EPOCH FROM (a.converted_at - a.applied_at)) / 86400)::numeric, 1) AS avg_days_applied_to_join,
         ROUND(AVG(EXTRACT(EPOCH FROM (a.reviewed_at - a.applied_at)) / 86400)::numeric, 1) AS avg_days_applied_to_decision
       FROM applications a
       JOIN job_postings jp ON a.job_posting_id = jp.id
       LEFT JOIN vacancies v ON a.vacancy_id = v.id
       LEFT JOIN departments d ON v.department_id = d.id
       WHERE a.tenant_id = $1 AND a.status = 'hired' AND a.deleted_at IS NULL ${where}
       GROUP BY d.name, jp.title
       ORDER BY avg_days_applied_to_join DESC NULLS LAST`,
      params,
    );
    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getOfferAcceptance(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND o.created_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND o.created_at::date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status = 'sent') AS sent,
         COUNT(*) FILTER (WHERE o.status = 'accepted') AS accepted,
         COUNT(*) FILTER (WHERE o.status = 'declined') AS declined,
         COUNT(*) FILTER (WHERE o.status = 'withdrawn') AS withdrawn,
         COUNT(*) FILTER (WHERE o.status = 'expired') AS expired,
         CASE WHEN COUNT(*) FILTER (WHERE o.status IN ('accepted','declined')) > 0
              THEN ROUND((COUNT(*) FILTER (WHERE o.status = 'accepted')::numeric / COUNT(*) FILTER (WHERE o.status IN ('accepted','declined'))) * 100, 1)
              ELSE NULL END AS acceptance_rate_pct
       FROM offers o WHERE o.tenant_id = $1 AND o.deleted_at IS NULL ${where}`,
      params,
    );
    return { data: rows, total: 1, page: 1, limit: 1 };
  }

  async getJoiningRatio(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND o.responded_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to) { where += ` AND o.responded_at::date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status = 'accepted') AS accepted_offers,
         COUNT(*) FILTER (WHERE o.status = 'accepted' AND a.converted_employee_id IS NOT NULL) AS actually_joined,
         CASE WHEN COUNT(*) FILTER (WHERE o.status = 'accepted') > 0
              THEN ROUND((COUNT(*) FILTER (WHERE o.status = 'accepted' AND a.converted_employee_id IS NOT NULL)::numeric
                          / COUNT(*) FILTER (WHERE o.status = 'accepted')) * 100, 1)
              ELSE NULL END AS joining_ratio_pct
       FROM offers o
       JOIN applications a ON o.application_id = a.id
       WHERE o.tenant_id = $1 AND o.deleted_at IS NULL ${where}`,
      params,
    );
    return { data: rows, total: 1, page: 1, limit: 1 };
  }

  async getCampaignRoi(tenantId: string, filter: ReportFilterDto) {
    return this.getHiringCost(tenantId, filter);
  }
}
