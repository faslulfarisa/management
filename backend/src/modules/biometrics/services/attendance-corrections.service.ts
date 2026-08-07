import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AttendanceAuditService } from './attendance-audit.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';

export interface CreateCorrectionDto {
  employeeId: string;
  attendanceRecordId: string;
  requestedState: Record<string, any>;
  reason?: string;
}

@Injectable()
export class AttendanceCorrectionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AttendanceAuditService,
    @Inject(forwardRef(() => ApprovalEngineService))
    private readonly approvalEngine: ApprovalEngineService,
    private readonly payrollLock: PayrollLockService,
  ) {}

  async create(
    tenantId: string,
    requestedBy: string,
    dto: CreateCorrectionDto,
  ) {
    const { rows: records } = await this.db.query(
      `SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2`,
      [dto.attendanceRecordId, tenantId],
    );
    if (!records[0]) {
      throw new NotFoundException(
        `Attendance record '${dto.attendanceRecordId}' not found`,
      );
    }

    await this.payrollLock.assertPeriodUnlocked(tenantId, dto.employeeId, records[0].date);

    const { rows } = await this.db.query(
      `INSERT INTO attendance_corrections
         (tenant_id, employee_id, attendance_record_id,
          requested_by, status, original_state, requested_state, reason)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        dto.employeeId,
        dto.attendanceRecordId,
        requestedBy,
        JSON.stringify(records[0]),
        JSON.stringify(dto.requestedState),
        dto.reason ?? null,
      ],
    );

    await this.audit.write({
      tenantId,
      employeeId: dto.employeeId,
      attendanceRecordId: dto.attendanceRecordId,
      eventType: 'manual_correction',
      actorType: 'user',
      actorId: requestedBy,
      beforeState: records[0],
      afterState: dto.requestedState,
      metadata: { correctionId: rows[0].id, reason: dto.reason },
    });

    // Look up employee branch for approval chain
    const { rows: empRows } = await this.db.query(
      'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [dto.employeeId, tenantId],
    );

    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'attendance_correction',
      entityId: rows[0].id,
      entityTable: 'attendance_corrections',
      submittedBy: requestedBy,
      branchId: empRows[0]?.branch_id ?? null,
      title: `Attendance correction for ${dto.attendanceRecordId}`,
      description: dto.reason,
      metadata: { attendance_record_id: dto.attendanceRecordId, employee_id: dto.employeeId },
    });

    return rows[0];
  }

  async approve(tenantId: string, correctionId: string, approvedBy: string, reason: string) {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM attendance_corrections
         WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [correctionId, tenantId],
      );
      if (!rows[0]) {
        throw new NotFoundException(`Correction '${correctionId}' not found or not pending`);
      }
      const correction = rows[0];

      // Delegate approval step/status to engine (uses same transaction client)
      const result = await this.approvalEngine.approveByEntity(
        correctionId, 'attendance_corrections', tenantId, approvedBy, reason,
      );

      // Apply attendance record change only on full approval
      if (result.fullyApproved) {
        const requested = correction.requested_state as Record<string, any>;
        const allowedFields = ['clock_in', 'clock_out', 'status', 'total_work_minutes', 'overtime_minutes', 'late_minutes'];
        const setClauses = allowedFields
          .filter((f) => requested[f] !== undefined)
          .map((f, i) => `${f} = $${i + 3}`)
          .join(', ');
        const setValues = allowedFields.filter((f) => requested[f] !== undefined).map((f) => requested[f]);

        if (setClauses) {
          await client.query(
            `UPDATE attendance_records SET ${setClauses}, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [correction.attendance_record_id, tenantId, ...setValues],
          );
        }

        await client.query(
          `UPDATE attendance_corrections SET applied_at = NOW() WHERE id = $1`,
          [correctionId],
        );

        await this.audit.write({
          tenantId,
          employeeId: correction.employee_id,
          attendanceRecordId: correction.attendance_record_id,
          eventType: 'approval_granted',
          actorType: 'user',
          actorId: approvedBy,
          beforeState: correction.original_state,
          afterState: correction.requested_state,
          metadata: { correctionId },
        });
      }

      return result;
    });
  }

  async reject(
    tenantId: string,
    correctionId: string,
    rejectedBy: string,
    reason: string,
  ) {
    const result = await this.approvalEngine.rejectByEntity(
      correctionId, 'attendance_corrections', tenantId, rejectedBy, reason,
    );

    const { rows } = await this.db.query(
      'SELECT * FROM attendance_corrections WHERE id = $1 AND tenant_id = $2',
      [correctionId, tenantId],
    );

    if (rows[0]) {
      await this.audit.write({
        tenantId,
        employeeId: rows[0].employee_id,
        attendanceRecordId: rows[0].attendance_record_id,
        eventType: 'approval_rejected',
        actorType: 'user',
        actorId: rejectedBy,
        metadata: { correctionId, reason },
      });
    }

    return result;
  }

  async listPending(tenantId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { rows } = await this.db.query(
      `SELECT ac.*,
              e.first_name || ' ' || e.last_name AS employee_name,
              e.employee_code
       FROM attendance_corrections ac
       LEFT JOIN employees e ON e.id = ac.employee_id
       WHERE ac.tenant_id = $1 AND ac.status = 'pending'
       ORDER BY ac.requested_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    const { rows: countRows } = await this.db.query(
      `SELECT COUNT(*) AS total FROM attendance_corrections
       WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId],
    );
    return { items: rows, total: parseInt(countRows[0].total, 10), page, limit };
  }
}
