import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';
import { FileUploadService } from '../../shared/file-upload.service';
import { AuditLogService } from '../platform/services/audit-log.service';
import { AuthorizationService } from '../platform/services/authorization.service';

const DEFAULT_NOTIFICATION_MODULES = [
  'approvals',
  'attendance',
  'payroll',
  'recruitment',
  'system',
];

const APPROVAL_REQUIRED_FIELDS = [
  'legalName',
  'dateOfBirth',
  'pan',
  'aadhaar',
  'bankDetails',
  'department',
  'designation',
  'reportingManager',
];

@Injectable()
export class AccountProfileService {
  constructor(
    private db: DatabaseService,
    private fileUpload: FileUploadService,
    private auditLog: AuditLogService,
    private authorizationService: AuthorizationService,
  ) {}

  async getProfile(user: any) {
    const userId = user.sub;
    const tenantId = user.tenantId || user.tenant_id || null;

    const [
      account,
      employee,
      organization,
      branches,
      permissionsResult,
      sessions,
      trustedDevices,
      notificationPreferences,
      activity,
      documents,
    ] = await Promise.all([
      this.getAccount(userId),
      tenantId ? this.getEmployee(userId, user.employeeId || user.employee_id, tenantId) : Promise.resolve(null),
      tenantId ? this.getOrganization(tenantId) : Promise.resolve(null),
      tenantId ? this.getBranches(userId, tenantId) : Promise.resolve([]),
      tenantId ? this.authorizationService.getEffectivePermissions(user) : Promise.resolve({ permissions: [], accessScope: null }),
      this.getSessions(userId),
      this.getTrustedDevices(userId),
      tenantId ? this.getNotificationPreferences(userId, tenantId) : Promise.resolve([]),
      tenantId ? this.getActivity(userId, tenantId) : Promise.resolve([]),
      tenantId ? this.getDocuments(userId, user.employeeId || user.employee_id, tenantId) : Promise.resolve([]),
    ]);

    const roleContext = this.buildRoleContext(user, account, employee, organization, branches, permissionsResult.permissions);
    const completion = this.calculateCompletion(account, employee, organization);

    return {
      account,
      employee,
      organization,
      branches,
      roleContext,
      permissions: permissionsResult.permissions,
      accessScope: permissionsResult.accessScope,
      completion,
      preferences: {
        language: 'en',
        theme: 'system',
        timezone: organization?.timezone || 'Asia/Kolkata',
        dateFormat: organization?.date_format || 'dd MMM yyyy',
        timeFormat: '12h',
        currency: organization?.currency || 'INR',
        dashboardLayout: 'standard',
        sidebarCollapsed: false,
        defaultLandingPage: this.defaultLandingPage(roleContext.primaryRole),
      },
      security: {
        mfaEnabled: account.mfa_enabled,
        lastLoginAt: account.last_login_at,
        sessions,
        trustedDevices,
      },
      notifications: notificationPreferences,
      documents,
      activity,
      changeRequests: {
        approvalRequiredFields: APPROVAL_REQUIRED_FIELDS,
      },
    };
  }

  async updatePersonal(user: any, data: any) {
    const userId = user.sub;
    const tenantId = user.tenantId || user.tenant_id || null;
    const safe = this.pick(data, [
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'gender',
      'phone',
      'alternatePhone',
      'personalEmail',
      'language',
      'timezone',
      'country',
      'address',
      'biography',
      'headline',
    ]);

    const fullName = [safe.firstName, safe.middleName, safe.lastName].filter(Boolean).join(' ').trim();

    await this.db.query(
      `UPDATE users
       SET phone = COALESCE($2, phone),
           full_name = COALESCE(NULLIF($3, ''), full_name),
           profile_headline = COALESCE($4, profile_headline),
           biography = COALESCE($5, biography),
           country = COALESCE($6, country),
           address = COALESCE($7, address),
           updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL`,
      [
        userId,
        safe.phone || null,
        fullName,
        safe.headline || null,
        safe.biography || null,
        safe.country || null,
        safe.address ? JSON.stringify(safe.address) : null,
      ],
    );

    if (tenantId) {
      const employee = await this.getEmployee(userId, user.employeeId || user.employee_id, tenantId);
      if (employee?.id) {
        await this.db.query(
          `UPDATE employees
           SET first_name = COALESCE($3, first_name),
               middle_name = COALESCE($4, middle_name),
               last_name = COALESCE($5, last_name),
               nickname = COALESCE($6, nickname),
               gender = COALESCE($7, gender),
               personal_phone = COALESCE($8, personal_phone),
               alternate_phone = COALESCE($9, alternate_phone),
               personal_email = COALESCE($10, personal_email),
               present_address = COALESCE($11, present_address),
               country = COALESCE($12, country),
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [
            employee.id,
            tenantId,
            safe.firstName || null,
            safe.middleName || null,
            safe.lastName || null,
            safe.preferredName || null,
            safe.gender || null,
            safe.phone || null,
            safe.alternatePhone || null,
            safe.personalEmail || null,
            safe.address ? JSON.stringify(safe.address) : null,
            safe.country || null,
          ],
        );
      }

      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'user_profile',
        entityId: userId,
        action: 'profile_updated',
        newValues: safe,
      });
    }

    return this.getProfile(user);
  }

  async uploadPhoto(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const tenantId = user.tenantId || user.tenant_id || null;
    if (!tenantId) throw new BadRequestException('Organization context is required to store profile photos');

    this.fileUpload.validateImageFile(file.buffer, file.mimetype);
    const url = await this.fileUpload.uploadImage(file.buffer, file.mimetype, 'profile-photos', tenantId, file.originalname);

    await this.db.query(
      `UPDATE users SET profile_photo_url = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [user.sub, url],
    );

    const employee = await this.getEmployee(user.sub, user.employeeId || user.employee_id, tenantId);
    if (employee?.id) {
      await this.db.query(
        `UPDATE employees SET photo_url = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [employee.id, tenantId, url],
      );
    }

    await this.auditLog.log({
      tenantId,
      userId: user.sub,
      entityType: 'user_profile',
      entityId: user.sub,
      action: 'profile_photo_updated',
      newValues: { url },
    });

    return this.getProfile(user);
  }

  async deletePhoto(user: any) {
    const tenantId = user.tenantId || user.tenant_id || null;
    if (!tenantId) throw new BadRequestException('Organization context is required to delete profile photos');

    const account = await this.getAccount(user.sub);
    const employee = await this.getEmployee(user.sub, user.employeeId || user.employee_id, tenantId);
    const url = account.profile_photo_url || employee?.photo_url;

    await this.db.query(
      `UPDATE users SET profile_photo_url = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [user.sub],
    );
    if (employee?.id) {
      await this.db.query(
        `UPDATE employees SET photo_url = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [employee.id, tenantId],
      );
    }

    if (url) await this.fileUpload.deleteFile(url);

    await this.auditLog.log({
      tenantId,
      userId: user.sub,
      entityType: 'user_profile',
      entityId: user.sub,
      action: 'profile_photo_deleted',
      oldValues: { url },
    });

    return this.getProfile(user);
  }

  async updateAccount(user: any, data: any) {
    const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : undefined;
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : undefined;
    if (!username && !email) return this.getProfile(user);

    if (username && !/^[a-z0-9._-]{3,64}$/.test(username)) {
      throw new BadRequestException('Username must be 3-64 characters and use letters, numbers, dots, underscores, or hyphens');
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }

    const tenantId = user.tenantId || user.tenant_id || null;
    if (username) {
      const params = tenantId ? [tenantId, username, user.sub] : [username, user.sub];
      const { rows } = await this.db.query(
        tenantId
          ? `SELECT 1 FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2) AND id <> $3 AND deleted_at IS NULL`
          : `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 AND deleted_at IS NULL`,
        params,
      );
      if (rows.length) throw new BadRequestException('Username is already in use');
    }

    await this.db.query(
      `UPDATE users
       SET username = COALESCE($2, username),
           email = COALESCE($3, email),
           updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL`,
      [user.sub, username || null, email || null],
    );

    if (tenantId) {
      await this.auditLog.log({
        tenantId,
        userId: user.sub,
        entityType: 'user_profile',
        entityId: user.sub,
        action: 'account_settings_updated',
        newValues: { username, email },
      });
    }

    return this.getProfile(user);
  }

  private async getAccount(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, email, phone, username, full_name, profile_photo_url,
              profile_preferences, profile_headline, biography, country, address,
              is_active, is_super_admin,
              is_internal_staff, internal_role, status, employee_id, mfa_enabled,
              created_at, updated_at, last_login_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!rows.length) throw new BadRequestException('User account not found');
    return rows[0];
  }

  private async getEmployee(userId: string, employeeId: string | null, tenantId: string) {
    const params = employeeId ? [tenantId, userId, employeeId] : [tenantId, userId];
    const { rows } = await this.db.query(
      `SELECT e.*, d.name AS department_name, des.name AS designation_name,
              pos.name AS position_name, b.name AS branch_name,
              rm.first_name || ' ' || rm.last_name AS reporting_manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations des ON des.id = e.designation_id
       LEFT JOIN positions pos ON pos.id = e.position_id
       LEFT JOIN branches b ON b.id = e.branch_id
       LEFT JOIN employees rm ON rm.id = e.reporting_manager_id
       WHERE e.tenant_id = $1
         AND e.deleted_at IS NULL
         AND (e.user_id = $2 OR ${employeeId ? 'e.id = $3 OR' : ''} e.personal_email = (SELECT email FROM users WHERE id = $2))
       ORDER BY (e.user_id = $2) DESC
       LIMIT 1`,
      params,
    );
    return rows[0] || null;
  }

  private async getOrganization(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, slug, logo_url, status, timezone, currency, date_format
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    return rows[0] || null;
  }

  private async getBranches(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT b.id, b.name, b.code, b.status, bua.role
       FROM branch_user_access bua
       JOIN branches b ON b.id = bua.branch_id
       WHERE bua.tenant_id = $1 AND bua.user_id = $2 AND bua.is_active = true
       ORDER BY b.name ASC`,
      [tenantId, userId],
    );
    return rows;
  }

  private async getSessions(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, device_info, ip_address, created_at, expires_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId],
    );
    return rows;
  }

  private async getTrustedDevices(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, browser_fingerprint, ip_address, created_at, last_used_at, expires_at
       FROM trusted_devices
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_used_at DESC NULLS LAST
       LIMIT 10`,
      [userId],
    );
    return rows;
  }

  private async getNotificationPreferences(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT module, in_app, email, sms, whatsapp
       FROM notification_preferences
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    const byModule = new Map(rows.map((row: any) => [row.module, row]));
    return DEFAULT_NOTIFICATION_MODULES.map((module) => byModule.get(module) || {
      module,
      in_app: true,
      email: true,
      sms: false,
      whatsapp: false,
    });
  }

  private async getActivity(userId: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, action, entity_type, entity_id, ip_address, user_agent, created_at
       FROM audit_logs
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 25`,
      [tenantId, userId],
    );
    return rows;
  }

  private async getDocuments(userId: string, employeeId: string | null, tenantId: string) {
    const employee = await this.getEmployee(userId, employeeId, tenantId);
    if (!employee?.id) return [];
    const { rows } = await this.db.query(
      `SELECT id, document_type, name, file_url, file_size_bytes, mime_type, created_at, updated_at
       FROM employee_documents
       WHERE tenant_id = $1 AND employee_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 25`,
      [tenantId, employee.id],
    );
    return rows;
  }

  private buildRoleContext(user: any, account: any, employee: any, organization: any, branches: any[], permissions: string[]) {
    const platformRole = account.is_internal_staff ? account.internal_role : account.is_super_admin ? 'platform_super_admin' : null;
    const tenantRole = user.userType || user.user_type || (organization ? 'employee' : null);
    const isManager = !!employee?.id && permissions.some((permission) => permission.includes('approve')) || !!employee?.is_manager;
    const primaryRole = platformRole || tenantRole || 'user';

    return {
      primaryRole,
      platformRole,
      tenantRole,
      isPlatformUser: !!account.is_internal_staff || !!account.is_super_admin,
      isOrgUser: !!organization,
      isEmployeeLinked: !!employee?.id,
      isManager,
      branchScoped: branches.length > 0,
    };
  }

  private calculateCompletion(account: any, employee: any, organization: any) {
    const checks = [
      { key: 'displayName', label: 'Display name', complete: !!(account.full_name || employee?.first_name) },
      { key: 'username', label: 'Username', complete: !!account.username },
      { key: 'email', label: 'Email', complete: !!account.email },
      { key: 'phone', label: 'Phone number', complete: !!(account.phone || employee?.personal_phone) },
      { key: 'photo', label: 'Profile photo', complete: !!employee?.photo_url },
      { key: 'organization', label: 'Organization', complete: !!organization?.name },
      { key: 'role', label: 'Role', complete: true },
      { key: 'timezone', label: 'Time zone', complete: !!organization?.timezone },
    ];
    const completed = checks.filter((item) => item.complete).length;
    return {
      percent: Math.round((completed / checks.length) * 100),
      missing: checks.filter((item) => !item.complete).map(({ key, label }) => ({ key, label })),
    };
  }

  private defaultLandingPage(role: string) {
    if (role === 'platform_super_admin' || role?.includes('sales') || role?.includes('support')) return '/operations';
    if (['org_admin', 'branch_admin', 'admin', 'hr', 'finance'].includes(role)) return '/dashboard';
    if (role === 'manager') return '/manager/dashboard';
    return '/home';
  }

  private pick(data: any, keys: string[]) {
    return keys.reduce((acc, key) => {
      if (data?.[key] !== undefined) acc[key] = data[key];
      return acc;
    }, {} as Record<string, any>);
  }
}
