import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { CredentialEncryptionService } from '../../../shared/crypto/credential-encryption.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private db: DatabaseService,
    private crypto: CredentialEncryptionService,
  ) {}

  private toPublicIntegration(row: any) {
    if (!row) return row;
    return {
      ...row,
      config: this.crypto.decryptConfig(row.config || {}),
    };
  }

  private toPublicWebhook(row: any) {
    if (!row) return row;
    return {
      ...row,
      secret: row.secret ? this.crypto.decrypt(row.secret) : row.secret,
    };
  }

  async getIntegrations(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM integrations WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows.map((row) => this.toPublicIntegration(row));
  }

  async createIntegration(tenantId: string, data: any) {
    const encryptedConfig = this.crypto.encryptConfig(data.config || {});
    const { rows } = await this.db.query(
      `INSERT INTO integrations (tenant_id, name, type, config)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, name) DO UPDATE SET type=$3, config=$4, updated_at=now()
        RETURNING *`,
      [tenantId, data.name, data.type, JSON.stringify(encryptedConfig)],
    );
    return this.toPublicIntegration(rows[0]);
  }

  async updateIntegration(id: string, tenantId: string, data: any) {
    const encryptedConfig = data.config ? this.crypto.encryptConfig(data.config) : null;
    const { rows } = await this.db.query(
      `UPDATE integrations SET name = COALESCE($3, name), type = COALESCE($4, type),
        config = COALESCE($5, config), is_active = COALESCE($6, is_active), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.name, data.type, encryptedConfig ? JSON.stringify(encryptedConfig) : null, data.is_active],
    );
    if (!rows.length) throw new NotFoundException('Integration not found');
    return this.toPublicIntegration(rows[0]);
  }

  async deleteIntegration(id: string, tenantId: string) {
    await this.db.query('DELETE FROM integrations WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async toggleIntegration(id: string, tenantId: string, isActive: boolean) {
    const { rows } = await this.db.query(
      'UPDATE integrations SET is_active = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, isActive],
    );
    if (!rows.length) throw new NotFoundException('Integration not found');
    return this.toPublicIntegration(rows[0]);
  }

  async getWebhooks(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows.map((row) => this.toPublicWebhook(row));
  }

  async createWebhook(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO webhooks (tenant_id, url, events, secret) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenantId, data.url, data.events, data.secret ? this.crypto.encrypt(data.secret) : null],
    );
    return this.toPublicWebhook(rows[0]);
  }

  async deleteWebhook(id: string, tenantId: string) {
    await this.db.query('DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async getSyncLogs(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT sl.*, i.name as integration_name FROM sync_logs sl LEFT JOIN integrations i ON sl.integration_id = i.id WHERE sl.tenant_id = $1 ORDER BY sl.started_at DESC LIMIT 50',
      [tenantId],
    );
    return rows;
  }

  async createSyncLog(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO sync_logs (tenant_id, integration_id, direction, entity_type, records_synced, status, error)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, data.integration_id, data.direction, data.entity_type, data.records_synced || 0, data.status || 'success', data.error || null],
    );
    return rows[0];
  }

  async getAvailableIntegrations() {
    return [
      // ── Biometric Attendance ─────────────────────────────────────────────
      {
        type: 'zkteco',
        name: 'ZKTeco Biometric',
        description: 'Sync attendance from ZKTeco fingerprint/face biometric devices via ADMS push or TCP pull',
        icon: '🔏',
        category: 'biometric',
      },
      {
        type: 'easytimepro',
        name: 'EasyTimePro',
        description: 'Sync attendance from EasyTimePro time-attendance software via SQL Server database or REST API polling',
        icon: '⏱️',
        category: 'biometric',
      },
      // ── Location & Maps ──────────────────────────────────────────────────
      {
        type: 'google_maps',
        name: 'Google Maps',
        description: 'Location services and geofencing',
        icon: '🗺️',
        category: 'location',
      },
      // ── Notifications ────────────────────────────────────────────────────
      {
        type: 'whatsapp',
        name: 'WhatsApp Business',
        description: 'Send notifications via WhatsApp',
        icon: '💬',
        category: 'notifications',
      },
      {
        type: 'email',
        name: 'Email (SMTP/SendGrid)',
        description: 'Email notifications and alerts',
        icon: '📧',
        category: 'notifications',
      },
    ];
  }
}
