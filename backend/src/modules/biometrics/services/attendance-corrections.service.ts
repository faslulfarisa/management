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
  employeeId?: string;
  attendanceRecordId?: string;
  attendance_record_id?: string;
  correction_type?: string;
  requestedState?: Record<string, any>;
  requested_clock_in?: string;
  requested_clock_out?: string;
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
    const attendanceRecordId = dto.attendanceRecordId ?? dto.attendance_record_id;
    if (!attendanceRecordId) {
      throw new BadRequestException('attendance_record_id is required');
    }

    const { rows: records } = await this.db.query(
      `SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2`,
      [attendanceRecordId, tenantId],
    );
    if (!records[0]) {
      throw new NotFoundException(
        `Attendance record '${attendanceRecordId}' not found`,
      );
    }

    const employeeId = dto.employeeId ?? records[0].employee_id;
    const requestedState = dto.requestedState ?? this.buildRequestedState(dto);
    if (!Object.keys(requestedState).length) {
      throw new BadRequestException('At least one correction field is required');
    }

    await this.payrollLock.assertPeriodUnlocked(tenantId, employeeId, records[0].date);

    const { rows } = await this.db.query(
      `INSERT INTO attendance_corrections
         (tenant_id, employee_id, attendance_record_id,
          requested_by, status, original_state, requested_state, reason)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        employeeId,
        attendanceRecordId,
        requestedBy,
        JSON.stringify(records[0]),
        JSON.stringify(requestedState),
        dto.reason ?? null,
      ],
    );

    await this.audit.write({
      tenantId,
      employeeId,
      attendanceRecordId,
      eventType: 'manual_correction',
      actorType: 'user',
      actorId: requestedBy,
      beforeState: records[0],
      afterState: requestedState,
      metadata: { correctionId: rows[0].id, reason: dto.reason },
    });

    // Look up employee branch for approval chain
    const { rows: empRows } = await this.db.query(
      'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );

    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'attendance_correction',
      entityId: rows[0].id,
      entityTable: 'attendance_corrections',
      submittedBy: requestedBy,
      branchId: empRows[0]?.branch_id ?? null,
      title: `Attendance correction for ${attendanceRecordId}`,
      description: dto.reason,
      metadata: { attendance_record_id: attendanceRecordId, employee_id: employeeId },
    });

    return rows[0];
  }

  async approve(tenantId: string, correctionId: string, approvedBy: string, reason: string) {
    return this.approvalEngine.approveByEntity(
      correctionId, 'attendance_corrections', tenantId, approvedBy, reason,
    );
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

  private buildRequestedState(dto: CreateCorrectionDto): Record<string, any> {
    const requestedState: Record<string, any> = {};
    if ((dto.correction_type === 'clock_in' || dto.correction_type === 'both') && dto.requested_clock_in) {
      requestedState.clock_in = dto.requested_clock_in;
    }
    if ((dto.correction_type === 'clock_out' || dto.correction_type === 'both') && dto.requested_clock_out) {
      requestedState.clock_out = dto.requested_clock_out;
    }
    return requestedState;
  }
}
