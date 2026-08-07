import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalGateway } from '../../approvals/gateways/approval.gateway';

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'critical' | 'approval' | 'system';

export interface EmitNotificationInput {
  /** Specific recipients. If omitted, a single tenant-wide broadcast row (user_id = NULL) is created. */
  userIds?: string[];
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  sourceModule?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  departmentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Generic helper for creating persisted notifications and pushing them
 * over the existing `/approvals` socket.io namespace in real time.
 */
@Injectable()
export class NotificationEmitterService {
  constructor(
    private db: DatabaseService,
    @Optional() private gateway?: ApprovalGateway,
  ) {}

  async emit(tenantId: string, input: EmitNotificationInput) {
    const {
      userIds, title, message, type = 'info', priority = 'medium',
      sourceModule, actionUrl, entityType, entityId, branchId, departmentId, metadata = {},
    } = input;

    const targets = userIds?.length ? userIds : [null];
    const rows: any[] = [];

    for (const userId of targets) {
      const { rows: inserted } = await this.db.query(
        `INSERT INTO notifications
           (tenant_id, user_id, title, message, type, source_module, priority,
            action_url, entity_type, entity_id, branch_id, department_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [tenantId, userId, title, message, type, sourceModule || null, priority,
          actionUrl || null, entityType || null, entityId || null, branchId || null,
          departmentId || null, JSON.stringify(metadata)],
      );
      rows.push(inserted[0]);
    }

    this.gateway?.broadcastNotification(tenantId, rows[0] ? rows : { title, message, type, priority }, userIds);
    return rows;
  }
}
