import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

/**
 * Historical imports are tenant-sensitive migration data. Access is limited to:
 * - organization super admins (`user_type = org_admin`)
 * - users explicitly granted `historical_attendance_import:manage` through
 *   their assigned Position
 *
 * Branch admins and generic admins must never inherit this capability from
 * role identity alone.
 */
@Injectable()
export class HistoricalAttendanceImportGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = user?.tenantId || user?.tenant_id;

    if (!user || !tenantId) {
      throw new ForbiddenException('Historical attendance imports require an active organization');
    }

    if (user.userType === 'org_admin') {
      return true;
    }

    const { rows } = await this.db.query(
      `SELECT 1
       FROM user_positions up
       JOIN position_permissions pp ON pp.position_id = up.position_id AND pp.tenant_id = up.tenant_id
       JOIN permissions p ON p.id = pp.permission_id
       WHERE up.user_id = $1
         AND up.tenant_id = $2
         AND p.module = 'historical_attendance_import'
         AND p.action = 'manage'
       LIMIT 1`,
      [user.sub, tenantId],
    );

    if (!rows.length) {
      throw new ForbiddenException('You do not have permission to manage historical attendance imports');
    }

    return true;
  }
}
