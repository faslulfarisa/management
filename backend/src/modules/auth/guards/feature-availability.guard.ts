import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY, RequiredFeatureMetadata } from '../decorators/require-feature.decorator';
import { FeatureAvailabilityService } from '../../../shared/feature-availability.service';

@Injectable()
export class FeatureAvailabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureAvailability: FeatureAvailabilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredFeatureMetadata>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = user?.tenantId || user?.tenant_id || request.headers?.['x-tenant-id'];
    if (!tenantId) throw new ForbiddenException('Organization context required');

    await this.featureAvailability.assertEnabled(tenantId, required.module, required.feature);
    return true;
  }
}
