import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CompanyBankAccountService } from './company-bank-account.service';
import { CurrencyService } from '../../../shared/currency.service';

@Injectable()
export class TenantService {
  constructor(
    private db: DatabaseService,
    private bankAccountService: CompanyBankAccountService,
    private currencyService: CurrencyService,
  ) {}

  async findAll() {
    const { rows } = await this.db.query(
      'SELECT * FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
    return rows;
  }

  async findAllForUser(userId: string, isSuperAdmin: boolean) {
    if (isSuperAdmin) {
      return this.findAll();
    }

    const { rows } = await this.db.query(
      `SELECT t.*, ut.is_org_admin
       FROM user_tenants ut
       JOIN tenants t ON ut.tenant_id = t.id
       WHERE ut.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.name ASC`,
      [userId],
    );
    return rows;
  }

  async findOne(id: string, requestingUserId?: string, isSuperAdmin?: boolean) {
    const { rows } = await this.db.query(
      'SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (!rows.length) throw new NotFoundException('Tenant not found');

    // Membership check: a non-super-admin may only view organizations they
    // belong to. Without this, any authenticated user could fetch any other
    // organization's full profile (legal name, GSTIN, address, etc.) by id.
    if (!isSuperAdmin && requestingUserId) {
      const { rows: memberRows } = await this.db.query(
        'SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
        [requestingUserId, id],
      );
      if (!memberRows.length) throw new ForbiddenException('You do not have access to this organization');
    }

    return rows[0];
  }

  async create(data: any, createdByUserId?: string) {
    const companyCode = typeof (data.company_code ?? data.companyCode) === 'string'
      ? (data.company_code ?? data.companyCode).trim()
      : '';
    if (!companyCode) {
      throw new BadRequestException('Company code is required');
    }

    // Check slug uniqueness
    const { rows: existing } = await this.db.query(
      'SELECT 1 FROM tenants WHERE slug = $1 AND deleted_at IS NULL',
      [data.slug],
    );
    if (existing.length) throw new BadRequestException('Organization slug already exists');

    const { rows: codeConflict } = await this.db.query(
      'SELECT 1 FROM tenants WHERE LOWER(company_code) = LOWER($1) AND deleted_at IS NULL',
      [companyCode],
    );
    if (codeConflict.length) throw new BadRequestException('Company code already exists');

    const primaryEmail = typeof data.primary_email === 'string' ? data.primary_email.trim().toLowerCase() : '';
    const gstin = typeof data.gstin === 'string' ? data.gstin.trim() : '';
    const registrationNumber = typeof data.registration_number === 'string' ? data.registration_number.trim() : '';
    await this.assertUniqueTenantIdentity({
      primaryEmail: primaryEmail || null,
      gstin: gstin || null,
      registrationNumber: registrationNumber || null,
    });

    // Validate and normalise emp_code_prefix
    const empPrefix = data.emp_code_prefix ? data.emp_code_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
    if (empPrefix) {
      const { rows: prefixConflict } = await this.db.query(
        'SELECT 1 FROM tenants WHERE emp_code_prefix = $1 AND deleted_at IS NULL',
        [empPrefix],
      );
      if (prefixConflict.length) throw new BadRequestException('Employee code prefix already in use by another organization');
    }

    const toJsonb = (val: any) => (val && typeof val === 'object' ? JSON.stringify(val) : null);
    const currency = this.currencyService.snapshot(data.currency);

    const { rows } = await this.db.query(
      `INSERT INTO tenants (
         name, slug, logo_url, gstin, registered_address, fiscal_year_start, timezone, status,
         emp_code_prefix, emp_code_digits, legal_name, trade_name, company_code, registration_number,
         pan_number, cin_number, company_type, industry, primary_email, support_email, phone_number,
         alternate_phone, website_url, operational_address, currency, currency_symbol, currency_metadata, date_format, work_week_config,
         leave_year_config, max_failed_login_attempts, contact_person_name, contact_designation,
         contact_person_mobile, contact_person_email, estimated_branch_count, estimated_employee_count,
         business_category, current_hr_system
       ) VALUES (
         $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25,$26,$27::jsonb,$28,$29::jsonb,$30::jsonb,$31,$32,$33,$34,$35,$36,$37,$38,$39
       ) RETURNING *`,
      [
        data.name, data.slug, data.logo_url || null, gstin || null, toJsonb(data.registered_address),
        data.fiscal_year_start || 4, data.timezone || 'Asia/Kolkata', data.status || 'active', empPrefix,
        data.emp_code_digits || 4, data.legal_name || null, data.trade_name || null, companyCode,
        registrationNumber || null, data.pan_number || null, data.cin_number || null,
        data.company_type || null, data.industry || null, primaryEmail || null, data.support_email || null,
        data.phone_number || null, data.alternate_phone || null, data.website_url || null,
        toJsonb(data.operational_address), currency.currencyCode, currency.currencySymbol,
        JSON.stringify(currency.currencyMetadata), data.date_format || 'DD/MM/YYYY',
        toJsonb(data.work_week_config), toJsonb(data.leave_year_config), data.max_failed_login_attempts || 5,
        data.contact_person_name || null, data.contact_designation || null, data.contact_person_mobile || null,
        data.contact_person_email || null, data.estimated_branch_count || null, data.estimated_employee_count || null,
        data.business_category || null, data.current_hr_system || null,
      ],
    );

    const tenant = rows[0];

    // Claim existing employees whose codes match the prefix
    if (empPrefix) {
      await this.db.query(
        'UPDATE employees SET tenant_id = $1, updated_at = now() WHERE employee_code LIKE $2 AND deleted_at IS NULL',
        [tenant.id, `${empPrefix}%`],
      );
    }

    if (Array.isArray(data.bank_accounts) && createdByUserId) {
      for (const account of data.bank_accounts) {
        if (!account.bankName && !account.upiId) continue;
        await this.bankAccountService.create(tenant.id, createdByUserId, account, {});
      }
    }

    return tenant;
  }

  private async assertUniqueTenantIdentity(values: { primaryEmail?: string | null; gstin?: string | null; registrationNumber?: string | null }) {
    const checks = [
      { value: values.primaryEmail, column: 'primary_email', label: 'corporate email' },
      { value: values.gstin, column: 'gstin', label: 'GST number' },
      { value: values.registrationNumber, column: 'registration_number', label: 'registration number' },
    ].filter((check) => !!check.value);

    for (const check of checks) {
      const { rows } = await this.db.query(
        `SELECT 1 FROM tenants WHERE ${check.column} = $1 AND deleted_at IS NULL LIMIT 1`,
        [check.value],
      );
      if (rows.length) {
        throw new ConflictException(`Another organization already uses this ${check.label}.`);
      }
    }
  }

  async update(id: string, data: any, isSuperAdmin: boolean = false) {
    await this.findOne(id);

    if (!isSuperAdmin) {
      // Org admins may edit their own organization's profile fields, but
      // lifecycle/ownership fields are super-admin-only (use the dedicated
      // suspend/activate endpoints and the Edit Access flow respectively).
      delete data.status;
      delete data.organization_admin_user_id;
      delete data.assigned_by_super_admin;
    }

    if (data.company_code !== undefined || data.companyCode !== undefined) {
      const rawCompanyCode = data.company_code ?? data.companyCode;
      const companyCode = typeof rawCompanyCode === 'string' ? rawCompanyCode.trim() : '';
      if (!companyCode) {
        throw new BadRequestException('Company code is required');
      }

      const { rows: codeConflict } = await this.db.query(
        'SELECT 1 FROM tenants WHERE LOWER(company_code) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
        [companyCode, id],
      );
      if (codeConflict.length) throw new BadRequestException('Company code already exists');

      delete data.companyCode;
      data.company_code = companyCode;
    }

    if (data.emp_code_prefix !== undefined) {
      data.emp_code_prefix = data.emp_code_prefix
        ? data.emp_code_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '') || null
        : null;
      if (data.emp_code_prefix) {
        const { rows: prefixConflict } = await this.db.query(
          'SELECT 1 FROM tenants WHERE emp_code_prefix = $1 AND id != $2 AND deleted_at IS NULL',
          [data.emp_code_prefix, id],
        );
        if (prefixConflict.length) throw new BadRequestException('Employee code prefix already in use by another organization');
      }
    }

    if (data.currency !== undefined) {
      const currency = this.currencyService.snapshot(data.currency);
      data.currency = currency.currencyCode;
      data.currency_symbol = currency.currencySymbol;
      data.currency_metadata = currency.currencyMetadata;
    }

    const fields = Object.keys(data).filter(k => k !== 'bank_accounts' && data[k] !== undefined);
    if (!fields.length) throw new BadRequestException('No fields to update');

    const setClauses = fields.map((f, i) => `${this.toSnake(f)} = $${i + 2}`).join(', ');
    const values = fields.map(f => {
      const val = data[f];
      return val && typeof val === 'object' ? JSON.stringify(val) : val;
    });

    const { rows } = await this.db.query(
      `UPDATE tenants SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...values],
    );

    const updatedTenant = rows[0];

    // Claim existing employees whose codes match the (new) prefix
    if (updatedTenant.emp_code_prefix) {
      await this.db.query(
        'UPDATE employees SET tenant_id = $1, updated_at = now() WHERE employee_code LIKE $2 AND deleted_at IS NULL',
        [id, `${updatedTenant.emp_code_prefix}%`],
      );
    }

    return updatedTenant;
  }

  async remove(id: string) {
    await this.findOne(id);
    const { rows } = await this.db.query(
      'UPDATE tenants SET deleted_at = now() WHERE id = $1 RETURNING *',
      [id],
    );
    return rows[0];
  }

  async suspend(id: string) {
    await this.findOne(id);
    const { rows } = await this.db.query(
      `UPDATE tenants SET status = 'suspended', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0];
  }

  async activate(id: string) {
    await this.findOne(id);
    const { rows } = await this.db.query(
      `UPDATE tenants SET status = 'active', updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0];
  }

  async getMembers(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.phone, u.is_active, u.is_super_admin, ut.is_org_admin, ut.created_at
       FROM user_tenants ut
       JOIN users u ON ut.user_id = u.id
       WHERE ut.tenant_id = $1 AND u.deleted_at IS NULL
       ORDER BY ut.created_at ASC`,
      [tenantId],
    );
    return rows;
  }

  // Plain membership only — Organization Admin assignment is exclusively done
  // via UserHierarchyService.setUserAccess (super-admin-gated), not here.
  async addMember(tenantId: string, userId: string) {
    await this.findOne(tenantId);
    await this.db.query(
      'INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2) ON CONFLICT (user_id, tenant_id) DO NOTHING',
      [userId, tenantId],
    );
    return { success: true };
  }

  async removeMember(tenantId: string, userId: string) {
    const { rows } = await this.db.query(
      'SELECT is_super_admin FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    if (rows[0]?.is_super_admin) {
      throw new BadRequestException('Super admin cannot be removed from an organization');
    }
    await this.db.query(
      'DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );
    return { success: true };
  }

  private toSnake(s: string) {
    return s.replace(/([A-Z])/g, '_$1').toLowerCase();
  }
}
