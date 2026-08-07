import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { ExitTimelineService } from './exit-timeline.service';

@Injectable()
export class ExitKnowledgeTransferService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly timeline: ExitTimelineService,
  ) {}

  async get(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT ekt.*, e.first_name, e.last_name FROM exit_knowledge_transfers ekt
       LEFT JOIN employees e ON ekt.handover_to = e.id
       WHERE ekt.tenant_id = $1 AND ekt.exit_request_id = $2`,
      [tenantId, exitRequestId],
    );
    return rows[0] ?? null;
  }

  /** Employee submits/updates their handover notes. No password/credential fields, by design. */
  async submit(tenantId: string, exitRequestId: string, employeeId: string, data: {
    handover_to?: string; responsibilities?: string; current_projects?: string;
    pending_tasks?: string; client_information?: string; system_access?: string;
  }, finalize: boolean) {
    const existing = await this.get(tenantId, exitRequestId);
    const status = finalize ? 'submitted' : 'pending';
    const submittedAt = finalize ? new Date().toISOString() : null;

    let row;
    if (existing) {
      const { rows } = await this.db.query(
        `UPDATE exit_knowledge_transfers
         SET handover_to = $1, responsibilities = $2, current_projects = $3, pending_tasks = $4,
             client_information = $5, system_access = $6, status = $7,
             submitted_at = COALESCE($8::timestamptz, submitted_at),
             updated_at = now()
         WHERE id = $9 RETURNING *`,
        [data.handover_to ?? null, data.responsibilities ?? null, data.current_projects ?? null,
          data.pending_tasks ?? null, data.client_information ?? null, data.system_access ?? null, status, submittedAt, existing.id],
      );
      row = rows[0];
    } else {
      const { rows } = await this.db.query(
        `INSERT INTO exit_knowledge_transfers
           (tenant_id, exit_request_id, handover_to, responsibilities, current_projects, pending_tasks,
            client_information, system_access, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [tenantId, exitRequestId, data.handover_to ?? null, data.responsibilities ?? null, data.current_projects ?? null,
          data.pending_tasks ?? null, data.client_information ?? null, data.system_access ?? null, status, submittedAt],
      );
      row = rows[0];
    }

    if (finalize) {
      await this.timeline.record(tenantId, exitRequestId, 'knowledge_transfer_submitted', employeeId);
    }
    return row;
  }

  async review(tenantId: string, exitRequestId: string, reviewerId: string, approved: boolean, remarks?: string) {
    const existing = await this.get(tenantId, exitRequestId);
    if (!existing) throw new NotFoundException('Knowledge transfer not submitted yet');
    if (existing.status !== 'submitted') {
      throw new BadRequestException('Knowledge transfer must be submitted before it can be reviewed');
    }

    const { rows } = await this.db.query(
      `UPDATE exit_knowledge_transfers
       SET status = $1, reviewed_by = $2, reviewed_at = now(), review_remarks = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [approved ? 'approved' : 'submitted', reviewerId, remarks ?? null, existing.id],
    );

    if (approved) {
      await this.timeline.record(tenantId, exitRequestId, 'knowledge_transfer_approved', reviewerId, remarks);
    }
    return rows[0];
  }
}
