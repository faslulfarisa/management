import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

export type ExitStage =
  | 'submitted'
  | 'manager_approved'
  | 'hr_approved'
  | 'org_admin_approved'
  | 'rejected'
  | 'withdrawn'
  | 'notice_period_started'
  | 'knowledge_transfer_submitted'
  | 'knowledge_transfer_approved'
  | 'checklist_completed'
  | 'clearance_cleared'
  | 'clearances_completed'
  | 'asset_recovered'
  | 'assets_completed'
  | 'interview_completed'
  | 'settlement_calculated'
  | 'settlement_approved'
  | 'settlement_paid'
  | 'attendance_frozen'
  | 'account_deactivated'
  | 'completed';

const STAGE_LABELS: Record<ExitStage, string> = {
  submitted: 'Exit request submitted',
  manager_approved: 'Approved by reporting manager',
  hr_approved: 'Approved by HR',
  org_admin_approved: 'Approved by organization admin',
  rejected: 'Exit request rejected',
  withdrawn: 'Exit request withdrawn',
  notice_period_started: 'Notice period started',
  knowledge_transfer_submitted: 'Knowledge transfer submitted',
  knowledge_transfer_approved: 'Knowledge transfer approved',
  checklist_completed: 'Exit checklist completed',
  clearance_cleared: 'Department clearance cleared',
  clearances_completed: 'All department clearances completed',
  asset_recovered: 'Asset recovered',
  assets_completed: 'All assets recovered',
  interview_completed: 'Exit interview completed',
  settlement_calculated: 'Full & Final settlement calculated',
  settlement_approved: 'Full & Final settlement approved',
  settlement_paid: 'Full & Final settlement paid',
  attendance_frozen: 'Attendance and payroll frozen',
  account_deactivated: 'User account deactivated',
  completed: 'Offboarding completed',
};

/**
 * Append-only stage history for an exit request, independent of the
 * approval-engine's own approval_log — this is what renders the visual
 * offboarding timeline regardless of which sub-system drove a transition.
 */
@Injectable()
export class ExitTimelineService {
  constructor(private readonly db: DatabaseService) {}

  async record(
    tenantId: string,
    exitRequestId: string,
    stage: ExitStage,
    actorId?: string | null,
    description?: string,
    metadata: Record<string, any> = {},
  ) {
    const { rows } = await this.db.query(
      `INSERT INTO exit_timeline_events
         (tenant_id, exit_request_id, stage, label, description, actor_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [tenantId, exitRequestId, stage, STAGE_LABELS[stage], description ?? null, actorId ?? null, JSON.stringify(metadata)],
    );
    return rows[0];
  }

  async getTimeline(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT ete.*, u.email AS actor_email
       FROM exit_timeline_events ete
       LEFT JOIN users u ON u.id = ete.actor_id
       WHERE ete.tenant_id = $1 AND ete.exit_request_id = $2
       ORDER BY ete.created_at ASC`,
      [tenantId, exitRequestId],
    );
    return rows;
  }
}
