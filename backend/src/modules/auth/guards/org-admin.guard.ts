import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class OrgAdminGuard implements CanActivate {
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Super admins can do anything
    if (user.isSuperAdmin) {
      return true;
    }

    // Determine target tenantId from params, body, or current JWT
    const targetTenantId =
      request.params?.id ||
      request.params?.tenantId ||
      request.body?.tenantId ||
      user.tenantId;

    if (!targetTenantId) {
      throw new ForbiddenException('No organization specified');
    }

    // Check if user is an org admin for this tenant
    const { rows } = await this.db.query(
      `SELECT 1 FROM user_tenants
       WHERE user_id = $1 AND tenant_id = $2
         AND (is_org_admin = true OR user_type = 'org_admin')`,
      [user.sub, targetTenantId],
    );

    if (!rows.length) {
      throw new ForbiddenException('Only organization admins can perform this action');
    }

    return true;
  }
}
