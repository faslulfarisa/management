import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthorizationService } from '../platform/services/authorization.service';

/**
 * HTTP-level checks through the real Nest pipeline (guards, validation
 * pipe, controller) with AuthService mocked. There is no Playwright/Cypress
 * setup in this repo, so this is the closest equivalent to an E2E test for
 * the MFA login endpoints — see docs/MFA_IMPLEMENTATION_REPORT.md.
 */
describe('AuthController — MFA login enforcement (HTTP)', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    verifyMfaLogin: jest.fn(),
  };

  beforeEach(async () => {
    authService.login.mockReset();
    authService.verifyMfaLogin.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuthorizationService, useValue: {} },
      ],
    })
      .overrideGuard(LocalAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/login returns requiresMfa with no cookie and no token when MFA is required', async () => {
    authService.login.mockResolvedValue({ requiresMfa: true, loginSessionId: 'session-1', expiresIn: 300 });

    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ requiresMfa: true, loginSessionId: 'session-1', expiresIn: 300 });
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /auth/login sets the refresh_token cookie and returns a token when MFA is not required', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'jwt', refreshToken: 'refresh-raw', isSuperAdmin: false, isInternalStaff: false,
      internalRole: null, tenants: [], selectedTenantId: null, pendingOrganization: null,
    });

    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'a@b.com', password: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresMfa).toBe(false);
    expect(res.body.data.accessToken).toBe('jwt');
    const cookies: string[] = ([] as string[]).concat((res.headers['set-cookie'] as any) || []);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('POST /auth/mfa/login/verify sets refresh_token and trusted_device_token cookies on success', async () => {
    authService.verifyMfaLogin.mockResolvedValue({
      accessToken: 'jwt', refreshToken: 'refresh-raw', trustedDeviceToken: 'device-raw',
      isSuperAdmin: false, isInternalStaff: false, internalRole: null, tenants: [], selectedTenantId: null, pendingOrganization: null,
    });

    const res = await request(app.getHttpServer())
      .post('/auth/mfa/login/verify')
      .send({ loginSessionId: '11111111-1111-4111-8111-111111111111', token: '123456', trustDevice: true });

    expect(res.status).toBe(200);
    const cookies: string[] = ([] as string[]).concat((res.headers['set-cookie'] as any) || []);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('trusted_device_token='))).toBe(true);
  });

  it('POST /auth/mfa/login/verify sets no cookies and returns 401 on a failed verification', async () => {
    authService.verifyMfaLogin.mockRejectedValue(new UnauthorizedException('Invalid verification code'));

    const res = await request(app.getHttpServer())
      .post('/auth/mfa/login/verify')
      .send({ loginSessionId: '11111111-1111-4111-8111-111111111111', token: '000000' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /auth/mfa/login/verify rejects a malformed body before ever calling the service', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/login/verify')
      .send({ loginSessionId: 'not-a-uuid', token: '12' });

    expect(res.status).toBe(400);
    expect(authService.verifyMfaLogin).not.toHaveBeenCalled();
  });
});
