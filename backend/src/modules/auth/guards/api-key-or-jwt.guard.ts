import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
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

    this.verifyHmacSignature(request, apiKey);

    request.user = {
      tenantId: rows[0].tenant_id,
      isServiceAccount: true,
      keyName: rows[0].name,
      apiKeyId: rows[0].id,
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

  private verifyHmacSignature(request: any, apiKey: string): void {
    const signature = request.headers['x-signature'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const nonce = request.headers['x-nonce'] as string | undefined;
    if (!signature || !timestamp || !nonce) {
      throw new UnauthorizedException('Missing request signature, timestamp, or nonce');
    }

    const requestTime = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(requestTime) || Math.abs(Math.floor(Date.now() / 1000) - requestTime) > 300) {
      throw new UnauthorizedException('Expired request timestamp');
    }

    const secret = process.env.BIOMETRIC_HMAC_SECRET || apiKey;
    const path = request.originalUrl?.split('?')[0] ?? request.url?.split('?')[0] ?? '';
    const query = request.originalUrl?.includes('?') ? request.originalUrl.split('?').slice(1).join('?') : '';
    const body = this.canonicalBody(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})));
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const message = [request.method.toUpperCase(), path, query, timestamp, nonce, bodyHash].join('\n');
    const expected = createHmac('sha256', secret).update(message).digest('hex');

    if (!this.secureEqual(signature, expected)) {
      throw new UnauthorizedException('Invalid request signature');
    }
  }

  private canonicalBody(raw: Buffer | string): string {
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
    if (!text) return '';
    try {
      return JSON.stringify(this.sortJson(JSON.parse(text)));
    } catch {
      return text;
    }
  }

  private sortJson(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.sortJson(item));
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.sortJson(value[key]);
          return acc;
        }, {} as Record<string, any>);
    }
    return value;
  }

  private secureEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
