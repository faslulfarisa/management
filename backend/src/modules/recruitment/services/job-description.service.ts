import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CreateJobDescriptionDto, UpdateJobDescriptionDto } from '../dto/job-description.dto';

const EDITABLE_STATUSES = ['draft', 'rejected'];
const SNAPSHOT_FIELDS = [
  'title', 'summary', 'responsibilities', 'kras', 'kpis', 'skills', 'competencies', 'benefits',
  'qualifications', 'certifications', 'work_location', 'is_template', 'template_name',
];

@Injectable()
export class JobDescriptionService {
  constructor(private db: DatabaseService) {}

  private snapshotOf(row: any) {
    const snap: Record<string, any> = {};
    for (const f of SNAPSHOT_FIELDS) snap[f] = row[f];
    return snap;
  }

  private async writeVersion(tenantId: string, jobDescriptionId: string, versionNumber: number, snapshot: any, createdBy?: string, changeNote?: string) {
    await this.db.query(
      `INSERT INTO job_description_versions (tenant_id, job_description_id, version_number, snapshot, change_note, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [tenantId, jobDescriptionId, versionNumber, JSON.stringify(snapshot), changeNote ?? null, createdBy ?? null],
    );
  }

  async list(tenantId: string, filters: { q?: string; status?: string; vacancyId?: string; isTemplate?: boolean; page?: number; limit?: number }) {
    const { q, status, vacancyId, isTemplate, page = 1, limit = 20 } = filters;
    let where = 'WHERE jd.tenant_id = $1 AND jd.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { where += ` AND jd.status = $${idx++}`; params.push(status); }
    if (vacancyId) { where += ` AND jd.vacancy_id = $${idx++}`; params.push(vacancyId); }
    if (isTemplate !== undefined) { where += ` AND jd.is_template = $${idx++}`; params.push(isTemplate); }
    if (q) { where += ` AND jd.title ILIKE $${idx++}`; params.push(`%${q}%`); }

    const countResult = await this.db.query(`SELECT COUNT(*) FROM job_descriptions jd ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (Number(page) - 1) * Number(limit);
    const dataResult = await this.db.query(
      `SELECT jd.*, v.title AS vacancy_title
       FROM job_descriptions jd
       LEFT JOIN vacancies v ON jd.vacancy_id = v.id
       ${where} ORDER BY jd.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), offset],
    );
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT jd.*, v.title AS vacancy_title
       FROM job_descriptions jd
       LEFT JOIN vacancies v ON jd.vacancy_id = v.id
       WHERE jd.id = $1 AND jd.tenant_id = $2 AND jd.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Job description not found');
    return rows[0];
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM job_descriptions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Job description not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, dto: CreateJobDescriptionDto) {
    const { rows } = await this.db.query(
      `INSERT INTO job_descriptions (
        tenant_id, vacancy_id, title, summary, responsibilities, kras, kpis, skills, competencies, benefits,
        qualifications, certifications, work_location, is_template, template_name, created_by, last_updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$16)
      RETURNING *`,
      [
        tenantId, dto.vacancy_id ?? null, dto.title, dto.summary ?? null, dto.responsibilities ?? null,
        JSON.stringify(dto.kras ?? []), JSON.stringify(dto.kpis ?? []), JSON.stringify(dto.skills ?? []),
        JSON.stringify(dto.competencies ?? []), JSON.stringify(dto.benefits ?? []),
        dto.qualifications ?? null, dto.certifications ?? null, dto.work_location ?? null,
        dto.is_template ?? false, dto.template_name ?? null, createdById,
      ],
    );
    const jd = rows[0];
    await this.writeVersion(tenantId, jd.id, 1, this.snapshotOf(jd), createdById, 'Initial version');
    return this.findOne(jd.id, tenantId);
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateJobDescriptionDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a job description with status '${existing.status}'`);
    }

    const { rows } = await this.db.query(
      `UPDATE job_descriptions SET
        title = COALESCE($3, title), vacancy_id = COALESCE($4, vacancy_id),
        summary = COALESCE($5, summary), responsibilities = COALESCE($6, responsibilities),
        kras = COALESCE($7::jsonb, kras), kpis = COALESCE($8::jsonb, kpis),
        skills = COALESCE($9::jsonb, skills), competencies = COALESCE($10::jsonb, competencies),
        benefits = COALESCE($11::jsonb, benefits),
        qualifications = COALESCE($12, qualifications), certifications = COALESCE($13, certifications),
        work_location = COALESCE($14, work_location),
        is_template = COALESCE($15, is_template), template_name = COALESCE($16, template_name),
        current_version = current_version + 1, last_updated_by = $17, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        id, tenantId, dto.title, dto.vacancy_id, dto.summary, dto.responsibilities,
        dto.kras ? JSON.stringify(dto.kras) : null, dto.kpis ? JSON.stringify(dto.kpis) : null,
        dto.skills ? JSON.stringify(dto.skills) : null, dto.competencies ? JSON.stringify(dto.competencies) : null,
        dto.benefits ? JSON.stringify(dto.benefits) : null,
        dto.qualifications, dto.certifications, dto.work_location,
        dto.is_template, dto.template_name, updatedById,
      ],
    );
    const jd = rows[0];
    await this.writeVersion(tenantId, id, jd.current_version, this.snapshotOf(jd), updatedById, dto.change_note);
    return this.findOne(id, tenantId);
  }

  async duplicate(id: string, tenantId: string, createdById: string) {
    const source = await this.getRaw(id, tenantId);
    return this.create(tenantId, createdById, {
      title: `${source.title} (Copy)`,
      vacancy_id: undefined,
      summary: source.summary, responsibilities: source.responsibilities,
      kras: source.kras, kpis: source.kpis, skills: source.skills, competencies: source.competencies, benefits: source.benefits,
      qualifications: source.qualifications, certifications: source.certifications, work_location: source.work_location,
      is_template: false, template_name: undefined,
    });
  }

  async archive(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status === 'pending_approval') {
      throw new BadRequestException('Cannot archive a job description while it is pending approval');
    }
    await this.db.query(`UPDATE job_descriptions SET status = 'archived', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return this.findOne(id, tenantId);
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'draft') throw new BadRequestException('Only draft job descriptions can be deleted');
    await this.db.query('UPDATE job_descriptions SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async listVersions(jobDescriptionId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT v.*, u.email AS created_by_email FROM job_description_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.job_description_id = $1 AND v.tenant_id = $2 ORDER BY v.version_number DESC`,
      [jobDescriptionId, tenantId],
    );
    return rows;
  }

  async restoreVersion(jobDescriptionId: string, tenantId: string, versionNumber: number, restoredById: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM job_description_versions WHERE job_description_id = $1 AND tenant_id = $2 AND version_number = $3',
      [jobDescriptionId, tenantId, versionNumber],
    );
    if (!rows.length) throw new NotFoundException('Version not found');
    const snap = rows[0].snapshot;
    return this.update(jobDescriptionId, tenantId, restoredById, { ...snap, change_note: `Restored from version ${versionNumber}` });
  }
}
