import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class RecruitmentService {
  constructor(private db: DatabaseService) {}

  async getJobPostings(tenantId: string, filters: any) {
    const { status, vacancy_id, job_description_id } = filters;
    let query = 'SELECT jp.*, d.name as department_name, des.name as designation_name FROM job_postings jp LEFT JOIN departments d ON jp.department_id = d.id LEFT JOIN designations des ON jp.designation_id = des.id WHERE jp.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { query += ` AND jp.status = $${idx++}`; params.push(status); }
    if (vacancy_id) { query += ` AND jp.vacancy_id = $${idx++}`; params.push(vacancy_id); }
    if (job_description_id) { query += ` AND jp.job_description_id = $${idx++}`; params.push(job_description_id); }
    query += ' ORDER BY jp.posted_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createJobPosting(tenantId: string, postedBy: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO job_postings (tenant_id, title, department_id, designation_id, location, employment_type_id,
        description, requirements, salary_min, salary_max, openings, status, posted_by, closes_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [tenantId, data.title, data.department_id, data.designation_id, data.location, data.employment_type_id,
        data.description, data.requirements, data.salary_min, data.salary_max, data.openings || 1, data.status || 'open', postedBy, data.closes_at],
    );
    return rows[0];
  }

  async updateJobPosting(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE job_postings SET title = COALESCE($3, title), department_id = COALESCE($4, department_id),
        designation_id = COALESCE($5, designation_id), location = COALESCE($6, location),
        employment_type_id = COALESCE($7, employment_type_id), description = COALESCE($8, description),
        requirements = COALESCE($9, requirements), salary_min = COALESCE($10, salary_min),
        salary_max = COALESCE($11, salary_max), openings = COALESCE($12, openings),
        status = COALESCE($13, status), closes_at = COALESCE($14, closes_at), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.title, data.department_id, data.designation_id, data.location, data.employment_type_id,
        data.description, data.requirements, data.salary_min, data.salary_max, data.openings, data.status, data.closes_at],
    );
    if (!rows.length) throw new NotFoundException('Job posting not found');
    return rows[0];
  }

  async deleteJobPosting(id: string, tenantId: string) {
    await this.db.query('DELETE FROM job_postings WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async getStats(tenantId: string) {
    const [openJobs, totalCandidates, interviewsScheduled] = await Promise.all([
      this.db.query("SELECT COUNT(*) FROM job_postings WHERE tenant_id = $1 AND status = 'open'", [tenantId]),
      this.db.query('SELECT COUNT(*) FROM candidates WHERE tenant_id = $1', [tenantId]),
      this.db.query("SELECT COUNT(*) FROM interviews WHERE tenant_id = $1 AND status = 'scheduled'", [tenantId]),
    ]);
    return {
      open_jobs: parseInt(openJobs.rows[0].count),
      total_candidates: parseInt(totalCandidates.rows[0].count),
      interviews_scheduled: parseInt(interviewsScheduled.rows[0].count),
    };
  }
}
