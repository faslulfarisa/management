import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CreateVacancyDto, UpdateVacancyDto } from '../dto/vacancy.dto';
import { CurrencyService } from '../../../shared/currency.service';

const EDITABLE_STATUSES = ['draft', 'rejected'];

const SORTABLE_COLUMNS: Record<string, string> = {
  title: 'v.title',
  status: 'v.status',
  number_of_positions: 'v.number_of_positions',
  target_close_date: 'v.target_close_date',
  created_at: 'v.created_at',
};

const SELECT_WITH_JOINS = `
  SELECT v.*,
    b.name AS branch_name,
    d.name AS department_name,
    p.name AS position_name,
    et.name AS employment_type_name,
    hm.first_name AS hiring_manager_first_name, hm.last_name AS hiring_manager_last_name,
    rc.first_name AS recruiter_first_name, rc.last_name AS recruiter_last_name,
    rm.first_name AS reporting_manager_first_name, rm.last_name AS reporting_manager_last_name,
    cb.email AS created_by_email
  FROM vacancies v
  LEFT JOIN branches b ON v.branch_id = b.id
  LEFT JOIN departments d ON v.department_id = d.id
  LEFT JOIN positions p ON v.position_id = p.id
  LEFT JOIN employment_types et ON v.employment_type_id = et.id
  LEFT JOIN employees hm ON v.hiring_manager_id = hm.id
  LEFT JOIN employees rc ON v.recruiter_id = rc.id
  LEFT JOIN employees rm ON v.reporting_manager_id = rm.id
  LEFT JOIN users cb ON v.created_by = cb.id
`;

export interface VacancyFilters {
  q?: string;
  status?: string;
  branch_id?: string;
  department_id?: string;
  employment_type_id?: string;
  recruiter_id?: string;
  hiring_manager_id?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class VacancyService {
  constructor(
    private db: DatabaseService,
    private notifications: NotificationEmitterService,
    private currencyService: CurrencyService,
  ) {}

  async list(tenantId: string, accessScope: AccessScope | undefined, filters: VacancyFilters) {
    const {
      q, status, branch_id, department_id, employment_type_id, recruiter_id, hiring_manager_id,
      includeArchived, sortBy = 'created_at', sortDir = 'desc',
      page = 1, limit = 20,
    } = filters;

    let where = 'WHERE v.tenant_id = $1 AND v.deleted_at IS NULL';
    const params: any[] = [tenantId];
    let idx = 2;

    if (!includeArchived && !status) { where += ` AND v.status != 'archived'`; }
    if (status) { where += ` AND v.status = $${idx++}`; params.push(status); }
    if (branch_id) { where += ` AND v.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND v.department_id = $${idx++}`; params.push(department_id); }
    if (employment_type_id) { where += ` AND v.employment_type_id = $${idx++}`; params.push(employment_type_id); }
    if (recruiter_id) { where += ` AND v.recruiter_id = $${idx++}`; params.push(recruiter_id); }
    if (hiring_manager_id) { where += ` AND v.hiring_manager_id = $${idx++}`; params.push(hiring_manager_id); }
    if (q) { where += ` AND v.title ILIKE $${idx++}`; params.push(`%${q}%`); }
    if (accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'v.branch_id', idx);
      where += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    const orderCol = SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.created_at;
    const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM vacancies v ${where}`, params),
      this.db.query(
        `${SELECT_WITH_JOINS} ${where} ORDER BY ${orderCol} ${orderDir} LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows, total };
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `${SELECT_WITH_JOINS} WHERE v.id = $1 AND v.tenant_id = $2 AND v.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Vacancy not found');
    return rows[0];
  }

  async create(tenantId: string, createdById: string, dto: CreateVacancyDto) {
    const currency = await this.currencyService.getTenantCurrencySnapshot(tenantId, dto.currency);
    const { rows } = await this.db.query(
      `INSERT INTO vacancies (
        tenant_id, branch_id, department_id, position_id, title,
        hiring_manager_id, recruiter_id, reporting_manager_id, employment_type_id,
        experience_min_years, experience_max_years, qualification,
        salary_min, salary_max, currency, number_of_positions,
        target_start_date, target_close_date, description, justification,
        created_by, last_updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)
      RETURNING *`,
      [
        tenantId, dto.branch_id ?? null, dto.department_id ?? null, dto.position_id ?? null, dto.title,
        dto.hiring_manager_id ?? null, dto.recruiter_id ?? null, dto.reporting_manager_id ?? null, dto.employment_type_id ?? null,
        dto.experience_min_years ?? null, dto.experience_max_years ?? null, dto.qualification ?? null,
        dto.salary_min ?? null, dto.salary_max ?? null, currency.currencyCode, dto.number_of_positions ?? 1,
        dto.target_start_date ?? null, dto.target_close_date ?? null, dto.description ?? null, dto.justification ?? null,
        createdById,
      ],
    );
    return this.findOne(rows[0].id, tenantId);
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateVacancyDto) {
    const existing = await this.getRaw(id, tenantId);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a vacancy with status '${existing.status}'`);
    }

    const currencyCode = dto.currency !== undefined
      ? this.currencyService.getDefinition(dto.currency).code
      : undefined;

    await this.db.query(
      `UPDATE vacancies SET
        branch_id = COALESCE($3, branch_id), department_id = COALESCE($4, department_id),
        position_id = COALESCE($5, position_id), title = COALESCE($6, title),
        hiring_manager_id = COALESCE($7, hiring_manager_id), recruiter_id = COALESCE($8, recruiter_id),
        reporting_manager_id = COALESCE($9, reporting_manager_id), employment_type_id = COALESCE($10, employment_type_id),
        experience_min_years = COALESCE($11, experience_min_years), experience_max_years = COALESCE($12, experience_max_years),
        qualification = COALESCE($13, qualification),
        salary_min = COALESCE($14, salary_min), salary_max = COALESCE($15, salary_max), currency = COALESCE($16, currency),
        number_of_positions = COALESCE($17, number_of_positions),
        target_start_date = COALESCE($18, target_start_date), target_close_date = COALESCE($19, target_close_date),
        description = COALESCE($20, description), justification = COALESCE($21, justification),
        last_updated_by = $22, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        id, tenantId, dto.branch_id, dto.department_id, dto.position_id, dto.title,
        dto.hiring_manager_id, dto.recruiter_id, dto.reporting_manager_id, dto.employment_type_id,
        dto.experience_min_years, dto.experience_max_years, dto.qualification,
        dto.salary_min, dto.salary_max, currencyCode, dto.number_of_positions,
        dto.target_start_date, dto.target_close_date, dto.description, dto.justification,
        updatedById,
      ],
    );
    return this.findOne(id, tenantId);
  }

  async softDelete(id: string, tenantId: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft vacancies can be deleted');
    }
    await this.db.query('UPDATE vacancies SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  /** Internal transition fired by VacancyApprovalService right after full approval. */
  async open(id: string, tenantId: string, actorId: string) {
    const existing = await this.getRaw(id, tenantId);
    await this.transition(id, tenantId, existing.status, 'open', actorId);
    return this.findOne(id, tenantId);
  }

  async close(id: string, tenantId: string, actorId: string, reason?: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!['open', 'on_hold', 'reopened'].includes(existing.status)) {
      throw new BadRequestException(`Cannot close a vacancy with status '${existing.status}'`);
    }
    await this.db.query(
      `UPDATE vacancies SET status = 'closed', closed_at = now(), closed_by = $3, close_reason = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, actorId, reason ?? null],
    );
    await this.recordStatusHistory(tenantId, id, existing.status, 'closed', actorId, reason);
    await this.notifyStakeholders(tenantId, existing, actorId, 'Vacancy closed', `"${existing.title}" has been closed.`);
    return this.findOne(id, tenantId);
  }

  async reopen(id: string, tenantId: string, actorId: string, reason?: string) {
    const existing = await this.getRaw(id, tenantId);
    if (existing.status !== 'closed') {
      throw new BadRequestException(`Cannot reopen a vacancy with status '${existing.status}'`);
    }
    await this.db.query(
      `UPDATE vacancies SET status = 'reopened', reopened_at = now(), reopened_by = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, actorId],
    );
    await this.recordStatusHistory(tenantId, id, existing.status, 'reopened', actorId, reason);
    await this.notifyStakeholders(tenantId, existing, actorId, 'Vacancy reopened', `"${existing.title}" has been reopened.`);
    return this.findOne(id, tenantId);
  }

  async archive(id: string, tenantId: string, actorId: string, reason?: string) {
    const existing = await this.getRaw(id, tenantId);
    if (!['closed', 'rejected', 'cancelled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot archive a vacancy with status '${existing.status}'`);
    }
    await this.db.query(
      `UPDATE vacancies SET status = 'archived', archived_at = now(), archived_by = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, actorId],
    );
    await this.recordStatusHistory(tenantId, id, existing.status, 'archived', actorId, reason);
    return this.findOne(id, tenantId);
  }

  /** Resolves an employees.id to the linked users.id, if any (employees may have no login account). */
  async resolveUserIdForEmployee(tenantId: string, employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const { rows } = await this.db.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL LIMIT 1',
      [tenantId, employeeId],
    );
    return rows[0]?.id ?? null;
  }

  private async notifyStakeholders(tenantId: string, vacancy: any, actorId: string, title: string, message: string) {
    const userIds = (await Promise.all(
      [vacancy.recruiter_id, vacancy.hiring_manager_id].map((empId) => this.resolveUserIdForEmployee(tenantId, empId)),
    )).filter((id): id is string => !!id && id !== actorId);
    if (!userIds.length) return;
    await this.notifications.emit(tenantId, {
      userIds, title, message, type: 'info', sourceModule: 'recruitment',
      entityType: 'vacancy', entityId: vacancy.id, branchId: vacancy.branch_id ?? undefined,
      actionUrl: `/dashboard/hr/recruitment/vacancies/${vacancy.id}`,
    });
  }

  async getStatusHistory(vacancyId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT h.*, u.email AS actor_email
       FROM vacancy_status_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.vacancy_id = $1 AND h.tenant_id = $2
       ORDER BY h.created_at ASC`,
      [vacancyId, tenantId],
    );
    return rows;
  }

  async recordStatusHistory(tenantId: string, vacancyId: string, fromStatus: string | null, toStatus: string, actorId?: string | null, reason?: string | null) {
    await this.db.query(
      `INSERT INTO vacancy_status_history (tenant_id, vacancy_id, from_status, to_status, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, vacancyId, fromStatus, toStatus, actorId ?? null, reason ?? null],
    );
  }

  /** Plain status transition without the close/reopen/archive side-columns — used by the approval sync path. */
  private async transition(id: string, tenantId: string, fromStatus: string, toStatus: string, actorId?: string | null, reason?: string | null) {
    await this.db.query(
      `UPDATE vacancies SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, toStatus],
    );
    await this.recordStatusHistory(tenantId, id, fromStatus, toStatus, actorId, reason);
  }

  async getRaw(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM vacancies WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Vacancy not found');
    return rows[0];
  }
}
