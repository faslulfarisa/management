import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PERMISSION_BRANCH_PARAM_KEY } from '../decorators/require-permission.decorator';
import { AuthorizationService } from '../../platform/services/authorization.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { Permission } from '../../../shared/permissions.constants';

/**
 * Enforces @RequirePermission(...) via the centralized AuthorizationService.
 * Apply after JwtAuthGuard (and ActiveOrgGuard where relevant). Endpoints
 * without @RequirePermission are unaffected (default allow).
 *
 * Denials are audit-logged as `entity_type='authorization'`,
 * `action='permission_denied'`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(forwardRef(() => AuthorizationService))
    private authorizationService: AuthorizationService,
    @Inject(forwardRef(() => AuditLogService))
    private auditLog: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const branchParam = this.reflector.getAllAndOverride<string>(PERMISSION_BRANCH_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const branchId = branchParam
      ? request.params?.[branchParam] || request.query?.[branchParam] || request.body?.[branchParam] || null
      : undefined;

    const allowed = await this.authorizationService.can(user, permission, branchId ? { branchId } : undefined);

    if (!allowed) {
      const tenantId = user.tenantId || user.tenant_id;
      if (tenantId) {
        await this.auditLog.log({
          tenantId,
          userId: user.sub,
          entityType: 'authorization',
          entityId: user.sub,
          action: 'permission_denied',
          newValues: { permission, branchId: branchId || null, path: request.originalUrl, method: request.method },
        });
      }
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
