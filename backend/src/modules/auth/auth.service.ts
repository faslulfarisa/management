import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../shared/database.service';
import { EmailService } from './email.service';
import { AuditLogService } from '../platform/services/audit-log.service';
import { NotificationEmitterService } from '../notifications/services/notification-emitter.service';
import { AccountLockedException } from './exceptions/account-locked.exception';
import { AccountDeactivatedException } from './exceptions/account-deactivated.exception';
import { MfaLockedException } from './exceptions/mfa-locked.exception';
import { validatePasswordPolicy } from '../../shared/credential-generator.util';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

const DEFAULT_LOCKOUT_THRESHOLD = 5;
const EXEMPT_USER_TYPES = ['org_admin'];
const MFA_LOGIN_SESSION_TTL_SECONDS = 300;
const MFA_MAX_FAILED_ATTEMPTS = 5;
const PASSWORD_CHANGE_SESSION_TTL_SECONDS = 900;
const RECOVERY_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

@Injectable()
export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private auditLog: AuditLogService,
    private notificationEmitter: NotificationEmitterService,
  ) {}

  // ── Login flow (global email lookup, no tenant_id) ──────────────

  async validateUser(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email],
    );

    const user = rows[0];
    if (!user) {
      await this.recordLoginAttempt({ tenantId: null, userId: null, email, success: false, failureReason: 'user_not_found', ip: ipAddress, userAgent });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Lock status is checked before any authentication outcome is revealed.
    if (user.is_locked) {
      await this.recordLoginAttempt({ tenantId: null, userId: user.id, email, success: false, failureReason: 'account_locked', ip: ipAddress, userAgent });
      throw new AccountLockedException();
    }

    if (user.status !== 'active' || !user.is_active) {
      const message = await this.getDeactivationMessage(user);
      await this.recordLoginAttempt({ tenantId: null, userId: user.id, email, success: false, failureReason: 'account_deactivated', ip: ipAddress, userAgent });
      throw new AccountDeactivatedException(message, user.status);
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new UnauthorizedException('Account is locked. Try again later');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      await this.recordLoginAttempt({ tenantId: null, userId: user.id, email, success: false, failureReason: 'invalid_password', ip: ipAddress, userAgent });

      // Super Admin / Org Admin accounts are never auto-locked.
      if (await this.isLockoutExempt(user)) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const newCount = (user.failed_login_count || 0) + 1;
      const tenantId = await this.getPrimaryTenantId(user.id);
      const threshold = await this.getLockoutThreshold(tenantId);

      await this.db.query(
        `UPDATE users
         SET failed_login_count = $1, last_failed_login_at = now(), last_failed_login_ip = $2, last_failed_login_device = $3
         WHERE id = $4`,
        [newCount, ipAddress || null, userAgent || null, user.id],
      );

      if (newCount >= threshold) {
        await this.lockAccount(user, tenantId, newCount, threshold, ipAddress, userAgent);
        throw new AccountLockedException();
      }

      if (newCount > 1 && tenantId) {
        await this.auditLog.log({
          tenantId,
          userId: user.id,
          entityType: 'user',
          entityId: user.id,
          action: 'repeated_failed_login',
          newValues: { failedCount: newCount, threshold },
          ipAddress,
          userAgent,
        });
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.recordLoginAttempt({ tenantId: null, userId: user.id, email, success: true, ip: ipAddress, userAgent });

    await this.db.query(
      `UPDATE users
       SET failed_login_count = 0, last_failed_login_at = NULL, last_failed_login_ip = NULL, last_failed_login_device = NULL, last_login_at = now()
       WHERE id = $1`,
      [user.id],
    );

    return user;
  }

  // ── Account lockout helpers ─────────────────────────────────────

  private async isLockoutExempt(user: any): Promise<boolean> {
    if (user.is_super_admin) return true;
    const { rows } = await this.db.query(
      `SELECT 1 FROM user_tenants WHERE user_id = $1 AND user_type = ANY($2) LIMIT 1`,
      [user.id, EXEMPT_USER_TYPES],
    );
    return rows.length > 0;
  }

  private async getPrimaryTenantId(userId: string): Promise<string | null> {
    const { rows } = await this.db.query(
      `SELECT tenant_id FROM user_tenants WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [userId],
    );
    return rows[0]?.tenant_id || null;
  }

  private async getLockoutThreshold(tenantId: string | null): Promise<number> {
    if (!tenantId) return DEFAULT_LOCKOUT_THRESHOLD;
    const { rows } = await this.db.query('SELECT max_failed_login_attempts FROM tenants WHERE id = $1', [tenantId]);
    return rows[0]?.max_failed_login_attempts ?? DEFAULT_LOCKOUT_THRESHOLD;
  }

  private async getUserDisplayName(userId: string): Promise<string | undefined> {
    const { rows } = await this.db.query(
      `SELECT COALESCE(e.first_name, '') AS first_name
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       WHERE u.id = $1`,
      [userId],
    );
    return rows[0]?.first_name || undefined;
  }

  // ── Account deactivation messaging ──────────────────────────────

  private async getDeactivationMessage(user: any): Promise<string> {
    if (user.deactivation_reason_id) {
      const { rows } = await this.db.query(
        'SELECT login_message FROM deactivation_reasons WHERE id = $1',
        [user.deactivation_reason_id],
      );
      if (rows[0]?.login_message) return rows[0].login_message;
    }

    const fallbackByStatus: Record<string, string> = {
      resigned: 'Your employment has ended and your account is no longer active. Please contact HR for assistance.',
      retired: 'Your employment has ended and your account is no longer active. Please contact HR for assistance.',
      terminated: 'Your account has been deactivated. Please contact your organization administrator for more information.',
      inactive: 'Your account has been temporarily deactivated. Please contact your administrator.',
      suspended: 'Your account access has been temporarily restricted. Please contact HR or your administrator.',
      on_leave: 'Your account is currently inactive while you are on leave. Please contact HR if access is required.',
      locked: 'Your account has been locked due to multiple failed login attempts. Please contact your administrator to reactivate access.',
    };

    return fallbackByStatus[user.status] || 'Your account has been deactivated. Please contact your organization administrator for more information.';
  }

  private async recordLoginAttempt(data: { tenantId: string | null; userId: string | null; email: string; success: boolean; failureReason?: string; ip?: string; userAgent?: string }) {
    await this.db.query(
      `INSERT INTO login_attempts (tenant_id, user_id, email, success, failure_reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [data.tenantId, data.userId, data.email, data.success, data.failureReason || null, data.ip || null, data.userAgent || null],
    );
  }

  private async lockAccount(user: any, tenantId: string | null, failedCount: number, threshold: number, ipAddress?: string, userAgent?: string) {
    await this.db.query(
      `UPDATE users
       SET is_locked = true, account_locked_at = now(), account_locked_by = NULL, lockout_reason = 'failed_login_threshold_reached', locked_until = NULL
       WHERE id = $1`,
      [user.id],
    );

    // Item 2: invalidate any active sessions immediately on lock.
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.id],
    );

    if (tenantId) {
      await this.auditLog.log({
        tenantId,
        userId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'failed_login_threshold_reached',
        newValues: { failedCount, threshold },
        ipAddress,
        userAgent,
      });
      await this.auditLog.log({
        tenantId,
        userId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'account_locked',
        newValues: { reason: 'failed_login_threshold_reached', failedCount, threshold },
        ipAddress,
        userAgent,
      });
    }

    const displayName = await this.getUserDisplayName(user.id);

    try {
      await this.emailService.sendAccountLockedEmail(user.email, displayName);
    } catch {
      // Don't block the response on email delivery failures
    }

    if (tenantId) {
      try {
        const { rows: admins } = await this.db.query(
          `SELECT u.email FROM user_tenants ut JOIN users u ON u.id = ut.user_id
           WHERE ut.tenant_id = $1 AND ut.user_type = 'org_admin' AND u.deleted_at IS NULL`,
          [tenantId],
        );
        for (const admin of admins) {
          await this.emailService.sendAdminLockoutNotification(admin.email, user.email, displayName);
        }
      } catch {
        // Best-effort notification only
      }
    }
  }

  async unlockAccount(targetUserId: string, tenantId: string, actor: { sub: string; isSuperAdmin: boolean; userType: string }, ipAddress?: string, userAgent?: string) {
    const { rows } = await this.db.query(
      'SELECT id, email, employee_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [targetUserId],
    );
    if (!rows.length) throw new NotFoundException('User not found');
    const target = rows[0];

    await this.db.query(
      `UPDATE users
       SET is_locked = false, failed_login_count = 0, locked_until = NULL, account_locked_at = NULL,
           account_locked_by = NULL, lockout_reason = NULL, last_failed_login_at = NULL,
           last_failed_login_ip = NULL, last_failed_login_device = NULL, unlocked_at = now(), unlocked_by = $1
       WHERE id = $2`,
      [actor.sub, targetUserId],
    );

    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: targetUserId,
      action: 'account_unlocked',
      newValues: { unlockedBy: actor.sub },
      ipAddress,
      userAgent,
    });
    await this.auditLog.log({
      tenantId,
      userId: actor.sub,
      entityType: 'user',
      entityId: targetUserId,
      action: 'admin_unlock_action',
      newValues: { targetUserId, unlockedBy: actor.sub, actorType: actor.userType },
      ipAddress,
      userAgent,
    });

    try {
      const displayName = await this.getUserDisplayName(targetUserId);
      await this.emailService.sendAccountUnlockedEmail(target.email, displayName);
    } catch {
      // Best-effort notification only
    }

    return { id: targetUserId, is_locked: false, failed_login_count: 0, unlocked_at: new Date().toISOString() };
  }

  /**
   * Entry point for the password step. Returns either a full token set
   * (no MFA, or a recognized trusted device) or an MFA challenge — a JWT
   * must never be issued for an mfa_enabled user without one of those two.
   */
  async login(
    user: any,
    ipAddress: string,
    deviceInfo: string,
    trustedDeviceToken?: string,
    portal?: 'platform' | 'customer',
  ) {
    // Portal is an optional hint from the login page the request came through
    // (Platform Portal vs Customer HRMS). When present, it must match the
    // account's actual identity type — this is what keeps the two login
    // pages from ever admitting the other population, independent of the
    // post-login redirect logic in the frontend.
    if (portal === 'platform' && !user.is_internal_staff) {
      throw new ForbiddenException('This account does not have Platform access. Use the customer login.');
    }
    if (portal === 'customer' && user.is_internal_staff) {
      throw new ForbiddenException('Internal staff accounts must sign in through the Platform Portal.');
    }

    if (user.mfa_locked_until && new Date(user.mfa_locked_until) > new Date()) {
      throw new MfaLockedException();
    }

    // Bulk-imported (or otherwise flagged) accounts must rotate their password
    // before reaching MFA/dashboard — no JWT is issued until that happens.
    if (user.must_change_password) {
      const { rows } = await this.db.query(
        `INSERT INTO password_change_sessions (user_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, now() + interval '15 minutes')
         RETURNING id`,
        [user.id, ipAddress || null, deviceInfo || null],
      );

      return {
        requiresPasswordChange: true as const,
        changeSessionId: rows[0].id,
        expiresIn: PASSWORD_CHANGE_SESSION_TTL_SECONDS,
      };
    }

    return this.proceedPastPassword(user, ipAddress, deviceInfo, trustedDeviceToken);
  }

  /** Verifies + applies a forced password change, then re-enters the normal MFA/token-issuing path. */
  async verifyPasswordChange(changeSessionId: string, newPassword: string, ipAddress: string, userAgent: string) {
    const { rows: sessionRows } = await this.db.query('SELECT * FROM password_change_sessions WHERE id = $1', [changeSessionId]);
    const session = sessionRows[0];
    if (!session) throw new UnauthorizedException('Invalid or expired session');
    if (session.verified_at) throw new UnauthorizedException('This session has already been used');
    if (new Date(session.expires_at) < new Date()) throw new UnauthorizedException('Session has expired. Please log in again.');

    const { rows: userRows } = await this.db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [session.user_id]);
    const user = userRows[0];
    if (!user) throw new UnauthorizedException('Invalid session');

    const policyErrors = validatePasswordPolicy(newPassword);
    if (policyErrors.length) throw new BadRequestException(policyErrors.join(', '));

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.db.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = false, failed_login_count = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [newHash, user.id],
    );
    await this.db.query('UPDATE password_change_sessions SET verified_at = now() WHERE id = $1', [changeSessionId]);

    await this.auditLog.log({
      tenantId: user.tenant_id,
      userId: user.id,
      entityType: 'auth',
      entityId: user.id,
      action: 'first_login_password_changed',
      newValues: {},
      ipAddress,
      userAgent,
    });

    return this.proceedPastPassword({ ...user, password_hash: newHash, must_change_password: false }, ipAddress, userAgent);
  }

  /** Deletes expired forced-password-change sessions. Mirrors the MFA login-session sweep below. */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'password-change-session-sweep' })
  async sweepExpiredPasswordChangeSessions() {
    await this.db.query('DELETE FROM password_change_sessions WHERE expires_at < now()');
  }

  private async proceedPastPassword(user: any, ipAddress: string, deviceInfo: string, trustedDeviceToken?: string) {
    if (user.mfa_enabled) {
      const trustedDevice = await this.findValidTrustedDevice(user.id, trustedDeviceToken);
      if (trustedDevice) {
        await this.db.query('UPDATE trusted_devices SET last_used_at = now() WHERE id = $1', [trustedDevice.id]);
        return this.issueTokensForUser(user, ipAddress, deviceInfo);
      }

      const { rows } = await this.db.query(
        `INSERT INTO mfa_login_sessions (user_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, now() + interval '5 minutes')
         RETURNING id`,
        [user.id, ipAddress || null, deviceInfo || null],
      );

      return {
        requiresMfa: true as const,
        loginSessionId: rows[0].id,
        expiresIn: MFA_LOGIN_SESSION_TTL_SECONDS,
      };
    }

    return this.issueTokensForUser(user, ipAddress, deviceInfo);
  }

  /** Verifies the TOTP code or recovery code for a pending MFA login session, then issues tokens. */
  async verifyMfaLogin(
    loginSessionId: string,
    body: { token?: string; recoveryCode?: string; trustDevice?: boolean },
    ipAddress: string,
    userAgent: string,
  ) {
    const { rows: sessionRows } = await this.db.query('SELECT * FROM mfa_login_sessions WHERE id = $1', [loginSessionId]);
    const session = sessionRows[0];
    if (!session) throw new UnauthorizedException('Invalid or expired login session');
    if (session.verified_at) throw new UnauthorizedException('This login session has already been used');
    if (new Date(session.expires_at) < new Date()) throw new UnauthorizedException('Login session has expired. Please log in again.');

    const { rows: userRows } = await this.db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [session.user_id]);
    const user = userRows[0];
    if (!user) throw new UnauthorizedException('Invalid login session');

    if (user.mfa_locked_until && new Date(user.mfa_locked_until) > new Date()) {
      throw new MfaLockedException();
    }

    const usedRecoveryCode = !!body.recoveryCode;
    const verified = usedRecoveryCode
      ? await this.consumeRecoveryCode(user.id, body.recoveryCode!)
      : !!body.token && !!user.mfa_secret && speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: body.token, window: 2 });

    if (!verified) {
      await this.recordMfaLoginFailure(session, user, ipAddress, userAgent);
      throw new UnauthorizedException(usedRecoveryCode ? 'Invalid recovery code' : 'Invalid verification code');
    }

    await this.db.query('UPDATE mfa_login_sessions SET verified_at = now() WHERE id = $1', [loginSessionId]);
    await this.db.query('UPDATE users SET mfa_failed_attempts = 0, mfa_locked_until = NULL WHERE id = $1', [user.id]);

    await this.auditLog.log({
      tenantId: user.tenant_id,
      userId: user.id,
      entityType: 'auth',
      entityId: user.id,
      action: usedRecoveryCode ? 'mfa_recovery_code_used' : 'mfa_login_success',
      newValues: { loginSessionId },
      ipAddress,
      userAgent,
    });

    if (usedRecoveryCode) {
      try {
        await this.emailService.sendRecoveryCodeUsedEmail(user.email, await this.getUserDisplayName(user.id));
      } catch {
        // Best-effort notification only
      }
      try {
        await this.notificationEmitter.emit(user.tenant_id, {
          userIds: [user.id],
          title: 'Recovery code used',
          message: "A recovery code was used to sign in to your account. If this wasn't you, secure your account immediately.",
          type: 'warning',
          priority: 'high',
          sourceModule: 'auth',
        });
      } catch {
        // Best-effort notification only
      }
    }

    const tokens = await this.issueTokensForUser(user, ipAddress, userAgent);

    let trustedDeviceToken: string | undefined;
    if (body.trustDevice) {
      trustedDeviceToken = await this.createTrustedDevice(user, ipAddress, userAgent);
    }

    return { ...tokens, trustedDeviceToken };
  }

  /** Hashed lookup key for a trusted-device cookie — sha256 (not bcrypt) since the
   *  token is already a high-entropy random secret and lookups need to be O(1). */
  private hashDeviceToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async findValidTrustedDevice(userId: string, rawToken?: string) {
    if (!rawToken) return null;
    const { rows } = await this.db.query(
      `SELECT * FROM trusted_devices WHERE user_id = $1 AND device_hash = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [userId, this.hashDeviceToken(rawToken)],
    );
    return rows[0] || null;
  }

  private describeDevice(userAgent?: string): string {
    if (!userAgent) return 'Unknown device';
    const browser = /Edg\//.test(userAgent) ? 'Edge'
      : /Chrome\//.test(userAgent) ? 'Chrome'
      : /Firefox\//.test(userAgent) ? 'Firefox'
      : /Safari\//.test(userAgent) ? 'Safari'
      : 'Browser';
    const os = /Windows/.test(userAgent) ? 'Windows'
      : /Mac OS X/.test(userAgent) ? 'macOS'
      : /Android/.test(userAgent) ? 'Android'
      : /iPhone|iPad/.test(userAgent) ? 'iOS'
      : /Linux/.test(userAgent) ? 'Linux'
      : 'an unknown OS';
    return `${browser} on ${os}`;
  }

  private async createTrustedDevice(user: any, ipAddress?: string, userAgent?: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const fingerprint = this.describeDevice(userAgent);

    await this.db.query(
      `INSERT INTO trusted_devices (user_id, device_hash, browser_fingerprint, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '30 days')`,
      [user.id, this.hashDeviceToken(rawToken), fingerprint, ipAddress || null],
    );

    await this.auditLog.log({
      tenantId: user.tenant_id,
      userId: user.id,
      entityType: 'auth',
      entityId: user.id,
      action: 'mfa_trusted_device_added',
      newValues: { fingerprint },
      ipAddress,
      userAgent,
    });

    try {
      await this.emailService.sendNewTrustedDeviceEmail(user.email, fingerprint, await this.getUserDisplayName(user.id));
    } catch {
      // Best-effort notification only
    }
    try {
      await this.notificationEmitter.emit(user.tenant_id, {
        userIds: [user.id],
        title: 'New trusted device added',
        message: `${fingerprint} was trusted for 30 days. If this wasn't you, revoke it from Security Settings immediately.`,
        type: 'info',
        priority: 'medium',
        sourceModule: 'auth',
      });
    } catch {
      // Best-effort notification only
    }

    return rawToken;
  }

  private async recordMfaLoginFailure(session: any, user: any, ipAddress?: string, userAgent?: string) {
    await this.db.query('UPDATE mfa_login_sessions SET failed_attempts = failed_attempts + 1 WHERE id = $1', [session.id]);

    const newCount = (user.mfa_failed_attempts || 0) + 1;

    if (newCount >= MFA_MAX_FAILED_ATTEMPTS) {
      await this.db.query(
        `UPDATE users SET mfa_failed_attempts = $1, mfa_locked_until = now() + interval '5 minutes' WHERE id = $2`,
        [newCount, user.id],
      );
      await this.auditLog.log({
        tenantId: user.tenant_id,
        userId: user.id,
        entityType: 'auth',
        entityId: user.id,
        action: 'mfa_login_rate_limited',
        newValues: { failedCount: newCount },
        ipAddress,
        userAgent,
      });
      try {
        await this.emailService.sendMfaRateLimitedEmail(user.email, await this.getUserDisplayName(user.id));
      } catch {
        // Best-effort notification only
      }
      try {
        await this.notificationEmitter.emit(user.tenant_id, {
          userIds: [user.id],
          title: 'Repeated failed MFA attempts',
          message: 'Multiple failed multi-factor authentication attempts were detected on your account. Verification has been temporarily locked for 5 minutes.',
          type: 'critical',
          priority: 'critical',
          sourceModule: 'auth',
        });
      } catch {
        // Best-effort notification only
      }
    } else {
      await this.db.query('UPDATE users SET mfa_failed_attempts = $1 WHERE id = $2', [newCount, user.id]);
      await this.auditLog.log({
        tenantId: user.tenant_id,
        userId: user.id,
        entityType: 'auth',
        entityId: user.id,
        action: 'mfa_login_failed',
        newValues: { failedCount: newCount },
        ipAddress,
        userAgent,
      });
    }
  }

  private async consumeRecoveryCode(userId: string, rawCode: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    for (const row of rows) {
      if (await bcrypt.compare(rawCode, row.code_hash)) {
        await this.db.query('UPDATE mfa_recovery_codes SET used_at = now() WHERE id = $1', [row.id]);
        return true;
      }
    }
    return false;
  }

  /** Deletes expired MFA login sessions. Mirrors the stale-sweep cron pattern used elsewhere (e.g. biometric-device.service.ts). */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'mfa-login-session-sweep' })
  async sweepExpiredMfaLoginSessions() {
    await this.db.query('DELETE FROM mfa_login_sessions WHERE expires_at < now()');
  }

  private async issueTokensForUser(user: any, ipAddress: string, deviceInfo: string) {
    // Internal staff (Marketing/Sales/Technical) never belong to a tenant —
    // they're a global flag, same as is_super_admin. Skip the tenant lookup
    // entirely and let the frontend route them straight to /operations.
    if (user.is_internal_staff) {
      const refreshTokenValue = crypto.randomBytes(40).toString('hex');
      const refreshTokenHash = await bcrypt.hash(refreshTokenValue, 10);

      const payload = {
        sub: user.id,
        email: user.email,
        employee_id: user.employee_id,
        is_super_admin: false,
        is_internal_staff: true,
        internal_role: user.internal_role,
        tenant_id: null,
      };

      const accessToken = this.jwtService.sign(payload);

      await this.db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, ip_address, device_info, expires_at, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, refreshTokenHash, ipAddress, deviceInfo, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), null],
      );

      return {
        accessToken,
        refreshToken: refreshTokenValue,
        isSuperAdmin: false,
        isInternalStaff: true,
        internalRole: user.internal_role,
        tenants: [],
        selectedTenantId: null,
        pendingOrganization: null,
      };
    }

    // Fetch user's tenant memberships
    const { rows: tenantRows } = await this.db.query(
      `SELECT t.id, t.name, t.slug, t.logo_url, t.status, ut.is_org_admin, ut.user_type
       FROM user_tenants ut
       JOIN tenants t ON ut.tenant_id = t.id
       WHERE ut.user_id = $1 AND t.deleted_at IS NULL AND t.status = 'active'
       ORDER BY t.name ASC`,
      [user.id],
    );

    const tenants = tenantRows.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logo_url,
      status: t.status,
      isOrgAdmin: t.is_org_admin,
      userType: user.is_super_admin ? 'super_admin' : (t.user_type || 'employee'),
    }));

    // If the user has no active tenant (e.g. their only organization is
    // still pending Super Admin approval), surface that explicitly so the
    // login page can show a status screen instead of an empty dashboard.
    let pendingOrganization: { id: string; name: string; approvalStatus: string; rejectionReason: string | null } | null = null;
    if (!tenants.length && !user.is_super_admin) {
      const { rows: pendingRows } = await this.db.query(
        `SELECT t.id, t.name, t.approval_status, t.rejection_reason
         FROM user_tenants ut
         JOIN tenants t ON ut.tenant_id = t.id
         WHERE ut.user_id = $1 AND t.deleted_at IS NULL
         ORDER BY t.created_at DESC LIMIT 1`,
        [user.id],
      );
      if (pendingRows.length) {
        pendingOrganization = {
          id: pendingRows[0].id,
          name: pendingRows[0].name,
          approvalStatus: pendingRows[0].approval_status,
          rejectionReason: pendingRows[0].rejection_reason,
        };
      }
    }

    // If only one tenant, auto-select it in the JWT
    const autoTenantId = tenants.length === 1 ? tenants[0].id : null;

    const payload = {
      sub: user.id,
      email: user.email,
      employee_id: user.employee_id,
      is_super_admin: user.is_super_admin,
      tenant_id: autoTenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshTokenValue = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshTokenValue, 10);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, ip_address, device_info, expires_at, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.id, refreshTokenHash, ipAddress, deviceInfo, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), autoTenantId],
    );

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      isSuperAdmin: user.is_super_admin,
      isInternalStaff: false,
      internalRole: null,
      tenants,
      selectedTenantId: autoTenantId,
      pendingOrganization,
    };
  }

  // ── Select tenant (org switch) ──────────────────────────────────

  async selectTenant(userId: string, tenantId: string, ipAddress?: string, userAgent?: string) {
    // Verify user has membership in this tenant
    const { rows: membership } = await this.db.query(
      `SELECT ut.*, u.email, u.employee_id, u.is_super_admin
       FROM user_tenants ut
       JOIN users u ON ut.user_id = u.id
       WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND u.deleted_at IS NULL`,
      [userId, tenantId],
    );

    // Super admins can select any tenant even without explicit membership
    if (!membership.length) {
      const { rows: userRows } = await this.db.query(
        'SELECT id, email, employee_id, is_super_admin FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId],
      );
      if (!userRows.length) throw new UnauthorizedException('User not found');
      if (!userRows[0].is_super_admin) {
        throw new ForbiddenException('You do not have access to this organization');
      }

      // Verify tenant exists
      const { rows: tenantRows } = await this.db.query(
        'SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL',
        [tenantId],
      );
      if (!tenantRows.length) throw new BadRequestException('Organization not found');

      const payload = {
        sub: userRows[0].id,
        email: userRows[0].email,
        employee_id: userRows[0].employee_id,
        is_super_admin: true,
        tenant_id: tenantId,
      };

      // Update all valid refresh tokens so the next refresh preserves this tenant
      await this.db.query(
        'UPDATE refresh_tokens SET tenant_id = $1 WHERE user_id = $2 AND revoked_at IS NULL AND expires_at > now()',
        [tenantId, userId],
      );

      await this.auditLog.log({
        tenantId,
        userId,
        entityType: 'auth',
        entityId: userId,
        action: 'organization_switch',
        newValues: { tenantId, userType: 'super_admin' },
        ipAddress,
        userAgent,
      });

      return { accessToken: this.jwtService.sign(payload), userType: 'super_admin' };
    }

    const user = membership[0];
    const payload = {
      sub: userId,
      email: user.email,
      employee_id: user.employee_id,
      is_super_admin: user.is_super_admin,
      tenant_id: tenantId,
    };

    // Update all valid refresh tokens for this user to reflect the new tenant
    await this.db.query(
      'UPDATE refresh_tokens SET tenant_id = $1 WHERE user_id = $2 AND revoked_at IS NULL AND expires_at > now()',
      [tenantId, userId],
    );

    const userType = user.is_super_admin ? 'super_admin' : (user.user_type || 'employee');

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'auth',
      entityId: userId,
      action: 'organization_switch',
      newValues: { tenantId, userType },
      ipAddress,
      userAgent,
    });

    return { accessToken: this.jwtService.sign(payload), userType };
  }

  // ── Refresh tokens ─────────────────────────────────────────────

  async refreshTokens(refreshToken: string) {
    const { rows } = await this.db.query(
      `SELECT rt.*, rt.tenant_id AS rt_tenant_id, u.email, u.employee_id, u.is_super_admin, u.is_active, u.deleted_at
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.revoked_at IS NULL AND rt.expires_at > now()`,
    );

    let matchingToken: any = null;
    for (const token of rows) {
      const isValid = await bcrypt.compare(refreshToken, token.token_hash);
      if (isValid) { matchingToken = token; break; }
    }

    if (!matchingToken) throw new UnauthorizedException('Invalid or expired refresh token');
    if (matchingToken.deleted_at || !matchingToken.is_active) throw new UnauthorizedException('User account is inactive');

    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [matchingToken.id]);

    const payload = {
      sub: matchingToken.user_id,
      tenant_id: matchingToken.rt_tenant_id,
      email: matchingToken.email,
      employee_id: matchingToken.employee_id,
      is_super_admin: matchingToken.is_super_admin,
    };

    const accessToken = this.jwtService.sign(payload);

    const newRefreshTokenValue = crypto.randomBytes(40).toString('hex');
    const newRefreshTokenHash = await bcrypt.hash(newRefreshTokenValue, 10);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, ip_address, device_info, expires_at, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [matchingToken.user_id, newRefreshTokenHash, matchingToken.ip_address, matchingToken.device_info, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), matchingToken.rt_tenant_id],
    );

    return { accessToken, refreshToken: newRefreshTokenValue };
  }

  // ── Logout / Sessions ──────────────────────────────────────────

  async logout(userId: string, refreshToken: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );

    for (const token of rows) {
      const isValid = await bcrypt.compare(refreshToken, token.token_hash);
      if (isValid) {
        await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [token.id]);
        break;
      }
    }

    return { success: true };
  }

  async getSessions(userId: string) {
    const { rows } = await this.db.query(
      'SELECT id, device_info, ip_address, expires_at, created_at FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }

  async revokeSession(userId: string, sessionId: string) {
    const { rows } = await this.db.query(
      'SELECT 1 FROM refresh_tokens WHERE id = $1 AND user_id = $2',
      [sessionId, userId],
    );
    if (!rows.length) throw new BadRequestException('Session not found');

    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [sessionId]);
    return { success: true };
  }

  // ── MFA ─────────────────────────────────────────────────────────

  async getMfaStatus(userId: string) {
    const { rows } = await this.db.query('SELECT mfa_enabled, mfa_enabled_at FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    if (!rows.length) throw new BadRequestException('User not found');

    const { rows: codeRows } = await this.db.query(
      'SELECT COUNT(*) FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
    const { rows: deviceRows } = await this.db.query(
      'SELECT COUNT(*) FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()',
      [userId],
    );

    return {
      mfaEnabled: rows[0].mfa_enabled as boolean,
      enabledAt: rows[0].mfa_enabled_at,
      recoveryCodesRemaining: parseInt(codeRows[0].count, 10),
      trustedDeviceCount: parseInt(deviceRows[0].count, 10),
    };
  }

  async generateMfaSetup(userId: string, password: string) {
    const { rows } = await this.db.query('SELECT email, password_hash FROM users WHERE id = $1', [userId]);
    if (!rows.length) throw new BadRequestException('User not found');

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) throw new UnauthorizedException('Incorrect password');

    const secret = speakeasy.generateSecret({ name: `Ai-HRMS (${rows[0].email})`, issuer: 'Ai-HRMS' });

    await this.db.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret.base32, userId]);

    const qrCode = await qrcode.toDataURL(secret.otpauth_url || '');
    return { secret: secret.base32, qrCode };
  }

  async verifyMfa(userId: string, token: string) {
    const { rows } = await this.db.query('SELECT mfa_secret, tenant_id, email FROM users WHERE id = $1', [userId]);
    if (!rows.length || !rows[0].mfa_secret) throw new BadRequestException('MFA not initialized');

    const verified = speakeasy.totp.verify({ secret: rows[0].mfa_secret, encoding: 'base32', token, window: 2 });
    if (!verified) throw new UnauthorizedException('Invalid MFA code');

    await this.db.query('UPDATE users SET mfa_enabled = true, mfa_enabled_at = now() WHERE id = $1', [userId]);
    const recoveryCodes = await this.generateRecoveryCodes(userId);

    await this.auditLog.log({
      tenantId: rows[0].tenant_id,
      userId,
      entityType: 'auth',
      entityId: userId,
      action: 'mfa_enabled',
      newValues: {},
    });

    try {
      await this.emailService.sendMfaEnabledEmail(rows[0].email, await this.getUserDisplayName(userId));
    } catch {
      // Best-effort notification only
    }
    try {
      await this.notificationEmitter.emit(rows[0].tenant_id, {
        userIds: [userId],
        title: 'Multi-factor authentication enabled',
        message: 'MFA has been enabled on your account. Keep your recovery codes somewhere safe.',
        type: 'success',
        priority: 'medium',
        sourceModule: 'auth',
      });
    } catch {
      // Best-effort notification only
    }

    return { success: true, recoveryCodes };
  }

  async disableMfa(userId: string, token: string) {
    const { rows } = await this.db.query('SELECT mfa_secret, tenant_id, email FROM users WHERE id = $1', [userId]);
    if (!rows.length) throw new BadRequestException('User not found');

    const verified = speakeasy.totp.verify({ secret: rows[0].mfa_secret, encoding: 'base32', token, window: 2 });
    if (!verified) throw new UnauthorizedException('Invalid MFA code');

    await this.db.query(
      `UPDATE users
       SET mfa_enabled = false, mfa_secret = NULL, mfa_enabled_at = NULL, mfa_failed_attempts = 0, mfa_locked_until = NULL
       WHERE id = $1`,
      [userId],
    );
    await this.db.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [userId]);
    await this.db.query('UPDATE trusted_devices SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

    await this.auditLog.log({
      tenantId: rows[0].tenant_id,
      userId,
      entityType: 'auth',
      entityId: userId,
      action: 'mfa_disabled',
      newValues: {},
    });

    try {
      await this.emailService.sendMfaDisabledEmail(rows[0].email, await this.getUserDisplayName(userId));
    } catch {
      // Best-effort notification only
    }
    try {
      await this.notificationEmitter.emit(rows[0].tenant_id, {
        userIds: [userId],
        title: 'Multi-factor authentication disabled',
        message: 'MFA has been disabled on your account. If you did not make this change, secure your account immediately.',
        type: 'warning',
        priority: 'high',
        sourceModule: 'auth',
      });
    } catch {
      // Best-effort notification only
    }

    return { success: true };
  }

  async regenerateRecoveryCodes(userId: string, password: string) {
    const { rows } = await this.db.query('SELECT password_hash, mfa_enabled FROM users WHERE id = $1', [userId]);
    if (!rows.length) throw new BadRequestException('User not found');
    if (!rows[0].mfa_enabled) throw new BadRequestException('MFA is not enabled');

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) throw new UnauthorizedException('Incorrect password');

    const recoveryCodes = await this.generateRecoveryCodes(userId);
    return { recoveryCodes };
  }

  private async generateRecoveryCodes(userId: string): Promise<string[]> {
    await this.db.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [userId]);

    const randomPart = () => Array.from({ length: 4 }, () => RECOVERY_CODE_CHARSET[crypto.randomInt(RECOVERY_CODE_CHARSET.length)]).join('');
    const codes = Array.from({ length: 10 }, () => `${randomPart()}-${randomPart()}`);

    for (const code of codes) {
      const hash = await bcrypt.hash(code, 10);
      await this.db.query('INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)', [userId, hash]);
    }

    return codes;
  }

  async listTrustedDevices(userId: string) {
    const { rows } = await this.db.query(
      `SELECT id, browser_fingerprint, ip_address, created_at, last_used_at, expires_at
       FROM trusted_devices WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async revokeTrustedDevice(userId: string, deviceId: string, ipAddress?: string, userAgent?: string) {
    const { rows } = await this.db.query(
      'SELECT id FROM trusted_devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [deviceId, userId],
    );
    if (!rows.length) throw new BadRequestException('Trusted device not found');

    await this.db.query('UPDATE trusted_devices SET revoked_at = now() WHERE id = $1', [deviceId]);

    const { rows: userRows } = await this.db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    await this.auditLog.log({
      tenantId: userRows[0].tenant_id,
      userId,
      entityType: 'auth',
      entityId: userId,
      action: 'mfa_trusted_device_removed',
      newValues: { deviceId },
      ipAddress,
      userAgent,
    });

    return { success: true };
  }

  async getMfaActivity(userId: string) {
    const { rows: userRows } = await this.db.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    if (!userRows.length) throw new BadRequestException('User not found');

    const { rows } = await this.db.query(
      `SELECT action, ip_address, user_agent, created_at FROM audit_logs
       WHERE user_id = $1 AND tenant_id = $2 AND action LIKE 'mfa%'
       ORDER BY created_at DESC LIMIT 25`,
      [userId, userRows[0].tenant_id],
    );
    return rows;
  }

  // ── Password reset ─────────────────────────────────────────────

  async forgotPassword(email: string) {
    // Always return success to prevent email enumeration
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, COALESCE(e.first_name, '') AS first_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       WHERE u.email = $1 AND u.deleted_at IS NULL AND u.is_active = true`,
      [email],
    );
    if (!rows.length) return { success: true };

    const user = rows[0];

    // Invalidate any previous unused tokens for this user
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    );

    // Generate a cryptographically secure 6-digit OTP
    const otpBytes = crypto.randomBytes(3);
    const otp = (parseInt(otpBytes.toString('hex'), 16) % 900000 + 100000).toString();
    const tokenHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.db.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt],
    );

    try {
      await this.emailService.sendPasswordResetEmail(user.email, otp, user.first_name || undefined);
    } catch {
      // Don't expose email delivery failures to the caller
    }

    return { success: true };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const { rows: userRows } = await this.db.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL AND is_active = true',
      [email],
    );
    if (!userRows.length) throw new BadRequestException('Invalid or expired reset code');

    const userId = userRows[0].id;

    // Find the most recent valid (unused, non-expired) token for this user
    const { rows: tokenRows } = await this.db.query(
      `SELECT id, token_hash
       FROM password_reset_tokens
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    if (!tokenRows.length) throw new BadRequestException('Reset code has expired. Please request a new one.');

    const token = tokenRows[0];
    const isValid = await bcrypt.compare(otp, token.token_hash);
    if (!isValid) throw new BadRequestException('Invalid reset code. Please check and try again.');

    // Mark token as used (single-use enforcement)
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
      [token.id],
    );

    // Update password, clear any lockout state, and invalidate all active sessions
    const newHash = await bcrypt.hash(newPassword, 12);
    await this.db.query(
      `UPDATE users
       SET password_hash = $1, failed_login_count = 0, locked_until = NULL,
           is_locked = false, account_locked_at = NULL, account_locked_by = NULL, lockout_reason = NULL,
           last_failed_login_at = NULL, last_failed_login_ip = NULL, last_failed_login_device = NULL,
           updated_at = now()
       WHERE id = $2`,
      [newHash, userId],
    );
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );

    return { success: true };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}
