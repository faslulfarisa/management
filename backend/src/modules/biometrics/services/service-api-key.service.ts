import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';

export interface CreatedApiKey {
  id: string;
  tenantId: string;
  name: string;
  rawKey: string; // shown exactly once; never stored
  createdAt: string;
}

@Injectable()
export class ServiceApiKeyService {
  constructor(private readonly db: DatabaseService) {}

  async create(tenantId: string, name: string): Promise<CreatedApiKey> {
    const rawKey = ApiKeyOrJwtGuard.generateRawKey();
    const keyHash = ApiKeyOrJwtGuard.hashKey(rawKey);

    const { rows } = await this.db.query(
      `INSERT INTO service_api_keys (tenant_id, key_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, tenant_id, name, created_at`,
      [tenantId, keyHash, name],
    );

    return {
      id: rows[0].id,
      tenantId: rows[0].tenant_id,
      name: rows[0].name,
      rawKey,
      createdAt: rows[0].created_at,
    };
  }

  async listForTenant(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, name, is_active, created_at, last_used_at
       FROM service_api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async revoke(id: string): Promise<void> {
    const { rowCount } = await this.db.query(
      `UPDATE service_api_keys SET is_active = false WHERE id = $1 AND is_active = true`,
      [id],
    );
    if (rowCount === 0) {
      throw new NotFoundException(`Service API key '${id}' not found or already revoked`);
    }
  }
}
