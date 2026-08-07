/**
 * zkteco.provider.ts
 *
 * Formal implementation of IAttendanceProvider for ZKTeco devices.
 * Wraps the ZktecoService parsing adapters and registers with the ProviderRegistry.
 *
 * Supported input modes:
 *   - ADMS plain-text push (from ZktecoController)
 *   - JSON punch array (REST API)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IAttendanceProvider, ProviderHealthResult } from '../base-provider.interface';
import { PunchEventDto } from '../../dto/punch-event.dto';
import { ProviderRegistryService } from '../provider-registry.service';
import { ZktecoService } from '../../../integrations/services/zkteco.service';

export const ZKTECO_PROVIDER_NAME = 'zkteco';

@Injectable()
export class ZktecoProvider implements IAttendanceProvider, OnModuleInit {
  readonly providerName = ZKTECO_PROVIDER_NAME;

  private readonly logger = new Logger(ZktecoProvider.name);

  constructor(
    private readonly zktecoService: ZktecoService,
    private readonly registry: ProviderRegistryService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  /**
   * Parse raw ZKTeco input into normalized PunchEventDtos.
   *
   * Raw format is determined by content type:
   *   - string  → ADMS plain-text format
   *   - object[] → JSON punch array
   *
   * The deviceSn must be embedded in raw as { deviceSn, body } for ADMS,
   * or { deviceSn, punches[] } for JSON.
   */
  async processIncoming(tenantId: string, raw: unknown): Promise<PunchEventDto[]> {
    if (!raw || typeof raw !== 'object') {
      this.logger.warn(`[zkteco] Received non-object payload for tenant ${tenantId}`);
      return [];
    }

    const payload = raw as Record<string, unknown>;
    const deviceSn = (payload['deviceSn'] as string) ?? 'UNKNOWN';

    // ADMS text format
    if (typeof payload['body'] === 'string') {
      return this.zktecoService.parseAdmsPunchText(deviceSn, payload['body']);
    }

    // JSON punch array format
    if (Array.isArray(payload['punches'])) {
      return this.zktecoService.parseJsonPunches(
        deviceSn,
        payload['punches'] as Array<{ employeeCode: string; timestamp: string }>,
      );
    }

    this.logger.warn(`[zkteco] Unrecognized payload structure for device ${deviceSn}`);
    return [];
  }

  /**
   * Health check: verify the ZKTeco integration record exists and is active.
   * For a real check, one would attempt a pyzk ping via the Python biometric-service.
   */
  async healthCheck(tenantId: string): Promise<ProviderHealthResult> {
    const start = Date.now();
    try {
      const { rows } = await (this.zktecoService as any).db.query(
        `SELECT COUNT(*) as cnt FROM integrations
         WHERE tenant_id = $1 AND type = 'zkteco' AND is_active = true`,
        [tenantId],
      );
      const activeCount = parseInt(rows[0]?.cnt ?? '0', 10);
      return {
        healthy: activeCount > 0,
        providerName: this.providerName,
        latencyMs: Date.now() - start,
        details: { activeIntegrations: activeCount },
      };
    } catch (err: any) {
      return {
        healthy: false,
        providerName: this.providerName,
        latencyMs: Date.now() - start,
        error: err?.message,
      };
    }
  }
}
