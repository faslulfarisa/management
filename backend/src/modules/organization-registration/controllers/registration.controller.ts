import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RegistrationService } from '../services/registration.service';
import {
  CreateAccountDto, RegistrationSessionDto, VerifyMobileDto, SubmitOrganizationDto,
} from '../dto/registration.dto';

/**
 * All routes here are intentionally public (no JwtAuthGuard) — this is the
 * self-service signup flow for organizations that don't have an account yet.
 * Throttled the same way as auth.controller.ts's forgot-password endpoint.
 */
@ApiTags('Organization Registration')
@Controller('organization-registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('account')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Step 1: create the registration owner\'s account (public)' })
  async createAccount(@Body() dto: CreateAccountDto) {
    const data = await this.registrationService.createAccount(dto);
    return { success: true, data, meta: null, error: null };
  }

  @Post('mobile-otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a mobile OTP (best-effort — optional step, no SMS provider configured)' })
  async requestMobileOtp(@Body() dto: RegistrationSessionDto) {
    const data = await this.registrationService.requestMobileOtp(dto);
    return { success: true, data, meta: null, error: null };
  }

  @Post('mobile-otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify the mobile OTP (optional step)' })
  async verifyMobile(@Body() dto: VerifyMobileDto) {
    const data = await this.registrationService.verifyMobile(dto);
    return { success: true, data, meta: null, error: null };
  }

  @Post('account/status')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Check mobile verification status for the current registration session (public)' })
  async getAccountStatus(@Body() dto: RegistrationSessionDto) {
    const data = await this.registrationService.getAccountStatus(dto.registrationId, dto.accessToken);
    return { success: true, data, meta: null, error: null };
  }

  @Post('organization')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Step 2: submit full organization details, creating the org in pending_review status (public)' })
  async submitOrganization(@Req() req: Request, @Body() dto: SubmitOrganizationDto) {
    const data = await this.registrationService.submitOrganization(
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
    return { success: true, data, meta: null, error: null };
  }

  @Get('status/:tenantId')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Poll the approval status of a newly submitted organization (public)' })
  async getOrganizationStatus(@Param('tenantId') tenantId: string) {
    const data = await this.registrationService.getOrganizationStatus(tenantId);
    return { success: true, data, meta: null, error: null };
  }
}
