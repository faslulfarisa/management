import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USER_TYPE_KEY } from '../decorators/user-type.decorator';
import { UserType } from '../../../shared/user-hierarchy.constants';

/**
 * Checks request.user.userType (or isSuperAdmin) against the user types
 * declared via @RequireUserType(...). Apply after JwtAuthGuard.
 */
@Injectable()
export class HierarchyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTypes = this.reflector.getAllAndOverride<UserType[]>(USER_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredTypes || requiredTypes.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Authentication required');

    const userType: UserType = user.isSuperAdmin ? 'super_admin' : (user.userType || 'employee');

    if (!requiredTypes.includes(userType)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
