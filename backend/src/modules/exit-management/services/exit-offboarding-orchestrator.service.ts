import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';
import { UserService } from '../../platform/services/user.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { LeaveService } from '../../hr/services/leave.service';
import { ExitTimelineService } from './exit-timeline.service';
import { ExitRequestService } from './exit-request.service';
import { toDateOnlyString } from '../utils/notice-period.util';

interface Actor {
  sub: string;
  isSuperAdmin: boolean;
  userType: string;
}

/** Maps an exit request's resignation type to the global deactivation_reasons.code used to deactivate the linked user account. */
const REQUEST_TYPE_TO_DEACTIVATION_CODE: Record<string, string> = {
  resignation: 'resigned',
  retirement: 'retired',
  termination: 'terminated',
  contract_completion: 'contract_ended',
  mutual_separation: 'resigned',
  absconding: 'terminated',
};

const REQUEST_TYPE_TO_EMPLOYEE_STATUS: Record<string, string> = {
  resignation: 'resigned',
  retirement: 'retired',
  termination: 'terminated',
  contract_completion: 'terminated',
  mutual_separation: 'resigned',
  absconding: 'terminated',
};

/**
 * Runs once a Full & Final settlement is fully approved: freezes attendance
 * /payroll for the exit period, finalizes leave encashment, deactivates the
 * employee's user account (sessions revoked, MFA cleared), updates employee
 * status, and marks the exit request completed. No manual steps required
 * beyond the settlement approval that triggers it.
 */
@Injectable()
export class ExitOffboardingOrchestratorService {
  constructor(
    private readonly db: DatabaseService,
    private readonly payrollLock: PayrollLockService,
    private readonly userService: UserService,
    private readonly auditLog: AuditLogService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly leaveService: LeaveService,
    private readonly timeline: ExitTimelineService,
    private readonly exitRequestService: ExitRequestService,
  ) {}

  async finalize(tenantId: string, exitRequestId: string, actor: Actor, ip?: string, userAgent?: string) {
    const { rows: erRows } = await this.db.query(
      `SELECT er.*, e.id AS employee_pk FROM exit_requests er JOIN employees e ON er.employee_id = e.id
       WHERE er.id = $1 AND er.tenant_id = $2`,
      [exitRequestId, tenantId],
    );
    if (!erRows.length) throw new BadRequestException('Exit request not found');
    const exitRequest = erRows[0];
    const employeeId = exitRequest.employee_id;

    if (exitRequest.account_deactivated_at) {
      return exitRequest;
    }

    // 1. Finalize leave encashment (mutates balances; the FnF preview only read them)
    await this.leaveService.processExitEncashment(tenantId, employeeId, exitRequestId, actor.sub);

    // 2. Freeze attendance/payroll for the exit period
    const lastWorkingDate = toDateOnlyString(exitRequest.last_working_date);
    const [year, month] = lastWorkingDate.split('-').map(Number);
    try {
      await this.payrollLock.lock(
        tenantId, year, month, { type: 'employee', employeeIds: [employeeId] }, actor.sub,
        `Offboarding — exit request ${exitRequestId}`,
      );
    } catch {
      // No approved summary to lock for this period (e.g. already locked, or none generated yet) — non-fatal to offboarding.
    }
    await this.exitRequestService.markAttendanceFrozen(tenantId, exitRequestId);
    await this.timeline.record(tenantId, exitRequestId, 'attendance_frozen', actor.sub);

    // 3. Deactivate the linked user account (revokes sessions, clears MFA state via UserService.deactivate)
    const { rows: userRows } = await this.db.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 LIMIT 1',
      [tenantId, employeeId],
    );
    if (userRows.length) {
      const code = REQUEST_TYPE_TO_DEACTIVATION_CODE[exitRequest.request_type] ?? 'resigned';
      const { rows: reasonRows } = await this.db.query(
        `SELECT id FROM deactivation_reasons WHERE code = $1 AND is_active = true AND (tenant_id IS NULL OR tenant_id = $2) LIMIT 1`,
        [code, tenantId],
      );
      if (reasonRows.length) {
        await this.userService.deactivate(
          userRows[0].id, tenantId, reasonRows[0].id,
          `Offboarding completed for exit request ${exitRequestId}`, actor, ip, userAgent,
        );
        await this.exitRequestService.markAccountDeactivated(tenantId, exitRequestId);
        await this.timeline.record(tenantId, exitRequestId, 'account_deactivated', actor.sub);
      }
    }

    // 4. Employee status -> resigned/terminated/retired (archival: status-based, record retained in place)
    const employeeStatus = REQUEST_TYPE_TO_EMPLOYEE_STATUS[exitRequest.request_type] ?? 'resigned';
    await this.db.query('UPDATE employees SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3', [employeeStatus, employeeId, tenantId]);

    // 5. Complete the exit request
    await this.exitRequestService.markCompleted(tenantId, exitRequestId);
    await this.timeline.record(tenantId, exitRequestId, 'completed', actor.sub);

    await this.auditLog.log({
      tenantId, userId: actor.sub, entityType: 'exit_request', entityId: exitRequestId,
      action: 'offboarding_completed', newValues: { employee_status: employeeStatus },
      ipAddress: ip, userAgent,
    });

    await this.notificationEmitter.emit(tenantId, {
      userIds: await this.resolveHrAndManagerIds(tenantId, employeeId),
      title: 'Offboarding completed',
      message: `Offboarding for employee ${employeeId} has been completed.`,
      type: 'success', sourceModule: 'exit_management',
      entityType: 'exit_request', entityId: exitRequestId,
    });

    return this.exitRequestService.getById(tenantId, exitRequestId);
  }

  private async resolveHrAndManagerIds(tenantId: string, employeeId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT u.id FROM users u
       JOIN employees e ON u.employee_id = e.reporting_manager_id
       WHERE e.id = $1 AND e.tenant_id = $2
       UNION
       SELECT DISTINCT user_id AS id FROM user_tenants WHERE tenant_id = $2 AND is_org_admin = true`,
      [employeeId, tenantId],
    );
    return rows.map((r: any) => r.id);
  }
}
