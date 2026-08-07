import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Front door for the Internal Operations Portal (/operations/*). Apply after
 * JwtAuthGuard. Mirrors ActiveOrgGuard's role for tenant-scoped controllers,
 * but for the opposite population: only internal staff (Marketing/Sales/
 * Technical/Finance/Customer Success/Customer Support/Platform Super Admin)
 * may pass. `is_super_admin` (the *customer* hierarchy's top role) no longer
 * bypasses this — Phase 2 of the Platform/Customer separation split that
 * conflated identity into `internal_role: 'platform_super_admin'`, a distinct
 * is_internal_staff account. A customer super admin who also needs platform
 * access must be provisioned a separate platform account (see
 * internal-staff.controller.ts), never the same login.
 */
@Injectable()
export class InternalStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.isInternalStaff) {
      throw new ForbiddenException('This area is restricted to internal operations staff');
    }

    return true;
  }
}
