/**
 * biometric-device.service.ts
 *
 * Owns the biometric_devices registry: upserts from sync, CRUD for the API,
 * online/offline lifecycle, stale-device detection, and dashboard stats.
 *
 * Called by:
 *   BiometricSyncProcessor  — upsertFromSync() after each devices cursor run
 *   BiometricsController    — list / get / patch / deactivate endpoints
 *
 * Internally owns:
 *   sweepStaleDevices()     — @Cron every 5 min; marks offline devices whose
 *                             last_seen_at has gone stale
 *   _refreshOnlineGauge()   — keeps hms_devices_online Prometheus gauge accurate
 *                             after any is_online state change
 */

import { Injectable, Logger, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import { DeviceSyncRecord } from '../sync/biometric-sync.types';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';

export interface DeviceListFilters {
  providerName?: string;
  hardwareType?: string;
  isOnline?: boolean;
  isActive?: boolean;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface CreateDeviceDto {
  serialNumber: string;
  providerName: string;
  providerDeviceId?: string;
  name: string;
  ipAddress?: string;
  firmwareVersion?: string;
  hardwareType: 'fingerprint' | 'face' | 'card' | 'hybrid' | 'unknown';
  capabilities: string[];
  platform?: string;
  branchId?: string;
  metadata?: Record<string, unknown>;
}

export interface DevicePatchDto {
  name?: string;
  isActive?: boolean;
  /** Shallow-merged into existing metadata via jsonb || operator. */
  metadata?: Record<string, unknown>;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  byProvider: Array<{ provider: string; total: number; online: number }>;
  byHardwareType: Array<{ hardwareType: string; count: number }>;
}

/** Minutes of silence after which a previously-online device is marked stale. */
const STALE_THRESHOLD_MINUTES = 15;

@Injectable()
export class BiometricDeviceService {
  private readonly logger = new Logger(BiometricDeviceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: BiometricsMetricsService,
    @Inject(forwardRef(() => ApprovalEngineService))
    private readonly approvalEngine: ApprovalEngineService,
    @Inject(forwardRef(() => NotificationEmitterService))
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  // ── Sync integration ──────────────────────────────────────────────────────

  /**
   * Bulk-upsert device records produced by a sync adapter run.
   *
   * Conflict key: (tenant_id, serial_number, provider_name) per migration 027.
   * last_seen_at is only updated when the device is reported online so the
   * column always reflects the last known heartbeat, not a forced timestamp.
   */
  async upsertFromSync(
    tenantId: string,
    providerName: string,
    devices: DeviceSyncRecord[],
  ): Promise<{ upserted: number; failed: number }> {
    let upserted = 0;
    let failed = 0;

    for (const d of devices) {
      try {
        const lastSeenIso = d.lastSeenAt?.toISOString()
          ?? (d.isOnline ? new Date().toISOString() : null);

        await this.db.query(
          `INSERT INTO biometric_devices
             (tenant_id, serial_number, provider_name, provider_device_id,
              name, ip_address, firmware_version,
              hardware_type, capabilities, platform, is_online,
              last_seen_at, sync_cursor, metadata,
              is_active, created_at, updated_at)
           VALUES
             ($1, $2, $3, $4,
              $5, $6, $7,
              $8, $9::jsonb, $10, $11,
              $12, $12, $13::jsonb,
              true, NOW(), NOW())
           ON CONFLICT (tenant_id, serial_number, provider_name)
           DO UPDATE SET
             provider_device_id = EXCLUDED.provider_device_id,
             name               = COALESCE(EXCLUDED.name,             biometric_devices.name),
             ip_address         = COALESCE(EXCLUDED.ip_address,       biometric_devices.ip_address),
             firmware_version   = COALESCE(EXCLUDED.firmware_version, biometric_devices.firmware_version),
             hardware_type      = EXCLUDED.hardware_type,
             capabilities       = EXCLUDED.capabilities,
             platform           = COALESCE(EXCLUDED.platform,         biometric_devices.platform),
             is_online          = EXCLUDED.is_online,
             last_seen_at       = CASE
                                    WHEN EXCLUDED.is_online
                                    THEN COALESCE(EXCLUDED.last_seen_at, NOW())
                                    ELSE biometric_devices.last_seen_at
                                  END,
             sync_cursor        = EXCLUDED.sync_cursor,
             metadata           = biometric_devices.metadata || EXCLUDED.metadata,
             updated_at         = NOW()`,
          [
            tenantId,
            d.serialNumber,
            providerName,
            d.providerDeviceId,
            d.name || null,
            d.ipAddress ?? null,
            d.firmwareVersion ?? null,
            d.hardwareType,
            JSON.stringify(d.capabilities),
            d.platform ?? null,
            d.isOnline,
            lastSeenIso,
            JSON.stringify(d.metadata),
          ],
        );
        upserted++;
      } catch (err: any) {
        this.logger.error(
          JSON.stringify({
            event: 'device_upsert_failed',
            tenantId,
            serialNumber: d.serialNumber,
            error: err?.message,
          }),
        );
        failed++;
      }
    }

    if (upserted > 0) {
      await this._refreshOnlineGauge(tenantId, providerName);
      this._refreshDeviceDetailGauges().catch(() => {});
    }

    return { upserted, failed };
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async listDevices(
    tenantId: string,
    filters: DeviceListFilters = {},
  ): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    const {
      providerName,
      hardwareType,
      isOnline,
      isActive = true,
      branchId,
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let p = 2;

    conditions.push(`is_active = $${p++}`);
    params.push(isActive);

    if (providerName) {
      conditions.push(`provider_name = $${p++}`);
      params.push(providerName);
    }
    if (hardwareType) {
      conditions.push(`hardware_type = $${p++}`);
      params.push(hardwareType);
    }
    if (isOnline !== undefined) {
      conditions.push(`is_online = $${p++}`);
      params.push(isOnline);
    }
    if (branchId) {
      conditions.push(`branch_id = $${p++}`);
      params.push(branchId);
    }

    const where = conditions.join(' AND ');
    const selectCols = `
      id, tenant_id, serial_number, provider_name, provider_device_id,
      name, ip_address, firmware_version, hardware_type, capabilities,
      platform, is_online, is_active, last_seen_at, metadata,
      branch_id, created_at, updated_at`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(
        `SELECT ${selectCols}
         FROM biometric_devices
         WHERE ${where}
         ORDER BY is_online DESC, name ASC NULLS LAST, serial_number ASC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      ),
      this.db.query(
        `SELECT COUNT(*) AS total FROM biometric_devices WHERE ${where}`,
        params,
      ),
    ]);

    return {
      items: rows,
      total: parseInt(countRows[0].total, 10),
      page,
      limit,
    };
  }

  async getDevice(tenantId: string, id: string): Promise<any | null> {
    const { rows } = await this.db.query(
      `SELECT
         id, tenant_id, serial_number, provider_name, provider_device_id,
         name, ip_address, firmware_version, hardware_type, capabilities,
         platform, is_online, is_active, last_seen_at, metadata,
         branch_id, created_at, updated_at
       FROM biometric_devices
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ?? null;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async createDevice(tenantId: string, dto: CreateDeviceDto): Promise<any> {
    const { rows: existing } = await this.db.query(
      `SELECT id FROM biometric_devices
       WHERE tenant_id = $1 AND serial_number = $2 AND provider_name = $3 AND is_active = true`,
      [tenantId, dto.serialNumber, dto.providerName],
    );

    if (existing.length > 0) {
      throw new ConflictException(
        `Device with serial number '${dto.serialNumber}' and provider '${dto.providerName}' is already registered.`
      );
    }

    const { rows } = await this.db.query(
      `INSERT INTO biometric_devices
         (tenant_id, serial_number, provider_name, provider_device_id,
          name, ip_address, firmware_version, hardware_type,
          capabilities, platform, is_online, is_active, metadata,
          branch_id, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4,
          $5, $6, $7, $8,
          $9::jsonb, $10, false, true, $11::jsonb,
          $12, NOW(), NOW())
       RETURNING *`,
      [
        tenantId,
        dto.serialNumber,
        dto.providerName,
        dto.providerDeviceId ?? null,
        dto.name,
        dto.ipAddress ?? null,
        dto.firmwareVersion ?? null,
        dto.hardwareType,
        JSON.stringify(dto.capabilities),
        dto.platform ?? null,
        JSON.stringify(dto.metadata ?? {}),
        dto.branchId ?? null,
      ],
    );

    await this._refreshOnlineGauge(tenantId, dto.providerName);
    this._refreshDeviceDetailGauges().catch(() => {});

    // Submit for approval if the branch has a biometric_device chain configured
    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'biometric_device',
      entityId: rows[0].id,
      entityTable: 'biometric_devices',
      submittedBy: tenantId, // device registration initiated by system/admin
      branchId: dto.branchId ?? null,
      title: `Device registration: ${dto.name} (${dto.serialNumber})`,
      metadata: { serial_number: dto.serialNumber, provider: dto.providerName, hardware_type: dto.hardwareType },
    }).catch(() => {
      // If no chain is configured the submit is a no-op notification; don't block registration
    });

    return rows[0];
  }

  async patchDevice(tenantId: string, id: string, dto: DevicePatchDto): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let p = 1;

    if (dto.name !== undefined) {
      setClauses.push(`name = $${p++}`);
      params.push(dto.name);
    }
    if (dto.isActive !== undefined) {
      setClauses.push(`is_active = $${p++}`);
      params.push(dto.isActive);
      if (!dto.isActive) {
        // Deactivating → force offline so stale sweep ignores it
        setClauses.push(`is_online = false`);
      }
    }
    if (dto.metadata !== undefined) {
      setClauses.push(`metadata = metadata || $${p++}::jsonb`);
      params.push(JSON.stringify(dto.metadata));
    }

    const { rows } = await this.db.query(
      `UPDATE biometric_devices
       SET ${setClauses.join(', ')}
       WHERE id = $${p} AND tenant_id = $${p + 1}
       RETURNING *`,
      [...params, id, tenantId],
    );

    if (!rows[0]) throw new NotFoundException(`Device ${id} not found`);

    if (dto.isActive === false) {
      await this._refreshOnlineGauge(tenantId, rows[0].provider_name);
    }

    return rows[0];
  }

  /**
   * Record an explicit heartbeat for a device identified by serial + provider.
   * Used when a provider pushes a status ping rather than waiting for the next
   * full sync. Safe to call on unknown devices — a missing row is silently ignored.
   */
  async markOnline(
    tenantId: string,
    serialNumber: string,
    providerName: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE biometric_devices
       SET is_online = true, last_seen_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND serial_number = $2 AND provider_name = $3
         AND is_active = true`,
      [tenantId, serialNumber, providerName],
    );
    await this._refreshOnlineGauge(tenantId, providerName);
  }

  /**
   * Soft-delete a device — sets is_active=false and is_online=false.
   * The row is preserved for audit and historical attendance records.
   */
  async deactivate(tenantId: string, id: string): Promise<void> {
    const { rows } = await this.db.query(
      `UPDATE biometric_devices
       SET is_active = false, is_online = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING provider_name`,
      [id, tenantId],
    );
    if (!rows[0]) throw new NotFoundException(`Device ${id} not found`);
    await this._refreshOnlineGauge(tenantId, rows[0].provider_name as string);
  }

  // ── Stale-device detection ────────────────────────────────────────────────

  /**
   * Mark online devices offline if last_seen_at has exceeded STALE_THRESHOLD_MINUTES.
   * Runs every 5 minutes via @Cron; can also be called directly with a custom
   * staleMinutes value for tests or manual ops.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'device-stale-sweep' })
  async sweepStaleDevices(
    staleMinutes: number = STALE_THRESHOLD_MINUTES,
  ): Promise<{ markedOffline: number }> {
    const { rows } = await this.db.query(
      `UPDATE biometric_devices
       SET is_online = false, updated_at = NOW()
       WHERE is_online = true
         AND is_active = true
         AND (
           last_seen_at IS NULL
           OR last_seen_at < NOW() - ($1 * INTERVAL '1 minute')
         )
       RETURNING id, tenant_id, provider_name, name, branch_id`,
      [staleMinutes],
    );

    const markedOffline = rows.length;

    if (markedOffline > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'devices_marked_stale',
          markedOffline,
          staleMinutes,
        }),
      );

      // Refresh gauges for every (tenant, provider) pair that was affected
      const affected = new Set(
        (rows as Array<{ tenant_id: string; provider_name: string }>).map(
          (r) => `${r.tenant_id}::${r.provider_name}`,
        ),
      );
      await Promise.all(
        [...affected].map((key) => {
          const sep = key.indexOf('::');
          const tid  = key.slice(0, sep);
          const prov = key.slice(sep + 2);
          return this._refreshOnlineGauge(tid, prov);
        }),
      );
      this._refreshDeviceDetailGauges().catch(() => {});

      // Notify org/branch admins that devices went offline (best-effort; non-fatal).
      for (const device of rows as Array<{ id: string; tenant_id: string; provider_name: string; name: string | null; branch_id: string | null }>) {
        this.notificationEmitter.emit(device.tenant_id, {
          title: 'Biometric Device Offline',
          message: `${device.name || device.provider_name} has gone offline (no heartbeat for ${staleMinutes}+ minutes).`,
          type: 'critical',
          priority: 'high',
          sourceModule: 'system',
          actionUrl: '/dashboard/automation?tab=system-alerts',
          entityType: 'biometric_device',
          entityId: device.id,
          branchId: device.branch_id || undefined,
        }).catch((err) => this.logger.warn(`Failed to emit device-offline notification: ${err?.message}`));
      }
    }

    return { markedOffline };
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────

  async getStats(tenantId: string): Promise<DeviceStats> {
    const [summaryRes, byProviderRes, byTypeRes] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)                                         FILTER (WHERE is_active)              AS total,
           COUNT(*)                                         FILTER (WHERE is_active AND is_online) AS online,
           COUNT(*)                                         FILTER (WHERE is_active AND NOT is_online) AS offline
         FROM biometric_devices
         WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           provider_name                                    AS provider,
           COUNT(*) FILTER (WHERE is_active)               AS total,
           COUNT(*) FILTER (WHERE is_active AND is_online)  AS online
         FROM biometric_devices
         WHERE tenant_id = $1
         GROUP BY provider_name
         ORDER BY provider_name`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COALESCE(hardware_type, 'unknown')              AS hardware_type,
           COUNT(*) FILTER (WHERE is_active)               AS count
         FROM biometric_devices
         WHERE tenant_id = $1
         GROUP BY hardware_type
         ORDER BY count DESC`,
        [tenantId],
      ),
    ]);

    const s = summaryRes.rows[0] as Record<string, string>;
    return {
      total:   parseInt(s.total,   10),
      online:  parseInt(s.online,  10),
      offline: parseInt(s.offline, 10),
      byProvider: (byProviderRes.rows as any[]).map((r) => ({
        provider: r.provider as string,
        total:    parseInt(r.total,  10),
        online:   parseInt(r.online, 10),
      })),
      byHardwareType: (byTypeRes.rows as any[]).map((r) => ({
        hardwareType: r.hardware_type as string,
        count:        parseInt(r.count, 10),
      })),
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _refreshOnlineGauge(tenantId: string, providerName: string): Promise<void> {
    try {
      const { rows } = await this.db.query(
        `SELECT COUNT(*) AS online_count
         FROM biometric_devices
         WHERE tenant_id = $1 AND provider_name = $2
           AND is_online = true AND is_active = true`,
        [tenantId, providerName],
      );
      this.metrics.devicesOnline.set(
        { provider: providerName },
        parseInt((rows[0] as any)?.online_count ?? '0', 10),
      );
    } catch {
      // Gauge staleness is acceptable — never let a metric write break the data path
    }
  }

  /**
   * Global refresh of device detail gauges (hardware-type breakdown + last-seen age).
   * Queries across all tenants intentionally — operational dashboards need fleet-wide totals.
   * Never throws; called fire-and-forget from mutation paths.
   */
  private async _refreshDeviceDetailGauges(): Promise<void> {
    try {
      // Devices grouped by provider × hardware_type × online status
      const { rows: typeRows } = await this.db.query(
        `SELECT
           provider_name,
           COALESCE(hardware_type, 'unknown') AS hardware_type,
           is_online,
           COUNT(*) AS count
         FROM biometric_devices
         WHERE is_active = true
         GROUP BY provider_name, hardware_type, is_online`,
      );

      this.metrics.devicesByHardwareType.reset();
      for (const row of typeRows as any[]) {
        this.metrics.devicesByHardwareType.set(
          {
            provider:      row.provider_name as string,
            hardware_type: row.hardware_type as string,
            status:        row.is_online ? 'online' : 'offline',
          },
          parseInt(row.count, 10),
        );
      }

      // Age of the oldest last_seen_at among currently-online devices per provider
      const { rows: ageRows } = await this.db.query(
        `SELECT
           provider_name,
           EXTRACT(EPOCH FROM (NOW() - MIN(last_seen_at))) AS max_age_seconds
         FROM biometric_devices
         WHERE is_active = true AND is_online = true AND last_seen_at IS NOT NULL
         GROUP BY provider_name`,
      );

      this.metrics.deviceLastSeenAgeSeconds.reset();
      for (const row of ageRows as any[]) {
        this.metrics.deviceLastSeenAgeSeconds.set(
          { provider: row.provider_name as string },
          parseFloat(row.max_age_seconds ?? '0'),
        );
      }
    } catch {
      // Gauge staleness is acceptable
    }
  }
}
