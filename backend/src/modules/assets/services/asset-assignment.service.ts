import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AssetItemService } from './asset-item.service';

@Injectable()
export class AssetAssignmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly assetItemService: AssetItemService,
  ) {}

  async assign(tenantId: string, data: { asset_item_id?: string; item_name?: string; employee_id: string; expected_return_date?: string; notes?: string }, assignedBy: string) {
    let itemId = data.asset_item_id;

    if (!itemId) {
      if (!data.item_name) {
        throw new BadRequestException('Either asset_item_id or item_name must be provided.');
      }

      // 1. Get or create a default asset type
      let typeId: string;
      const { rows: types } = await this.db.query(
        `SELECT id FROM asset_types WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );

      if (types.length > 0) {
        typeId = types[0].id;
      } else {
        const { rows: newType } = await this.db.query(
          `INSERT INTO asset_types (tenant_id, name, category)
           VALUES ($1, 'General', 'it_equipment') RETURNING id`,
          [tenantId],
        );
        typeId = newType[0].id;
      }

      // 2. Generate a unique asset code
      const assetCode = 'AST-' + Date.now().toString().slice(-6) + Math.random().toString(36).substring(2, 5).toUpperCase();

      // 3. Create a new asset item in 'assigned' status
      const { rows: newItem } = await this.db.query(
        `INSERT INTO asset_items (tenant_id, asset_type_id, asset_code, name, status)
         VALUES ($1, $2, $3, $4, 'assigned') RETURNING id`,
        [tenantId, typeId, assetCode, data.item_name],
      );
      itemId = newItem[0].id;
    } else {
      await this.assetItemService.assertAvailable(tenantId, itemId);
      await this.assetItemService.setStatus(tenantId, itemId, 'assigned');
    }

    const { rows } = await this.db.query(
      `INSERT INTO asset_assignments (tenant_id, asset_item_id, employee_id, assigned_by, expected_return_date, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *`,
      [tenantId, itemId, data.employee_id, assignedBy, data.expected_return_date ?? null, data.notes ?? null],
    );
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

  async listAll(
    tenantId: string,
    filters: { search?: string; branch_id?: string; department_id?: string; status?: string },
  ) {
    const params: any[] = [tenantId];
    let where = 'aa.tenant_id = $1';
    let idx = 2;

    if (filters.status) {
      where += ` AND aa.status = $${idx++}`;
      params.push(filters.status);
    } else {
      // Default: active + recovery_pending
      where += ` AND aa.status IN ('active', 'recovery_pending')`;
    }

    if (filters.branch_id) {
      where += ` AND ai.branch_id = $${idx++}`;
      params.push(filters.branch_id);
    }
    if (filters.department_id) {
      where += ` AND e.department_id = $${idx++}`;
      params.push(filters.department_id);
    }
    if (filters.search) {
      where += ` AND (ai.name ILIKE $${idx} OR ai.asset_code ILIKE $${idx} OR (e.first_name || ' ' || e.last_name) ILIKE $${idx})`;
      params.push(`%${filters.search}%`);
      idx++;
    }

    const { rows } = await this.db.query(
      `SELECT
         aa.id,
         aa.status,
         aa.assigned_at,
         aa.expected_return_date,
         aa.notes,
         ai.id          AS asset_item_id,
         ai.name        AS asset_name,
         ai.asset_code,
         ai.branch_id,
         at.name        AS asset_type_name,
         at.category    AS asset_category,
         e.id           AS employee_id,
         e.first_name,
         e.last_name,
         e.employee_code,
         d.id           AS department_id,
         d.name         AS department_name,
         b.id           AS branch_db_id,
         b.name         AS branch_name
       FROM asset_assignments aa
       JOIN asset_items ai       ON aa.asset_item_id  = ai.id
       JOIN asset_types at       ON ai.asset_type_id  = at.id
       JOIN employees   e        ON aa.employee_id    = e.id
       LEFT JOIN departments d   ON e.department_id   = d.id
       LEFT JOIN branches    b   ON ai.branch_id      = b.id
       WHERE ${where}
       ORDER BY aa.assigned_at DESC`,
      params,
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

  async update(tenantId: string, assignmentId: string, data: { item_name?: string; employee_id?: string; expected_return_date?: string; notes?: string }) {
    const { rows: existing } = await this.db.query(
      'SELECT * FROM asset_assignments WHERE id = $1 AND tenant_id = $2',
      [assignmentId, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Asset assignment not found');

    if (data.item_name !== undefined) {
      await this.db.query(
        'UPDATE asset_items SET name = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3',
        [data.item_name, existing[0].asset_item_id, tenantId],
      );
    }

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.employee_id !== undefined) {
      sets.push(`employee_id = $${idx++}`);
      params.push(data.employee_id);
    }
    if (data.expected_return_date !== undefined) {
      sets.push(`expected_return_date = $${idx++}`);
      params.push(data.expected_return_date || null);
    }
    if (data.notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      params.push(data.notes || null);
    }

    if (!sets.length && data.item_name === undefined) return existing[0];

    if (sets.length > 0) {
      sets.push(`updated_at = now()`);
      params.push(assignmentId, tenantId);

      const { rows } = await this.db.query(
        `UPDATE asset_assignments SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
        params,
      );
      return rows[0];
    }

    return existing[0];
  }

  async delete(tenantId: string, assignmentId: string) {
    const { rows: existing } = await this.db.query(
      'SELECT * FROM asset_assignments WHERE id = $1 AND tenant_id = $2',
      [assignmentId, tenantId],
    );
    if (!existing.length) throw new NotFoundException('Asset assignment not found');

    // Set the asset item back to available
    await this.assetItemService.setStatus(tenantId, existing[0].asset_item_id, 'available');

    await this.db.query(
      'DELETE FROM asset_assignments WHERE id = $1 AND tenant_id = $2',
      [assignmentId, tenantId],
    );
    return { deleted: true };
  }
}
