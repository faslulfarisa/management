import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { UpsertScreeningDto } from '../dto/pipeline.dto';

@Injectable()
export class ScreeningService {
  constructor(private db: DatabaseService) {}

  async get(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT s.*, u.email AS screened_by_email
       FROM candidate_screenings s
       LEFT JOIN users u ON u.id = s.screened_by
       WHERE s.application_id = $1 AND s.tenant_id = $2`,
      [applicationId, tenantId],
    );
    return rows[0] ?? null;
  }

  /** One screening per application — created on first save, updated thereafter. */
  async upsert(applicationId: string, tenantId: string, screenedById: string, dto: UpsertScreeningDto) {
    const { rows: appRows } = await this.db.query('SELECT id FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [applicationId, tenantId]);
    if (!appRows.length) throw new NotFoundException('Application not found');

    const { rows } = await this.db.query(
      `INSERT INTO candidate_screenings (
         tenant_id, application_id, current_salary, expected_salary, notice_period_days,
         availability_date, communication_rating, recommendation, notes, screened_by, screened_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (application_id) DO UPDATE SET
         current_salary = EXCLUDED.current_salary, expected_salary = EXCLUDED.expected_salary,
         notice_period_days = EXCLUDED.notice_period_days, availability_date = EXCLUDED.availability_date,
         communication_rating = EXCLUDED.communication_rating, recommendation = EXCLUDED.recommendation,
         notes = EXCLUDED.notes, screened_by = EXCLUDED.screened_by, screened_at = now(), updated_at = now()
       RETURNING *`,
      [
        tenantId, applicationId, dto.current_salary ?? null, dto.expected_salary ?? null, dto.notice_period_days ?? null,
        dto.availability_date ?? null, dto.communication_rating ?? null, dto.recommendation ?? null, dto.notes ?? null, screenedById,
      ],
    );
    return rows[0];
  }
}
