import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { INTERNAL_ROLES, InternalRole } from '../../../shared/internal-roles.constants';
import { slugifyUsername } from '../../../shared/credential-generator.util';

export interface OpsActor {
  sub: string;
}

/**
 * CRUD for the internal-staff population itself (provisioning Marketing/
 * Sales/Technical accounts) — deliberately separate from UserService, which
 * is tenant-scoped throughout (every method takes a tenantId and checks
 * membership). Internal staff have no real tenant, only an arbitrary
 * placeholder (see migration 099) to satisfy users.tenant_id NOT NULL, so
 * none of that tenant-scoped machinery applies here.
 */
@Injectable()
export class InternalStaffService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
  ) {}

  async findAll() {
    const { rows } = await this.db.query(
      `SELECT id, email, username, full_name, internal_role, is_active, created_at, last_login_at
       FROM users
       WHERE is_internal_staff = true AND deleted_at IS NULL
       ORDER BY created_at DESC`,
    );
    return rows;
  }

  async create(data: { email: string; password: string; username?: string | null; fullName?: string; internalRole: InternalRole }, actor: OpsActor) {
    if (!INTERNAL_ROLES.includes(data.internalRole)) {
      throw new BadRequestException('Invalid internal role');
    }
    if (!data.email?.trim() || !data.password) {
      throw new BadRequestException('Email and password are required');
    }

    const { rows: existing } = await this.db.query(
      'SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL',
      [data.email],
    );
    if (existing.length) throw new BadRequestException('Email already in use');

    const username = this.normalizeUsername(data.username);
    if (username && await this.usernameExists(username)) {
      throw new BadRequestException('Username already exists');
    }

    // users.tenant_id is NOT NULL at the schema level — internal staff get an
    // arbitrary placeholder (same workaround already used for super admins),
    // never read for authorization (jwt.strategy.ts forces tenantId to null
    // for is_internal_staff regardless of this column).
    const { rows: tenantRows } = await this.db.query('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1');
    if (!tenantRows.length) throw new BadRequestException('No organization exists yet to anchor this account to');
    const placeholderTenantId = tenantRows[0].id;

    const passwordHash = await bcrypt.hash(data.password, 12);
    const { rows } = await this.db.query(
      `INSERT INTO users (email, username, password_hash, full_name, is_active, is_internal_staff, internal_role, status, tenant_id)
       VALUES ($1, $2, $3, $4, true, true, $5, 'active', $6)
       RETURNING id, email, username, full_name, internal_role, is_active, created_at`,
      [data.email, username, passwordHash, data.fullName || null, data.internalRole, placeholderTenantId],
    );
    const created = rows[0];

    await this.auditLog.log({
      tenantId: placeholderTenantId,
      userId: actor.sub,
      entityType: 'internal_staff',
      entityId: created.id,
      action: 'internal_staff_created',
      newValues: { email: created.email, username: created.username, internalRole: created.internal_role },
    });

    return created;
  }

  async update(id: string, data: { internalRole?: InternalRole; fullName?: string; username?: string | null }, actor: OpsActor) {
    const target = await this.getOrThrow(id);
    if (data.internalRole !== undefined && !INTERNAL_ROLES.includes(data.internalRole)) {
      throw new BadRequestException('Invalid internal role');
    }
    const username = data.username !== undefined ? this.normalizeUsername(data.username) : undefined;
    if (username && await this.usernameExists(username, id)) {
      throw new BadRequestException('Username already exists');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (data.internalRole !== undefined) { fields.push(`internal_role = $${i++}`); values.push(data.internalRole); }
    if (data.fullName !== undefined) { fields.push(`full_name = $${i++}`); values.push(data.fullName || null); }
    if (data.username !== undefined) { fields.push(`username = $${i++}`); values.push(username); }
    if (!fields.length) throw new BadRequestException('No fields to update');

    const { rows } = await this.db.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${i} AND is_internal_staff = true
       RETURNING id, email, username, full_name, internal_role, is_active, created_at`,
      [...values, id],
    );

    await this.auditLog.log({
      tenantId: target.tenant_id,
      userId: actor.sub,
      entityType: 'internal_staff',
      entityId: id,
      action: 'internal_staff_updated',
      oldValues: { internalRole: target.internal_role, fullName: target.full_name, username: target.username },
      newValues: { ...data, username },
    });

    return rows[0];
  }

  async setActive(id: string, isActive: boolean, actor: OpsActor) {
    const target = await this.getOrThrow(id);

    const { rows } = await this.db.query(
      `UPDATE users SET is_active = $1, updated_at = now()
       WHERE id = $2 AND is_internal_staff = true
       RETURNING id, email, username, full_name, internal_role, is_active`,
      [isActive, id],
    );

    if (!isActive) {
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [id],
      );
    }

    await this.auditLog.log({
      tenantId: target.tenant_id,
      userId: actor.sub,
      entityType: 'internal_staff',
      entityId: id,
      action: isActive ? 'internal_staff_reactivated' : 'internal_staff_deactivated',
    });

    return rows[0];
  }

  async resetPassword(id: string, newPassword: string, actor: OpsActor) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const target = await this.getOrThrow(id);
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
    await this.db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);

    await this.auditLog.log({
      tenantId: target.tenant_id,
      userId: actor.sub,
      entityType: 'internal_staff',
      entityId: id,
      action: 'internal_staff_password_reset',
    });

    return { success: true };
  }

  async remove(id: string, actor: OpsActor) {
    const target = await this.getOrThrow(id);
    if (target.is_active) {
      throw new BadRequestException('Deactivate the account before deleting it');
    }

    await this.db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);

    await this.auditLog.log({
      tenantId: target.tenant_id,
      userId: actor.sub,
      entityType: 'internal_staff',
      entityId: id,
      action: 'internal_staff_deleted',
      oldValues: { email: target.email },
    });

    return { success: true };
  }

  private async getOrThrow(id: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM users WHERE id = $1 AND is_internal_staff = true AND deleted_at IS NULL',
      [id],
    );
    if (!rows.length) throw new NotFoundException('Internal staff user not found');
    return rows[0];
  }

  private normalizeUsername(rawUsername: string | null | undefined): string | null {
    const trimmed = String(rawUsername ?? '').trim();
    if (!trimmed) return null;

    const username = slugifyUsername(trimmed);
    if (!username) {
      throw new BadRequestException('Username must contain at least one letter or number');
    }
    if (username !== trimmed) {
      throw new BadRequestException('Use lowercase letters and numbers only for username');
    }
    return username;
  }

  private async usernameExists(username: string, excludeUserId?: string): Promise<boolean> {
    const params: any[] = [username];
    let clause = 'is_internal_staff = true AND LOWER(username) = LOWER($1) AND deleted_at IS NULL';
    if (excludeUserId) {
      clause += ' AND id <> $2';
      params.push(excludeUserId);
    }

    const { rows } = await this.db.query(`SELECT 1 FROM users WHERE ${clause} LIMIT 1`, params);
    return rows.length > 0;
  }
}
