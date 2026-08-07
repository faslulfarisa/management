import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { UpsertVerificationDto } from '../dto/verification.dto';

@Injectable()
export class VerificationService {
  constructor(private db: DatabaseService) {}

  async list(applicationId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT v.*, u.email AS reviewer_email FROM candidate_verifications v
       LEFT JOIN users u ON u.id = v.reviewer_id
       WHERE v.application_id = $1 AND v.tenant_id = $2
       ORDER BY v.verification_type ASC`,
      [applicationId, tenantId],
    );
    return rows;
  }

  /** One row per (application, verification_type) — created on first save, updated thereafter. */
  async upsert(applicationId: string, tenantId: string, reviewerId: string, dto: UpsertVerificationDto) {
    const { rows: appRows } = await this.db.query('SELECT id FROM applications WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [applicationId, tenantId]);
    if (!appRows.length) throw new NotFoundException('Application not found');

    const isReviewing = dto.status !== undefined && dto.status !== 'pending';

    const { rows } = await this.db.query(
      `INSERT INTO candidate_verifications (
         tenant_id, application_id, verification_type, status, details, comments, reviewer_id, reviewed_at, created_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$7)
       ON CONFLICT (application_id, verification_type) DO UPDATE SET
         status = EXCLUDED.status, details = EXCLUDED.details, comments = EXCLUDED.comments,
         reviewer_id = CASE WHEN $9 THEN EXCLUDED.reviewer_id ELSE candidate_verifications.reviewer_id END,
         reviewed_at = CASE WHEN $9 THEN now() ELSE candidate_verifications.reviewed_at END,
         updated_at = now()
       RETURNING *`,
      [
        tenantId, applicationId, dto.verification_type, dto.status ?? 'pending',
        JSON.stringify(dto.details ?? {}), dto.comments ?? null, reviewerId,
        isReviewing ? new Date() : null, isReviewing,
      ],
    );
    return rows[0];
  }
}
