import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Extracts the active tenant_id from the JWT payload.
 * Throws BadRequestException if no tenant is selected.
 *
 * Usage: async myAction(@CurrentTenantId() tenantId: string) { ... }
 */
export const CurrentTenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = user?.tenantId || user?.tenant_id;
    if (!tenantId) {
      throw new BadRequestException(
        'No active organization selected. Please select an organization first.',
      );
    }
    return tenantId;
  },
);
