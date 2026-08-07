import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignupOfferService } from '../services/signup-offer.service';
import { ValidateOfferCodeDto } from '../dto/signup-offer.dto';

/**
 * Public (no JwtAuthGuard) — consumed by the unauthenticated organization
 * registration wizard, the same way registration.controller.ts is public.
 */
@ApiTags('Public Signup Offers')
@Controller('public/signup-offers')
export class PublicSignupOfferController {
  constructor(private readonly service: SignupOfferService) {}

  @Get('active')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'List currently active, auto-applied signup offers (public)' })
  async listActive() {
    const data = await this.service.getPublicActiveOffers();
    return { success: true, data, meta: null, error: null };
  }

  @Post('validate-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate a promo code entered during signup (public)' })
  async validateCode(@Body() dto: ValidateOfferCodeDto) {
    const data = await this.service.validateCode(dto.code);
    return { success: true, data, meta: null, error: null };
  }
}
