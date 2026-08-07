import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';
import { CreateTrackerItemDto, UpdateTrackerItemDto } from '../dto/compliance-tracker.dto';

/**
 * Compliance Tracker = the pre-existing monthly statutory filings ledger
 * (compliance_filings, unchanged) plus the new generic tracker items
 * (Labour Law / audits / legal cases / custom compliance work items).
 */
@Injectable()
export class ComplianceTrackerService {
  constructor(private db: DatabaseService) {}

  // ── Statutory filings (legacy, migrated as-is from hr/services/compliance.service.ts) ──

  async getFilings(tenantId: string, filters: any) {
    const { type, month, year } = filters;
    let query = 'SELECT * FROM compliance_filings WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (type) { query += ` AND type = $${idx++}`; params.push(type); }
    if (month) { query += ` AND month = $${idx++}`; params.push(parseInt(month)); }
    if (year) { query += ` AND year = $${idx++}`; params.push(parseInt(year)); }
    query += ' ORDER BY year DESC, month DESC, type';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createFiling(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO compliance_filings (tenant_id, type, month, year, amount, reference_number, status, due_date, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, data.type, data.month, data.year, data.amount || 0,
       data.reference_number || null, data.status || 'pending', data.due_date || null, data.notes || null],
    );
    return rows[0];
  }

  async updateFiling(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE compliance_filings SET
        status = COALESCE($3, status),
        reference_number = COALESCE($4, reference_number),
        amount = COALESCE($5, amount),
        filed_date = COALESCE($6, filed_date),
        notes = COALESCE($7, notes),
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.status || null, data.reference_number || null,
       data.amount || null, data.filed_date || null, data.notes || null],
    );
    if (!rows.length) throw new NotFoundException('Filing not found');
    return rows[0];
  }

  async removeFiling(id: string, tenantId: string) {
    const { rows } = await this.db.query(`DELETE FROM compliance_filings WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Filing not found');
    return { success: true };
  }

  // ── Generic compliance tracker items ────────────────────────────────────

  async listItems(tenantId: string, accessScope: AccessScope, filters: { complianceType?: string; status?: string } = {}) {
    let where = 'ti.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters.complianceType) { where += ` AND ti.compliance_type = $${idx++}`; params.push(filters.complianceType); }
    if (filters.status) { where += ` AND ti.status = $${idx++}`; params.push(filters.status); }
    if (!accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'ti.branch_id', idx);
      where += ` AND (ti.branch_id IS NULL OR ${scope.clause})`;
      params.push(...scope.params);
    }

    const { rows } = await this.db.query(
      `SELECT ti.*, u.email AS responsible_user_email,
         (SELECT COUNT(*) FROM compliance_tracker_documents td WHERE td.tracker_item_id = ti.id)::int AS document_count
       FROM compliance_tracker_items ti
       LEFT JOIN users u ON u.id = ti.responsible_user_id
       WHERE ${where} ORDER BY ti.due_date ASC NULLS LAST, ti.created_at DESC`,
      params,
    );
    return rows;
  }

  async createItem(tenantId: string, createdById: string, dto: CreateTrackerItemDto) {
    const { rows } = await this.db.query(
      `INSERT INTO compliance_tracker_items
        (tenant_id, branch_id, compliance_type, title, description, due_date, responsible_user_id, completion_percent, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tenantId, dto.branch_id ?? null, dto.compliance_type, dto.title, dto.description ?? null, dto.due_date ?? null,
        dto.responsible_user_id ?? null, dto.completion_percent ?? 0, dto.remarks ?? null, createdById],
    );
    return rows[0];
  }

  async updateItem(id: string, tenantId: string, dto: UpdateTrackerItemDto) {
    const { rows } = await this.db.query(
      `UPDATE compliance_tracker_items SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        due_date = COALESCE($6, due_date),
        responsible_user_id = COALESCE($7, responsible_user_id),
        completion_percent = COALESCE($8, completion_percent),
        remarks = COALESCE($9, remarks),
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.title ?? null, dto.description ?? null, dto.status ?? null, dto.due_date ?? null,
        dto.responsible_user_id ?? null, dto.completion_percent ?? null, dto.remarks ?? null],
    );
    if (!rows.length) throw new NotFoundException('Compliance tracker item not found');
    return rows[0];
  }

  async linkDocument(trackerItemId: string, documentId: string, tenantId: string) {
    const { rows: itemRows } = await this.db.query(`SELECT 1 FROM compliance_tracker_items WHERE id = $1 AND tenant_id = $2`, [trackerItemId, tenantId]);
    if (!itemRows.length) throw new NotFoundException('Compliance tracker item not found');
    await this.db.query(
      `INSERT INTO compliance_tracker_documents (tracker_item_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [trackerItemId, documentId],
    );
    return { success: true };
  }

  async removeItem(id: string, tenantId: string) {
    const { rows } = await this.db.query(`DELETE FROM compliance_tracker_items WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Compliance tracker item not found');
    return { success: true };
  }
}
