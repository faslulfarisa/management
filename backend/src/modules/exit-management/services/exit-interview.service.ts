import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ExitTimelineService } from './exit-timeline.service';

export const EXIT_INTERVIEW_QUESTIONS = [
  { key: 'reason_for_leaving', label: 'What is your primary reason for leaving?', type: 'choice', options: ['better_opportunity', 'compensation', 'career_growth', 'work_environment', 'relocation', 'personal', 'other'] },
  { key: 'overall_experience', label: 'How would you rate your overall experience working here?', type: 'rating' },
  { key: 'manager_relationship', label: 'How would you rate your relationship with your manager?', type: 'rating' },
  { key: 'growth_opportunities', label: 'How would you rate growth/learning opportunities?', type: 'rating' },
  { key: 'would_recommend', label: 'Would you recommend this organization as a place to work?', type: 'boolean' },
  { key: 'suggestions', label: 'What could we have done better?', type: 'text' },
];

@Injectable()
export class ExitInterviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly timeline: ExitTimelineService,
  ) {}

  getQuestionnaire() {
    return EXIT_INTERVIEW_QUESTIONS;
  }

  async get(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM exit_interviews WHERE tenant_id = $1 AND exit_request_id = $2`,
      [tenantId, exitRequestId],
    );
    return rows[0] ?? null;
  }

  async schedule(tenantId: string, exitRequestId: string, scheduledAt: string, conductedBy: string) {
    const existing = await this.get(tenantId, exitRequestId);
    if (existing) {
      const { rows } = await this.db.query(
        `UPDATE exit_interviews SET scheduled_at = $1, conducted_by = $2, status = 'scheduled', updated_at = now()
         WHERE id = $3 RETURNING *`,
        [scheduledAt, conductedBy, existing.id],
      );
      return rows[0];
    }
    const { rows } = await this.db.query(
      `INSERT INTO exit_interviews (tenant_id, exit_request_id, scheduled_at, conducted_by, status)
       VALUES ($1, $2, $3, $4, 'scheduled') RETURNING *`,
      [tenantId, exitRequestId, scheduledAt, conductedBy],
    );
    return rows[0];
  }

  /** Employee self-service submission of their own responses. */
  async submitResponses(tenantId: string, exitRequestId: string, employeeId: string, data: {
    overall_rating?: number; reason_for_leaving?: string; responses: Record<string, any>;
    would_recommend?: boolean; suggestions?: string;
  }) {
    const existing = await this.get(tenantId, exitRequestId);
    const params = [
      data.overall_rating ?? null, data.reason_for_leaving ?? null, JSON.stringify(data.responses ?? {}),
      data.would_recommend ?? null, data.suggestions ?? null,
    ];

    let row;
    if (existing) {
      const { rows } = await this.db.query(
        `UPDATE exit_interviews
         SET overall_rating = $1, reason_for_leaving = $2, responses = $3::jsonb, would_recommend = $4,
             suggestions = $5, status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = $6 RETURNING *`,
        [...params, existing.id],
      );
      row = rows[0];
    } else {
      const { rows } = await this.db.query(
        `INSERT INTO exit_interviews
           (tenant_id, exit_request_id, overall_rating, reason_for_leaving, responses, would_recommend, suggestions, status, completed_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'completed', now())
         RETURNING *`,
        [tenantId, exitRequestId, ...params],
      );
      row = rows[0];
    }
    await this.timeline.record(tenantId, exitRequestId, 'interview_completed', employeeId);
    return row;
  }

  async addFeedback(tenantId: string, exitRequestId: string, kind: 'manager_feedback' | 'hr_feedback', feedback: string) {
    const existing = await this.get(tenantId, exitRequestId);
    if (!existing) throw new NotFoundException('Exit interview not found');
    const column = kind === 'manager_feedback' ? 'manager_feedback' : 'hr_feedback';
    const { rows } = await this.db.query(
      `UPDATE exit_interviews SET ${column} = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [feedback, existing.id],
    );
    return rows[0];
  }

  async skip(tenantId: string, exitRequestId: string) {
    const existing = await this.get(tenantId, exitRequestId);
    if (existing) {
      const { rows } = await this.db.query(
        `UPDATE exit_interviews SET status = 'skipped', updated_at = now() WHERE id = $1 RETURNING *`,
        [existing.id],
      );
      return rows[0];
    }
    const { rows } = await this.db.query(
      `INSERT INTO exit_interviews (tenant_id, exit_request_id, status) VALUES ($1, $2, 'skipped') RETURNING *`,
      [tenantId, exitRequestId],
    );
    return rows[0];
  }

  async export(tenantId: string, filters: { from?: string; to?: string }) {
    const params: any[] = [tenantId];
    let where = 'ei.tenant_id = $1';
    let idx = 2;
    if (filters.from) { where += ` AND ei.completed_at >= $${idx++}`; params.push(filters.from); }
    if (filters.to) { where += ` AND ei.completed_at <= $${idx++}`; params.push(filters.to); }

    const { rows } = await this.db.query(
      `SELECT ei.*, e.first_name, e.last_name, e.employee_code
       FROM exit_interviews ei
       JOIN exit_requests er ON ei.exit_request_id = er.id
       JOIN employees e ON er.employee_id = e.id
       WHERE ${where} AND ei.status = 'completed'
       ORDER BY ei.completed_at DESC`,
      params,
    );
    return rows;
  }
}
