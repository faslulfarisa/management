import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class ApiKeyOrJwtGuard extends AuthGuard('jwt') {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      return super.canActivate(context) as Promise<boolean>;
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, name
       FROM service_api_keys
       WHERE key_hash = $1 AND is_active = true`,
      [keyHash],
    );

    if (!rows[0]) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.user = {
      tenantId: rows[0].tenant_id,
      isServiceAccount: true,
      keyName: rows[0].name,
    };

    // fire-and-forget usage tracking
    this.db
      .query(`UPDATE service_api_keys SET last_used_at = NOW() WHERE id = $1`, [rows[0].id])
      .catch(() => {});

    return true;
  }

  static hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  static generateRawKey(): string {
    return `hms_sak_${randomBytes(32).toString('hex')}`;
  }
}
