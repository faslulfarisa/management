import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';

@Injectable()
export class BranchTransferService {
  constructor(
    private db: DatabaseService,
    @Inject(forwardRef(() => ApprovalEngineService))
    private approvalEngine: ApprovalEngineService,
  ) {}

  async findAll(tenantId: string, filters: any = {}) {
    const { status, branch_id, employee_id } = filters;
    let query = `
      SELECT ebt.*,
        e.first_name || ' ' || e.last_name AS employee_name,
        e.employee_code,
        fb.name AS from_branch_name,
        tb.name AS to_branch_name,
        fd.name AS from_department_name,
        td.name AS to_department_name,
        COALESCE(re.first_name || ' ' || re.last_name, ru.email) AS requested_by_name,
        COALESCE(ae.first_name || ' ' || ae.last_name, au.email) AS approved_by_name
      FROM employee_branch_transfers ebt
      JOIN employees e    ON e.id  = ebt.employee_id
      LEFT JOIN branches    fb  ON fb.id  = ebt.from_branch_id
      JOIN branches         tb  ON tb.id  = ebt.to_branch_id
      LEFT JOIN departments fd  ON fd.id  = ebt.from_department_id
      LEFT JOIN departments td  ON td.id  = ebt.to_department_id
      LEFT JOIN users       ru  ON ru.id  = ebt.requested_by
      LEFT JOIN employees   re  ON re.id  = ru.employee_id AND re.tenant_id = ebt.tenant_id
      LEFT JOIN users       au  ON au.id  = ebt.approved_by
      LEFT JOIN employees   ae  ON ae.id  = au.employee_id AND ae.tenant_id = ebt.tenant_id
      WHERE ebt.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (status)      { query += ` AND ebt.status = $${idx++}`;                                               params.push(status); }
    if (branch_id)   { query += ` AND (ebt.from_branch_id = $${idx} OR ebt.to_branch_id = $${idx})`; idx++; params.push(branch_id); }
    if (employee_id) { query += ` AND ebt.employee_id = $${idx++}`;                                          params.push(employee_id); }

    query += ' ORDER BY ebt.created_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT ebt.*,
         e.first_name || ' ' || e.last_name AS employee_name, e.employee_code,
         fb.name AS from_branch_name, tb.name AS to_branch_name,
         fd.name AS from_department_name, td.name AS to_department_name
       FROM employee_branch_transfers ebt
       JOIN employees e  ON e.id  = ebt.employee_id
       LEFT JOIN branches   fb ON fb.id = ebt.from_branch_id
       JOIN branches        tb ON tb.id = ebt.to_branch_id
       LEFT JOIN departments fd ON fd.id = ebt.from_department_id
       LEFT JOIN departments td ON td.id = ebt.to_department_id
       WHERE ebt.id = $1 AND ebt.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Transfer not found');
    return rows[0];
  }

  async initiate(tenantId: string, requestedBy: string, data: any) {
    const { rows: emp } = await this.db.query(
      'SELECT branch_id, department_id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [data.employee_id, tenantId],
    );
    if (!emp.length) throw new NotFoundException('Employee not found');

    const { rows } = await this.db.query(
      `INSERT INTO employee_branch_transfers
         (tenant_id, employee_id, from_branch_id, to_branch_id,
          from_department_id, to_department_id, transfer_type,
          effective_date, remarks, requested_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING *`,
      [
        tenantId,
        data.employee_id,
        emp[0].branch_id || null,
        data.to_branch_id,
        emp[0].department_id || null,
        data.to_department_id || null,
        data.transfer_type || 'permanent',
        data.effective_date,
        data.remarks || null,
        requestedBy,
      ],
    );
    const transfer = rows[0];
    await this.submitApproval(tenantId, transfer, requestedBy);
    return transfer;
  }

  async approve(id: string, tenantId: string, approvedBy: string) {
    const transfer = await this.findOne(id, tenantId);
    if (transfer.status !== 'pending') throw new BadRequestException('Only pending transfers can be approved');

    await this.ensureApprovalRequest(tenantId, transfer, transfer.requested_by ?? approvedBy);
    await this.approvalEngine.approveByEntity(
      id,
      'employee_branch_transfers',
      tenantId,
      approvedBy,
      'Approved transfer',
    );

    return this.findOne(id, tenantId);
  }

  async reject(id: string, tenantId: string, rejectedBy: string, reason: string) {
    const transfer = await this.findOne(id, tenantId);
    if (transfer.status !== 'pending') throw new BadRequestException('Only pending transfers can be rejected');

    await this.ensureApprovalRequest(tenantId, transfer, transfer.requested_by ?? rejectedBy);
    await this.approvalEngine.rejectByEntity(
      id,
      'employee_branch_transfers',
      tenantId,
      rejectedBy,
      reason || 'Rejected transfer',
    );
    return this.findOne(id, tenantId);
  }

  async cancel(id: string, tenantId: string) {
    const transfer = await this.findOne(id, tenantId);
    if (transfer.status !== 'pending') throw new BadRequestException('Only pending transfers can be cancelled');

    const { rows } = await this.db.query(
      `UPDATE employee_branch_transfers
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    return rows[0];
  }

  // ── Deputation-specific ──────────────────────────────────────────────────────

  async initiateDeputation(tenantId: string, requestedBy: string, data: any) {
    const { rows: emp } = await this.db.query(
      'SELECT branch_id, department_id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [data.employee_id, tenantId],
    );
    if (!emp.length) throw new NotFoundException('Employee not found');

    const { rows } = await this.db.query(
      `INSERT INTO employee_branch_transfers
         (tenant_id, employee_id, from_branch_id, to_branch_id,
          from_department_id, to_department_id, transfer_type,
          effective_date, return_date, original_branch_id, deputation_notes, remarks, requested_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,'deputation',$7,$8,$3,$9,$10,$11,'pending')
       RETURNING *`,
      [
        tenantId,
        data.employee_id,
        emp[0].branch_id || null,
        data.to_branch_id,
        emp[0].department_id || null,
        data.to_department_id || null,
        data.effective_date,
        data.return_date || null,
        data.deputation_notes || null,
        data.remarks || null,
        requestedBy,
      ],
    );
    const transfer = rows[0];
    await this.submitApproval(tenantId, transfer, requestedBy);
    return transfer;
  }

  async getActiveDeputations(tenantId: string, branchId?: string) {
    let query = `
      SELECT ebt.*,
        e.first_name || ' ' || e.last_name AS employee_name,
        e.employee_code,
        fb.name AS from_branch_name,
        tb.name AS to_branch_name,
        ob.name AS original_branch_name
      FROM employee_branch_transfers ebt
      JOIN employees e   ON e.id  = ebt.employee_id
      LEFT JOIN branches fb ON fb.id = ebt.from_branch_id
      JOIN branches  tb ON tb.id = ebt.to_branch_id
      LEFT JOIN branches ob ON ob.id = ebt.original_branch_id
      WHERE ebt.tenant_id = $1
        AND ebt.transfer_type = 'deputation'
        AND ebt.status = 'approved'`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (branchId) { query += ` AND (ebt.from_branch_id = $${idx} OR ebt.to_branch_id = $${idx})`; idx++; params.push(branchId); }
    query += ' ORDER BY ebt.return_date ASC NULLS LAST';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  /** Auto-revert approved deputations whose return_date <= today. */
  async processExpiredDeputations(tenantId: string): Promise<{ reverted: number; ids: string[] }> {
    const today = new Date().toISOString().split('T')[0];

    const { rows: expired } = await this.db.query(
      `SELECT * FROM employee_branch_transfers
       WHERE tenant_id = $1
         AND transfer_type = 'deputation'
         AND status = 'approved'
         AND return_date IS NOT NULL
         AND return_date <= $2`,
      [tenantId, today],
    );

    const reverted: string[] = [];

    for (const dep of expired) {
      // Restore employee to original branch
      await this.db.query(
        `UPDATE employees
         SET branch_id = $3, department_id = COALESCE($4, department_id), updated_at = now()
         WHERE id = $2 AND tenant_id = $1`,
        [tenantId, dep.employee_id, dep.original_branch_id || dep.from_branch_id, dep.from_department_id],
      );

      // Mark transfer as completed
      await this.db.query(
        `UPDATE employee_branch_transfers
         SET status = 'completed', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [dep.id, tenantId],
      );

      // Lifecycle event
      await this.db.query(
        `INSERT INTO employee_lifecycle_events
           (tenant_id, employee_id, event_type, effective_date, old_values, new_values, remarks)
         VALUES ($1,$2,'deputation_return',$3,$4,$5,'Auto-reverted by deputation cron')`,
        [
          tenantId,
          dep.employee_id,
          today,
          JSON.stringify({ branch_id: dep.to_branch_id }),
          JSON.stringify({ branch_id: dep.original_branch_id || dep.from_branch_id }),
        ],
      );

      reverted.push(dep.id);
    }

    return { reverted: reverted.length, ids: reverted };
  }

  private async ensureApprovalRequest(tenantId: string, transfer: any, submittedBy: string) {
    const { rows } = await this.db.query(
      `SELECT 1 FROM approval_requests
       WHERE tenant_id = $1
         AND entity_id = $2
         AND entity_table = 'employee_branch_transfers'
         AND status IN ('pending', 'under_review', 'escalated')
       LIMIT 1`,
      [tenantId, transfer.id],
    );
    if (rows.length) return;
    await this.submitApproval(tenantId, transfer, submittedBy);
  }

  private async submitApproval(tenantId: string, transfer: any, submittedBy: string) {
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'transfer',
      entityId: transfer.id,
      entityTable: 'employee_branch_transfers',
      submittedBy,
      branchId: transfer.from_branch_id ?? transfer.to_branch_id ?? null,
      title: 'Branch transfer',
      description: transfer.remarks ?? null,
      metadata: {
        employee_id: transfer.employee_id,
        from_branch_id: transfer.from_branch_id,
        to_branch_id: transfer.to_branch_id,
        transfer_type: transfer.transfer_type,
        effective_date: transfer.effective_date,
      },
    });
  }
}
