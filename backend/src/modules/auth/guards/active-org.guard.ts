import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Ensures the JWT contains a non-null tenant_id before allowing access to
 * any operational module. Apply after JwtAuthGuard so req.user is populated.
 *
 * Super admins must call POST /auth/select-tenant to embed a tenant_id in
 * their JWT before they can operate within an organization's data.
 */
@Injectable()
export class ActiveOrgGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new BadRequestException('Authentication required');
    }

    const tenantId = user.tenantId || user.tenant_id;
    if (!tenantId) {
      throw new BadRequestException(
        'No active organization selected. Please select an organization before performing this action.',
      );
    }

    return true;
  }
}
