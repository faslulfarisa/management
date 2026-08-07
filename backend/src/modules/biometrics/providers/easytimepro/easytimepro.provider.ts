/**
 * easytimepro.provider.ts
 *
 * IPollingProvider implementation for EasyTimePro.
 * Supports two data extraction modes:
 *   1. 'mssql' — Queries EasyTimePro's SQL Server database directly.
 *   2. 'api'   — Polls EasyTimePro's REST API with date-range parameters.
 *
 * Both transports are protected by opossum circuit breakers that open after
 * 50% failure rate (min 5 calls) and attempt recovery after 30 seconds.
 * Circuit state changes are emitted as structured logs and Prometheus metrics.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as OpossumModule from 'opossum';
const CircuitBreaker = (OpossumModule as any).default ?? OpossumModule;
import {
  IPollingProvider,
  ProviderHealthResult,
} from '../base-provider.interface';
import { PunchEventDto, PunchDirection, VerifyMethod, AttendanceSource } from '../../dto/punch-event.dto';
import { ProviderRegistryService } from '../provider-registry.service';
import { DatabaseService } from '../../../../shared/database.service';
import { CredentialEncryptionService } from '../../../../shared/crypto/credential-encryption.service';
import { BiometricsMetricsService } from '../../../../shared/metrics/biometrics-metrics.service';
import { VerifyMethodNormalizerService } from '../../normalization/verify-method-normalizer.service';
import { EasyTimeProConfig } from './easytimepro.config.dto';
import { Client } from 'pg';

export const EASYTIMEPRO_PROVIDER_NAME = 'easytimepro';

const BREAKER_OPTIONS = {
  timeout: 10_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 5,
};

@Injectable()
export class EasyTimeProProvider implements IPollingProvider, OnModuleInit {
  readonly providerName = EASYTIMEPRO_PROVIDER_NAME;

  private readonly logger = new Logger(EasyTimeProProvider.name);

  private _apiBreaker!: InstanceType<typeof CircuitBreaker>;
  private _mssqlBreaker!: InstanceType<typeof CircuitBreaker>;
  private _postgresBreaker!: InstanceType<typeof CircuitBreaker>;

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ProviderRegistryService,
    private readonly crypto: CredentialEncryptionService,
    private readonly metrics: BiometricsMetricsService,
    private readonly verifyNormalizer: VerifyMethodNormalizerService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
    this._initBreakers();
  }

  // ── IPollingProvider ────────────────────────────────────────────────────────

  async poll(tenantId: string, integrationId: string): Promise<PunchEventDto[]> {
    const config = await this._loadConfig(integrationId);
    if (!config) {
      this.logger.warn(`[easytimepro] No config found for integration ${integrationId}`);
      return [];
    }

    const since = config.lastSyncCursor
      ? new Date(config.lastSyncCursor)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    this.logger.log(
      JSON.stringify({
        level: 'info',
        event: 'poll_started',
        provider: 'easytimepro',
        tenantId,
        integrationId,
        since: since.toISOString(),
        transport: config.syncMode ?? 'api',
      }),
    );

    let events: PunchEventDto[] = [];
    let latestTimestamp = since;

    if (config.syncMode === 'mssql') {
      events = await this._mssqlBreaker.fire(config, since, tenantId);
    } else if (config.syncMode === 'postgres') {
      events = await this._postgresBreaker.fire(config, since, tenantId);
    } else {
      events = await this._apiBreaker.fire(config, since, tenantId);
    }

    for (const e of events) {
      if (e.timestamp > latestTimestamp) latestTimestamp = e.timestamp;
    }

    if (events.length > 0) {
      await this._updateCursor(integrationId, latestTimestamp);
    }

    this.logger.log(
      JSON.stringify({
        level: 'info',
        event: 'poll_completed',
        provider: 'easytimepro',
        tenantId,
        count: events.length,
      }),
    );

    return events;
  }

  async processIncoming(tenantId: string, raw: unknown): Promise<PunchEventDto[]> {
    if (!Array.isArray(raw)) {
      this.logger.warn(`[easytimepro] Expected array payload for tenant ${tenantId}`);
      return [];
    }

    return (raw as any[])
      .map((record) =>
        this._mapRecord(record, {
          employeeField: 'EmployeeID',
          timestampField: 'PunchTime',
        }),
      )
      .filter((e): e is PunchEventDto => e !== null);
  }

  // ── Health Check ────────────────────────────────────────────────────────────

  async healthCheck(tenantId: string): Promise<ProviderHealthResult> {
    const start = Date.now();

    const { rows } = await this.db.query(
      `SELECT COUNT(*) as cnt FROM integrations
       WHERE tenant_id = $1 AND type = 'easytimepro' AND is_active = true`,
      [tenantId],
    );

    const activeCount = parseInt(rows[0]?.cnt ?? '0', 10);
    const circuitOpen = this._apiBreaker?.opened || this._mssqlBreaker?.opened;

    if (activeCount === 0) {
      return {
        healthy: false,
        providerName: this.providerName,
        latencyMs: Date.now() - start,
        details: { activeIntegrations: 0, circuitOpen },
        error: 'No active EasyTimePro integrations configured for this tenant',
      };
    }

    return {
      healthy: !circuitOpen,
      providerName: this.providerName,
      latencyMs: Date.now() - start,
      details: {
        activeIntegrations: activeCount,
        circuitOpen,
        apiCircuitState: this._apiBreaker?.opened
          ? 'open'
          : this._apiBreaker?.halfOpen
            ? 'half-open'
            : 'closed',
      },
    };
  }

  // ── Circuit Breaker Init ────────────────────────────────────────────────────

  private _initBreakers(): void {
    this._apiBreaker = new CircuitBreaker(
      (cfg: EasyTimeProConfig, since: Date, tenantId: string) =>
        this._fetchFromApi(cfg, since, tenantId),
      BREAKER_OPTIONS,
    );

    this._mssqlBreaker = new CircuitBreaker(
      (cfg: EasyTimeProConfig, since: Date, tenantId: string) =>
        this._fetchFromMssql(cfg, since, tenantId),
      BREAKER_OPTIONS,
    );

    this._postgresBreaker = new CircuitBreaker(
      (cfg: EasyTimeProConfig, since: Date, tenantId: string) =>
        this._fetchFromPostgres(cfg, since, tenantId),
      BREAKER_OPTIONS,
    );

    this._wireEvents(this._apiBreaker, 'api');
    this._wireEvents(this._mssqlBreaker, 'mssql');
    this._wireEvents(this._postgresBreaker, 'postgres');
  }

  private _wireEvents(breaker: InstanceType<typeof CircuitBreaker>, transport: string): void {
    breaker.on('open', () => {
      this.metrics.circuitBreakerOpenTotal.inc({ provider: 'easytimepro', transport });
      this.logger.warn(
        JSON.stringify({
          level: 'warn',
          event: 'circuit_open',
          provider: 'easytimepro',
          transport,
        }),
      );
    });

    breaker.on('halfOpen', () => {
      this.logger.log(
        JSON.stringify({
          level: 'info',
          event: 'circuit_half_open',
          provider: 'easytimepro',
          transport,
        }),
      );
    });

    breaker.on('close', () => {
      this.logger.log(
        JSON.stringify({
          level: 'info',
          event: 'circuit_closed',
          provider: 'easytimepro',
          transport,
        }),
      );
    });
  }

  // ── REST API Polling ────────────────────────────────────────────────────────

  private async _fetchFromApi(
    config: EasyTimeProConfig,
    since: Date,
    _tenantId: string,
  ): Promise<PunchEventDto[]> {
    const baseUrl = config.apiBaseUrl!.replace(/\/$/, '');
    const limit = config.syncBatchSize ?? 500;
    const url = `${baseUrl}/attendance/punches?since=${encodeURIComponent(since.toISOString())}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey ?? ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `[easytimepro] API responded with ${response.status}: ${await response.text()}`,
      );
    }

    const data = (await response.json()) as any;
    const records: any[] = Array.isArray(data) ? data : (data.data ?? data.records ?? []);

    return records
      .map((row) =>
        this._mapRecord(row, {
          employeeField:   config.employeeCodeField,
          timestampField:  config.timestampField,
          punchTypeField:  config.punchTypeField,
	          verifyField:     config.verifyMethodField,
	          deviceField:     config.deviceSerialField,
	          workCodeField:   config.workCodeField,
        }),
      )
      .filter((e): e is PunchEventDto => e !== null);
  }

  // ── SQL Server Polling ──────────────────────────────────────────────────────

  private async _fetchFromMssql(
    config: EasyTimeProConfig,
    since: Date,
    _tenantId: string,
  ): Promise<PunchEventDto[]> {
    let mssql: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      mssql = new Function('require', "return require('mssql')")(require);
    } catch {
      throw new Error('[easytimepro] mssql package not installed. Run: npm install mssql');
    }

    const pool = await mssql.connect({
      server: config.mssqlHost!,
      port: config.mssqlPort ?? 1433,
      database: config.mssqlDatabase!,
      user: config.mssqlUsername!,
      password: config.mssqlPassword!,
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 15_000,
      requestTimeout: 30_000,
    });

    try {
      const {
        employeeCodeField,
        timestampField,
        punchTypeField,
        verifyMethodField,
        deviceSerialField,
        workCodeField,
        attendanceLogTable = 'AttLogs',
        syncBatchSize = 500,
      } = config;

      const extraFields = [punchTypeField, verifyMethodField, deviceSerialField, workCodeField]
        .filter(Boolean)
        .join(', ');
      const selectFields = extraFields
        ? `${employeeCodeField}, ${timestampField}, ${extraFields}`
        : `${employeeCodeField}, ${timestampField}`;

      const request = pool.request();
      request.input('since', mssql.DateTime, since);
      const result = await request.query(
        `SELECT TOP ${syncBatchSize} ${selectFields}
         FROM ${attendanceLogTable}
         WHERE ${timestampField} > @since
         ORDER BY ${timestampField} ASC`,
      );

      return (result.recordset as any[])
        .map((row) =>
          this._mapRecord(row, {
            employeeField:  employeeCodeField,
            timestampField,
            punchTypeField,
	            verifyField:    verifyMethodField,
	            deviceField:    deviceSerialField,
	            workCodeField,
          }),
        )
        .filter((e): e is PunchEventDto => e !== null);
    } finally {
      await pool.close();
    }
  }

  // ── PostgreSQL Polling ──────────────────────────────────────────────────────

  private async _fetchFromPostgres(
    config: EasyTimeProConfig,
    since: Date,
    _tenantId: string,
  ): Promise<PunchEventDto[]> {
    const client = new Client({
      host: config.postgresHost!,
      port: config.postgresPort ?? 5432,
      database: config.postgresDatabase!,
      user: config.postgresUsername!,
      password: config.postgresPassword!,
      connectionTimeoutMillis: 15_000,
    });

    await client.connect();

    try {
      const {
        employeeCodeField,
        timestampField,
        punchTypeField,
        verifyMethodField,
        deviceSerialField,
        workCodeField,
        attendanceLogTable = 'iclock_transaction',
        syncBatchSize = 500,
      } = config;

      const extraCols = [punchTypeField, verifyMethodField, deviceSerialField, workCodeField]
        .filter(Boolean)
        .map((c) => `"${c}"`)
        .join(', ');

      const selectCols = extraCols
        ? `"${employeeCodeField}", "${timestampField}", ${extraCols}`
        : `"${employeeCodeField}", "${timestampField}"`;

      const result = await client.query(
        `SELECT ${selectCols}
         FROM "${attendanceLogTable}"
         WHERE "${timestampField}" > $1
         ORDER BY "${timestampField}" ASC
         LIMIT $2`,
        [since, syncBatchSize],
      );

      return (result.rows as any[])
        .map((row) =>
          this._mapRecord(row, {
            employeeField:  employeeCodeField,
            timestampField,
            punchTypeField,
	            verifyField:    verifyMethodField,
	            deviceField:    deviceSerialField,
	            workCodeField,
          }),
        )
        .filter((e): e is PunchEventDto => e !== null);
    } finally {
      await client.end();
    }
  }

  // ── Record Mapping ──────────────────────────────────────────────────────────

  private _mapRecord(
    row: Record<string, unknown>,
    opts: {
      employeeField:  string;
      timestampField: string;
	      punchTypeField?: string | null;
	      verifyField?:    string | null;
	      deviceField?:    string | null;
	      workCodeField?:  string | null;
    },
  ): PunchEventDto | null {
    const employeeCode = String(row[opts.employeeField] ?? '').trim();
    const rawTs = row[opts.timestampField];

    if (!employeeCode || !rawTs) return null;

    const timestamp = rawTs instanceof Date ? rawTs : new Date(String(rawTs));
    if (isNaN(timestamp.getTime())) return null;

    let punchType = PunchDirection.UNKNOWN;
    if (opts.punchTypeField && row[opts.punchTypeField] !== undefined) {
      const val = String(row[opts.punchTypeField]).toUpperCase();
      if (val === '0' || val === 'IN' || val === 'CHECK IN')   punchType = PunchDirection.IN;
      else if (val === '1' || val === 'OUT' || val === 'CHECK OUT') punchType = PunchDirection.OUT;
    }

    const verifyMethod = opts.verifyField
      ? this.verifyNormalizer.normalize(row[opts.verifyField] as string | number | null, this.providerName)
      : VerifyMethod.OTHER;

    const deviceId = opts.deviceField
      ? String(row[opts.deviceField] ?? '').trim() || undefined
      : undefined;

    return {
      employeeCode,
      timestamp,
      punchType,
      verifyMethod,
	      providerName: this.providerName,
	      deviceId,
	      attendanceSource: AttendanceSource.BIOMETRIC_DEVICE,
	      punchState: opts.punchTypeField ? String(row[opts.punchTypeField] ?? '') : undefined,
	      rawVerifyType: opts.verifyField ? String(row[opts.verifyField] ?? '') : undefined,
	      workCode: opts.workCodeField ? String(row[opts.workCodeField] ?? '') : undefined,
	      rawPayload: row as Record<string, unknown>,
	    };
  }

  // ── Config & Cursor Helpers ─────────────────────────────────────────────────

  private async _loadConfig(integrationId: string): Promise<EasyTimeProConfig | null> {
    const { rows } = await this.db.query(
      'SELECT config FROM integrations WHERE id = $1 AND type = $2 AND is_active = true',
      [integrationId, 'easytimepro'],
    );
    if (!rows[0]?.config) return null;
    return this.crypto.decryptConfig(rows[0].config as EasyTimeProConfig);
  }

  private async _updateCursor(integrationId: string, latestTs: Date): Promise<void> {
    await this.db.query(
      `UPDATE integrations
       SET config = jsonb_set(config, '{lastSyncCursor}', $1::text::jsonb),
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(latestTs.toISOString()), integrationId],
    );
  }
}
