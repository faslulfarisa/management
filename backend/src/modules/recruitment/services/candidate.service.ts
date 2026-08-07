import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../../shared/database.service';

function dedupHash(email: string, phone?: string | null): string {
  const normalized = `${email.trim().toLowerCase()}|${(phone || '').replace(/\D/g, '')}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export interface CandidateContactInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  current_company?: string;
  current_designation?: string;
  experience_years?: number;
  expected_salary?: number;
  source?: string;
  date_of_birth?: string;
  gender?: string;
  address?: any;
  education?: any[];
  experience?: any[];
  skills?: any[];
  certifications?: any[];
  notes?: string;
}

@Injectable()
export class CandidateService {
  constructor(private db: DatabaseService) {}

  async list(tenantId: string, filters: { q?: string; tag?: string; source?: string; page?: number; limit?: number }) {
    const { q, tag, source, page = 1, limit = 20 } = filters;
    let where = 'WHERE c.tenant_id = $1 AND c.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;
    if (q) { where += ` AND (c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.email ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
    if (tag) { where += ` AND $${idx++} = ANY(c.tags)`; params.push(tag); }
    if (source) { where += ` AND c.source = $${idx++}`; params.push(source); }

    const offset = (Number(page) - 1) * Number(limit);
    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM candidates c ${where}`, params),
      this.db.query(
        `SELECT c.*, COUNT(a.id)::int AS application_count
         FROM candidates c
         LEFT JOIN applications a ON a.candidate_id = c.id AND a.deleted_at IS NULL
         ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);
    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM candidates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Candidate not found');
    return rows[0];
  }

  /** Used by both internal "Add Candidate" and the public Career Portal apply flow — same dedup logic either way. */
  async findOrCreateByContact(tenantId: string, input: CandidateContactInput, createdBy?: string | null) {
    if (!input.email?.trim()) throw new BadRequestException('Email is required');
    const hash = dedupHash(input.email, input.phone);

    const { rows: existing } = await this.db.query(
      'SELECT * FROM candidates WHERE tenant_id = $1 AND dedup_hash = $2 AND deleted_at IS NULL LIMIT 1',
      [tenantId, hash],
    );
    if (existing.length) {
      // Refresh profile fields with the latest submission (e.g. re-applying with an updated resume/profile).
      const { rows } = await this.db.query(
        `UPDATE candidates SET
           first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name), phone = COALESCE($5, phone),
           current_company = COALESCE($6, current_company), current_designation = COALESCE($7, current_designation),
           experience_years = COALESCE($8, experience_years), expected_salary = COALESCE($9, expected_salary),
           date_of_birth = COALESCE($10, date_of_birth), gender = COALESCE($11, gender),
           address = COALESCE($12::jsonb, address), education = COALESCE($13::jsonb, education),
           experience = COALESCE($14::jsonb, experience), skills = COALESCE($15::jsonb, skills),
           certifications = COALESCE($16::jsonb, certifications), updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [
          existing[0].id, tenantId, input.first_name, input.last_name, input.phone,
          input.current_company, input.current_designation, input.experience_years, input.expected_salary,
          input.date_of_birth, input.gender,
          input.address ? JSON.stringify(input.address) : null, input.education ? JSON.stringify(input.education) : null,
          input.experience ? JSON.stringify(input.experience) : null, input.skills ? JSON.stringify(input.skills) : null,
          input.certifications ? JSON.stringify(input.certifications) : null,
        ],
      );
      return { candidate: rows[0], isNew: false };
    }

    const { rows } = await this.db.query(
      `INSERT INTO candidates (
        tenant_id, first_name, last_name, email, phone, current_company, current_designation,
        experience_years, expected_salary, source, dedup_hash, date_of_birth, gender,
        address, education, experience, skills, certifications, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19,$20)
      RETURNING *`,
      [
        tenantId, input.first_name, input.last_name, input.email.trim().toLowerCase(), input.phone ?? null,
        input.current_company ?? null, input.current_designation ?? null, input.experience_years ?? null,
        input.expected_salary ?? null, input.source ?? 'manual', hash, input.date_of_birth ?? null, input.gender ?? null,
        JSON.stringify(input.address ?? {}), JSON.stringify(input.education ?? []), JSON.stringify(input.experience ?? []),
        JSON.stringify(input.skills ?? []), JSON.stringify(input.certifications ?? []), input.notes ?? null, createdBy ?? null,
      ],
    );
    return { candidate: rows[0], isNew: true };
  }

  async update(id: string, tenantId: string, data: Partial<CandidateContactInput> & { tags?: string[] }) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      `UPDATE candidates SET
         first_name = COALESCE($3, first_name), last_name = COALESCE($4, last_name), phone = COALESCE($5, phone),
         current_company = COALESCE($6, current_company), current_designation = COALESCE($7, current_designation),
         experience_years = COALESCE($8, experience_years), expected_salary = COALESCE($9, expected_salary),
         notes = COALESCE($10, notes), tags = COALESCE($11, tags), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.first_name, data.last_name, data.phone, data.current_company, data.current_designation,
        data.experience_years, data.expected_salary, data.notes, data.tags ?? null],
    );
    return rows[0];
  }

  async softDelete(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.db.query('UPDATE candidates SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }
}
