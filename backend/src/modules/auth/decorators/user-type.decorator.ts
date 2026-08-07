import { SetMetadata } from '@nestjs/common';
import { UserType } from '../../../shared/user-hierarchy.constants';

export const USER_TYPE_KEY = 'requiredUserTypes';

/**
 * Restricts an endpoint to actors whose resolved user type (or super admin)
 * is one of the given types. Use with HierarchyGuard.
 *
 * Usage: @RequireUserType('super_admin', 'org_admin')
 */
export const RequireUserType = (...types: UserType[]) => SetMetadata(USER_TYPE_KEY, types);
