import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual, randomUUID } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { PunchIngestionService } from '../services/punch-ingestion.service';
import { PunchDirection, PunchEventDto, VerifyMethod, AttendanceSource } from '../dto/punch-event.dto';

const PROVIDER_NAME = 'zkteco';
const SERVER_VERSION = '3.1.1';
const SERVER_NAME = 'Ai-HRMS-ADMS';
const SERIAL_PATTERN = /^[A-Za-z0-9._:-]{3,64}$/;
const DEFAULT_HEARTBEAT_OFFLINE_SECONDS = 180;

interface ResolvedAdmsDevice {
  tenantId: string;
  integrationId: string;
  integration: any;
  device: any;
  clientIp?: string;
}

interface AdmsRequestContext {
  sn: string;
  query: Record<string, any>;
  sourceIp?: string;
  remoteIp?: string;
  forwardedFor?: string[];
  userAgent?: string;
}

@Injectable()
export class AdmsService {
  private readonly logger = new Logger(AdmsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly punchIngestion: PunchIngestionService,
  ) {}

  async handleRegistration(ctx: AdmsRequestContext): Promise<string> {
    const resolved = await this.resolveDevice(ctx);
    const now = new Date();
    const stamp = this.resolveStamp(resolved.device?.last_adms_stamp);
    const opStamp = this.resolveStamp(resolved.device?.last_adms_op_stamp);

    return [
      `RegistryCode=${resolved.integrationId}`,
      `ServerVersion=${SERVER_VERSION}`,
      `ServerName=${SERVER_NAME}`,
      `DateTime=${this.formatDeviceTime(now)}`,
      `Stamp=${stamp}`,
      `OpStamp=${opStamp}`,
      'ErrorDelay=60',
      'Delay=30',
      'TransInterval=1',
      'TransTimes=00:00;14:05',
      'TransFlag=1111111111',
      'Realtime=1',
      'Encrypt=0',
      'TimeZone=330',
      'TimeoutSec=10',
      'OK',
    ].join('\n') + '\n';
  }

  async handleGetRequest(ctx: AdmsRequestContext): Promise<string> {
    const resolved = await this.resolveDevice(ctx);
    const commands = await this.pollCommands(resolved, 20);

    if (commands.length === 0) return 'OK\n';

    return commands
      .map((cmd) => `C:${cmd.command_key}:${this.renderCommand(cmd)}`)
      .join('\n') + '\n';
  }

  async handleDeviceCommand(ctx: AdmsRequestContext, rawBody: string): Promise<string> {
    const resolved = await this.resolveDevice(ctx);
    const acknowledgements = this.parseCommandReturns(rawBody);

    for (const ack of acknowledgements) {
      await this.acknowledgeCommand(resolved, ack);
    }

    await this.markDeviceReturn(resolved);
    return 'OK\n';
  }

  async handleCdataUpload(ctx: AdmsRequestContext, table: string | undefined, rawBody: string): Promise<string> {
    const resolved = await this.resolveDevice(ctx);
    const normalizedTable = (table ?? '').toUpperCase();

    if (normalizedTable === 'ATTLOG' || normalizedTable === '') {
      const events = this.parseAttendance(ctx.sn, rawBody, ctx);
      if (events.length > 0) {
        const result = await this.punchIngestion.submit({
          tenantId: resolved.tenantId,
          integrationId: resolved.integrationId,
          providerName: PROVIDER_NAME,
          events,
          requestId: randomUUID(),
        });

        await this.updateDeviceStamps(resolved, events);
        return `OK: ${result.queued || result.buffered}\n`;
      }
    }

    await this.updateDeviceHeartbeat(resolved, ctx);
    return 'OK\n';
  }

  async queueCommand(input: {
    tenantId: string;
    deviceSerialNumber: string;
    commandType: string;
    command: string;
    integrationId?: string | null;
    biometricDeviceId?: string | null;
    priority?: number;
    expiresAt?: Date | null;
    createdBy?: string | null;
  }): Promise<any> {
    const deviceSerialNumber = this.normalizeSerial(input.deviceSerialNumber);
    await this.assertCommandTarget(input.tenantId, deviceSerialNumber, input.integrationId, input.biometricDeviceId);
    const commandKey = this.nextCommandKey();
    const commandPayload = JSON.stringify({ command: input.command });
    const { rows } = await this.db.query(
      `WITH existing AS (
         SELECT *
         FROM biometric_device_commands
         WHERE tenant_id = $1
           AND integration_id IS NOT DISTINCT FROM $2
           AND biometric_device_id IS NOT DISTINCT FROM $3
           AND provider_name = $4
           AND device_serial_number = $5
           AND command_type = $7
           AND command_payload = $8::jsonb
           AND status IN ('pending', 'sent')
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY queued_at DESC
         LIMIT 1
       ),
       inserted AS (
         INSERT INTO biometric_device_commands (
           tenant_id, integration_id, biometric_device_id, provider_name,
           device_serial_number, command_key, command_type, command_payload,
           priority, expires_at, created_by
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11
         WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING *
       )
       SELECT * FROM inserted
       UNION ALL
       SELECT * FROM existing
       LIMIT 1`,
      [
        input.tenantId,
        input.integrationId ?? null,
        input.biometricDeviceId ?? null,
        PROVIDER_NAME,
        deviceSerialNumber,
        commandKey,
        input.commandType,
        commandPayload,
        input.priority ?? 100,
        input.expiresAt ?? null,
        input.createdBy ?? null,
      ],
    );
    return rows[0];
  }

  async listCommands(tenantId: string, deviceSerialNumber: string, limit = 50): Promise<any[]> {
    const normalizedSerial = this.normalizeSerial(deviceSerialNumber);
    const { rows } = await this.db.query(
      `SELECT *
       FROM biometric_device_commands
       WHERE tenant_id = $1
         AND provider_name = $2
         AND device_serial_number = $3
       ORDER BY queued_at DESC
       LIMIT $4`,
      [tenantId, PROVIDER_NAME, normalizedSerial, limit],
    );
    return rows;
  }

  private async resolveDevice(ctx: AdmsRequestContext): Promise<ResolvedAdmsDevice> {
    ctx.sn = this.normalizeSerial(ctx.sn);

    let integration = await this.getSingleActiveIntegration(ctx.sn);
    if (!integration) {
      this.assertNetworkAllowed(ctx, null);
      integration = await this.autoRegisterIntegration(ctx);
    }
    if (!integration) throw new UnauthorizedException('SN not registered or inactive');

    this.assertTenantActive(integration);
    this.assertDeviceAuthentication(integration, ctx);
    const clientIp = this.assertNetworkAllowed(ctx, integration);
    await this.assertExistingDeviceState(integration.tenant_id, ctx.sn);

    const device = await this.upsertDevice(integration, { ...ctx, sourceIp: clientIp });
    return {
      tenantId: integration.tenant_id,
      integrationId: integration.id,
      integration,
      device,
      clientIp,
    };
  }

  private normalizeSerial(serial: string): string {
    const normalized = String(serial ?? '').trim();
    if (!normalized) throw new UnauthorizedException('SN is required');
    if (!SERIAL_PATTERN.test(normalized)) throw new UnauthorizedException('Invalid SN');
    return normalized;
  }

  private async getSingleActiveIntegration(sn: string): Promise<any | null> {
    const { rows } = await this.db.query(
      `SELECT i.*, t.status AS tenant_status
       FROM integrations i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.type = 'zkteco'
         AND i.config->>'device_sn' = $1
         AND i.is_active = true
       ORDER BY i.updated_at DESC`,
      [sn],
    );

    if (rows.length > 1) {
      this.logger.warn(`Blocked duplicate active ZKTeco registration for SN ${sn}`);
      throw new UnauthorizedException('Duplicate device registration');
    }

    return rows[0] ?? null;
  }

  private assertTenantActive(integration: any): void {
    if (integration.tenant_status && integration.tenant_status !== 'active') {
      throw new UnauthorizedException('Tenant is not active');
    }
  }

  private async assertExistingDeviceState(tenantId: string, sn: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id, is_active, status
       FROM biometric_devices
       WHERE tenant_id = $1 AND serial_number = $2 AND provider_name = $3
       LIMIT 1`,
      [tenantId, sn, PROVIDER_NAME],
    );
    const device = rows[0];
    if (!device) return;

    const status = String(device.status ?? '').toLowerCase();
    if (device.is_active === false || ['inactive', 'disabled', 'suspended', 'blocked', 'retired'].includes(status)) {
      throw new UnauthorizedException('Device is not active');
    }
  }

  private async assertCommandTarget(
    tenantId: string,
    serialNumber: string,
    integrationId?: string | null,
    biometricDeviceId?: string | null,
  ): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT d.id AS device_id, i.id AS integration_id
       FROM integrations i
       LEFT JOIN biometric_devices d
         ON d.tenant_id = i.tenant_id
        AND d.provider_name = $3
        AND d.serial_number = i.config->>'device_sn'
       WHERE i.tenant_id = $1
         AND i.type = 'zkteco'
         AND i.config->>'device_sn' = $2
         AND i.is_active = true`,
      [tenantId, serialNumber, PROVIDER_NAME],
    );
    const target = rows[0];
    if (!target) throw new UnauthorizedException('Command target is not registered');
    if (integrationId && target.integration_id !== integrationId) {
      throw new UnauthorizedException('Command integration mismatch');
    }
    if (biometricDeviceId && target.device_id !== biometricDeviceId) {
      throw new UnauthorizedException('Command device mismatch');
    }
  }

  private assertDeviceAuthentication(integration: any, ctx: AdmsRequestContext): void {
    const config = integration.config ?? {};
    const expected = this.firstString(
      config.adms_device_key,
      config.device_key,
      config.auth_token,
      config.secret,
      process.env.BIOMETRICS_ADMS_DEVICE_KEY,
    );
    const requireAuth = this.toBoolean(config.require_device_auth) || this.toBoolean(process.env.BIOMETRICS_ADMS_REQUIRE_DEVICE_AUTH);
    if (!expected && !requireAuth) return;

    const supplied = this.firstString(
      ctx.query.AuthKey,
      ctx.query.auth_key,
      ctx.query.DeviceKey,
      ctx.query.device_key,
      ctx.query.Token,
      ctx.query.token,
      ctx.query.auth_token,
      ctx.query.PIN,
      ctx.query.pin,
    );
    if (!expected || !supplied || !this.secureEquals(expected, supplied)) {
      throw new UnauthorizedException('Device authentication failed');
    }
  }

  private assertNetworkAllowed(ctx: AdmsRequestContext, integration: any | null): string | undefined {
    const clientIp = this.resolveClientIp(ctx, integration?.config ?? {});
    const config = integration?.config ?? {};
    const allowlist = [
      ...this.parseList(process.env.BIOMETRICS_ADMS_ALLOWED_IPS),
      ...this.parseList(process.env.BIOMETRICS_ADMS_ALLOWED_CIDRS),
      ...this.parseList(config.allowed_ip),
      ...this.parseList(config.allowed_ips),
      ...this.parseList(config.allowed_cidr),
      ...this.parseList(config.allowed_cidrs),
    ];

    if (allowlist.length === 0) return clientIp;
    if (!clientIp || !allowlist.some((entry) => this.ipMatches(clientIp, entry))) {
      throw new UnauthorizedException('Device source is not allowed');
    }
    return clientIp;
  }

  private resolveClientIp(ctx: AdmsRequestContext, config: Record<string, any>): string | undefined {
    const remoteIp = this.cleanIp(ctx.remoteIp ?? ctx.sourceIp);
    const forwardedFor = (ctx.forwardedFor ?? []).map((ip) => this.cleanIp(ip)).filter((ip): ip is string => Boolean(ip));
    if (forwardedFor.length === 0) return remoteIp;

    const trustedGateways = [
      ...this.parseList(process.env.BIOMETRICS_ADMS_TRUSTED_GATEWAYS),
      ...this.parseList(config.trusted_gateway),
      ...this.parseList(config.trusted_gateways),
    ];
    const proxyChain = [remoteIp, ...forwardedFor.slice(1)].filter((ip): ip is string => Boolean(ip));
    const chainTrusted = proxyChain.length > 0 && proxyChain.every((ip) => trustedGateways.some((entry) => this.ipMatches(ip, entry)));

    return chainTrusted ? forwardedFor[0] : remoteIp;
  }

  private async autoRegisterIntegration(ctx: AdmsRequestContext): Promise<any | null> {
    const tenantId = process.env.BIOMETRICS_ADMS_AUTO_REGISTER_TENANT_ID;
    if (!tenantId) return null;

    const { rows } = await this.db.query(
      `INSERT INTO integrations (tenant_id, name, type, config, is_active, created_at, updated_at)
       SELECT $1, $2, 'zkteco', $3::jsonb, true, NOW(), NOW()
       WHERE EXISTS (SELECT 1 FROM tenants WHERE id = $1 AND status = 'active')
         AND NOT EXISTS (
           SELECT 1 FROM integrations
           WHERE type = 'zkteco'
             AND is_active = true
             AND config->>'device_sn' = $4
         )
       ON CONFLICT (tenant_id, name)
       DO UPDATE SET config = integrations.config || EXCLUDED.config, is_active = true, updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        `ZKTeco ADMS ${ctx.sn}`,
        JSON.stringify({ device_sn: ctx.sn, source: 'adms_auto_registration' }),
        ctx.sn,
      ],
    );
    return rows[0] ?? null;
  }

  private async upsertDevice(integration: any, ctx: AdmsRequestContext): Promise<any> {
    const metadata = this.extractDeviceMetadata(ctx.query);
    const capabilities = this.extractCapabilities(ctx.query);
    const now = new Date();

    const { rows } = await this.db.query(
      `INSERT INTO biometric_devices (
         tenant_id, serial_number, provider_name, provider_device_id,
         name, ip_address, firmware_version, hardware_type, capabilities,
         platform, is_online, last_seen_at, last_heartbeat_at, last_heartbeat_ip,
         heartbeat_metadata, metadata, device_timezone, device_version,
         command_capabilities, adms_registered_at, status_reason, status_changed_at,
         is_active, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $2,
         $4, $5, $6, $7, $8::jsonb,
         $9, true, $10, $10, $11::inet,
         $12::jsonb, $13::jsonb, $14, $15,
         $16::jsonb, COALESCE((SELECT adms_registered_at FROM biometric_devices WHERE tenant_id = $1 AND serial_number = $2 AND provider_name = $3), $10),
         'adms_heartbeat', $10, true, NOW(), NOW()
       )
       ON CONFLICT (tenant_id, serial_number, provider_name)
       DO UPDATE SET
         provider_device_id = EXCLUDED.provider_device_id,
         name = COALESCE(EXCLUDED.name, biometric_devices.name),
         ip_address = COALESCE(EXCLUDED.ip_address, biometric_devices.ip_address),
         firmware_version = COALESCE(EXCLUDED.firmware_version, biometric_devices.firmware_version),
         hardware_type = EXCLUDED.hardware_type,
         capabilities = EXCLUDED.capabilities,
         platform = COALESCE(EXCLUDED.platform, biometric_devices.platform),
         is_online = true,
         last_seen_at = EXCLUDED.last_seen_at,
         last_heartbeat_at = EXCLUDED.last_heartbeat_at,
         last_heartbeat_ip = EXCLUDED.last_heartbeat_ip,
         heartbeat_metadata = biometric_devices.heartbeat_metadata || EXCLUDED.heartbeat_metadata,
         metadata = biometric_devices.metadata || EXCLUDED.metadata,
         device_timezone = COALESCE(EXCLUDED.device_timezone, biometric_devices.device_timezone),
         device_version = COALESCE(EXCLUDED.device_version, biometric_devices.device_version),
         command_capabilities = EXCLUDED.command_capabilities,
         adms_registered_at = COALESCE(biometric_devices.adms_registered_at, EXCLUDED.adms_registered_at),
         status_reason = 'adms_heartbeat',
         status_changed_at = CASE WHEN biometric_devices.is_online = false THEN EXCLUDED.status_changed_at ELSE biometric_devices.status_changed_at END,
         updated_at = NOW()
       RETURNING *`,
      [
        integration.tenant_id,
        ctx.sn,
        PROVIDER_NAME,
        metadata.deviceName ?? `ZKTeco ${ctx.sn}`,
        ctx.sourceIp ?? null,
        metadata.firmwareVersion ?? null,
        this.resolveHardwareType(capabilities),
        JSON.stringify(capabilities),
        metadata.platform ?? 'iClock',
        now,
        ctx.sourceIp ?? null,
        JSON.stringify(metadata),
        JSON.stringify(metadata),
        metadata.timezone ?? null,
        metadata.deviceVersion ?? null,
        JSON.stringify(['DATA UPDATE', 'CHECK', 'CLEAR LOG', 'REBOOT']),
      ],
    );

    return rows[0];
  }

  private async updateDeviceHeartbeat(resolved: ResolvedAdmsDevice, ctx: AdmsRequestContext): Promise<void> {
    await this.db.query(
      `UPDATE biometric_devices
       SET is_online = true,
           last_seen_at = NOW(),
           last_heartbeat_at = NOW(),
           last_heartbeat_ip = COALESCE($4::inet, last_heartbeat_ip),
           heartbeat_metadata = heartbeat_metadata || $5::jsonb,
           updated_at = NOW()
       WHERE tenant_id = $1 AND serial_number = $2 AND provider_name = $3`,
      [
        resolved.tenantId,
        ctx.sn,
        PROVIDER_NAME,
        ctx.sourceIp ?? null,
        JSON.stringify(this.extractDeviceMetadata(ctx.query)),
      ],
    );
  }

  private async pollCommands(resolved: ResolvedAdmsDevice, limit: number): Promise<any[]> {
    const { rows } = await this.db.query(
      `WITH due AS (
         SELECT id
       FROM biometric_device_commands
       WHERE tenant_id = $1
         AND provider_name = $2
         AND device_serial_number = $3
         AND (integration_id IS NULL OR integration_id = $5)
         AND (biometric_device_id IS NULL OR biometric_device_id = $6)
         AND status = 'pending'
         AND available_at <= NOW()
         AND (expires_at IS NULL OR expires_at > NOW())
           AND attempts < max_attempts
         ORDER BY priority ASC, queued_at ASC
         LIMIT $4
         FOR UPDATE SKIP LOCKED
       )
       UPDATE biometric_device_commands c
       SET status = 'sent',
           attempts = attempts + 1,
           sent_at = NOW(),
           transfer_stamp = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
           updated_at = NOW()
       FROM due
       WHERE c.id = due.id
       RETURNING c.*`,
      [resolved.tenantId, PROVIDER_NAME, resolved.device.serial_number, limit, resolved.integrationId, resolved.device.id],
    );

    if (rows.length > 0) {
      await this.db.query(
        `UPDATE biometric_devices
         SET adms_last_transfer_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [resolved.device.id],
      );
    }

    return rows;
  }

  private async acknowledgeCommand(
    resolved: ResolvedAdmsDevice,
    ack: { commandKey: string; returnCode: string; message?: string; payload: Record<string, unknown> },
  ): Promise<void> {
    const succeeded = ack.returnCode === '0';
    await this.db.query(
      `UPDATE biometric_device_commands
       SET status = $1,
           acknowledged_at = NOW(),
           completed_at = NOW(),
           return_stamp = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
           result_code = $2,
           return_code = $2,
           result_message = $3,
           result_payload = COALESCE(result_payload, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE tenant_id = $5
         AND provider_name = $6
         AND device_serial_number = $7
         AND command_key = $8
         AND (integration_id IS NULL OR integration_id = $9)
         AND (biometric_device_id IS NULL OR biometric_device_id = $10)
         AND status = 'sent'
         AND completed_at IS NULL`,
      [
        succeeded ? 'succeeded' : 'failed',
        ack.returnCode,
        ack.message ?? (succeeded ? 'OK' : 'Command failed'),
        JSON.stringify(ack.payload),
        resolved.tenantId,
        PROVIDER_NAME,
        resolved.device.serial_number,
        ack.commandKey,
        resolved.integrationId,
        resolved.device.id,
      ],
    );
  }

  private async markDeviceReturn(resolved: ResolvedAdmsDevice): Promise<void> {
    await this.db.query(
      `UPDATE biometric_devices
       SET adms_last_return_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [resolved.device.id],
    );
  }

  private async updateDeviceStamps(resolved: ResolvedAdmsDevice, events: PunchEventDto[]): Promise<void> {
    const newest = events.reduce<Date | null>((acc, event) => {
      if (!acc || event.timestamp > acc) return event.timestamp;
      return acc;
    }, null);

    await this.db.query(
      `UPDATE biometric_devices
       SET last_seen_at = NOW(),
           last_heartbeat_at = NOW(),
           last_heartbeat_ip = COALESCE($3::inet, last_heartbeat_ip),
           is_online = true,
           last_adms_stamp = COALESCE($2, last_adms_stamp),
           updated_at = NOW()
       WHERE id = $1`,
      [resolved.device.id, newest?.toISOString() ?? null, resolved.clientIp ?? null],
    );
  }

  private parseAttendance(sn: string, rawText: string, ctx: AdmsRequestContext): PunchEventDto[] {
    const lines = rawText.split(/\r?\n/);
    const events: PunchEventDto[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const cols = trimmed.split(/\s+/);
      if (cols.length < 3) continue;

      const timestamp = new Date(`${cols[1]} ${cols[2]}`);
      if (isNaN(timestamp.getTime())) continue;

      const punchState = cols[3] ?? '0';
      const verifyType = cols[4] ?? '1';
      const workCode = cols[5];

      events.push({
        employeeCode: cols[0],
        timestamp,
        punchType: this.mapPunchDirection(punchState),
        verifyMethod: this.mapVerifyMethod(verifyType),
        providerName: PROVIDER_NAME,
        deviceId: sn,
        terminalSerialNumber: sn,
        attendanceSource: AttendanceSource.BIOMETRIC_DEVICE,
        punchState,
        rawVerifyType: verifyType,
        workCode,
        sourceIp: ctx.sourceIp,
        sourceUserAgent: ctx.userAgent,
        rawPayload: {
          line: trimmed,
          sn,
          punch_state: punchState,
          verify_type: verifyType,
          work_code: workCode ?? null,
        },
      });
    }

    return events;
  }

  private parseCommandReturns(rawBody: string): Array<{
    commandKey: string;
    returnCode: string;
    message?: string;
    payload: Record<string, unknown>;
  }> {
    const acknowledgements: Array<{
      commandKey: string;
      returnCode: string;
      message?: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const line of rawBody.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const fields = this.parseKeyValueLine(trimmed);
      const commandKey = fields.ID ?? fields.Id ?? fields.id ?? fields.CMDID ?? fields.CommandID ?? fields.command_key;
      if (!commandKey) continue;

      acknowledgements.push({
        commandKey,
        returnCode: fields.Return ?? fields.return ?? fields.Result ?? fields.result ?? fields.code ?? '0',
        message: fields.Message ?? fields.message ?? fields.CMD ?? trimmed,
        payload: { ...fields, raw: trimmed },
      });
    }

    return acknowledgements;
  }

  private parseKeyValueLine(line: string): Record<string, string> {
    const normalized = line.replace(/\t/g, '&').replace(/\s+/g, '&');
    return normalized.split('&').reduce<Record<string, string>>((acc, part) => {
      const index = part.indexOf('=');
      if (index > 0) acc[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return acc;
    }, {});
  }

  private renderCommand(command: any): string {
    const payload = command.command_payload ?? {};
    return payload.command ?? payload.text ?? payload.cmd ?? command.command_type;
  }

  private extractDeviceMetadata(query: Record<string, any>): Record<string, any> {
    return {
      deviceName: query.DeviceName ?? query.device_name ?? query.Alias,
      firmwareVersion: query.FWVersion ?? query.Firmware ?? query.firmware,
      deviceVersion: query.PushVersion ?? query.Version ?? query.device_version,
      platform: query.ProductType ?? query.Platform ?? query.DeviceType ?? 'iClock',
      timezone: query.TimeZone ?? query.timezone,
      language: query.Language,
      mac: query.MAC ?? query.Mac,
      ipAddress: query.IPAddress ?? query.IP,
      rawQuery: query,
    };
  }

  private extractCapabilities(query: Record<string, any>): string[] {
    const raw = [
      query.DeviceType,
      query.ProductType,
      query.Capabilities,
      query.FaceFunOn === '1' ? 'face' : undefined,
      query.FingerFunOn === '1' ? 'fingerprint' : undefined,
      query.CardFunOn === '1' ? 'card' : undefined,
    ].filter(Boolean).join(' ').toLowerCase();

    const capabilities = new Set<string>();
    if (raw.includes('face')) capabilities.add('face');
    if (raw.includes('finger') || raw.includes('fp')) capabilities.add('fingerprint');
    if (raw.includes('card')) capabilities.add('card');
    if (capabilities.size === 0) capabilities.add('fingerprint');
    return [...capabilities];
  }

  private resolveHardwareType(capabilities: string[]): 'fingerprint' | 'face' | 'card' | 'hybrid' | 'unknown' {
    if (capabilities.length > 1) return 'hybrid';
    if (capabilities[0] === 'face') return 'face';
    if (capabilities[0] === 'card') return 'card';
    if (capabilities[0] === 'fingerprint') return 'fingerprint';
    return 'unknown';
  }

  private mapPunchDirection(raw: string): PunchDirection {
    if (raw === '0' || raw.toUpperCase() === 'IN') return PunchDirection.IN;
    if (raw === '1' || raw.toUpperCase() === 'OUT') return PunchDirection.OUT;
    return PunchDirection.UNKNOWN;
  }

  private mapVerifyMethod(raw: string): VerifyMethod {
    const map: Record<string, VerifyMethod> = {
      '0': VerifyMethod.PASSWORD,
      '1': VerifyMethod.FINGERPRINT,
      '2': VerifyMethod.CARD,
      '15': VerifyMethod.FACE,
      fingerprint: VerifyMethod.FINGERPRINT,
      face: VerifyMethod.FACE,
      card: VerifyMethod.CARD,
      password: VerifyMethod.PASSWORD,
    };
    return map[raw.toLowerCase()] ?? VerifyMethod.OTHER;
  }

  private resolveStamp(value?: string | null): string {
    if (value) return value;
    return '0';
  }

  private nextCommandKey(): string {
    const entropy = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `${Date.now()}${entropy}`;
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }

  private parseList(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap((entry) => this.parseList(entry));
    if (typeof value !== 'string') return [String(value)];
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on', 'required'].includes(value.trim().toLowerCase());
  }

  private secureEquals(expected: string, supplied: string): boolean {
    const expectedHash = createHash('sha256').update(expected).digest();
    const suppliedHash = createHash('sha256').update(supplied).digest();
    return timingSafeEqual(expectedHash, suppliedHash);
  }

  private cleanIp(value?: string): string | undefined {
    if (!value) return undefined;
    const cleaned = value.trim().replace(/^::ffff:/, '');
    if (!cleaned) return undefined;
    const bracketless = cleaned.startsWith('[') ? cleaned.slice(1, cleaned.indexOf(']')) : cleaned;
    const withoutPort = bracketless.includes('.') ? bracketless.replace(/:\d+$/, '') : bracketless;
    return withoutPort;
  }

  private ipMatches(ip: string, rule: string): boolean {
    const normalizedIp = this.cleanIp(ip);
    const normalizedRule = rule.trim();
    if (!normalizedIp || !normalizedRule) return false;
    if (!normalizedRule.includes('/')) return normalizedIp === this.cleanIp(normalizedRule);

    const [network, prefixRaw] = normalizedRule.split('/');
    const prefix = Number(prefixRaw);
    const ipNumber = this.ipv4ToNumber(normalizedIp);
    const networkNumber = this.ipv4ToNumber(network);
    if (ipNumber === null || networkNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNumber & mask) === (networkNumber & mask);
  }

  private ipv4ToNumber(value: string): number | null {
    const parts = value.split('.');
    if (parts.length !== 4) return null;
    let result = 0;
    for (const part of parts) {
      if (!/^\d+$/.test(part)) return null;
      const octet = Number(part);
      if (octet < 0 || octet > 255) return null;
      result = ((result << 8) + octet) >>> 0;
    }
    return result >>> 0;
  }

  async markOfflineDevices(timeoutSeconds = Number(process.env.BIOMETRICS_ADMS_OFFLINE_AFTER_SECONDS ?? DEFAULT_HEARTBEAT_OFFLINE_SECONDS)): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE biometric_devices
       SET is_online = false,
           status_reason = 'adms_heartbeat_timeout',
           status_changed_at = NOW(),
           updated_at = NOW()
       WHERE provider_name = $1
         AND is_online = true
         AND last_heartbeat_at IS NOT NULL
         AND last_heartbeat_at < NOW() - ($2::int * INTERVAL '1 second')`,
      [PROVIDER_NAME, timeoutSeconds],
    );
    return rowCount ?? 0;
  }

  private formatDeviceTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
}
