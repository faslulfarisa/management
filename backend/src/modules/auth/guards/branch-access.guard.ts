import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Authentication required');
    if (user.isSuperAdmin) return true;

    // Org admins also bypass branch-level restrictions
    const { rows: adminRows } = await this.db.query(
      'SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2 AND is_org_admin = true',
      [user.sub, user.tenantId],
    );
    if (adminRows.length) return true;

    const branchId =
      request.params?.branchId ||
      request.params?.id ||
      request.query?.branch_id ||
      request.body?.branch_id;

    // No branch scope in request — tenant-level access is sufficient
    if (!branchId) return true;

    const { rows } = await this.db.query(
      'SELECT 1 FROM branch_user_access WHERE tenant_id = $1 AND branch_id = $2 AND user_id = $3 AND is_active = TRUE',
      [user.tenantId, branchId, user.sub],
    );

    if (!rows.length) throw new ForbiddenException('You do not have access to this branch');
    return true;
  }
}
