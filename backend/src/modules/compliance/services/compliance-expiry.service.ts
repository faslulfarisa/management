import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { SchedulerControlService } from '../../../shared/scheduler-control.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';

const THRESHOLDS = [90, 60, 30, 15, 7, 1, 0];

/**
 * Daily expiry sweep — mirrors the existing
 * ApprovalEngineService.processExpiredRequests() cron pattern. Matching on
 * an exact day-count threshold (rather than "<=") means each threshold fires
 * its notification exactly once per document as the cron runs daily.
 */
@Injectable()
export class ComplianceExpiryService {
  private readonly logger = new Logger(ComplianceExpiryService.name);

  constructor(
    private db: DatabaseService,
    private notifier: NotificationEmitterService,
    private schedulerControl: SchedulerControlService = new SchedulerControlService(),
  ) {}

  @Cron('11 1 1 * * *', { name: 'compliance-expiry-sweep' })
  async runDailySweep(): Promise<void> {
    await this.schedulerControl.run('compliance-expiry-sweep', async () => {
      await this.notifyThresholdCrossings();
      await this.transitionExpiredAndRenewalPending();
    });
  }

  private async notifyThresholdCrossings(): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT d.*, e.reporting_manager_id, ue.id AS employee_user_id, um.id AS manager_user_id
       FROM compliance_documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       LEFT JOIN users ue ON ue.employee_id = d.employee_id
       LEFT JOIN users um ON um.employee_id = e.reporting_manager_id
       WHERE d.status NOT IN ('archived','deleted')
         AND d.expiry_date IS NOT NULL
         AND (d.expiry_date - CURRENT_DATE) = ANY($1::int[])`,
      [THRESHOLDS],
    );

    for (const doc of rows) {
      const daysRemaining = Math.round((new Date(doc.expiry_date).getTime() - Date.now()) / 86400000);
      const userIds = [doc.owner_id, doc.employee_user_id, doc.manager_user_id].filter((v, i, arr) => v && arr.indexOf(v) === i);

      await this.notifier.emit(doc.tenant_id, {
        userIds: userIds.length ? userIds : undefined,
        title: daysRemaining <= 0 ? 'Document expiring today' : `Document expiring in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
        message: `"${doc.title}" is due to expire on ${new Date(doc.expiry_date).toLocaleDateString()}.`,
        type: daysRemaining <= 7 ? 'warning' : 'info',
        priority: daysRemaining <= 7 ? 'high' : 'medium',
        sourceModule: 'compliance',
        entityType: 'compliance_document',
        entityId: doc.id,
        branchId: doc.branch_id ?? undefined,
        departmentId: doc.department_id ?? undefined,
        actionUrl: `/dashboard/compliance/expiring`,
      });
    }

    if (rows.length) this.logger.log(`Compliance expiry sweep: notified ${rows.length} threshold crossing(s)`);
  }

  private async transitionExpiredAndRenewalPending(): Promise<void> {
    await this.db.query(
      `UPDATE compliance_documents SET status = 'renewal_pending', updated_at = now()
       WHERE status NOT IN ('renewal_pending','expired','archived','deleted')
         AND expiry_date IS NOT NULL
         AND expiry_date < CURRENT_DATE
         AND CURRENT_DATE <= expiry_date + grace_period_days * INTERVAL '1 day'`,
    );

    await this.db.query(
      `UPDATE compliance_documents SET status = 'expired', updated_at = now()
       WHERE status NOT IN ('expired','archived','deleted')
         AND expiry_date IS NOT NULL
         AND CURRENT_DATE > expiry_date + grace_period_days * INTERVAL '1 day'`,
    );
  }
}
