import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../shared/database.service';
import { normalizeStoredUserType } from '../../../shared/user-hierarchy.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const { rows } = await this.db.query(
      `SELECT u.id, u.tenant_id, u.email, u.employee_id, u.is_active, u.is_super_admin,
              u.is_internal_staff, u.internal_role, ut.user_type, ut.is_org_admin
       FROM users u
       LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $2
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [payload.sub, payload.tenant_id || null],
    );

    if (!rows.length || !rows[0].is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const isOrgAdmin = rows[0].is_org_admin === true;
    const storedUserType = isOrgAdmin ? 'org_admin' : normalizeStoredUserType(rows[0].user_type);
    const hasTenantMembership = rows[0].user_type != null;
    const isGlobalSuperAdmin = rows[0].is_super_admin && !rows[0].is_internal_staff && !hasTenantMembership;

    return {
      sub: rows[0].id,
      // Internal staff never get a tenant context, even though users.tenant_id
      // is NOT NULL at the schema level and holds an arbitrary placeholder for
      // them (the same workaround super admins already rely on) — falling
      // through to that placeholder here would let ActiveOrgGuard mistake them
      // for a member of that tenant.
      tenantId: rows[0].is_internal_staff ? null : (payload.tenant_id || rows[0].tenant_id || null),
      email: rows[0].email,
      employeeId: rows[0].employee_id,
      isSuperAdmin: isGlobalSuperAdmin,
      userType: isGlobalSuperAdmin ? 'super_admin' : storedUserType,
      isOrgAdmin: isOrgAdmin || storedUserType === 'org_admin',
      isInternalStaff: rows[0].is_internal_staff,
      internalRole: rows[0].internal_role || null,
    };
  }
}
