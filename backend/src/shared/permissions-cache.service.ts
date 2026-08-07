import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Caches the per-user permission-string arrays computed by RoleService and
 * PositionService — both are queried on every authorization check
 * (AuthorizationService.hasPermission / getEffectivePermissions), which fires
 * on most authenticated requests.
 *
 * TTL is intentionally short: it's a performance cache, not a source of
 * truth, and a short TTL bounds how long a revoked permission can stay
 * effective if a call site forgets to invalidate explicitly.
 */
@Injectable()
export class PermissionsCacheService {
  private readonly logger = new Logger(PermissionsCacheService.name);
  private readonly ttl = parseInt(process.env.PERMISSIONS_CACHE_TTL_SECONDS ?? '60', 10);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private roleKey(tenantId: string, userId: string) {
    return `permissions:role:${tenantId}:${userId}`;
  }

  private positionKey(tenantId: string, userId: string) {
    return `permissions:position:${tenantId}:${userId}`;
  }

  async getRolePermissions(
    tenantId: string,
    userId: string,
    loader: () => Promise<string[]>,
  ): Promise<string[]> {
    return this.getOrLoad(this.roleKey(tenantId, userId), loader);
  }

  async getPositionPermissions(
    tenantId: string,
    userId: string,
    loader: () => Promise<string[]>,
  ): Promise<string[]> {
    return this.getOrLoad(this.positionKey(tenantId, userId), loader);
  }

  /** Call after any change to this user's role/position assignments. */
  async invalidateUser(tenantId: string, userId: string): Promise<void> {
    try {
      await this.redis.del(this.roleKey(tenantId, userId), this.positionKey(tenantId, userId));
    } catch (e) {
      this.logger.warn(`Redis invalidation failed for user ${userId}`);
    }
  }

  /** Call after a role's permission set changes, for every user holding that role. */
  async invalidateRoleForUsers(tenantId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    try {
      await this.redis.del(...userIds.map(id => this.roleKey(tenantId, id)));
    } catch (e) {
      this.logger.warn('Redis invalidation failed for role permission change');
    }
  }

  /** Call after a position's permission set changes, for every user holding that position. */
  async invalidatePositionForUsers(tenantId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    try {
      await this.redis.del(...userIds.map(id => this.positionKey(tenantId, id)));
    } catch (e) {
      this.logger.warn('Redis invalidation failed for position permission change');
    }
  }

  private async getOrLoad(key: string, loader: () => Promise<string[]>): Promise<string[]> {
    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached) as string[];
    } catch (e) {
      this.logger.warn(`Redis get failed for key ${key}, falling back to DB`);
    }

    const value = await loader();

    try {
      await this.redis.setex(key, this.ttl, JSON.stringify(value));
    } catch (e) {
      // Cache write failure is non-fatal
    }

    return value;
  }
}
