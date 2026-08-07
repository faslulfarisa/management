import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { splitProtectedFields } from '../../organization-registration/organization-registration.constants';
import { CurrencyService } from '../../../shared/currency.service';

const PROFILE_SELECT = `
  SELECT id, name, slug, logo_url, gstin, timezone, currency, currency_symbol, currency_metadata, date_format,
         legal_name, trade_name, company_code, registration_number, pan_number,
         cin_number, company_type, primary_email, support_email, phone_number,
         alternate_phone, website_url, registered_address, operational_address,
         work_week_config, leave_year_config, fiscal_year_start, max_failed_login_attempts,
         profile_updated_at, profile_updated_by, status, approval_status, industry,
         contact_person_name, contact_designation, contact_person_mobile, contact_person_email,
         created_at, updated_at
  FROM tenants WHERE id = $1 AND deleted_at IS NULL
`;

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class OrganizationProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly currencyService: CurrencyService,
  ) {}

  async getProfile(tenantId: string) {
    const { rows } = await this.db.query(PROFILE_SELECT, [tenantId]);
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  async updateCoreInfo(
    tenantId: string,
    userId: string,
    data: {
      name?: string;
      legalName?: string;
      tradeName?: string;
      companyCode?: string;
      registrationNumber?: string;
      gstin?: string;
      panNumber?: string;
      cinNumber?: string;
      companyType?: string;
      fiscalYearStart?: number;
    },
    meta: RequestMeta,
    isSuperAdmin = false,
  ) {
    const fieldMap = {
      name: 'name',
      legalName: 'legal_name',
      tradeName: 'trade_name',
      companyCode: 'company_code',
      registrationNumber: 'registration_number',
      gstin: 'gstin',
      panNumber: 'pan_number',
      cinNumber: 'cin_number',
      companyType: 'company_type',
      fiscalYearStart: 'fiscal_year_start',
    };

    if (!isSuperAdmin) {
      // Legal/registration identity fields are locked post-approval (Phase 7).
      // Org admins must use POST /organization-change-requests instead — this
      // is defense-in-depth since the Company Profile UI never sends these
      // fields here for a non-super-admin in the first place.
      const { protectedChanges } = splitProtectedFields(data);
      if (Object.keys(protectedChanges).length) {
        throw new ForbiddenException(
          'These fields are locked after approval. Submit a change request via POST /organization-change-requests instead.',
        );
      }
    }

    return this._patch(tenantId, userId, data, fieldMap, 'update_core_info', meta);
  }

  async updateContactInfo(
    tenantId: string,
    userId: string,
    data: {
      primaryEmail?: string;
      supportEmail?: string;
      phoneNumber?: string;
      alternatePhone?: string;
      websiteUrl?: string;
      contactPersonName?: string;
      contactDesignation?: string;
      contactPersonMobile?: string;
      contactPersonEmail?: string;
    },
    meta: RequestMeta,
  ) {
    return this._patch(tenantId, userId, data, {
      primaryEmail: 'primary_email',
      supportEmail: 'support_email',
      phoneNumber: 'phone_number',
      alternatePhone: 'alternate_phone',
      websiteUrl: 'website_url',
      contactPersonName: 'contact_person_name',
      contactDesignation: 'contact_designation',
      contactPersonMobile: 'contact_person_mobile',
      contactPersonEmail: 'contact_person_email',
    }, 'update_contact_info', meta);
  }

  async updateAddresses(
    tenantId: string,
    userId: string,
    data: {
      registeredAddress?: Record<string, any>;
      operationalAddress?: Record<string, any>;
    },
    meta: RequestMeta,
  ) {
    return this._patch(tenantId, userId, data, {
      registeredAddress: 'registered_address',
      operationalAddress: 'operational_address',
    }, 'update_addresses', meta);
  }

  async updateOperationalConfig(
    tenantId: string,
    userId: string,
    data: {
      timezone?: string;
      currency?: string;
      dateFormat?: string;
      workWeekConfig?: Record<string, any>;
      leaveYearConfig?: Record<string, any>;
    },
    meta: RequestMeta,
  ) {
    if (data.currency !== undefined) {
      const currency = this.currencyService.snapshot(data.currency);
      (data as any).currencySymbol = currency.currencySymbol;
      (data as any).currencyMetadata = currency.currencyMetadata;
      data.currency = currency.currencyCode;
    }

    return this._patch(tenantId, userId, data, {
      timezone: 'timezone',
      currency: 'currency',
      currencySymbol: 'currency_symbol',
      currencyMetadata: 'currency_metadata',
      dateFormat: 'date_format',
      workWeekConfig: 'work_week_config',
      leaveYearConfig: 'leave_year_config',
    }, 'update_operational_config', meta);
  }

  async updateSecurityConfig(
    tenantId: string,
    userId: string,
    data: {
      maxFailedLoginAttempts?: number;
    },
    meta: RequestMeta,
  ) {
    if (data.maxFailedLoginAttempts !== undefined) {
      if (data.maxFailedLoginAttempts < 3 || data.maxFailedLoginAttempts > 10) {
        throw new BadRequestException('Max failed login attempts must be between 3 and 10');
      }
    }
    return this._patch(tenantId, userId, data, {
      maxFailedLoginAttempts: 'max_failed_login_attempts',
    }, 'update_security_config', meta);
  }

  private async _patch(
    tenantId: string,
    userId: string,
    data: Record<string, any>,
    fieldMap: Record<string, string>,
    action: string,
    meta: RequestMeta,
  ) {
    const old = await this.getProfile(tenantId);

    const setClauses: string[] = [];
    const values: any[] = [tenantId];
    let idx = 2;

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (data[jsKey] !== undefined) {
        const val =
          typeof data[jsKey] === 'object' && data[jsKey] !== null
            ? JSON.stringify(data[jsKey])
            : data[jsKey];
        setClauses.push(`${dbCol} = $${idx++}`);
        values.push(val);
      }
    }

    if (!setClauses.length) throw new BadRequestException('No fields provided to update');

    setClauses.push(`profile_updated_at = now()`, `profile_updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId);

    const { rows } = await this.db.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'organization_profile',
      entityId: tenantId,
      action,
      oldValues: old,
      newValues: rows[0],
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return rows[0];
  }
}
