import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';
import { CreateWorkforcePlanDto, UpdateWorkforcePlanDto } from '../dto/workforce-plan.dto';

const EDITABLE_STATUSES = ['draft', 'rejected'];

const SELECT_WITH_JOINS = `
  SELECT wp.*, b.name AS branch_name, cb.email AS created_by_email
  FROM workforce_plans wp
  LEFT JOIN branches b ON wp.branch_id = b.id
  LEFT JOIN users cb ON wp.created_by = cb.id
`;

export interface WorkforcePlanFilters {
  status?: string;
  branch_id?: string;
  year?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class WorkforcePlanService {
  constructor(private db: DatabaseService) {}

  /** Sums breakdown[].budget_amount / planned_hires for list-row summaries without a denormalized column. */
  private summarize(plan: any) {
    const breakdown = Array.isArray(plan.breakdown) ? plan.breakdown : [];
    const totalBudget = breakdown.reduce((sum: number, item: any) => sum + (Number(item.budget_amount) || 0), 0);
    const totalPlannedHires = breakdown.reduce((sum: number, item: any) => sum + (Number(item.planned_hires) || 0), 0);
    const totalBudgetedHeadcount = breakdown.reduce((sum: number, item: any) => sum + (Number(item.budgeted_headcount) || 0), 0);
    return { ...plan, total_budget_amount: totalBudget, total_planned_hires: totalPlannedHires, total_budgeted_headcount: totalBudgetedHeadcount };
  }

  async list(tenantId: string, accessScope: AccessScope | undefined, filters: WorkforcePlanFilters) {
    const { status, branch_id, year, page = 1, limit = 20 } = filters;
    let where = 'WHERE wp.tenant_id = $1 AND wp.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;

    if (status) { where += ` AND wp.status = $${idx++}`; params.push(status); }
    if (branch_id) { where += ` AND wp.branch_id = $${idx++}`; params.push(branch_id); }
    if (year) { where += ` AND wp.year = $${idx++}`; params.push(year); }
    if (accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'wp.branch_id', idx);
      where += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    const offset = (Number(page) - 1) * Number(limit);
    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM workforce_plans wp ${where}`, params),
      this.db.query(
        `${SELECT_WITH_JOINS} ${where} ORDER BY wp.year DESC, wp.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows.map((r) => this.summarize(r)), total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `${SELECT_WITH_JOINS} WHERE wp.id = $1 AND wp.tenant_id = $2 AND wp.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Workforce plan not found');
    return this.summarize(rows[0]);
  }

  async create(tenantId: string, createdById: string, dto: CreateWorkforcePlanDto) {
    const { rows } = await this.db.query(
      `INSERT INTO workforce_plans (tenant_id, branch_id, year, title, notes, breakdown, created_by, last_updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7) RETURNING *`,
      [tenantId, dto.branch_id ?? null, dto.year, dto.title, dto.notes ?? null, JSON.stringify(dto.breakdown ?? []), createdById],
    );
    return this.findOne(rows[0].id, tenantId);
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateWorkforcePlanDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a workforce plan with status '${existing.status}'`);
    }
    await this.db.query(
      `UPDATE workforce_plans SET
        branch_id = COALESCE($3, branch_id), year = COALESCE($4, year), title = COALESCE($5, title),
        notes = COALESCE($6, notes), breakdown = COALESCE($7::jsonb, breakdown),
        last_updated_by = $8, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, dto.branch_id, dto.year, dto.title, dto.notes, dto.breakdown ? JSON.stringify(dto.breakdown) : null, updatedById],
    );
    return this.findOne(id, tenantId);
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft workforce plans can be deleted');
    }
    await this.db.query('UPDATE workforce_plans SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /** Internal transition fired by WorkforcePlanApprovalService right after full approval. */
  async activate(id: string, tenantId: string) {
    await this.db.query(`UPDATE workforce_plans SET status = 'active', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return this.findOne(id, tenantId);
  }

  async close(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'active') {
      throw new BadRequestException(`Cannot close a workforce plan with status '${existing.status}'`);
    }
    await this.db.query(`UPDATE workforce_plans SET status = 'closed', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return this.findOne(id, tenantId);
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM workforce_plans WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Workforce plan not found');
    return rows[0];
  }
}
