import { SetMetadata } from '@nestjs/common';
import { OpsPermission } from '../../../shared/ops-permissions.constants';

export const OPS_PERMISSION_KEY = 'requiredOpsPermission';

/**
 * Restricts an Internal Operations Portal endpoint to internal staff granted
 * `permission` (via DEFAULT_OPS_PERMISSIONS_BY_ROLE — see OpsPermissionGuard).
 * `internal_role: 'platform_super_admin'` always passes (it's granted every
 * permission). Customer `is_super_admin` does not bypass this. Use alongside
 * InternalStaffGuard + OpsPermissionGuard. Can be applied at the controller
 * (class) level when every route shares the same required permission.
 *
 * Usage:
 *   @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_CREATE)
 */
export const RequireOpsPermission = (permission: OpsPermission) =>
  SetMetadata(OPS_PERMISSION_KEY, permission);
