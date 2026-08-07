import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CreateShiftOverrideRequestDto, ApproveShiftOverrideRequestDto } from '../dto/shift-override.dto';

@Injectable()
export class ShiftOverrideService {
  constructor(
    private readonly db: DatabaseService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly auditLog: AuditLogService,
    private readonly emitter: NotificationEmitterService,
  ) {}

  async submitRequest(tenantId: string, userId: string, actorEmployeeId: string | null | undefined, data: CreateShiftOverrideRequestDto) {
    const employeeId = data.employee_id || actorEmployeeId;
    if (!employeeId) {
      throw new BadRequestException('Employee context is required before submitting a shift override request');
    }

    if (data.end_date < data.start_date) {
      throw new BadRequestException('End date cannot be before start date');
    }

    // 1. Validate employee exists
    const { rows: empRows } = await this.db.query(
      'SELECT id, branch_id, department_id, first_name, last_name FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );
    if (!empRows.length) throw new NotFoundException('Employee not found');
    const employee = empRows[0];

    if (data.current_shift_id) {
      const { rows: shiftRows } = await this.db.query(
        'SELECT id FROM shift_definitions WHERE id = $1 AND tenant_id = $2 AND is_active = true',
        [data.current_shift_id, tenantId],
      );
      if (!shiftRows.length) {
        throw new BadRequestException('Current shift is not available for this organization');
      }
    }

    // 2. Prevent duplicate override requests for overlapping date range
    const { rows: dupRows } = await this.db.query(
      `SELECT id FROM shift_override_requests 
       WHERE tenant_id = $1 AND employee_id = $2 
         AND status NOT IN ('rejected', 'cancelled')
         AND start_date <= $4 AND end_date >= $3`,
      [tenantId, employeeId, data.start_date, data.end_date],
    );
    if (dupRows.length) {
      throw new BadRequestException('An active shift override request already exists for this date range');
    }

    // 3. Prevent overriding completed shifts (shifts in the past relative to current date)
    const today = new Date().toISOString().slice(0, 10);
    if (data.start_date < today) {
      throw new BadRequestException('Cannot request overrides for past or completed shifts');
    }

    // 4. Create the request
    const { rows: reqRows } = await this.db.query(
      `INSERT INTO shift_override_requests 
         (tenant_id, employee_id, start_date, end_date, current_shift_id, 
          reason_category, detailed_reason, supporting_documents, urgency, preferred_action, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        employeeId,
        data.start_date,
        data.end_date,
        data.current_shift_id || null,
        data.reason_category,
        data.detailed_reason,
        data.supporting_documents || [],
        data.urgency || 'medium',
        data.preferred_action || null,
        data.remarks || null,
      ],
    );
    const request = reqRows[0];

    // 5. Submit to approval engine
    const title = `Shift Override: ${employee.first_name} ${employee.last_name} (${data.start_date} to ${data.end_date})`;
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'shift_override',
      entityId: request.id,
      entityTable: 'shift_override_requests',
      submittedBy: userId,
      branchId: employee.branch_id,
      departmentId: employee.department_id,
      title,
      description: data.detailed_reason,
      metadata: {
        employee_id: employeeId,
        start_date: data.start_date,
        end_date: data.end_date,
      },
      priority: data.priority || 'normal',
    });

    // 6. Log audit log
    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'shift_override_request',
      entityId: request.id,
      action: 'created',
      newValues: request,
    });

    return request;
  }

  async getRequests(tenantId: string, filters: any) {
    const { employee_id, status, date_from, date_to, limit = 20, page = 1 } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT sor.*, e.first_name, e.last_name, e.employee_code,
             sd.name as current_shift_name
      FROM shift_override_requests sor
      JOIN employees e ON sor.employee_id = e.id
      LEFT JOIN shift_definitions sd ON sor.current_shift_id = sd.id
      WHERE sor.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (employee_id) {
      query += ` AND sor.employee_id = $${idx++}`;
      params.push(employee_id);
    }
    if (status) {
      query += ` AND sor.status = $${idx++}`;
      params.push(status);
    }
    if (date_from) {
      query += ` AND sor.start_date >= $${idx++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND sor.end_date <= $${idx++}`;
      params.push(date_to);
    }

    query += ` ORDER BY sor.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    
    let countQuery = `
      SELECT COUNT(*) FROM shift_override_requests sor
      WHERE sor.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countIdx = 2;
    if (employee_id) { countQuery += ` AND sor.employee_id = $${countIdx++}`; countParams.push(employee_id); }
    if (status) { countQuery += ` AND sor.status = $${countIdx++}`; countParams.push(status); }
    if (date_from) { countQuery += ` AND sor.start_date >= $${countIdx++}`; countParams.push(date_from); }
    if (date_to) { countQuery += ` AND sor.end_date <= $${countIdx++}`; countParams.push(date_to); }

    const [{ rows: data }, { rows: countResult }] = await Promise.all([
      this.db.query(query, [...params, Number(limit), offset]),
      this.db.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult[0].count, 10);
    return { data, total, pages: Math.ceil(total / Number(limit)) };
  }

  async getById(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT sor.*, e.first_name, e.last_name, e.employee_code,
              sd.name as current_shift_name
       FROM shift_override_requests sor
       JOIN employees e ON sor.employee_id = e.id
       LEFT JOIN shift_definitions sd ON sor.current_shift_id = sd.id
       WHERE sor.id = $1 AND sor.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Shift override request not found');
    return rows[0];
  }

  async validateReplacementEmployee(tenantId: string, replacementId: string, startDate: string, endDate: string) {
    if (!replacementId) throw new BadRequestException('Replacement employee is required');
    if (!startDate || !endDate) throw new BadRequestException('Start date and end date are required to validate replacement availability');
    if (endDate < startDate) throw new BadRequestException('End date cannot be before start date');

    // 1. Get employee details
    const { rows: empRows } = await this.db.query(
      `SELECT e.id, e.first_name, e.last_name, e.branch_id, e.department_id,
              d.name as department_name, b.name as branch_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [replacementId, tenantId],
    );
    if (!empRows.length) throw new NotFoundException('Replacement employee not found');
    const employee = empRows[0];

    const warnings: string[] = [];
    const conflicts: string[] = [];

    // 2. Check overlap in overrides (is replacement already on leave/override/cancelled?)
    const { rows: overrideRows } = await this.db.query(
      `SELECT date, override_type FROM shift_overrides 
       WHERE tenant_id = $1 AND employee_id = $2 AND date >= $3 AND date <= $4`,
      [tenantId, replacementId, startDate, endDate],
    );
    for (const ov of overrideRows) {
      if (ov.override_type === 'leave') {
        conflicts.push(`Replacement employee is on leave on ${ov.date}`);
      } else if (ov.override_type === 'cancelled') {
        warnings.push(`Replacement employee has a cancelled shift override on ${ov.date}`);
      } else {
        conflicts.push(`Replacement employee already has an active shift override on ${ov.date}`);
      }
    }

    // 3. Check duplicate day schedule in shift_schedules
    const { rows: schedRows } = await this.db.query(
      `SELECT ss.date, sd.name as shift_name 
       FROM shift_schedules ss
       JOIN shift_definitions sd ON ss.shift_id = sd.id
       WHERE ss.tenant_id = $1 AND ss.employee_id = $2 AND ss.date >= $3 AND ss.date <= $4`,
      [tenantId, replacementId, startDate, endDate],
    );
    for (const sc of schedRows) {
      conflicts.push(`Replacement employee already scheduled for shift '${sc.shift_name}' on ${sc.date}`);
    }

    return {
      available: conflicts.length === 0,
      warnings,
      conflicts,
      employee,
    };
  }

  async actionAndApprove(id: string, tenantId: string, approverId: string, data: ApproveShiftOverrideRequestDto) {
    // 1. Get request
    const { rows: reqRows } = await this.db.query(
      'SELECT * FROM shift_override_requests WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (!reqRows.length) throw new NotFoundException('Shift override request not found');
    const request = reqRows[0];

    if (request.status !== 'pending') {
      throw new BadRequestException(`Cannot action a request with status '${request.status}'`);
    }

    if (data.action_type === 'assign_replacement') {
      if (!data.replacement_employee_id) {
        throw new BadRequestException('Replacement employee is required for replacement assignment');
      }
      if (data.replacement_employee_id === request.employee_id) {
        throw new BadRequestException('Replacement employee cannot be the same as the requesting employee');
      }
      const val = await this.validateReplacementEmployee(tenantId, data.replacement_employee_id, request.start_date, request.end_date);
      if (val.conflicts.length > 0) {
        throw new BadRequestException(`Conflict: ${val.conflicts.join(', ')}`);
      }
    }

    if (['move_shift', 'temporary_shift'].includes(data.action_type)) {
      if (!data.target_shift_id) {
        throw new BadRequestException('Target shift is required for shift reassignment');
      }
      const { rows: targetRows } = await this.db.query(
        'SELECT id FROM shift_definitions WHERE id = $1 AND tenant_id = $2 AND is_active = true',
        [data.target_shift_id, tenantId],
      );
      if (!targetRows.length) {
        throw new BadRequestException('Target shift not found or inactive');
      }
    }

    if (data.action_type === 'override_hours' && (!data.custom_start_time || !data.custom_end_time)) {
      throw new BadRequestException('Custom start time and end time are required for custom shift hours');
    }

    // convert_to_leave no longer requires a specific leave_type_id from the UI

    // 3. Update override request fields before calling the approval engine
    await this.db.query(
      `UPDATE shift_override_requests 
       SET action_type = $3,
           replacement_employee_id = $4,
           target_shift_id = $5,
           custom_start_time = $6,
           custom_end_time = $7,
           custom_break_minutes = $8,
           custom_grace_period_minutes = $9,
           remarks = COALESCE($10, remarks),
           metadata = COALESCE($11::jsonb, metadata),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        id,
        tenantId,
        data.action_type,
        data.replacement_employee_id || null,
        data.target_shift_id || null,
        data.custom_start_time || null,
        data.custom_end_time || null,
        data.custom_break_minutes || null,
        data.custom_grace_period_minutes || null,
        data.remarks || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );

    // 4. Approve via Approval Engine
    const result = await this.approvalEngine.approveByEntity(
      id,
      'shift_override_requests',
      tenantId,
      approverId,
      data.reason,
      data.remarks,
    );

    // 5. Send notification to replacement employee if assigned
    if (data.action_type === 'assign_replacement' && data.replacement_employee_id) {
      const { rows: replacementUser } = await this.db.query(
        'SELECT id FROM users WHERE employee_id = $1 AND tenant_id = $2 LIMIT 1',
        [data.replacement_employee_id, tenantId],
      );
      if (replacementUser.length) {
        await this.emitter.emit(tenantId, {
          userIds: [replacementUser[0].id],
          title: 'New Shift Replacement Assignment',
          message: `You have been assigned as a shift replacement from ${request.start_date} to ${request.end_date}.`,
          type: 'info',
          sourceModule: 'shift_override',
        });
      }
    }

    // 6. Log audit action
    await this.auditLog.log({
      tenantId,
      userId: approverId,
      entityType: 'shift_override_request',
      entityId: id,
      action: 'actioned_and_approved',
      newValues: { action_type: data.action_type, replacement_employee_id: data.replacement_employee_id },
    });

    return result;
  }

  async rejectRequest(id: string, tenantId: string, rejecterId: string, reason: string) {
    const result = await this.approvalEngine.rejectByEntity(id, 'shift_override_requests', tenantId, rejecterId, reason);
    await this.auditLog.log({
      tenantId,
      userId: rejecterId,
      entityType: 'shift_override_request',
      entityId: id,
      action: 'rejected',
      newValues: { reason },
    });
    return result;
  }

  async cancelRequest(id: string, tenantId: string, cancelledById: string, reason?: string) {
    const result = await this.approvalEngine.cancel(id, tenantId, cancelledById, reason);
    await this.auditLog.log({
      tenantId,
      userId: cancelledById,
      entityType: 'shift_override_request',
      entityId: id,
      action: 'cancelled',
      newValues: { reason },
    });
    return result;
  }

  async getStatistics(tenantId: string) {
    const { rows: freqRows } = await this.db.query(
      `SELECT reason_category, COUNT(*) as count 
       FROM shift_override_requests 
       WHERE tenant_id = $1 AND status = 'approved'
       GROUP BY reason_category ORDER BY count DESC`,
      [tenantId],
    );

    const { rows: actionRows } = await this.db.query(
      `SELECT action_type, COUNT(*) as count 
       FROM shift_override_requests 
       WHERE tenant_id = $1 AND status = 'approved'
       GROUP BY action_type ORDER BY count DESC`,
      [tenantId],
    );

    const { rows: deptRows } = await this.db.query(
      `SELECT d.name as department_name, COUNT(*) as count
       FROM shift_override_requests sor
       JOIN employees e ON sor.employee_id = e.id
       JOIN departments d ON e.department_id = d.id
       WHERE sor.tenant_id = $1 AND sor.status = 'approved'
       GROUP BY d.name ORDER BY count DESC`,
      [tenantId],
    );

    const { rows: avgApproval } = await this.db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600.0) as avg_hours
       FROM approval_requests
       WHERE tenant_id = $1 AND entity_table = 'shift_override_requests' AND status = 'approved'`,
      [tenantId],
    );

    return {
      frequency_by_category: freqRows,
      preferred_actions_count: actionRows,
      frequency_by_department: deptRows,
      avg_approval_time_hours: parseFloat(avgApproval[0]?.avg_hours ?? '0').toFixed(1),
    };
  }
}
