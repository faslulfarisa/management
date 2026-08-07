import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MfaLockedException } from './exceptions/mfa-locked.exception';

/**
 * Pattern-matching DB mock: each test supplies SQL-substring -> response
 * handlers, so call order can change without breaking every test (unlike
 * chained `mockResolvedValueOnce`, which is what `leave.service.spec.ts` uses
 * for simpler single-path services).
 */
function createDb(overrides: Record<string, any>) {
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (sql.includes(pattern)) {
        return typeof handler === 'function' ? handler(params) : handler;
      }
    }
    return { rows: [] };
  });
  return query;
}

const ACTIVE_TENANT_LOOKUP = "t.status = 'active'";
const REFRESH_TOKEN_INSERT = 'INSERT INTO refresh_tokens';
const MFA_SESSION_INSERT = 'INSERT INTO mfa_login_sessions';
const MFA_SESSION_SELECT = 'FROM mfa_login_sessions WHERE id = $1';
const MFA_SESSION_VERIFY = 'UPDATE mfa_login_sessions SET verified_at';
const MFA_SESSION_FAIL = 'UPDATE mfa_login_sessions SET failed_attempts';
const USER_BY_ID = 'FROM users WHERE id = $1 AND deleted_at IS NULL';
const USER_RESET_ATTEMPTS = 'mfa_failed_attempts = 0, mfa_locked_until = NULL';
const USER_INCREMENT_ATTEMPTS = 'SET mfa_failed_attempts = $1 WHERE';
const USER_LOCK = "mfa_locked_until = now() + interval '5 minutes'";
const TRUSTED_DEVICE_SELECT = 'FROM trusted_devices WHERE user_id = $1 AND device_hash';
const TRUSTED_DEVICE_TOUCH = 'UPDATE trusted_devices SET last_used_at';
const TRUSTED_DEVICE_INSERT = 'INSERT INTO trusted_devices';
const RECOVERY_CODE_SELECT = 'FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL';
const RECOVERY_CODE_BURN = 'UPDATE mfa_recovery_codes SET used_at';
const DISPLAY_NAME_LOOKUP = 'LEFT JOIN employees e ON e.id = u.employee_id';

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    tenant_id: 'tenant-1',
    email: 'user@example.com',
    employee_id: null,
    is_super_admin: false,
    is_internal_staff: false,
    internal_role: null,
    mfa_enabled: false,
    mfa_secret: null,
    mfa_failed_attempts: 0,
    mfa_locked_until: null,
    ...overrides,
  };
}

function makeService(db: jest.Mock) {
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') } as any;
  const config = {} as any;
  const emailService = {
    sendRecoveryCodeUsedEmail: jest.fn().mockResolvedValue(undefined),
    sendNewTrustedDeviceEmail: jest.fn().mockResolvedValue(undefined),
    sendMfaRateLimitedEmail: jest.fn().mockResolvedValue(undefined),
    sendMfaEnabledEmail: jest.fn().mockResolvedValue(undefined),
    sendMfaDisabledEmail: jest.fn().mockResolvedValue(undefined),
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const notificationEmitter = { emit: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new AuthService({ query: db } as any, jwtService, config, emailService, auditLog, notificationEmitter);
  return { service, jwtService, emailService, auditLog, notificationEmitter };
}

describe('AuthService — login() MFA gate', () => {
  it('issues tokens directly when MFA is disabled', async () => {
    const db = createDb({
      [ACTIVE_TENANT_LOOKUP]: { rows: [{ id: 't1', name: 'Acme', slug: 'acme', logo_url: null, status: 'active', is_org_admin: true, user_type: 'admin' }] },
      [REFRESH_TOKEN_INSERT]: { rows: [] },
    });
    const { service } = makeService(db);

    const result: any = await service.login(makeUser({ mfa_enabled: false }), '1.2.3.4', 'ua');

    expect(result.requiresMfa).toBeUndefined();
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.refreshToken).toBeTruthy();
  });

  it('creates a login session and withholds tokens when MFA is enabled with no trusted device', async () => {
    const db = createDb({ [MFA_SESSION_INSERT]: { rows: [{ id: 'session-1' }] } });
    const { service } = makeService(db);

    const result: any = await service.login(makeUser({ mfa_enabled: true }), '1.2.3.4', 'ua');

    expect(result).toEqual({ requiresMfa: true, loginSessionId: 'session-1', expiresIn: 300 });
  });

  it('throws MfaLockedException immediately if the user is already MFA-locked', async () => {
    const db = createDb({});
    const { service } = makeService(db);
    const lockedUser = makeUser({ mfa_enabled: true, mfa_locked_until: new Date(Date.now() + 60_000).toISOString() });

    await expect(service.login(lockedUser, '1.2.3.4', 'ua')).rejects.toThrow(MfaLockedException);
    expect(db).not.toHaveBeenCalled();
  });

  it('skips MFA and issues tokens for a valid, unexpired trusted device', async () => {
    const db = createDb({
      [TRUSTED_DEVICE_SELECT]: { rows: [{ id: 'device-1' }] },
      [TRUSTED_DEVICE_TOUCH]: { rows: [] },
      [ACTIVE_TENANT_LOOKUP]: { rows: [] },
      [REFRESH_TOKEN_INSERT]: { rows: [] },
    });
    const { service } = makeService(db);

    const result: any = await service.login(makeUser({ mfa_enabled: true, is_super_admin: true }), '1.2.3.4', 'ua', 'raw-trusted-token');

    expect(result.requiresMfa).toBeUndefined();
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  it('challenges MFA when the trusted-device cookie does not match any stored device', async () => {
    const db = createDb({
      [TRUSTED_DEVICE_SELECT]: { rows: [] },
      [MFA_SESSION_INSERT]: { rows: [{ id: 'session-2' }] },
    });
    const { service } = makeService(db);

    const result: any = await service.login(makeUser({ mfa_enabled: true }), '1.2.3.4', 'ua', 'unknown-token');

    expect(result.requiresMfa).toBe(true);
    expect(result.loginSessionId).toBe('session-2');
  });
});

describe('AuthService — verifyMfaLogin()', () => {
  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  const pastExpiry = new Date(Date.now() - 60_000).toISOString();

  it('issues tokens on a correct TOTP code', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const validToken = speakeasy.totp({ secret, encoding: 'base32' });
    const user = makeUser({ mfa_enabled: true, mfa_secret: secret, is_super_admin: true });

    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 0 }] },
      [USER_BY_ID]: { rows: [user] },
      [MFA_SESSION_VERIFY]: { rows: [] },
      [USER_RESET_ATTEMPTS]: { rows: [] },
      [ACTIVE_TENANT_LOOKUP]: { rows: [] },
      [REFRESH_TOKEN_INSERT]: { rows: [] },
    });
    const { service, auditLog } = makeService(db);

    const result: any = await service.verifyMfaLogin('session-1', { token: validToken }, '1.2.3.4', 'ua');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.trustedDeviceToken).toBeUndefined();
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa_login_success' }));
  });

  it('rejects a wrong TOTP code, increments the failure counter, and issues no tokens', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const user = makeUser({ mfa_enabled: true, mfa_secret: secret, mfa_failed_attempts: 0 });

    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 0 }] },
      [USER_BY_ID]: { rows: [user] },
      [MFA_SESSION_FAIL]: { rows: [] },
      [USER_INCREMENT_ATTEMPTS]: (params: any[]) => {
        expect(params[0]).toBe(1); // first failure
        return { rows: [] };
      },
    });
    const { service, auditLog } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { token: '000000' }, '1.2.3.4', 'ua')).rejects.toThrow(UnauthorizedException);
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa_login_failed', newValues: { failedCount: 1 } }));
  });

  it('locks MFA verification after the 5th consecutive failure and notifies the user', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const user = makeUser({ mfa_enabled: true, mfa_secret: secret, mfa_failed_attempts: 4 });

    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 4 }] },
      [USER_BY_ID]: { rows: [user] },
      [MFA_SESSION_FAIL]: { rows: [] },
      [USER_LOCK]: (params: any[]) => {
        expect(params[0]).toBe(5);
        return { rows: [] };
      },
      [DISPLAY_NAME_LOOKUP]: { rows: [{ first_name: 'Pat' }] },
    });
    const { service, auditLog, emailService, notificationEmitter } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { token: '000000' }, '1.2.3.4', 'ua')).rejects.toThrow(UnauthorizedException);

    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa_login_rate_limited' }));
    expect(emailService.sendMfaRateLimitedEmail).toHaveBeenCalled();
    expect(notificationEmitter.emit).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ title: 'Repeated failed MFA attempts' }));
  });

  it('throws MfaLockedException up-front on a subsequent attempt once the user is locked', async () => {
    const user = makeUser({ mfa_enabled: true, mfa_locked_until: futureExpiry });
    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 5 }] },
      [USER_BY_ID]: { rows: [user] },
    });
    const { service } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { token: '123456' }, '1.2.3.4', 'ua')).rejects.toThrow(MfaLockedException);
  });

  it('rejects an expired login session', async () => {
    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: 'user-1', verified_at: null, expires_at: pastExpiry, failed_attempts: 0 }] },
    });
    const { service } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { token: '123456' }, '1.2.3.4', 'ua')).rejects.toThrow('Login session has expired');
  });

  it('rejects a login session that has already been verified (single use)', async () => {
    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: 'user-1', verified_at: new Date().toISOString(), expires_at: futureExpiry, failed_attempts: 0 }] },
    });
    const { service } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { token: '123456' }, '1.2.3.4', 'ua')).rejects.toThrow('already been used');
  });

  it('logs in with a valid recovery code and burns it so it cannot be reused', async () => {
    const user = makeUser({ mfa_enabled: true });
    const codeHash = await bcrypt.hash('AAAA-BBBB', 10);

    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 0 }] },
      [USER_BY_ID]: { rows: [user] },
      [RECOVERY_CODE_SELECT]: { rows: [{ id: 'code-1', code_hash: codeHash }] },
      [RECOVERY_CODE_BURN]: (params: any[]) => {
        expect(params[0]).toBe('code-1');
        return { rows: [] };
      },
      [MFA_SESSION_VERIFY]: { rows: [] },
      [USER_RESET_ATTEMPTS]: { rows: [] },
      [DISPLAY_NAME_LOOKUP]: { rows: [{ first_name: 'Pat' }] },
      [ACTIVE_TENANT_LOOKUP]: { rows: [] },
      [REFRESH_TOKEN_INSERT]: { rows: [] },
    });
    const { service, auditLog, emailService } = makeService(db);

    const result: any = await service.verifyMfaLogin('session-1', { recoveryCode: 'AAAA-BBBB' }, '1.2.3.4', 'ua');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa_recovery_code_used' }));
    expect(emailService.sendRecoveryCodeUsedEmail).toHaveBeenCalled();
  });

  it('rejects a recovery code that does not match any unused code', async () => {
    const user = makeUser({ mfa_enabled: true });
    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 0 }] },
      [USER_BY_ID]: { rows: [user] },
      [RECOVERY_CODE_SELECT]: { rows: [] },
      [MFA_SESSION_FAIL]: { rows: [] },
      [USER_INCREMENT_ATTEMPTS]: { rows: [] },
    });
    const { service } = makeService(db);

    await expect(service.verifyMfaLogin('session-1', { recoveryCode: 'ZZZZ-ZZZZ' }, '1.2.3.4', 'ua')).rejects.toThrow('Invalid recovery code');
  });

  it('registers a trusted device and returns its raw token when trustDevice is requested', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const validToken = speakeasy.totp({ secret, encoding: 'base32' });
    const user = makeUser({ mfa_enabled: true, mfa_secret: secret });

    const db = createDb({
      [MFA_SESSION_SELECT]: { rows: [{ id: 'session-1', user_id: user.id, verified_at: null, expires_at: futureExpiry, failed_attempts: 0 }] },
      [USER_BY_ID]: { rows: [user] },
      [MFA_SESSION_VERIFY]: { rows: [] },
      [USER_RESET_ATTEMPTS]: { rows: [] },
      [ACTIVE_TENANT_LOOKUP]: { rows: [] },
      [REFRESH_TOKEN_INSERT]: { rows: [] },
      [TRUSTED_DEVICE_INSERT]: { rows: [] },
      [DISPLAY_NAME_LOOKUP]: { rows: [{ first_name: 'Pat' }] },
    });
    const { service, notificationEmitter } = makeService(db);

    const result: any = await service.verifyMfaLogin('session-1', { token: validToken, trustDevice: true }, '1.2.3.4', 'ua');

    expect(result.trustedDeviceToken).toMatch(/^[a-f0-9]{64}$/);
    expect(notificationEmitter.emit).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ title: 'New trusted device added' }));
  });
});

describe('AuthService — password-gated MFA management', () => {
  it('rejects generateMfaSetup with an incorrect password', async () => {
    const db = createDb({
      'SELECT email, password_hash FROM users WHERE id = $1': { rows: [{ email: 'a@b.com', password_hash: await bcrypt.hash('correct-password', 10) }] },
    });
    const { service } = makeService(db);

    await expect(service.generateMfaSetup('user-1', 'wrong-password')).rejects.toThrow('Incorrect password');
  });

  it('rejects regenerateRecoveryCodes with an incorrect password', async () => {
    const db = createDb({
      'SELECT password_hash, mfa_enabled FROM users WHERE id = $1': { rows: [{ password_hash: await bcrypt.hash('correct-password', 10), mfa_enabled: true }] },
    });
    const { service } = makeService(db);

    await expect(service.regenerateRecoveryCodes('user-1', 'wrong-password')).rejects.toThrow('Incorrect password');
  });
});
