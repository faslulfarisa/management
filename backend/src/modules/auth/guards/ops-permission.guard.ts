import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OPS_PERMISSION_KEY } from '../decorators/require-ops-permission.decorator';
import { OpsPermission, DEFAULT_OPS_PERMISSIONS_BY_ROLE } from '../../../shared/ops-permissions.constants';
import { InternalRole } from '../../../shared/internal-roles.constants';

/**
 * Enforces @RequireOpsPermission(...) for the Internal Operations Portal.
 * Apply after JwtAuthGuard + InternalStaffGuard. Endpoints without
 * @RequireOpsPermission are unaffected (default allow).
 */
@Injectable()
export class OpsPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<OpsPermission>(OPS_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    // Full bypass for the Platform Super Admin role only — `is_super_admin`
    // (customer hierarchy) no longer grants standing ops access as of Phase 2
    // of the Platform/Customer separation.
    if (user.internalRole === 'platform_super_admin') return true;

    const granted = DEFAULT_OPS_PERMISSIONS_BY_ROLE[user.internalRole as InternalRole] ?? [];
    if (!granted.includes(permission)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
