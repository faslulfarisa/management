import { Injectable, Logger, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { EmailService } from '../../auth/email.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { SignupOfferService } from '../../platform/services/signup-offer.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import {
  CreateAccountDto, RegistrationSessionDto, VerifyMobileDto, SubmitOrganizationDto,
} from '../dto/registration.dto';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private db: DatabaseService,
    private emailService: EmailService,
    private auditLog: AuditLogService,
    private signupOfferService: SignupOfferService,
    private notificationEmitter: NotificationEmitterService,
  ) {}

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async getSessionOrThrow(registrationId: string, accessToken: string) {
    const { rows } = await this.db.query('SELECT * FROM pending_registrations WHERE id = $1', [registrationId]);
    if (!rows.length) throw new BadRequestException('Registration not found or already completed');
    if (this.sha256(accessToken) !== rows[0].access_token_hash) {
      throw new ForbiddenException('Invalid registration session');
    }
    return rows[0];
  }

  private async retireStaleRegistrationOwner(email: string, client: Pick<DatabaseService, 'query'> = this.db) {
    await client.query(
      `UPDATE users u
       SET deleted_at = now(), updated_at = now()
       WHERE LOWER(u.email) = $1
         AND u.deleted_at IS NULL
         AND u.is_registration_owner = true
         AND NOT EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM tenants t
           WHERE t.deleted_at IS NULL
             AND (
               t.organization_admin_user_id = u.id
               OR t.registration_owner_user_id = u.id
             )
         )`,
      [email],
    );
  }

  // ── Step 1: account creation ────────────────────────────────────

  async createAccount(dto: CreateAccountDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const email = dto.email.toLowerCase().trim();

    await this.retireStaleRegistrationOwner(email);

    const { rows: existingUser } = await this.db.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
      [email],
    );
    if (existingUser.length) {
      throw new ConflictException('An account with this email already exists. Please log in instead.');
    }

    // Replace any stale in-flight registration for the same email rather
    // than erroring — the registrant may simply be retrying.
    await this.db.query('DELETE FROM pending_registrations WHERE LOWER(email) = $1', [email]);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const accessToken = crypto.randomBytes(32).toString('hex');
    const accessTokenHash = this.sha256(accessToken);

    const { rows } = await this.db.query(
      `INSERT INTO pending_registrations
         (full_name, email, mobile, password_hash, access_token_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [dto.fullName, email, dto.mobile || null, passwordHash, accessTokenHash],
    );

    const registrationId = rows[0].id;

    return { registrationId, accessToken };
  }

  // ── Mobile verification (optional, best-effort — no SMS provider exists) ──

  async requestMobileOtp(dto: RegistrationSessionDto) {
    const reg = await this.getSessionOrThrow(dto.registrationId, dto.accessToken);
    if (!reg.mobile) throw new BadRequestException('No mobile number on file for this registration');

    const otpBytes = crypto.randomBytes(3);
    const otp = (parseInt(otpBytes.toString('hex'), 16) % 900000 + 100000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.db.query(
      'UPDATE pending_registrations SET mobile_otp_hash = $1, mobile_otp_expires_at = $2 WHERE id = $3',
      [otpHash, expiresAt, reg.id],
    );

    // No SMS/WhatsApp provider is integrated in this codebase — mobile
    // verification is explicitly optional per spec. Same dev fallback style
    // as EmailService when SMTP isn't configured.
    this.logger.warn(`[DEV — no SMS provider] Mobile OTP for <${reg.mobile}>: ${otp}`);

    return { success: true };
  }

  async verifyMobile(dto: VerifyMobileDto) {
    const reg = await this.getSessionOrThrow(dto.registrationId, dto.accessToken);
    if (!reg.mobile_otp_hash || !reg.mobile_otp_expires_at || new Date(reg.mobile_otp_expires_at) < new Date()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }
    const isValid = await bcrypt.compare(dto.otp, reg.mobile_otp_hash);
    if (!isValid) throw new BadRequestException('Invalid OTP');
    await this.db.query('UPDATE pending_registrations SET mobile_verified_at = now() WHERE id = $1', [reg.id]);
    return { success: true };
  }

  async getAccountStatus(registrationId: string, accessToken: string) {
    const reg = await this.getSessionOrThrow(registrationId, accessToken);
    return {
      fullName: reg.full_name,
      email: reg.email,
      mobile: reg.mobile,
      mobileVerified: !!reg.mobile_verified_at,
    };
  }

  // ── Step 2: organization submission ─────────────────────────────

  private async assertNoDuplicateOrg(opts: { gstin?: string; registrationNumber?: string; corporateEmail: string; companyCode: string }) {
    const checks: { label: string; column: string; value?: string }[] = [
      { label: 'company code', column: 'company_code', value: opts.companyCode },
      { label: 'GST number', column: 'gstin', value: opts.gstin },
      { label: 'registration number', column: 'registration_number', value: opts.registrationNumber },
      { label: 'corporate email', column: 'primary_email', value: opts.corporateEmail },
    ];
    for (const check of checks) {
      if (!check.value) continue;
      const { rows } = await this.db.query(
        `SELECT 1 FROM tenants WHERE LOWER(${check.column}) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
        [check.value],
      );
      if (rows.length) {
        throw new ConflictException(`An organization with this ${check.label} is already registered.`);
      }
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'org';
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { rows } = await this.db.query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
      if (!rows.length) return slug;
      slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
    }
    return `${base}-${Date.now()}`;
  }

  async submitOrganization(dto: SubmitOrganizationDto, ipAddress?: string, userAgent?: string) {
    const reg = await this.getSessionOrThrow(dto.registrationId, dto.accessToken);

    const corporateEmail = dto.corporateEmail.toLowerCase().trim();
    const companyCode = dto.companyCode.trim();
    await this.assertNoDuplicateOrg({ gstin: dto.gstin, registrationNumber: dto.registrationNumber, corporateEmail, companyCode });

    const name = dto.tradeName || dto.legalName;
    const slug = await this.generateUniqueSlug(name);

    const { tenant, userId, offerApplied, trialEndsAt } = await this.db.transaction(async (client) => {
      const { rows: tenantRows } = await client.query(
        `INSERT INTO tenants (
           name, slug, legal_name, trade_name, company_code, company_type, registration_number, gstin,
           pan_number, cin_number, industry, website_url, primary_email, support_email,
           phone_number, alternate_phone, registered_address, operational_address,
           business_category, current_hr_system, company_size,
           estimated_branch_count, estimated_employee_count,
           contact_person_name, contact_designation, contact_person_mobile, contact_person_email,
           approval_status, status, submitted_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
           'pending_review', 'pending', now()
         ) RETURNING *`,
        [
          name, slug, dto.legalName, dto.tradeName || null, companyCode, dto.companyType, dto.registrationNumber || null,
          dto.gstin || null, dto.panNumber || null, dto.cinNumber || null, dto.industry || null,
          dto.websiteUrl || null, corporateEmail, dto.supportEmail || null, dto.phoneNumber,
          dto.alternatePhone || null, JSON.stringify(dto.registeredAddress),
          dto.operationalAddress ? JSON.stringify(dto.operationalAddress) : null,
          dto.businessCategory || null, dto.currentHrSystem || null, dto.companySize || null,
          dto.estimatedBranchCount || null, dto.estimatedEmployeeCount || null,
          dto.contactPersonName, dto.contactDesignation, dto.contactPersonMobile, dto.contactPersonEmail,
        ],
      );
      const tenant = tenantRows[0];

      await this.retireStaleRegistrationOwner(reg.email, client);

      const { rows: userRows } = await client.query(
        `INSERT INTO users (tenant_id, email, phone, password_hash, is_registration_owner, mobile_verified_at)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [tenant.id, reg.email, reg.mobile, reg.password_hash, reg.mobile_verified_at],
      );
      const userId = userRows[0].id;

      await client.query(
        `INSERT INTO user_tenants (user_id, tenant_id, user_type, is_org_admin) VALUES ($1, $2, 'org_admin', true)`,
        [userId, tenant.id],
      );

      await client.query(
        `UPDATE tenants SET organization_admin_user_id = $1, registration_owner_user_id = $1 WHERE id = $2`,
        [userId, tenant.id],
      );

      await client.query('DELETE FROM pending_registrations WHERE id = $1', [reg.id]);

      // Offers are a nice-to-have, not core registration data — if it's
      // become invalid between page load and submit (expired, exhausted,
      // deactivated), proceed with org creation rather than failing the
      // whole signup.
      let offerApplied = false;
      let trialEndsAt: Date | null = null;
      if (dto.offerId) {
        try {
          const result = await this.signupOfferService.redeemForTenant(client, tenant.id, dto.offerId);
          offerApplied = true;
          trialEndsAt = result.trialEndsAt;
        } catch (err: any) {
          this.logger.warn(`Signup offer ${dto.offerId} could not be applied to tenant ${tenant.id}: ${err.message}`);
        }
      }

      return { tenant, userId, offerApplied, trialEndsAt };
    });

    await this.auditLog.log({
      tenantId: tenant.id,
      userId,
      entityType: 'organization',
      entityId: tenant.id,
      action: 'organization_created',
      newValues: { legalName: dto.legalName, corporateEmail, contactPersonName: dto.contactPersonName, offerId: dto.offerId, offerApplied },
      ipAddress,
      userAgent,
    });

    await this.notifySuperAdmins(tenant);

    return { tenantId: tenant.id, approvalStatus: 'pending_review', offerApplied, trialEndsAt };
  }

  private async notifySuperAdmins(tenant: any) {
    const { rows: admins } = await this.db.query(
      `SELECT id, email FROM users WHERE is_super_admin = true AND deleted_at IS NULL AND is_active = true`,
    );
    if (!admins.length) return;

    await this.notificationEmitter.emit(tenant.id, {
      userIds: admins.map((a: any) => a.id),
      title: 'New Organization Registration',
      message: `${tenant.legal_name} has submitted a registration and is awaiting review.`,
      type: 'approval',
      priority: 'high',
      sourceModule: 'organization_registration',
      actionUrl: `/dashboard/platform/organization-approvals/${tenant.id}`,
      entityType: 'tenant',
      entityId: tenant.id,
    });

    for (const admin of admins) {
      try {
        await this.emailService.sendOrganizationSubmittedEmail(admin.email, tenant);
      } catch {
        // ignore delivery failures
      }
    }
  }

  // ── Pending confirmation page polling ───────────────────────────

  async getOrganizationStatus(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, status, lifecycle_stage, approval_status, rejection_reason, submitted_at, reviewed_at, trial_ends_at
       FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (!rows.length) throw new BadRequestException('Organization not found');
    const organization = rows[0];
    return {
      ...organization,
      approval_status: this.getEffectiveOrganizationStatus(organization),
    };
  }

  private getEffectiveOrganizationStatus(organization: any): string {
    if (organization.status !== 'active' && organization.lifecycle_stage && organization.lifecycle_stage !== 'active') {
      return organization.lifecycle_stage;
    }
    if (organization.approval_status && organization.approval_status !== 'approved') {
      return organization.approval_status;
    }
    return organization.status === 'active' ? 'approved' : 'pending_review';
  }
}
