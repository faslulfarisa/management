import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

const ACTIVITY_ENTITY_TYPES = ['vacancy', 'job_description', 'application', 'offer', 'probation_review', 'workforce_plan'];

@Injectable()
export class RecruitmentDashboardService {
  constructor(private db: DatabaseService) {}

  async getOverview(tenantId: string, branchId?: string) {
    const branchFilter = branchId ? ' AND v.branch_id = $2' : '';
    const branchParams = branchId ? [tenantId, branchId] : [tenantId];
    const analyticsParams = [tenantId, branchId ?? null];
    const analyticsBranchFilter = 'AND ($2::uuid IS NULL OR v.branch_id = $2)';

    const [
      openVacancies, awaitingApproval, pipelineCounts, upcomingInterviews,
      offersPending, joiningSchedule, recruiterWorkload, deptHiringStatus,
      hiringFunnel, recentActivity, kpis, timePerStage, recruiterPerformance,
      sourceEffectiveness, vacancyAnalytics, candidateConversion, monthlyTrend,
    ] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM vacancies v WHERE v.tenant_id = $1 AND v.status IN ('open','reopened') AND v.deleted_at IS NULL${branchFilter}`, branchParams),

      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM vacancies WHERE tenant_id = $1 AND approval_status = 'pending' AND deleted_at IS NULL) AS vacancies,
           (SELECT COUNT(*) FROM job_descriptions WHERE tenant_id = $1 AND approval_status = 'pending' AND deleted_at IS NULL) AS job_descriptions,
           (SELECT COUNT(*) FROM offers WHERE tenant_id = $1 AND approval_status = 'pending' AND deleted_at IS NULL) AS offers,
           (SELECT COUNT(*) FROM probation_reviews WHERE tenant_id = $1 AND approval_status = 'pending' AND deleted_at IS NULL) AS probation_reviews,
           (SELECT COUNT(*) FROM workforce_plans WHERE tenant_id = $1 AND approval_status = 'pending' AND deleted_at IS NULL) AS workforce_plans`,
        [tenantId],
      ),

      this.db.query(
        `SELECT a.status, COUNT(*) AS count FROM applications a WHERE a.tenant_id = $1 AND a.deleted_at IS NULL GROUP BY a.status`,
        [tenantId],
      ),

      this.db.query(
        `SELECT i.id, i.scheduled_at, i.round_type, i.round_number, a.id AS application_id,
                c.first_name, c.last_name, jp.title AS job_title
         FROM interviews i
         LEFT JOIN applications a ON i.application_id = a.id
         LEFT JOIN candidates c ON a.candidate_id = c.id
         LEFT JOIN job_postings jp ON a.job_posting_id = jp.id
         WHERE i.tenant_id = $1 AND i.status = 'scheduled'
           AND i.scheduled_at BETWEEN now() AND now() + INTERVAL '7 days'
         ORDER BY i.scheduled_at ASC LIMIT 8`,
        [tenantId],
      ),

      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent') AS sent,
           COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_approval,
           COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
           COUNT(*) FILTER (WHERE status = 'declined') AS declined
         FROM offers WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),

      this.db.query(
        `SELECT pc.application_id, pc.joining_date, c.first_name, c.last_name, jp.title AS job_title
         FROM preboarding_checklists pc
         JOIN applications a ON pc.application_id = a.id
         JOIN candidates c ON a.candidate_id = c.id
         JOIN job_postings jp ON a.job_posting_id = jp.id
         WHERE pc.tenant_id = $1 AND pc.joining_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
         ORDER BY pc.joining_date ASC LIMIT 8`,
        [tenantId],
      ),

      this.db.query(
        `SELECT v.recruiter_id, e.first_name, e.last_name,
                COUNT(DISTINCT v.id) FILTER (WHERE v.status IN ('open','reopened')) AS open_vacancies,
                COUNT(a.id) FILTER (WHERE a.status NOT IN ('rejected','withdrawn','hired')) AS active_applications
         FROM vacancies v
         LEFT JOIN employees e ON v.recruiter_id = e.id
         LEFT JOIN applications a ON a.vacancy_id = v.id AND a.deleted_at IS NULL
         WHERE v.tenant_id = $1 AND v.recruiter_id IS NOT NULL AND v.deleted_at IS NULL
         GROUP BY v.recruiter_id, e.first_name, e.last_name
         ORDER BY open_vacancies DESC LIMIT 8`,
        [tenantId],
      ),

      this.db.query(
        `SELECT COALESCE(d.name, 'Unassigned') AS department,
                COUNT(*) FILTER (WHERE v.status IN ('open','reopened')) AS open,
                COUNT(*) FILTER (WHERE v.status = 'on_hold') AS on_hold,
                COUNT(*) FILTER (WHERE v.status = 'closed') AS closed
         FROM vacancies v
         LEFT JOIN departments d ON v.department_id = d.id
         WHERE v.tenant_id = $1 AND v.deleted_at IS NULL
         GROUP BY d.name ORDER BY open DESC LIMIT 10`,
        [tenantId],
      ),

      this.db.query(
        `SELECT
           COUNT(*) AS applied,
           COUNT(*) FILTER (WHERE status != 'applied') AS under_review_plus,
           COUNT(*) FILTER (WHERE status = 'shortlisted') AS shortlisted,
           COUNT(*) FILTER (WHERE status = 'hired') AS hired,
           COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
           COUNT(*) FILTER (WHERE status = 'withdrawn') AS withdrawn
         FROM applications WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),

      this.db.query(
        `SELECT al.entity_type, al.action, al.entity_id, al.created_at, u.email AS actor_email
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.tenant_id = $1 AND al.entity_type = ANY($2::text[])
         ORDER BY al.created_at DESC LIMIT 12`,
        [tenantId, ACTIVITY_ENTITY_TYPES],
      ),

      this.db.query(
        `SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (a.reviewed_at - a.applied_at)) / 86400)::numeric, 1) AS avg_days_applied_to_decision,
           ROUND(AVG(EXTRACT(EPOCH FROM (a.converted_at - a.applied_at)) / 86400)::numeric, 1) AS avg_days_time_to_hire,
           (SELECT COUNT(*) FROM offers WHERE tenant_id = $1 AND status IN ('accepted','declined') AND deleted_at IS NULL) AS responded_offers,
           (SELECT COUNT(*) FROM offers WHERE tenant_id = $1 AND status = 'accepted' AND deleted_at IS NULL) AS accepted_offers
         FROM applications a WHERE a.tenant_id = $1 AND a.deleted_at IS NULL AND a.converted_at IS NOT NULL`,
        [tenantId],
      ),

      this.db.query(
        `WITH stage_events AS (
           SELECT
             cph.application_id,
             ps.name AS stage_name,
             ps.stage_category,
             ps.stage_order,
             cph.created_at AS entered_at,
             LEAD(cph.created_at) OVER (PARTITION BY cph.application_id ORDER BY cph.created_at) AS exited_at
           FROM candidate_pipeline_history cph
           JOIN applications a ON a.id = cph.application_id
           LEFT JOIN vacancies v ON v.id = a.vacancy_id
           LEFT JOIN pipeline_stages ps ON ps.id = cph.to_stage_id
           WHERE cph.tenant_id = $1 AND a.deleted_at IS NULL ${analyticsBranchFilter}
         )
         SELECT
           COALESCE(stage_name, 'Application') AS stage,
           COALESCE(stage_category, 'custom') AS category,
           MIN(stage_order) AS stage_order,
           COUNT(*) AS transitions,
           ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at)) / 86400)::numeric, 1) AS avg_days
         FROM stage_events
         GROUP BY stage_name, stage_category
         ORDER BY MIN(stage_order) NULLS LAST, stage`,
        analyticsParams,
      ),

      this.db.query(
        `SELECT
           v.recruiter_id,
           COALESCE(e.first_name || ' ' || e.last_name, 'Unassigned') AS recruiter_name,
           COUNT(DISTINCT v.id) AS vacancies,
           COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'closed') AS closed_vacancies,
           COUNT(DISTINCT a.id) AS candidates,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired') AS hires,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status != 'draft') AS offers,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'accepted') AS accepted_offers,
           ROUND((COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired')::numeric / NULLIF(COUNT(DISTINCT a.id), 0)) * 100, 1) AS hire_rate,
           ROUND(AVG(EXTRACT(EPOCH FROM (a.converted_at - a.applied_at)) / 86400) FILTER (WHERE a.converted_at IS NOT NULL)::numeric, 1) AS avg_time_to_hire_days
         FROM vacancies v
         LEFT JOIN employees e ON e.id = v.recruiter_id
         LEFT JOIN applications a ON a.vacancy_id = v.id AND a.deleted_at IS NULL
         LEFT JOIN offers o ON o.application_id = a.id AND o.deleted_at IS NULL
         WHERE v.tenant_id = $1 AND v.deleted_at IS NULL ${analyticsBranchFilter}
         GROUP BY v.recruiter_id, e.first_name, e.last_name
         ORDER BY hires DESC, candidates DESC
         LIMIT 8`,
        analyticsParams,
      ),

      this.db.query(
        `SELECT
           COALESCE(a.source, 'unknown') AS source,
           COUNT(*) AS applications,
           COUNT(*) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
           COUNT(*) FILTER (WHERE a.status = 'hired') AS hires,
           COUNT(o.id) FILTER (WHERE o.status = 'accepted') AS accepted_offers,
           ROUND((COUNT(*) FILTER (WHERE a.status = 'hired')::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS conversion_rate
         FROM applications a
         LEFT JOIN vacancies v ON v.id = a.vacancy_id
         LEFT JOIN offers o ON o.application_id = a.id AND o.deleted_at IS NULL
         WHERE a.tenant_id = $1 AND a.deleted_at IS NULL ${analyticsBranchFilter}
         GROUP BY a.source
         ORDER BY applications DESC
         LIMIT 8`,
        analyticsParams,
      ),

      this.db.query(
        `SELECT
           v.id,
           v.title,
           COALESCE(d.name, 'Unassigned') AS department,
           v.status,
           v.number_of_positions,
           COUNT(DISTINCT a.id) AS applications,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired') AS hires,
           COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'accepted') AS accepted_offers,
           ROUND(AVG(EXTRACT(EPOCH FROM (a.converted_at - a.applied_at)) / 86400) FILTER (WHERE a.converted_at IS NOT NULL)::numeric, 1) AS avg_time_to_hire_days
         FROM vacancies v
         LEFT JOIN departments d ON d.id = v.department_id
         LEFT JOIN applications a ON a.vacancy_id = v.id AND a.deleted_at IS NULL
         LEFT JOIN offers o ON o.application_id = a.id AND o.deleted_at IS NULL
         WHERE v.tenant_id = $1 AND v.deleted_at IS NULL ${analyticsBranchFilter}
         GROUP BY v.id, d.name
         ORDER BY applications DESC, v.created_at DESC
         LIMIT 8`,
        analyticsParams,
      ),

      this.db.query(
        `SELECT
           COUNT(DISTINCT a.id) AS applications,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status != 'applied') AS moved_forward,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
           COUNT(DISTINCT a.id) FILTER (WHERE o.status IN ('sent','accepted','declined','withdrawn','expired')) AS offered,
           COUNT(DISTINCT a.id) FILTER (WHERE o.status = 'accepted') AS offer_accepted,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired') AS hired,
           COUNT(DISTINCT a.id) FILTER (WHERE a.converted_employee_id IS NOT NULL) AS joined,
           ROUND((COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'hired')::numeric / NULLIF(COUNT(DISTINCT a.id), 0)) * 100, 1) AS candidate_to_hire_rate,
           ROUND((COUNT(DISTINCT a.id) FILTER (WHERE a.converted_employee_id IS NOT NULL)::numeric / NULLIF(COUNT(DISTINCT a.id) FILTER (WHERE o.status = 'accepted'), 0)) * 100, 1) AS accepted_to_joined_rate
         FROM applications a
         LEFT JOIN vacancies v ON v.id = a.vacancy_id
         LEFT JOIN offers o ON o.application_id = a.id AND o.deleted_at IS NULL
         WHERE a.tenant_id = $1 AND a.deleted_at IS NULL ${analyticsBranchFilter}`,
        analyticsParams,
      ),

      this.db.query(
        `SELECT
           to_char(date_trunc('month', a.applied_at), 'Mon YYYY') AS month,
           date_trunc('month', a.applied_at) AS month_start,
           COUNT(*) AS applications,
           COUNT(*) FILTER (WHERE a.status = 'hired') AS hires,
           COUNT(*) FILTER (WHERE a.converted_employee_id IS NOT NULL) AS joined
         FROM applications a
         LEFT JOIN vacancies v ON v.id = a.vacancy_id
         WHERE a.tenant_id = $1 AND a.deleted_at IS NULL ${analyticsBranchFilter}
           AND a.applied_at >= date_trunc('month', now()) - INTERVAL '5 months'
         GROUP BY month_start
         ORDER BY month_start ASC`,
        analyticsParams,
      ),
    ]);

    const kpiRow = kpis.rows[0] ?? {};
    const respondedOffers = parseInt(kpiRow.responded_offers, 10) || 0;
    const acceptedOffers = parseInt(kpiRow.accepted_offers, 10) || 0;

    return {
      open_vacancies: parseInt(openVacancies.rows[0].count, 10),
      awaiting_approval: awaitingApproval.rows[0],
      pipeline_counts: pipelineCounts.rows.reduce((acc: Record<string, number>, r: any) => { acc[r.status] = parseInt(r.count, 10); return acc; }, {}),
      upcoming_interviews: upcomingInterviews.rows,
      offers_pending: offersPending.rows[0],
      joining_schedule: joiningSchedule.rows,
      recruiter_workload: recruiterWorkload.rows,
      dept_hiring_status: deptHiringStatus.rows,
      hiring_funnel: hiringFunnel.rows[0],
      recent_activity: recentActivity.rows,
      kpis: {
        avg_time_to_hire_days: kpiRow.avg_days_time_to_hire != null ? Number(kpiRow.avg_days_time_to_hire) : null,
        avg_decision_days: kpiRow.avg_days_applied_to_decision != null ? Number(kpiRow.avg_days_applied_to_decision) : null,
        offer_acceptance_rate: respondedOffers > 0 ? Math.round((acceptedOffers / respondedOffers) * 1000) / 10 : null,
      },
      analytics: {
        hiring_funnel: hiringFunnel.rows[0],
        time_to_hire_days: kpiRow.avg_days_time_to_hire != null ? Number(kpiRow.avg_days_time_to_hire) : null,
        time_per_stage: timePerStage.rows,
        offer_acceptance: {
          responded_offers: respondedOffers,
          accepted_offers: acceptedOffers,
          acceptance_rate: respondedOffers > 0 ? Math.round((acceptedOffers / respondedOffers) * 1000) / 10 : null,
        },
        joining_ratio: {
          accepted_offers: parseInt(candidateConversion.rows[0]?.offer_accepted, 10) || 0,
          joined: parseInt(candidateConversion.rows[0]?.joined, 10) || 0,
          ratio: candidateConversion.rows[0]?.accepted_to_joined_rate != null ? Number(candidateConversion.rows[0].accepted_to_joined_rate) : null,
        },
        recruiter_performance: recruiterPerformance.rows,
        source_effectiveness: sourceEffectiveness.rows,
        vacancy_analytics: vacancyAnalytics.rows,
        candidate_conversion: candidateConversion.rows[0],
        monthly_trend: monthlyTrend.rows,
      },
    };
  }
}
