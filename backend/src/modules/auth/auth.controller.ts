import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UploadedFile,
  Param,
  Req,
  Res,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { AccountProfileService } from './account-profile.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthorizationService } from '../platform/services/authorization.service';
import { detectPortalFromRequest, PortalKind } from '../../shared/portal-host.util';
import { getClearCookieOptions, getCookieOptions } from '../../shared/http-config.util';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  SelectTenantDto,
  MfaVerifyDto,
  MfaDisableDto,
  MfaSetupDto,
  MfaLoginVerifyDto,
  RecoveryCodesRegenerateDto,
  ChangePasswordVerifyDto,
  AdminLoginDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountProfileService: AccountProfileService,
    @Inject(forwardRef(() => AuthorizationService))
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password login' })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('portal') portal?: 'platform' | 'customer',
  ) {
    const resolvedPortal = (req as any).resolvedPortal ?? detectPortalFromRequest(req, portal as PortalKind | undefined);
    const result: any = await this.authService.login(
      req.user,
      req.ip || '',
      req.headers['user-agent'] as string,
      req.cookies?.trusted_device_token,
      resolvedPortal,
    );

    if (result.requiresPasswordChange) {
      return {
        success: true,
        data: {
          requiresPasswordChange: true,
          changeSessionId: result.changeSessionId,
          expiresIn: result.expiresIn,
        },
        meta: null,
        error: null,
      };
    }

    if (result.requiresMfa) {
      return {
        success: true,
        data: {
          requiresMfa: true,
          loginSessionId: result.loginSessionId,
          expiresIn: result.expiresIn,
        },
        meta: null,
        error: null,
      };
    }

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        email: result.email,
        requiresMfa: false,
        isSuperAdmin: result.isSuperAdmin,
        isInternalStaff: result.isInternalStaff,
        internalRole: result.internalRole,
        tenants: result.tenants,
        selectedTenantId: result.selectedTenantId,
        pendingOrganization: result.pendingOrganization,
      },
      meta: null,
      error: null,
    };
  }

  @Post('admin-login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Company code + organization admin login' })
  async adminLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: AdminLoginDto,
  ) {
    const user = await this.authService.validateAdminUser(
      dto.companyCode,
      dto.email,
      dto.password,
      req.ip || '',
      req.headers['user-agent'] as string,
    );
    const result: any = await this.authService.login(
      user,
      req.ip || '',
      req.headers['user-agent'] as string,
      req.cookies?.trusted_device_token,
      'customer',
    );

    if (result.requiresPasswordChange) {
      return {
        success: true,
        data: {
          requiresPasswordChange: true,
          changeSessionId: result.changeSessionId,
          expiresIn: result.expiresIn,
        },
        meta: null,
        error: null,
      };
    }

    if (result.requiresMfa) {
      return {
        success: true,
        data: {
          requiresMfa: true,
          loginSessionId: result.loginSessionId,
          expiresIn: result.expiresIn,
        },
        meta: null,
        error: null,
      };
    }

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        email: result.email,
        requiresMfa: false,
        isSuperAdmin: result.isSuperAdmin,
        isInternalStaff: result.isInternalStaff,
        internalRole: result.internalRole,
        tenants: result.tenants,
        selectedTenantId: result.selectedTenantId,
        pendingOrganization: result.pendingOrganization,
      },
      meta: null,
      error: null,
    };
  }

  @Post('change-password/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Complete a forced first-login password change (10 req/min per IP)' })
  async verifyPasswordChange(@Body() dto: ChangePasswordVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result: any = await this.authService.verifyPasswordChange(
      dto.changeSessionId,
      dto.newPassword,
      req.ip || '',
      req.headers['user-agent'] as string,
    );

    if (result.requiresMfa) {
      return {
        success: true,
        data: {
          requiresMfa: true,
          loginSessionId: result.loginSessionId,
          expiresIn: result.expiresIn,
        },
        meta: null,
        error: null,
      };
    }

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        email: result.email,
        requiresMfa: false,
        isSuperAdmin: result.isSuperAdmin,
        isInternalStaff: result.isInternalStaff,
        internalRole: result.internalRole,
        tenants: result.tenants,
        selectedTenantId: result.selectedTenantId,
        pendingOrganization: result.pendingOrganization,
      },
      meta: null,
      error: null,
    };
  }

  @Post('mfa/login/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP or recovery code to complete an MFA-gated login (10 req/min per IP)' })
  async verifyMfaLogin(@Body() dto: MfaLoginVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result: any = await this.authService.verifyMfaLogin(
      dto.loginSessionId,
      { token: dto.token, recoveryCode: dto.recoveryCode, trustDevice: dto.trustDevice },
      req.ip || '',
      req.headers['user-agent'] as string,
    );

    if (result.refreshToken) {
      res.cookie('refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));
    }

    if (result.refreshToken && result.trustedDeviceToken) {
      res.cookie('trusted_device_token', result.trustedDeviceToken, getCookieOptions(30 * 24 * 60 * 60 * 1000));
    }

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        email: result.email,
        requiresMfa: false,
        isSuperAdmin: result.isSuperAdmin,
        isInternalStaff: result.isInternalStaff,
        internalRole: result.internalRole,
        tenants: result.tenants,
        selectedTenantId: result.selectedTenantId,
        pendingOrganization: result.pendingOrganization,
      },
      meta: null,
      error: null,
    };
  }

  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user\'s effective permissions and branch access scope for the active organization' })
  async getMyPermissions(@Req() req: Request) {
    const user = (req as any).user;
    const { permissions, accessScope } = await this.authorizationService.getEffectivePermissions(user);
    return {
      success: true,
      data: {
        permissions,
        accessScope,
        userType: user.userType,
        isSuperAdmin: user.isSuperAdmin,
        tenantId: user.tenantId,
      },
      meta: null,
      error: null,
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user global profile and settings context' })
  async getGlobalProfile(@Req() req: Request) {
    const data = await this.accountProfileService.getProfile((req as any).user);
    return { success: true, data, meta: null, error: null };
  }

  @Patch('profile/personal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update safe personal profile fields for the current authenticated user' })
  async updateGlobalPersonalProfile(@Req() req: Request, @Body() body: any) {
    const data = await this.accountProfileService.updatePersonal((req as any).user, body);
    return { success: true, data, meta: null, error: null };
  }

  @Patch('profile/account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update account identifiers for the current authenticated user' })
  async updateGlobalAccountProfile(@Req() req: Request, @Body() body: any) {
    const data = await this.accountProfileService.updateAccount((req as any).user, body);
    return { success: true, data, meta: null, error: null };
  }

  @Post('profile/photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload or replace the current authenticated user profile photo' })
  async uploadGlobalProfilePhoto(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
    const data = await this.accountProfileService.uploadPhoto((req as any).user, file);
    return { success: true, data, meta: null, error: null };
  }

  @Delete('profile/photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete the current authenticated user profile photo' })
  async deleteGlobalProfilePhoto(@Req() req: Request) {
    const data = await this.accountProfileService.deletePhoto((req as any).user);
    return { success: true, data, meta: null, error: null };
  }

  @Post('select-tenant')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Select an organization to work in' })
  async selectTenant(@Req() req: Request, @Body() dto: SelectTenantDto) {
    const user = (req as any).user;
    const result = await this.authService.selectTenant(
      user.sub,
      dto.tenantId,
      req.ip || '',
      req.headers['user-agent'] as string,
    );
    return {
      success: true,
      data: { accessToken: result.accessToken },
      meta: null,
      error: null,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh token for new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const result = await this.authService.refreshTokens(refreshToken);

    res.cookie('refresh_token', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

    return {
      success: true,
      data: { accessToken: result.accessToken },
      meta: null,
      error: null,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token and logout' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = (req as any).user;
    const refreshToken = req.cookies?.refresh_token;

    if (refreshToken) {
      await this.authService.logout(user.sub, refreshToken);
    }

    res.clearCookie('refresh_token', getClearCookieOptions());

    return { success: true, data: null, meta: null, error: null };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Send OTP to email for password reset (5 req/min per IP)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { success: true, data: null, meta: null, error: null };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and set new password' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List active sessions' })
  async getSessions(@Req() req: Request) {
    const user = (req as any).user;
    const sessions = await this.authService.getSessions(user.sub);
    return { success: true, data: sessions, meta: null, error: null };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke a session' })
  async revokeSession(@Req() req: Request, @Param('id') sessionId: string) {
    const user = (req as any).user;
    await this.authService.revokeSession(user.sub, sessionId);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get MFA enabled status for current user' })
  async getMfaStatus(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.getMfaStatus(user.sub);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate TOTP secret and QR code (requires password confirmation)' })
  async setupMfa(@Body() dto: MfaSetupDto, @Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.generateMfaSetup(user.sub, dto.password);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify TOTP code to activate MFA' })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.verifyMfa(user.sub, dto.token);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disable MFA' })
  async disableMfa(@Body() dto: MfaDisableDto, @Req() req: Request) {
    const user = (req as any).user;
    await this.authService.disableMfa(user.sub, dto.token);
    return { success: true, data: null, meta: null, error: null };
  }

  @Post('mfa/recovery-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Regenerate recovery codes (requires password confirmation)' })
  async regenerateRecoveryCodes(@Body() dto: RecoveryCodesRegenerateDto, @Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.regenerateRecoveryCodes(user.sub, dto.password);
    return { success: true, data: result, meta: null, error: null };
  }

  @Get('mfa/trusted-devices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List active trusted devices' })
  async listTrustedDevices(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.listTrustedDevices(user.sub);
    return { success: true, data: result, meta: null, error: null };
  }

  @Delete('mfa/trusted-devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke a trusted device' })
  async revokeTrustedDevice(@Req() req: Request, @Param('id') deviceId: string) {
    const user = (req as any).user;
    await this.authService.revokeTrustedDevice(user.sub, deviceId, req.ip || '', req.headers['user-agent'] as string);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get('mfa/activity')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Recent MFA-related security activity for the current user' })
  async getMfaActivity(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.authService.getMfaActivity(user.sub);
    return { success: true, data: result, meta: null, error: null };
  }
}
