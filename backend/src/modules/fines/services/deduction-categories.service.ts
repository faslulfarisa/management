import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

const DEFAULT_CATEGORIES = [
  { code: 'LATE_COMING',           name: 'Late Coming Beyond Limit',     category_type: 'disciplinary' },
  { code: 'REPEATED_LATE',         name: 'Repeated Late Arrivals',        category_type: 'disciplinary' },
  { code: 'UNAUTH_ABSENCE',        name: 'Unauthorized Absence',          category_type: 'disciplinary' },
  { code: 'SHIFT_VIOLATION',       name: 'Shift Violation',               category_type: 'disciplinary' },
  { code: 'POLICY_VIOLATION',      name: 'Policy Violation',              category_type: 'policy'       },
  { code: 'ASSET_DAMAGE',          name: 'Asset Damage',                  category_type: 'asset'        },
  { code: 'UNIFORM_DAMAGE',        name: 'Uniform Damage / Loss',         category_type: 'asset'        },
  { code: 'INVENTORY_LOSS',        name: 'Inventory Loss',                category_type: 'asset'        },
  { code: 'OP_NEGLIGENCE',         name: 'Operational Negligence',        category_type: 'disciplinary' },
  { code: 'MISCONDUCT',            name: 'Misconduct',                    category_type: 'disciplinary' },
  { code: 'REIMB_RECOVERY',        name: 'Reimbursement Recovery',        category_type: 'recovery'     },
  { code: 'SALARY_ADVANCE',        name: 'Salary Advance Recovery',       category_type: 'financial'    },
  { code: 'TRAINING_RECOVERY',     name: 'Training Recovery',             category_type: 'financial'    },
  { code: 'DEVICE_MISUSE',         name: 'Device Misuse',                 category_type: 'disciplinary' },
];

@Injectable()
export class DeductionCategoriesService {
  constructor(private db: DatabaseService) {}

  async getCategories(tenantId: string, filters: { branch_id?: string; category_type?: string; is_active?: boolean } = {}) {
    let query = `SELECT * FROM deduction_categories WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (filters.branch_id !== undefined) {
      // include org-wide (branch_id IS NULL) and branch-specific
      query += ` AND (branch_id IS NULL OR branch_id = $${idx++})`;
      params.push(filters.branch_id);
    }
    if (filters.category_type) {
      query += ` AND category_type = $${idx++}`;
      params.push(filters.category_type);
    }
    if (filters.is_active !== undefined) {
      query += ` AND is_active = $${idx++}`;
      params.push(filters.is_active);
    }

    query += ' ORDER BY category_type, name';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createCategory(tenantId: string | null, dto: any) {
    if (!tenantId) {
      if (dto.tenant_id) {
        tenantId = dto.tenant_id;
      } else if (dto.branch_id) {
        const { rows } = await this.db.query(
          'SELECT tenant_id FROM branches WHERE id = $1 LIMIT 1', [dto.branch_id],
        );
        if (rows.length) tenantId = rows[0].tenant_id;
      }
      if (!tenantId) throw new BadRequestException('tenant_id is required when creating a category as superadmin');
    }
    const { rows } = await this.db.query(
      `INSERT INTO deduction_categories
         (tenant_id, branch_id, name, code, category_type, description, is_payroll_deductible)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, code) DO UPDATE
         SET name                 = EXCLUDED.name,
             category_type        = EXCLUDED.category_type,
             description          = EXCLUDED.description,
             is_payroll_deductible = EXCLUDED.is_payroll_deductible,
             updated_at           = now()
       RETURNING *`,
      [
        tenantId,
        dto.branch_id ?? null,
        dto.name,
        dto.code.toUpperCase(),
        dto.category_type,
        dto.description ?? null,
        dto.is_payroll_deductible ?? true,
      ],
    );
    return rows[0];
  }

  async updateCategory(id: string, tenantId: string, dto: any) {
    const setClauses: string[] = ['updated_at = now()'];
    const vals: any[] = [id, tenantId];
    let idx = 3;

    if (dto.name !== undefined) { setClauses.push(`name = $${idx++}`); vals.push(dto.name); }
    if (dto.description !== undefined) { setClauses.push(`description = $${idx++}`); vals.push(dto.description); }
    if (dto.category_type !== undefined) { setClauses.push(`category_type = $${idx++}`); vals.push(dto.category_type); }
    if (dto.is_payroll_deductible !== undefined) { setClauses.push(`is_payroll_deductible = $${idx++}`); vals.push(dto.is_payroll_deductible); }
    if (dto.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); vals.push(dto.is_active); }

    const { rows } = await this.db.query(
      `UPDATE deduction_categories SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      vals,
    );
    if (!rows.length) throw new NotFoundException('Category not found');
    return rows[0];
  }

  async deleteCategory(id: string, tenantId: string | null) {
    const { rows } = await this.db.query(
      `UPDATE deduction_categories SET is_active = false, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Category not found');
    return rows[0];
  }

  /**
   * Called during tenant onboarding (or lazily on first request) to seed
   * the 14 predefined org-level deduction categories.
   */
  async ensureDefaults(tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    for (const cat of DEFAULT_CATEGORIES) {
      await this.db.query(
        `INSERT INTO deduction_categories (tenant_id, branch_id, name, code, category_type)
         VALUES ($1, NULL, $2, $3, $4)
         ON CONFLICT (tenant_id, code) DO NOTHING`,
        [tenantId, cat.name, cat.code, cat.category_type],
      );
    }
  }
}
