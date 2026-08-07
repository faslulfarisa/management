import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AssetItemService } from './asset-item.service';

@Injectable()
export class AssetAssignmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly assetItemService: AssetItemService,
  ) {}

  async assign(tenantId: string, data: { asset_item_id: string; employee_id: string; expected_return_date?: string; notes?: string }, assignedBy: string) {
    await this.assetItemService.assertAvailable(tenantId, data.asset_item_id);

    const { rows } = await this.db.query(
      `INSERT INTO asset_assignments (tenant_id, asset_item_id, employee_id, assigned_by, expected_return_date, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *`,
      [tenantId, data.asset_item_id, data.employee_id, assignedBy, data.expected_return_date ?? null, data.notes ?? null],
    );
    await this.assetItemService.setStatus(tenantId, data.asset_item_id, 'assigned');
    return rows[0];
  }

  async listForEmployee(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT aa.*, ai.name AS asset_name, ai.asset_code, at.name AS asset_type_name
       FROM asset_assignments aa
       JOIN asset_items ai ON aa.asset_item_id = ai.id
       JOIN asset_types at ON ai.asset_type_id = at.id
       WHERE aa.tenant_id = $1 AND aa.employee_id = $2
       ORDER BY aa.assigned_at DESC`,
      [tenantId, employeeId],
    );
    return rows;
  }

  async listForExit(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT aa.*, ai.name AS asset_name, ai.asset_code, at.name AS asset_type_name
       FROM asset_assignments aa
       JOIN asset_items ai ON aa.asset_item_id = ai.id
       JOIN asset_types at ON ai.asset_type_id = at.id
       WHERE aa.tenant_id = $1 AND aa.exit_request_id = $2
       ORDER BY aa.assigned_at DESC`,
      [tenantId, exitRequestId],
    );
    return rows;
  }

  /** Called on exit-request approval: flags every active assignment for recovery and links it to the exit. */
  async initiateRecovery(tenantId: string, exitRequestId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `UPDATE asset_assignments SET status = 'recovery_pending', exit_request_id = $1, updated_at = now()
       WHERE tenant_id = $2 AND employee_id = $3 AND status = 'active'
       RETURNING *`,
      [exitRequestId, tenantId, employeeId],
    );
    for (const a of rows) {
      await this.assetItemService.setStatus(tenantId, a.asset_item_id, 'in_recovery');
    }
    return rows;
  }

  async recordReturn(tenantId: string, assignmentId: string, data: { return_condition: 'good' | 'damaged' | 'lost'; recovery_amount?: number; notes?: string }) {
    const { rows: existing } = await this.db.query('SELECT * FROM asset_assignments WHERE id = $1 AND tenant_id = $2', [assignmentId, tenantId]);
    if (!existing.length) throw new NotFoundException('Asset assignment not found');

    const recoveryAmount = data.return_condition === 'good' ? 0 : (data.recovery_amount ?? 0);
    const assignmentStatus = data.return_condition === 'good' ? 'returned' : 'written_off';
    const assetStatus = data.return_condition === 'good' ? 'available' : data.return_condition === 'damaged' ? 'damaged' : 'lost';

    const { rows } = await this.db.query(
      `UPDATE asset_assignments
       SET status = $1, returned_at = now(), return_condition = $2, recovery_amount = $3, notes = COALESCE($4, notes), updated_at = now()
       WHERE id = $5 RETURNING *`,
      [assignmentStatus, data.return_condition, recoveryAmount, data.notes ?? null, assignmentId],
    );
    await this.assetItemService.setStatus(tenantId, existing[0].asset_item_id, assetStatus);
    return rows[0];
  }

  /** Total recovery charge for an exit, rolled into the FnF settlement's asset_recovery deduction. */
  async getRecoveryTotal(tenantId: string, exitRequestId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COALESCE(SUM(recovery_amount), 0) AS total FROM asset_assignments
       WHERE tenant_id = $1 AND exit_request_id = $2`,
      [tenantId, exitRequestId],
    );
    return parseFloat(rows[0].total);
  }

  /** Gate used before allowing offboarding completion — every assignment tied to this exit must be resolved. */
  async allRecovered(tenantId: string, exitRequestId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) AS outstanding FROM asset_assignments
       WHERE tenant_id = $1 AND exit_request_id = $2 AND status = 'recovery_pending'`,
      [tenantId, exitRequestId],
    );
    return parseInt(rows[0].outstanding, 10) === 0;
  }
}
