/**
 * easytimepro-sync.adapter.ts
 *
 * Data-access adapter for EasyTimePro — decoupled from EasyTimeProProvider
 * so the sync pipeline has independent circuit breakers, field mapping, and
 * error budgets from the push/poll path.
 *
 * Responsibilities:
 *   fetchAttendanceLogs — incremental pull of punch records (MSSQL or API)
 *   fetchDevices        — full inventory pull of registered biometric devices
 *
 * Circuit-breaker pairs (MSSQL + API) are initialised per data type so that
 * a flapping device endpoint cannot affect attendance log delivery.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as OpossumModule from 'opossum';
const CircuitBreaker = (OpossumModule as any).default ?? OpossumModule;

import { DatabaseService } from '../../../shared/database.service';
import { Client } from 'pg';
import { CredentialEncryptionService } from '../../../shared/crypto/credential-encryption.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import { VerifyMethodNormalizerService } from '../normalization/verify-method-normalizer.service';
import { EasyTimeProConfig } from '../providers/easytimepro/easytimepro.config.dto';
import {
  PunchEventDto,
  PunchDirection,
  VerifyMethod,
  AttendanceSource,
} from '../dto/punch-event.dto';
import { DeviceSyncRecord, SyncFetchResult, EmployeeSyncRecord } from './biometric-sync.types';

export const EASYTIMEPRO_PROVIDER_NAME = 'easytimepro';

const BREAKER_OPTS = {
  timeout: 30_000,
  errorThresholdPercentage: 50,
  resetTimeout: 60_000,
  volumeThreshold: 3,
};

@Injectable()
export class EasyTimeProSyncAdapter implements OnModuleInit {
  private readonly logger = new Logger(EasyTimeProSyncAdapter.name);

  private _attLogsMssql!: InstanceType<typeof CircuitBreaker>;
  private _attLogsApi!: InstanceType<typeof CircuitBreaker>;
  private _attLogsPostgres!: InstanceType<typeof CircuitBreaker>;
  private _devicesMssql!: InstanceType<typeof CircuitBreaker>;
  private _devicesApi!: InstanceType<typeof CircuitBreaker>;
  private _devicesPostgres!: InstanceType<typeof CircuitBreaker>;
  private _employeesPostgres!: InstanceType<typeof CircuitBreaker>;

  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CredentialEncryptionService,
    private readonly metrics: BiometricsMetricsService,
    private readonly verifyNormalizer: VerifyMethodNormalizerService,
  ) {}

  onModuleInit(): void {
    this._initBreakers();
  }

  // ── Config ────────────────────────────────────────────────────────────────

  async loadConfig(integrationId: string): Promise<EasyTimeProConfig | null> {
    const { rows } = await this.db.query(
      `SELECT config
       FROM integrations
       WHERE id = $1 AND type = 'easytimepro' AND is_active = true`,
      [integrationId],
    );
    if (!rows[0]?.config) return null;
    return this.crypto.decryptConfig(rows[0].config as EasyTimeProConfig);
  }

  // ── Attendance Logs ───────────────────────────────────────────────────────

  async fetchAttendanceLogs(
    config: EasyTimeProConfig,
    since: Date,
    tenantId: string,
  ): Promise<SyncFetchResult<PunchEventDto>> {
    let events: PunchEventDto[] = [];
    if (config.syncMode === 'mssql') {
      events = await this._attLogsMssql.fire(config, since, tenantId);
    } else if (config.syncMode === 'postgres') {
      events = await this._attLogsPostgres.fire(config, since, tenantId);
    } else {
      events = await this._attLogsApi.fire(config, since, tenantId);
    }

    let latestCursor: string | null = null;
    for (const e of events) {
      const iso = e.timestamp.toISOString();
      if (!latestCursor || iso > latestCursor) latestCursor = iso;
    }

    return { records: events, latestCursor, fetchedCount: events.length };
  }

  // ── Devices ───────────────────────────────────────────────────────────────

  async fetchDevices(
    config: EasyTimeProConfig,
    since: Date,
    tenantId: string,
  ): Promise<SyncFetchResult<DeviceSyncRecord>> {
    let devices: DeviceSyncRecord[] = [];
    if (config.syncMode === 'mssql') {
      devices = await this._devicesMssql.fire(config, since, tenantId);
    } else if (config.syncMode === 'postgres') {
      devices = await this._devicesPostgres.fire(config, since, tenantId);
    } else {
      devices = await this._devicesApi.fire(config, since, tenantId);
    }

    // Device inventory is small and changes rarely; cursor = run timestamp
    const latestCursor = devices.length > 0 ? new Date().toISOString() : null;

    return { records: devices, latestCursor, fetchedCount: devices.length };
  }

  // ── Employees ─────────────────────────────────────────────────────────────

  async fetchEmployees(
    config: EasyTimeProConfig,
    since: Date,
    tenantId: string,
  ): Promise<SyncFetchResult<EmployeeSyncRecord>> {
    let employees: EmployeeSyncRecord[] = [];
    if (config.syncMode === 'postgres') {
      employees = await this._employeesPostgres.fire(config, since, tenantId);
    }
    const latestCursor = employees.length > 0 ? new Date().toISOString() : null;
    return { records: employees, latestCursor, fetchedCount: employees.length };
  }

  // ── MSSQL: Attendance Logs ────────────────────────────────────────────────

  private async _mssqlFetchAttLogs(
    config: EasyTimeProConfig,
    since: Date,
    _tenantId: string,
  ): Promise<PunchEventDto[]> {
    const mssql = this._requireMssql();
    const pool = await mssql.connect(this._poolCfg(config));

    try {
      const {
        employeeCodeField,
        timestampField,
        punchTypeField,
        verifyMethodField,
        deviceSerialField,
        attendanceLogTable = 'AttLogs',
        syncBatchSize = 500,
      } = config;

      const extraCols = [punchTypeField, verifyMethodField, deviceSerialField]
        .filter(Boolean)
        .map((c) => `[${c}]`)
        .join(', ');

      const selectCols = extraCols
        ? `[${employeeCodeField}], [${timestampField}], ${extraCols}`
        : `[${employeeCodeField}], [${timestampField}]`;

      const req = pool.request();
      req.input('since', mssql.DateTime, since);

      const result = await req.query(
        `SELECT TOP ${syncBatchSize} ${selectCols}
         FROM [${attendanceLogTable}]
         WHERE [${timestampField}] > @since
         ORDER BY [${timestampField}] ASC`,
      );

      return (result.recordset as any[])
        .map((row) => this._mapAttLog(row, config))
        .filter((e): e is PunchEventDto => e !== null);
    } finally {
      await pool.close();
    }
  }

  // ── API: Attendance Logs ──────────────────────────────────────────────────

  private async _apiFetchAttLogs(
    config: EasyTimeProConfig,
    since: Date,
    _tenantId: string,
  ): Promise<PunchEventDto[]> {
    const base = config.apiBaseUrl!.replace(/\/$/, '');
    const limit = config.syncBatchSize ?? 500;
    const url = `${base}/attendance/punches?since=${encodeURIComponent(since.toISOString())}&limit=${limit}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey ?? ''}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`[easytimepro] attendance API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const records: any[] = Array.isArray(data) ? data : (data.data ?? data.records ?? []);

    return records
      .map((row) => this._mapAttLog(row, config))
      .filter((e): e is PunchEventDto => e !== null);
  }

  // ── MSSQL: Devices ────────────────────────────────────────────────────────

  private async _mssqlFetchDevices(
    config: EasyTimeProConfig,
    _since: Date,
    _tenantId: string,
  ): Promise<DeviceSyncRecord[]> {
    const mssql = this._requireMssql();
    const pool = await mssql.connect(this._poolCfg(config));

    try {
      const deviceTable = config.deviceTable ?? 'Machines';

      // Column aliases normalise across EasyTimePro schema versions.
      // ISNULL guards against tables that omit optional columns.
      const result = await pool.request().query(`
        SELECT
          CAST([MachineNumber] AS VARCHAR(50)) AS provider_id,
          ISNULL([SN], CAST([MachineNumber] AS VARCHAR(50))) AS serial_number,
          ISNULL([MachineName], ISNULL([Alias], '')) AS device_name,
          [IPAddress]                                AS ip_address,
          [Platform]                                 AS platform,
          ISNULL([FirmwareVersion], [ProxyVersion])  AS firmware_version,
          ISNULL([FPCount],   0)                     AS fp_count,
          ISNULL([FaceCount], 0)                     AS face_count,
          ISNULL([CardCount], 0)                     AS card_count,
          ISNULL([IsOnline],  0)                     AS is_online,
          [LastActivity]                             AS last_seen_at
        FROM [${deviceTable}]
      `);

      return (result.recordset as any[]).map((row) => this._mapDevice(row));
    } finally {
      await pool.close();
    }
  }

  // ── API: Devices ──────────────────────────────────────────────────────────

  private async _apiFetchDevices(
    config: EasyTimeProConfig,
    _since: Date,
    _tenantId: string,
  ): Promise<DeviceSyncRecord[]> {
    const base = config.apiBaseUrl!.replace(/\/$/, '');
    const res = await fetch(`${base}/devices`, {
      headers: { Authorization: `Bearer ${config.apiKey ?? ''}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`[easytimepro] devices API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const records: any[] = Array.isArray(data) ? data : (data.data ?? data.devices ?? []);
    return records.map((row) => this._mapDevice(row));
  }

  // ── Row Mappers ───────────────────────────────────────────────────────────

  private _mapAttLog(
    row: Record<string, unknown>,
    config: EasyTimeProConfig,
  ): PunchEventDto | null {
    const employeeCode = String(row[config.employeeCodeField] ?? '').trim();
    const rawTs = row[config.timestampField];
    if (!employeeCode || !rawTs) return null;

    const timestamp = rawTs instanceof Date ? rawTs : new Date(String(rawTs));
    if (isNaN(timestamp.getTime())) return null;

    let punchType = PunchDirection.UNKNOWN;
    if (config.punchTypeField) {
      const v = String(row[config.punchTypeField] ?? '').toUpperCase();
      if (v === '0' || v === 'IN' || v === 'CHECK IN')     punchType = PunchDirection.IN;
      else if (v === '1' || v === 'OUT' || v === 'CHECK OUT') punchType = PunchDirection.OUT;
    }

    const verifyMethod = config.verifyMethodField
      ? this.verifyNormalizer.normalize(
          row[config.verifyMethodField] as string | number | null,
          EASYTIMEPRO_PROVIDER_NAME,
        )
      : VerifyMethod.OTHER;

    const deviceId = config.deviceSerialField
      ? (String(row[config.deviceSerialField] ?? '').trim() || undefined)
      : undefined;

    return {
      employeeCode,
      timestamp,
      punchType,
      verifyMethod,
      providerName: EASYTIMEPRO_PROVIDER_NAME,
      deviceId,
      attendanceSource: AttendanceSource.BIOMETRIC_DEVICE,
      rawPayload: row as Record<string, unknown>,
    };
  }

  private _mapDevice(row: Record<string, unknown>): DeviceSyncRecord {
    const fpCount   = Number(row['fp_count']   ?? row['FPCount']   ?? 0);
    const faceCount = Number(row['face_count'] ?? row['FaceCount'] ?? 0);
    const cardCount = Number(row['card_count'] ?? row['CardCount'] ?? 0);

    const caps: string[] = [];
    if (fpCount > 0)   caps.push('fingerprint');
    if (faceCount > 0) caps.push('face');
    if (cardCount > 0) caps.push('card');

    let hardwareType: DeviceSyncRecord['hardwareType'] = 'unknown';
    if (caps.length > 1)                hardwareType = 'hybrid';
    else if (caps[0] === 'fingerprint') hardwareType = 'fingerprint';
    else if (caps[0] === 'face')        hardwareType = 'face';
    else if (caps[0] === 'card')        hardwareType = 'card';

    const rawLastSeen = row['last_seen_at'] ?? row['LastActivity'];
    const lastSeenAt = rawLastSeen ? new Date(String(rawLastSeen)) : undefined;

    return {
      providerDeviceId: String(row['provider_id'] ?? row['MachineNumber'] ?? ''),
      serialNumber:     String(row['serial_number'] ?? row['SN'] ?? row['provider_id'] ?? ''),
      name:             String(row['device_name'] ?? row['MachineName'] ?? ''),
      ipAddress:        row['ip_address'] ? String(row['ip_address']) : undefined,
      platform:         row['platform']   ? String(row['platform'])   : undefined,
      firmwareVersion:  row['firmware_version'] ? String(row['firmware_version']) : undefined,
      hardwareType,
      capabilities: caps.length > 0 ? caps : ['fingerprint'],
      isOnline: Boolean(row['is_online'] ?? row['IsOnline'] ?? false),
      lastSeenAt: lastSeenAt && !isNaN(lastSeenAt.getTime()) ? lastSeenAt : undefined,
      metadata: {
        fp_capacity:   fpCount,
        face_capacity: faceCount,
        card_capacity: cardCount,
      },
    };
  }

  // ── Circuit Breakers ──────────────────────────────────────────────────────

  private _initBreakers(): void {
    this._attLogsMssql = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._mssqlFetchAttLogs(c, s, t),
      BREAKER_OPTS,
    );
    this._attLogsApi = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._apiFetchAttLogs(c, s, t),
      BREAKER_OPTS,
    );
    this._attLogsPostgres = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._postgresFetchAttLogs(c, s, t),
      BREAKER_OPTS,
    );
    this._devicesMssql = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._mssqlFetchDevices(c, s, t),
      BREAKER_OPTS,
    );
    this._devicesApi = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._apiFetchDevices(c, s, t),
      BREAKER_OPTS,
    );
    this._devicesPostgres = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._postgresFetchDevices(c, s, t),
      BREAKER_OPTS,
    );
    this._employeesPostgres = new CircuitBreaker(
      (c: EasyTimeProConfig, s: Date, t: string) => this._postgresFetchEmployees(c, s, t),
      BREAKER_OPTS,
    );

    const pairs: Array<[InstanceType<typeof CircuitBreaker>, string]> = [
      [this._attLogsMssql, 'att_logs_mssql'],
      [this._attLogsApi,   'att_logs_api'],
      [this._attLogsPostgres, 'att_logs_postgres'],
      [this._devicesMssql, 'devices_mssql'],
      [this._devicesApi,   'devices_api'],
      [this._devicesPostgres, 'devices_postgres'],
      [this._employeesPostgres, 'employees_postgres'],
    ];
    for (const [breaker, label] of pairs) {
      this._wireBreaker(breaker, label);
    }
  }

  private _wireBreaker(breaker: InstanceType<typeof CircuitBreaker>, label: string): void {
    breaker.on('open', () => {
      this.metrics.circuitBreakerOpenTotal.inc({
        provider: EASYTIMEPRO_PROVIDER_NAME,
        transport: label,
      });
      this.logger.warn(
        JSON.stringify({ event: 'circuit_open', provider: EASYTIMEPRO_PROVIDER_NAME, label }),
      );
    });
    breaker.on('halfOpen', () =>
      this.logger.log(
        JSON.stringify({ event: 'circuit_half_open', provider: EASYTIMEPRO_PROVIDER_NAME, label }),
      ),
    );
    breaker.on('close', () =>
      this.logger.log(
        JSON.stringify({ event: 'circuit_closed', provider: EASYTIMEPRO_PROVIDER_NAME, label }),
      ),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _requireMssql(): any {
    try {
      return new Function('require', "return require('mssql')")(require);
    } catch {
      throw new Error('[easytimepro] mssql package not installed. Run: npm install mssql');
    }
  }

  private _poolCfg(config: EasyTimeProConfig): object {
    return {
      server:  config.mssqlHost!,
      port:    config.mssqlPort ?? 1433,
      database: config.mssqlDatabase!,
      user:    config.mssqlUsername!,
      password: config.mssqlPassword!,
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 15_000,
      requestTimeout:    30_000,
    };
  }

  // ── PostgreSQL Query Operations ───────────────────────────────────────────

  private async _postgresFetchAttLogs(
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
        attendanceLogTable = 'iclock_transaction',
        syncBatchSize = 500,
      } = config;

      const extraCols = [punchTypeField, verifyMethodField, deviceSerialField]
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
        .map((row) => this._mapAttLog(row, config))
        .filter((e): e is PunchEventDto => e !== null);
    } finally {
      await client.end();
    }
  }

  private async _postgresFetchDevices(
    config: EasyTimeProConfig,
    _since: Date,
    _tenantId: string,
  ): Promise<DeviceSyncRecord[]> {
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
      const deviceTable = config.deviceTable ?? 'iclock_terminal';

      const result = await client.query(`
        SELECT
          CAST(id AS VARCHAR(50)) AS provider_id,
          COALESCE(sn, CAST(id AS VARCHAR(50))) AS serial_number,
          COALESCE(alias, '') AS device_name,
          ip_address,
          platform,
          product_type AS firmware_version,
          COALESCE(fp_count, 0) AS fp_count,
          COALESCE(face_count, 0) AS face_count,
          COALESCE(user_count, 0) AS card_count,
          CASE WHEN last_activity >= NOW() - INTERVAL '15 minutes' THEN true ELSE false END AS is_online,
          last_activity AS last_seen_at
        FROM "${deviceTable}"
      `);

      return (result.rows as any[]).map((row) => this._mapDevice(row));
    } finally {
      await client.end();
    }
  }

  private async _postgresFetchEmployees(
    config: EasyTimeProConfig,
    _since: Date,
    _tenantId: string,
  ): Promise<EmployeeSyncRecord[]> {
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
      const employeeTable = config.employeeTable ?? 'personnel_employee';

      const result = await client.query(`
        SELECT 
          emp_code AS employee_code,
          first_name,
          last_name,
          email,
          mobile,
          gender,
          hire_date AS date_of_joining
        FROM "${employeeTable}"
        WHERE emp_code IS NOT NULL AND first_name IS NOT NULL
      `);

      return (result.rows as any[]).map((row) => ({
        employeeCode: String(row.employee_code ?? '').trim(),
        firstName: String(row.first_name ?? '').trim(),
        lastName: String(row.last_name ?? '').trim(),
        email: row.email ? String(row.email).trim() : undefined,
        mobile: row.mobile ? String(row.mobile).trim() : undefined,
        gender: row.gender ? this._normalizeGender(row.gender) : undefined,
        dateOfJoining: row.date_of_joining ? new Date(row.date_of_joining) : undefined,
      }));
    } finally {
      await client.end();
    }
  }

  private _normalizeGender(raw?: string): string {
    if (!raw) return 'M';
    const u = raw.toUpperCase();
    if (u === 'FEMALE' || u === 'F') return 'F';
    return 'M';
  }

  async upsertEmployees(
    tenantId: string,
    records: EmployeeSyncRecord[],
  ): Promise<{ upserted: number; failed: number }> {
    if (records.length === 0) return { upserted: 0, failed: 0 };

    let upserted = 0;
    let failed = 0;

    for (const emp of records) {
      try {
        await this.db.query(
          `INSERT INTO employees (
             tenant_id, employee_code, status, first_name, last_name, 
             personal_email, personal_phone, date_of_joining, gender, created_at, updated_at
           ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, now(), now())
           ON CONFLICT (tenant_id, employee_code) DO UPDATE SET
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             personal_email = COALESCE(EXCLUDED.personal_email, employees.personal_email),
             personal_phone = COALESCE(EXCLUDED.personal_phone, employees.personal_phone),
             date_of_joining = COALESCE(EXCLUDED.date_of_joining, employees.date_of_joining),
             gender = COALESCE(EXCLUDED.gender, employees.gender),
             updated_at = now()`,
          [
            tenantId,
            emp.employeeCode,
            emp.firstName,
            emp.lastName || '',
            emp.email ?? null,
            emp.mobile ?? null,
            emp.dateOfJoining ?? new Date(),
            emp.gender ?? 'M',
          ]
        );
        upserted++;
      } catch (err: any) {
        this.logger.error(`Failed to upsert employee ${emp.employeeCode}: ${err.message}`);
        failed++;
      }
    }

    return { upserted, failed };
  }
}
