import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { ApprovalGateway } from '../../approvals/gateways/approval.gateway';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { CreateFineDto } from '../dto/create-fine.dto';
import { UpdateFineDto } from '../dto/update-fine.dto';
import { SettleFineDto } from '../dto/settle-fine.dto';

@Injectable()
export class FinesService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private gateway: ApprovalGateway,
    private auditLog: AuditLogService,
  ) {}

  // ─── Fine CRUD ──────────────────────────────────────────────────────────────

  async createFine(tenantId: string | null, dto: CreateFineDto, createdBy: string) {
    if (!dto.fine_amount || dto.fine_amount <= 0) {
      throw new BadRequestException('Fine amount must be positive');
    }
    if (dto.deduction_mode === 'payroll' && (!dto.payroll_month || !dto.payroll_year)) {
      throw new BadRequestException('payroll_month and payroll_year are required for payroll deduction mode');
    }

    if (!tenantId) {
      const { rows: empRows } = await this.db.query(
        'SELECT tenant_id FROM employees WHERE id = $1 LIMIT 1',
        [dto.employee_id],
      );
      if (!empRows.length) throw new BadRequestException('Employee not found');
      tenantId = empRows[0].tenant_id as string;
    }
    const tid = tenantId as string;

    const { rows } = await this.db.query(
      `INSERT INTO employee_fines
         (tenant_id, branch_id, employee_id, category_id, title, description,
          fine_amount, deduction_mode, payroll_month, payroll_year, installments,
          reference_type, reference_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        tid,
        dto.branch_id ?? null,
        dto.employee_id,
        dto.category_id,
        dto.title,
        dto.description ?? null,
        dto.fine_amount,
        dto.deduction_mode,
        dto.payroll_month ?? null,
        dto.payroll_year ?? null,
        dto.installments ?? 1,
        dto.reference_type ?? null,
        dto.reference_id ?? null,
        createdBy,
      ],
    );
    const fine = rows[0];

    // Submit to the approval engine — triggers approval_requests row + WebSocket notification to approvers
    await this.approvalEngine.submit({
      tenantId: tid,
      workflowType: 'fine_deduction',
      entityId: fine.id,
      entityTable: 'employee_fines',
      submittedBy: createdBy,
      branchId: dto.branch_id ?? null,
      title: `Fine: ${dto.title}`,
      description: `Amount: ₹${dto.fine_amount} | Mode: ${dto.deduction_mode}`,
      metadata: {
        employee_id: dto.employee_id,
        fine_amount: dto.fine_amount,
        deduction_mode: dto.deduction_mode,
        payroll_month: dto.payroll_month,
        payroll_year: dto.payroll_year,
      },
      priority: dto.priority ?? 'normal',
    });

    // Notify the employee that a fine has been raised against them
    const employee = await this.db.query(
      `SELECT id AS user_id FROM users WHERE employee_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [dto.employee_id],
    );
    if (employee.rows[0]?.user_id) {
      this.gateway.notifyApprover(employee.rows[0].user_id, {
        event: 'fine:created',
        fine_id: fine.id,
        title: dto.title,
        fine_amount: dto.fine_amount,
      });
    }

    // Write general audit log
    const catResult = await this.db.query('SELECT category_type FROM deduction_categories WHERE id = $1', [dto.category_id]);
    const isFine = catResult.rows[0]?.category_type === 'disciplinary';
    const action = isFine ? 'fine_created' : 'deduction_created';
    await this.auditLog.log({
      tenantId: tid,
      userId: createdBy,
      entityType: 'employee_fines',
      entityId: fine.id,
      action,
      newValues: fine,
    });

    return fine;
  }

  async getFines(tenantId: string, filters: any, userType?: string) {
    const {
      page = 1, limit = 20,
      employee_id, branch_id, status, payroll_month, payroll_year,
      category_id, deduction_mode,
    } = filters;

    const baseWhere = `WHERE ef.tenant_id = $1`;
    let query = `
      SELECT
        ef.*,
        e.first_name, e.last_name, e.employee_code,
        dc.name AS category_name, dc.category_type,
        b.name AS branch_name,
        COALESCE(c_u_emp.first_name || ' ' || c_u_emp.last_name, c_u.email) AS creator_name,
        COALESCE(m_u_emp.first_name || ' ' || m_u_emp.last_name, m_u.email) AS modifier_name
      FROM employee_fines ef
      JOIN employees e ON e.id = ef.employee_id
      JOIN deduction_categories dc ON dc.id = ef.category_id
      LEFT JOIN branches b ON b.id = ef.branch_id
      LEFT JOIN users c_u ON c_u.id = ef.created_by
      LEFT JOIN employees c_u_emp ON c_u_emp.id = c_u.employee_id
      LEFT JOIN users m_u ON m_u.id = ef.last_modified_by
      LEFT JOIN employees m_u_emp ON m_u_emp.id = m_u.employee_id
      ${baseWhere}`;

    const params: any[] = [tenantId];
    let idx = 2;
    let extraWhere = '';

    if (employee_id) { const c = ` AND ef.employee_id = $${idx++}`; query += c; extraWhere += c; params.push(employee_id); }
    if (branch_id)   { const c = ` AND ef.branch_id = $${idx++}`;   query += c; extraWhere += c; params.push(branch_id); }
    if (status)      { const c = ` AND ef.status = $${idx++}`;       query += c; extraWhere += c; params.push(status); }
    if (category_id) { const c = ` AND ef.category_id = $${idx++}`; query += c; extraWhere += c; params.push(category_id); }
    if (deduction_mode) { const c = ` AND ef.deduction_mode = $${idx++}`; query += c; extraWhere += c; params.push(deduction_mode); }
    if (payroll_month)  { const c = ` AND ef.payroll_month = $${idx++}`;  query += c; extraWhere += c; params.push(parseInt(payroll_month)); }
    if (payroll_year)   { const c = ` AND ef.payroll_year = $${idx++}`;   query += c; extraWhere += c; params.push(parseInt(payroll_year)); }

    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM employee_fines ef ${baseWhere}${extraWhere}`,
      params,
    );

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ef.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    if (userType === 'employee') {
      for (const row of rows) {
        delete row.change_reason;
        delete row.last_modified_by;
        delete row.last_modified_at;
        delete row.edited_by;
        delete row.edited_at;
      }
    }

    return { data: rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async getFineById(id: string, tenantId: string | null, actorType?: string) {
    const queryStr = tenantId 
      ? `WHERE ef.id = $1 AND ef.tenant_id = $2`
      : `WHERE ef.id = $1`;
    const params = tenantId ? [id, tenantId] : [id];

    const { rows } = await this.db.query(
      `SELECT
         ef.*,
         e.first_name, e.last_name, e.employee_code,
         dc.name AS category_name, dc.category_type,
         b.name AS branch_name
       FROM employee_fines ef
       JOIN employees e ON e.id = ef.employee_id
       JOIN deduction_categories dc ON dc.id = ef.category_id
       LEFT JOIN branches b ON b.id = ef.branch_id
       ${queryStr}`,
      params,
    );
    if (!rows.length) throw new NotFoundException('Fine not found');
    const fine = rows[0];

    const { rows: payments } = await this.db.query(
      `SELECT dp.*, u.email AS verified_by_email
       FROM deduction_payments dp
       LEFT JOIN users u ON u.id = dp.verified_by
       WHERE dp.fine_id = $1 ORDER BY dp.created_at DESC`,
      [id],
    );

    const { rows: history } = await this.db.query(
      `SELECT h.*, u.email AS edited_by_email,
              COALESCE(e.first_name || ' ' || e.last_name, u.email) AS editor_name
       FROM fine_deduction_audit_history h
       JOIN users u ON u.id = h.edited_by
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE h.fine_id = $1 ORDER BY h.created_at DESC`,
      [id],
    );

    if (actorType === 'employee') {
      delete fine.change_reason;
      delete fine.last_modified_by;
      delete fine.last_modified_at;
      delete fine.edited_by;
      delete fine.edited_at;
      fine.payments = payments.map((p: any) => {
        const { verification_notes, verified_by, verified_by_email, ...rest } = p;
        return rest;
      });
      fine.history = [];
    } else {
      fine.payments = payments;
      fine.history = history;
    }

    return fine;
  }

  private async validatePayrollNotLocked(tenantId: string, month: number, year: number) {
    const { rows: prRows } = await this.db.query(
      `SELECT status FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3 LIMIT 1`,
      [tenantId, month, year]
    );
    if (prRows.length && prRows[0].status !== 'draft') {
      throw new BadRequestException(`Cannot edit record: Payroll for ${month}/${year} is already finalized/locked.`);
    }
    const { rows: psRows } = await this.db.query(
      `SELECT status FROM payslips WHERE tenant_id = $1 AND month = $2 AND year = $3 AND status != 'draft' LIMIT 1`,
      [tenantId, month, year]
    );
    if (psRows.length) {
      throw new BadRequestException(`Cannot edit record: Payslips for ${month}/${year} are already processed/released.`);
    }
  }

  async updateFine(id: string, tenantId: string, dto: UpdateFineDto, actor: { sub: string; userType: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.userType !== 'org_admin') {
      throw new ForbiddenException('Only administrators can edit fine and deduction records');
    }

    if (!dto.change_reason || !dto.change_reason.trim()) {
      throw new BadRequestException('A change reason is required to edit fine and deduction records');
    }

    const { rows: findRows } = await this.db.query(
      `SELECT ef.*, dc.name AS category_name, dc.category_type
       FROM employee_fines ef
       JOIN deduction_categories dc ON dc.id = ef.category_id
       WHERE ef.id = $1`,
      [id]
    );
    if (!findRows.length) throw new NotFoundException('Fine or deduction record not found');
    const existing = findRows[0];

    if (!actor.isSuperAdmin && existing.tenant_id !== tenantId) {
      throw new ForbiddenException('You do not have permission to edit records belonging to other organizations');
    }

    if (['payroll_deducted', 'manually_paid', 'waived', 'cancelled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot edit record: It has already been ${existing.status.replace(/_/g, ' ')}.`);
    }

    const oldMonth = existing.payroll_month;
    const oldYear = existing.payroll_year;
    const newMonth = dto.payroll_month !== undefined ? dto.payroll_month : oldMonth;
    const newYear = dto.payroll_year !== undefined ? dto.payroll_year : oldYear;

    if (existing.deduction_mode === 'payroll' && oldMonth && oldYear) {
      await this.validatePayrollNotLocked(existing.tenant_id, oldMonth, oldYear);
    }
    if ((dto.deduction_mode === 'payroll' || (dto.deduction_mode === undefined && existing.deduction_mode === 'payroll')) && newMonth && newYear && (newMonth !== oldMonth || newYear !== oldYear || dto.deduction_mode !== existing.deduction_mode)) {
      await this.validatePayrollNotLocked(existing.tenant_id, newMonth, newYear);
    }

    const auditEntries: Array<{ field: string; oldVal: string; newVal: string }> = [];

    if (dto.title !== undefined && dto.title !== existing.title) {
      auditEntries.push({
        field: existing.category_type === 'disciplinary' ? 'Fine Reason' : 'Deduction Reason',
        oldVal: existing.title,
        newVal: dto.title,
      });
    }

    if (dto.description !== undefined && dto.description !== existing.description) {
      auditEntries.push({
        field: 'Notes',
        oldVal: existing.description || '',
        newVal: dto.description || '',
      });
    }

    if (dto.fine_amount !== undefined && Number(dto.fine_amount) !== Number(existing.fine_amount)) {
      auditEntries.push({
        field: existing.category_type === 'disciplinary' ? 'Fine Amount' : 'Deduction Amount',
        oldVal: `₹${parseFloat(existing.fine_amount).toFixed(2)}`,
        newVal: `₹${parseFloat(dto.fine_amount as any).toFixed(2)}`,
      });
    }

    if (dto.category_id !== undefined && dto.category_id !== existing.category_id) {
      const { rows: catRows } = await this.db.query(
        'SELECT id, name FROM deduction_categories WHERE id = $1 OR id = $2',
        [existing.category_id, dto.category_id]
      );
      const catMap = new Map(catRows.map(r => [r.id, r.name]));
      auditEntries.push({
        field: existing.category_type === 'disciplinary' ? 'Fine Category' : 'Deduction Type',
        oldVal: catMap.get(existing.category_id) || 'Unknown',
        newVal: catMap.get(dto.category_id) || 'Unknown',
      });
    }

    if (dto.deduction_mode !== undefined && dto.deduction_mode !== existing.deduction_mode) {
      auditEntries.push({
        field: 'Recovery Method',
        oldVal: existing.deduction_mode,
        newVal: dto.deduction_mode,
      });
    }

    if ((dto.payroll_month !== undefined && dto.payroll_month !== existing.payroll_month) ||
        (dto.payroll_year !== undefined && dto.payroll_year !== existing.payroll_year)) {
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const oldPeriod = existing.payroll_month ? `${MONTHS[existing.payroll_month - 1]} ${existing.payroll_year}` : 'None';
      const newM = dto.payroll_month !== undefined ? dto.payroll_month : existing.payroll_month;
      const newY = dto.payroll_year !== undefined ? dto.payroll_year : existing.payroll_year;
      const newPeriod = newM ? `${MONTHS[newM - 1]} ${newY}` : 'None';

      auditEntries.push({
        field: 'Effective Payroll Period',
        oldVal: oldPeriod,
        newVal: newPeriod,
      });
    }

    if (dto.created_at !== undefined) {
      const oldDate = new Date(existing.created_at).toISOString().split('T')[0];
      const newDate = new Date(dto.created_at).toISOString().split('T')[0];
      if (oldDate !== newDate) {
        auditEntries.push({
          field: existing.category_type === 'disciplinary' ? 'Fine Date' : 'Deduction Date',
          oldVal: oldDate,
          newVal: newDate,
        });
      }
    }

    const setClauses: string[] = [
      'updated_at = now()',
      'edited_by = $3',
      'edited_at = now()',
      'change_reason = $4',
      'last_modified_by = $3',
      'last_modified_at = now()'
    ];
    const vals: any[] = [id, existing.tenant_id, actor.sub, dto.change_reason];
    let idx = 5;

    if (dto.title !== undefined)         { setClauses.push(`title = $${idx++}`);          vals.push(dto.title); }
    if (dto.description !== undefined)   { setClauses.push(`description = $${idx++}`);    vals.push(dto.description); }
    if (dto.fine_amount !== undefined)   { setClauses.push(`fine_amount = $${idx++}`);    vals.push(dto.fine_amount); }
    if (dto.deduction_mode !== undefined){ setClauses.push(`deduction_mode = $${idx++}`); vals.push(dto.deduction_mode); }
    if (dto.payroll_month !== undefined) { setClauses.push(`payroll_month = $${idx++}`);  vals.push(dto.payroll_month); }
    if (dto.payroll_year !== undefined)  { setClauses.push(`payroll_year = $${idx++}`);   vals.push(dto.payroll_year); }
    if (dto.installments !== undefined)  { setClauses.push(`installments = $${idx++}`);   vals.push(dto.installments); }
    if (dto.category_id !== undefined)   { setClauses.push(`category_id = $${idx++}`);    vals.push(dto.category_id); }
    if (dto.created_at !== undefined)    { setClauses.push(`created_at = $${idx++}`);     vals.push(dto.created_at); }

    const { rows } = await this.db.query(
      `UPDATE employee_fines SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      vals,
    );
    const updatedRecord = rows[0];

    for (const entry of auditEntries) {
      await this.db.query(
        `INSERT INTO fine_deduction_audit_history
           (tenant_id, fine_id, field_changed, old_value, new_value, change_reason, edited_by, editor_user_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          existing.tenant_id,
          id,
          entry.field,
          entry.oldVal,
          entry.newVal,
          dto.change_reason,
          actor.sub,
          actor.userType,
        ]
      );
    }

    const logAction = existing.category_type === 'disciplinary' ? 'fine_updated' : 'deduction_updated';
    await this.auditLog.log({
      tenantId: existing.tenant_id,
      userId: actor.sub,
      entityType: 'employee_fines',
      entityId: id,
      action: logAction,
      oldValues: {
        fine_amount: existing.fine_amount,
        title: existing.title,
        description: existing.description,
        category_id: existing.category_id,
        deduction_mode: existing.deduction_mode,
        payroll_month: existing.payroll_month,
        payroll_year: existing.payroll_year,
      },
      newValues: {
        fine_amount: updatedRecord.fine_amount,
        title: updatedRecord.title,
        description: updatedRecord.description,
        category_id: updatedRecord.category_id,
        deduction_mode: updatedRecord.deduction_mode,
        payroll_month: updatedRecord.payroll_month,
        payroll_year: updatedRecord.payroll_year,
      },
    });

    return updatedRecord;
  }

  async cancelFine(id: string, tenantId: string, cancelledBy: string, userType?: string, isSuperAdmin?: boolean) {
    if (userType !== undefined && isSuperAdmin !== undefined) {
      if (!isSuperAdmin && userType !== 'org_admin') {
        throw new ForbiddenException('Only administrators can cancel fine and deduction records');
      }
    }

    const existing = await this.db.query(
      `SELECT ef.*, dc.category_type
       FROM employee_fines ef
       JOIN deduction_categories dc ON dc.id = ef.category_id
       WHERE ef.id = $1`,
      [id]
    ).then(r => r.rows[0]);
    if (!existing) throw new NotFoundException('Fine or deduction record not found');

    if (isSuperAdmin !== undefined && !isSuperAdmin && existing.tenant_id !== tenantId) {
      throw new ForbiddenException('You do not have permission to cancel records belonging to other organizations');
    }

    if (existing.payroll_month && existing.payroll_year) {
      await this.validatePayrollNotLocked(existing.tenant_id, existing.payroll_month, existing.payroll_year);
    }

    if (!['pending_approval', 'approved'].includes(existing.status)) {
      throw new BadRequestException(`Cannot cancel a record with status '${existing.status}'`);
    }

    const logEntry = {
      action: 'cancelled',
      actor_id: cancelledBy,
      timestamp: new Date().toISOString(),
      reason: 'Cancelled by user',
    };

    const { rows } = await this.db.query(
      `UPDATE employee_fines
       SET status = 'cancelled',
           approval_log = approval_log || $3::jsonb,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, existing.tenant_id, JSON.stringify([logEntry])],
    );

    const logAction = existing.category_type === 'disciplinary' ? 'fine_deleted' : 'deduction_deleted';
    await this.auditLog.log({
      tenantId: existing.tenant_id,
      userId: cancelledBy,
      entityType: 'employee_fines',
      entityId: id,
      action: logAction,
      oldValues: { status: existing.status },
      newValues: { status: 'cancelled' },
    });

    return rows[0];
  }

  // ─── Compliance Reports ───────────────────────────────────────────────────────

  async getEditedFinesReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ef.*, e.first_name, e.last_name, e.employee_code,
              dc.name AS category_name, dc.category_type,
              u.email AS modified_by_email,
              COALESCE(u_emp.first_name || ' ' || u_emp.last_name, u.email) AS modifier_name
       FROM employee_fines ef
       JOIN employees e ON e.id = ef.employee_id
       JOIN deduction_categories dc ON dc.id = ef.category_id
       LEFT JOIN users u ON u.id = ef.last_modified_by
       LEFT JOIN employees u_emp ON u_emp.id = u.employee_id
       WHERE ef.tenant_id = $1 AND ef.last_modified_at IS NOT NULL AND dc.category_type = 'disciplinary'
       ORDER BY ef.last_modified_at DESC`,
      [tenantId]
    );
    return rows;
  }

  async getEditedDeductionsReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ef.*, e.first_name, e.last_name, e.employee_code,
              dc.name AS category_name, dc.category_type,
              u.email AS modified_by_email,
              COALESCE(u_emp.first_name || ' ' || u_emp.last_name, u.email) AS modifier_name
       FROM employee_fines ef
       JOIN employees e ON e.id = ef.employee_id
       JOIN deduction_categories dc ON dc.id = ef.category_id
       LEFT JOIN users u ON u.id = ef.last_modified_by
       LEFT JOIN employees u_emp ON u_emp.id = u.employee_id
       WHERE ef.tenant_id = $1 AND ef.last_modified_at IS NOT NULL AND dc.category_type != 'disciplinary'
       ORDER BY ef.last_modified_at DESC`,
      [tenantId]
    );
    return rows;
  }

  async getMostModifiedReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ef.id, ef.title, ef.fine_amount, ef.status,
              e.first_name, e.last_name, e.employee_code,
              COUNT(h.id)::int AS modification_count
       FROM employee_fines ef
       JOIN employees e ON e.id = ef.employee_id
       JOIN fine_deduction_audit_history h ON h.fine_id = ef.id
       WHERE ef.tenant_id = $1
       GROUP BY ef.id, e.id
       ORDER BY modification_count DESC, ef.title
       LIMIT 20`,
      [tenantId]
    );
    return rows;
  }

  async getPayrollAdjustmentHistoryReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT h.*, ef.title AS record_title, ef.status AS record_status,
              e.first_name || ' ' || e.last_name AS employee_name,
              COALESCE(u_emp.first_name || ' ' || u_emp.last_name, u.email) AS editor_name
       FROM fine_deduction_audit_history h
       JOIN employee_fines ef ON ef.id = h.fine_id
       JOIN employees e ON e.id = ef.employee_id
       JOIN users u ON u.id = h.edited_by
       LEFT JOIN employees u_emp ON u_emp.id = u.employee_id
       WHERE h.tenant_id = $1
       ORDER BY h.created_at DESC`,
      [tenantId]
    );
    return rows;
  }

  async getAdminActivityReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT h.edited_by, h.editor_user_type,
              COALESCE(e.first_name || ' ' || e.last_name, u.email) AS admin_name,
              COUNT(h.id)::int AS total_modifications,
              MAX(h.created_at) AS last_activity
       FROM fine_deduction_audit_history h
       JOIN users u ON u.id = h.edited_by
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE h.tenant_id = $1
       GROUP BY h.edited_by, h.editor_user_type, u.email, e.first_name, e.last_name
       ORDER BY total_modifications DESC`,
      [tenantId]
    );
    return rows;
  }

  // ─── Settlement & Payments ──────────────────────────────────────────────────

  async settleFine(id: string, tenantId: string, dto: SettleFineDto, settledBy: string) {
    const fine = await this.getFineById(id, tenantId);
    if (!['approved', 'partially_paid'].includes(fine.status)) {
      throw new BadRequestException(`Cannot settle a fine with status '${fine.status}'`);
    }

    const { rows: paymentRows } = await this.db.query(
      `INSERT INTO deduction_payments
         (tenant_id, fine_id, employee_id, payment_type, amount,
          payment_date, payment_method, payment_reference, payment_proof_url,
          notes, created_by)
       VALUES ($1,$2,$3,'manual_payment',$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        fine.tenant_id, id, fine.employee_id, dto.amount,
        dto.payment_date, dto.payment_method,
        dto.payment_reference ?? null, dto.payment_proof_url ?? null,
        dto.notes ?? null, settledBy,
      ],
    );
    const payment = paymentRows[0];

    // Update fine status to partially_paid pending finance verification
    await this.db.query(
      `UPDATE employee_fines SET status = 'partially_paid', updated_at = now() WHERE id = $1`,
      [id],
    );

    // Notify finance team
    this.gateway.broadcastUpdate(fine.tenant_id, {
      event: 'fine:settlement_submitted',
      fine_id: id,
      payment_id: payment.id,
      amount: dto.amount,
    });

    return payment;
  }

  async waiveFine(id: string, tenantId: string, reason: string, actorId: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Waiver reason must be at least 5 characters');
    }

    const fine = await this.getFineById(id, tenantId);
    if (!['approved', 'partially_paid'].includes(fine.status)) {
      throw new BadRequestException(`Cannot waive a fine with status '${fine.status}'`);
    }

    const logEntry = {
      action: 'waived',
      actor_id: actorId,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Insert waiver payment record for audit trail
    await this.db.query(
      `INSERT INTO deduction_payments
         (tenant_id, fine_id, employee_id, payment_type, amount, status, notes, created_by)
       VALUES ($1,$2,$3,'waiver',$4,'verified',$5,$6)`,
      [fine.tenant_id, id, fine.employee_id, fine.fine_amount, reason, actorId],
    );

    const { rows } = await this.db.query(
      `UPDATE employee_fines
       SET status = 'waived',
           amount_waived = fine_amount,
           approval_log = approval_log || $3::jsonb,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, JSON.stringify([logEntry])],
    );

    // Notify employee
    const employee = await this.db.query(
      `SELECT id AS user_id FROM users WHERE employee_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [fine.employee_id],
    );
    if (employee.rows[0]?.user_id) {
      this.gateway.notifyApprover(employee.rows[0].user_id, {
        event: 'fine:waived',
        fine_id: id,
        title: fine.title,
        reason,
      });
    }

    return rows[0];
  }

  async verifyPayment(paymentId: string, tenantId: string, verifiedBy: string, dto: { status: 'verified' | 'rejected'; verification_notes?: string }) {
    const { rows: payRows } = await this.db.query(
      `SELECT dp.*, ef.employee_id, ef.fine_amount, ef.amount_paid_manually, ef.amount_deducted, ef.amount_waived
       FROM deduction_payments dp
       JOIN employee_fines ef ON ef.id = dp.fine_id
       WHERE dp.id = $1 AND dp.tenant_id = $2`,
      [paymentId, tenantId],
    );
    if (!payRows.length) throw new NotFoundException('Payment not found');
    const payment = payRows[0];

    await this.db.query(
      `UPDATE deduction_payments
       SET status = $2, verified_by = $3, verified_at = now(),
           verification_notes = $4, updated_at = now()
       WHERE id = $1`,
      [paymentId, dto.status, verifiedBy, dto.verification_notes ?? null],
    );

    if (dto.status === 'verified') {
      const newPaid = parseFloat(payment.amount_paid_manually) + parseFloat(payment.amount);
      const remaining = parseFloat(payment.fine_amount) - parseFloat(payment.amount_deducted) - newPaid - parseFloat(payment.amount_waived);
      const newStatus = remaining <= 0 ? 'manually_paid' : 'partially_paid';

      await this.db.query(
        `UPDATE employee_fines
         SET amount_paid_manually = amount_paid_manually + $2,
             status = $3, updated_at = now()
         WHERE id = $4`,
        [payment.fine_id, payment.amount, newStatus, payment.fine_id],
      );

      // Notify employee
      const employee = await this.db.query(
        `SELECT id AS user_id FROM users WHERE employee_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [payment.employee_id],
      );
      if (employee.rows[0]?.user_id) {
        this.gateway.notifyApprover(employee.rows[0].user_id, {
          event: 'fine:settlement_verified',
          fine_id: payment.fine_id,
          amount: payment.amount,
          status: newStatus,
        });
      }
    }

    return this.db.query(
      `SELECT * FROM deduction_payments WHERE id = $1`, [paymentId],
    ).then(r => r.rows[0]);
  }

  async getPayments(fineId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT dp.*, u.email AS verified_by_email
       FROM deduction_payments dp
       LEFT JOIN users u ON u.id = dp.verified_by
       WHERE dp.fine_id = $1 AND dp.tenant_id = $2
       ORDER BY dp.created_at DESC`,
      [fineId, tenantId],
    );
    return rows;
  }

  // ─── Analytics ──────────────────────────────────────────────────────────────

  async getAnalytics(tenantId: string, filters: { branch_id?: string; from?: string; to?: string }) {
    const { branch_id, from, to } = filters;
    let where = 'WHERE ef.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;

    if (branch_id) { where += ` AND ef.branch_id = $${idx++}`; params.push(branch_id); }
    if (from)      { where += ` AND ef.created_at >= $${idx++}`; params.push(from); }
    if (to)        { where += ` AND ef.created_at <= $${idx++}`; params.push(to); }

    const [summary, byStatus, byCategory, byBranch, overdue] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total_fines,
           COALESCE(SUM(ef.fine_amount), 0)::numeric AS total_amount,
           COALESCE(SUM(CASE WHEN ef.status = 'payroll_deducted' THEN ef.amount_deducted ELSE 0 END), 0)::numeric AS total_payroll_deducted,
           COALESCE(SUM(CASE WHEN ef.status IN ('manually_paid','partially_paid') THEN ef.amount_paid_manually ELSE 0 END), 0)::numeric AS total_manually_paid,
           COALESCE(SUM(CASE WHEN ef.status = 'waived' THEN ef.amount_waived ELSE 0 END), 0)::numeric AS total_waived,
           COALESCE(SUM(CASE WHEN ef.status IN ('approved','pending_approval','partially_paid') THEN ef.fine_amount - ef.amount_deducted - ef.amount_paid_manually - ef.amount_waived ELSE 0 END), 0)::numeric AS total_outstanding
         FROM employee_fines ef ${where}`,
        params,
      ),
      this.db.query(
        `SELECT ef.status, COUNT(*)::int AS count, COALESCE(SUM(ef.fine_amount),0)::numeric AS amount
         FROM employee_fines ef ${where}
         GROUP BY ef.status ORDER BY count DESC`,
        params,
      ),
      this.db.query(
        `SELECT dc.name AS category_name, dc.category_type,
           COUNT(*)::int AS count, COALESCE(SUM(ef.fine_amount),0)::numeric AS amount
         FROM employee_fines ef
         JOIN deduction_categories dc ON dc.id = ef.category_id
         ${where}
         GROUP BY dc.name, dc.category_type ORDER BY count DESC`,
        params,
      ),
      this.db.query(
        `SELECT b.name AS branch_name, ef.branch_id,
           COUNT(*)::int AS count, COALESCE(SUM(ef.fine_amount),0)::numeric AS amount
         FROM employee_fines ef
         LEFT JOIN branches b ON b.id = ef.branch_id
         ${where}
         GROUP BY b.name, ef.branch_id ORDER BY count DESC`,
        params,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS overdue_count
         FROM employee_fines ef
         ${where} AND ef.status IN ('approved','partially_paid')
           AND ef.deduction_mode = 'payroll'
           AND (ef.payroll_year < EXTRACT(YEAR FROM now())
             OR (ef.payroll_year = EXTRACT(YEAR FROM now()) AND ef.payroll_month < EXTRACT(MONTH FROM now())))`,
        params,
      ),
    ]);

    return {
      summary: summary.rows[0],
      by_status: byStatus.rows,
      by_category: byCategory.rows,
      by_branch: byBranch.rows,
      overdue_count: overdue.rows[0]?.overdue_count ?? 0,
    };
  }

  async getEmployeeFines(employeeId: string, tenantId: string, filters: any = {}, userType?: string) {
    const { status, page = 1, limit = 20 } = filters;
    let query = `
      SELECT
        ef.*,
        dc.name AS category_name, dc.category_type
      FROM employee_fines ef
      JOIN deduction_categories dc ON dc.id = ef.category_id
      WHERE ef.tenant_id = $1 AND ef.employee_id = $2`;
    const params: any[] = [tenantId, employeeId];
    let idx = 3;

    if (status) { query += ` AND ef.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ef.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    if (userType === 'employee') {
      for (const row of rows) {
        delete row.change_reason;
        delete row.last_modified_by;
        delete row.last_modified_at;
        delete row.edited_by;
        delete row.edited_at;
      }
    }

    return rows;
  }

  // ─── Rules Engine ────────────────────────────────────────────────────────────

  async getRules(tenantId: string, branch_id?: string) {
    let query = `SELECT dr.*, dc.name AS category_name FROM deduction_rules dr
      LEFT JOIN deduction_categories dc ON dc.id = dr.category_id
      WHERE dr.tenant_id = $1`;
    const params: any[] = [tenantId];

    if (branch_id) { query += ` AND (dr.branch_id IS NULL OR dr.branch_id = $2)`; params.push(branch_id); }
    query += ' ORDER BY dr.is_active DESC, dr.name';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createRule(tenantId: string | null, dto: any) {
    if (!tenantId) {
      if (dto.branch_id) {
        const { rows: bRows } = await this.db.query('SELECT tenant_id FROM branches WHERE id = $1 LIMIT 1', [dto.branch_id]);
        if (bRows.length) tenantId = bRows[0].tenant_id;
      }
      if (!tenantId) throw new BadRequestException('tenant_id is required when creating a rule as superadmin without a branch context');
    }
    const { rows } = await this.db.query(
      `INSERT INTO deduction_rules
         (tenant_id, branch_id, category_id, name, rule_type, trigger_count,
          trigger_period, grace_minutes, fine_amount, fine_percentage, fine_basis, deduction_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        tenantId, dto.branch_id ?? null, dto.category_id ?? null,
        dto.name, dto.rule_type,
        dto.trigger_count ?? null, dto.trigger_period ?? null, dto.grace_minutes ?? null,
        dto.fine_amount ?? null, dto.fine_percentage ?? null, dto.fine_basis ?? null,
        dto.deduction_mode ?? 'payroll',
      ],
    );
    return rows[0];
  }

  async updateRule(id: string, tenantId: string, dto: any) {
    const setClauses: string[] = ['updated_at = now()'];
    const vals: any[] = [id, tenantId];
    let idx = 3;

    const fields = ['name', 'rule_type', 'trigger_count', 'trigger_period', 'grace_minutes',
      'fine_amount', 'fine_percentage', 'fine_basis', 'deduction_mode', 'is_active'];
    for (const f of fields) {
      if (dto[f] !== undefined) { setClauses.push(`${f} = $${idx++}`); vals.push(dto[f]); }
    }

    const { rows } = await this.db.query(
      `UPDATE deduction_rules SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      vals,
    );
    if (!rows.length) throw new NotFoundException('Rule not found');
    return rows[0];
  }

  async deleteRule(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE deduction_rules SET is_active = false, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Rule not found');
    return rows[0];
  }
}
