/**
 * terminal-punch.service.ts  (Phase 8)
 *
 * Normalizes a punch submitted by a trusted attendance terminal and enqueues
 * it on the existing punch-ingestion BullMQ queue.
 *
 * Terminal punches carry no biometric integration (integrationId = null).
 * This is safe because sync_logs.integration_id is a nullable FK column —
 * the AttendanceEngineService's _writeSyncLog INSERT will succeed, and the
 * _touchIntegration UPDATE against a null id is a harmless no-op.
 *
 * Replay protection mirrors the device-push path in BiometricsController,
 * namespaced under `nonce:terminal:` to avoid key collisions.
 */

import {
  Injectable,
  Logger,
  UnprocessableEntityException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../shared/redis.provider';
import { DatabaseService } from '../../../shared/database.service';
import { AttendanceTerminalService } from './attendance-terminal.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import { PunchIngestionService } from '../services/punch-ingestion.service';
import { PunchValidationService } from '../services/punch-validation.service';
import {
  PunchDirection,
  VerifyMethod,
  AttendanceSource,
  PunchEventDto,
} from '../dto/punch-event.dto';

// ── Request DTO ───────────────────────────────────────────────────────────────

export interface TerminalPunchBody {
  /** Must match employees.employee_code */
  employeeCode: string;
  /** UTC ISO-8601 timestamp of the punch event */
  timestamp: string;
  punchType?: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';
  /** How the employee authenticated at this terminal */
  verifyMethod?: 'fingerprint' | 'face' | 'card' | 'password' | 'other';
  /**
   * Replay-protection nonce — strongly recommended for production terminals.
   * Must be paired with requestTimestamp. A UUID or CSPRNG hex string is ideal.
   */
  nonce?: string;
  /** ISO-8601 timestamp of when the terminal built this request. */
  requestTimestamp?: string;
  signature?: string;
  /** Arbitrary terminal-app context attached to the raw payload for audit. */
  metadata?: Record<string, unknown>;
  gps?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    recordedAt?: string;
  };
  photo?: {
    url?: string;
    objectKey?: string;
    sha256?: string;
    capturedAt?: string;
  };
  locationMetadata?: Record<string, unknown>;
  workCode?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TerminalPunchService {
  private readonly logger = new Logger(TerminalPunchService.name);

  constructor(
    private readonly terminalService: AttendanceTerminalService,
    private readonly punchIngestion: PunchIngestionService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
    private readonly punchValidation: PunchValidationService,
    private readonly metrics: BiometricsMetricsService,
  ) {}

  async enqueuePunch(
    terminal: Record<string, unknown>,
    body: TerminalPunchBody,
    correlationId?: string,
    terminalRawToken?: string,
    request?: any,
  ): Promise<{ queued: number; requestId: string }> {
    const tenantId   = terminal['tenant_id']  as string;
    const terminalId = terminal['id']          as string;
    const deviceType = terminal['device_type'] as string;
    const requestId = randomUUID();

    // Replay protection — nonce + requestTimestamp must appear together
    this.requireSignature(body, terminalRawToken, request);
    await this.consumeNonce(
      tenantId,
      terminalId,
      body.nonce!,
      body.requestTimestamp!,
      requestId,
      request,
    );
    const ts = new Date(body.timestamp);
    if (isNaN(ts.getTime())) {
      throw new UnprocessableEntityException('Invalid punch timestamp');
    }

    const attendanceSource = this._deviceTypeToSource(deviceType);
    const gps = this.punchValidation.normalizeGps(body.gps);
    const photo = this.punchValidation.normalizePhoto(body.photo);
    const geofence = await this.punchValidation.validateTerminalGeofence(terminal, gps);

    const event: PunchEventDto = {
      tenantId,
      integrationId: null,
      employeeCode: body.employeeCode,
      timestamp: ts,
      punchType: this._normalizePunchType(body.punchType),
      verifyMethod: this._normalizeVerifyMethod(body.verifyMethod),
      providerName: 'terminal',
      deviceId: terminalId,
      terminalId,
      terminalSerialNumber: terminal['terminal_serial_number'] as string | undefined,
      attendanceSource,
      workCode: body.workCode,
      gps,
      photo,
      locationMetadata: {
        ...(body.locationMetadata ?? {}),
        geofence,
        terminal_authenticated: true,
        ip_whitelist_enforced: Array.isArray(terminal['allowed_ips']) && (terminal['allowed_ips'] as unknown[]).length > 0,
      },
      requestId,
      correlationId,
      rawPayload: {
        terminalName: terminal['device_name'],
        deviceType,
        metadata: body.metadata ?? {},
        photo: photo ?? null,
      },
    };

    await this.punchIngestion.submit({
      tenantId,
      integrationId: null,
      providerName: 'terminal',
      terminalId,
      events: [event],
      requestId,
      correlationId,
    });

    this.metrics.terminalPunchesTotal.inc({ device_type: deviceType });

    // Fire-and-forget — never let a stat update block the punch response
    this.terminalService.recordPunch(terminalId).catch(() => {});

    this.logger.log(
      JSON.stringify({
        event: 'terminal_punch_enqueued',
        tenantId,
        terminalId,
        employeeCode: body.employeeCode,
        attendanceSource,
        requestId,
      }),
    );

    return { queued: 1, requestId };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Maps terminal device_type to the normalized AttendanceSource that will be
   * written to attendance_records.attendance_source (migration 031).
   */
  private _deviceTypeToSource(deviceType: string): AttendanceSource {
    switch (deviceType) {
      case 'mobile':  return AttendanceSource.MOBILE_TERMINAL;
      case 'tablet':  return AttendanceSource.TABLET_TERMINAL;
      case 'kiosk':   return AttendanceSource.KIOSK_TERMINAL;
      case 'laptop':
      default:        return AttendanceSource.LAPTOP_TERMINAL;
    }
  }

  private _normalizePunchType(raw?: string): PunchDirection {
    if (!raw) return PunchDirection.UNKNOWN;
    const value = raw.toUpperCase().replace(/[\s-]+/g, '_');
    if (value === 'OUT' || value === '1') return PunchDirection.OUT;
    if (value === 'BREAK_OUT' || value === 'BREAKOUT' || value === 'LUNCH_OUT' || value === '2') return PunchDirection.BREAK_OUT;
    if (value === 'BREAK_IN' || value === 'BREAKIN' || value === 'LUNCH_IN' || value === '3') return PunchDirection.BREAK_IN;
    return PunchDirection.IN;
  }

  private requireSignature(body: TerminalPunchBody, terminalRawToken?: string, request?: any): void {
    const signature = String(request?.headers?.['x-signature'] ?? body.signature ?? '').trim();
    if (!body.nonce || !body.requestTimestamp || !signature) {
      throw new UnprocessableEntityException('nonce, requestTimestamp, and signature are required');
    }
    if (!terminalRawToken) {
      throw new UnprocessableEntityException('Terminal signing secret is unavailable');
    }
    const reqTs = new Date(body.requestTimestamp).getTime();
    if (isNaN(reqTs) || Math.abs(Date.now() - reqTs) > 5 * 60 * 1000) {
      throw new UnprocessableEntityException('requestTimestamp is outside the allowed 5-minute window');
    }

    const path = request?.originalUrl?.split('?')[0] ?? request?.url?.split('?')[0] ?? '';
    const query = request?.originalUrl?.includes('?') ? request.originalUrl.split('?').slice(1).join('?') : '';
    const rawBody = Buffer.from(JSON.stringify(this.stripSignature(request?.body ?? body)));
    const bodyHash = createHash('sha256').update(this.canonicalBody(rawBody)).digest('hex');
    const message = [String(request?.method ?? 'POST').toUpperCase(), path, query, body.requestTimestamp, body.nonce, bodyHash].join('\n');
    const expected = createHmac('sha256', terminalRawToken).update(message).digest('hex');
    if (!this.secureEqual(signature, expected)) {
      throw new UnprocessableEntityException('Invalid request signature');
    }
  }

  private stripSignature(value: any): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const { signature: _signature, ...rest } = value;
    return rest;
  }

  private _normalizeVerifyMethod(raw?: TerminalPunchBody['verifyMethod']): VerifyMethod {
    if (!raw) return VerifyMethod.OTHER;
    switch (raw) {
      case 'fingerprint': return VerifyMethod.FINGERPRINT;
      case 'face': return VerifyMethod.FACE;
      case 'card': return VerifyMethod.CARD;
      case 'password': return VerifyMethod.PASSWORD;
      default: return VerifyMethod.OTHER;
    }
  }

  private async consumeNonce(
    tenantId: string,
    terminalId: string,
    nonce: string,
    requestTimestamp: string,
    requestId?: string,
    request?: any,
  ): Promise<void> {
    const nonceKey = `nonce:terminal:${tenantId}:${terminalId}:${nonce}`;
    const seen = await this.redis.exists(nonceKey);
    if (seen) {
      await this.recordReplayBlocked(tenantId, terminalId, nonce, 'nonce_already_seen');
      throw new ConflictException('Duplicate request detected (nonce already used)');
    }

    const { rowCount } = await this.db.query(
      `INSERT INTO terminal_replay_nonces
         (tenant_id, terminal_id, nonce, request_id, request_timestamp, expires_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (tenant_id, terminal_id, nonce) DO NOTHING`,
      [tenantId, terminalId, nonce, requestId ?? null, requestTimestamp],
    );

    if (rowCount === 0) {
      await this.recordReplayBlocked(tenantId, terminalId, nonce, 'terminal_nonce_conflict');
      throw new ConflictException('Duplicate request detected (nonce already used)');
    }

    const { rowCount: sharedRowCount } = await this.db.query(
      `INSERT INTO punch_submission_nonces
         (tenant_id, principal_type, principal_id, nonce, request_timestamp,
          request_id, source_ip, user_agent, expires_at, metadata)
       VALUES ($1, 'terminal', $2, $3, $4::timestamptz, $5, $6::inet, $7, NOW() + INTERVAL '10 minutes', $8::jsonb)
       ON CONFLICT (tenant_id, principal_type, principal_id, nonce) DO NOTHING`,
      [
        tenantId,
        terminalId,
        nonce,
        requestTimestamp,
        requestId ?? null,
        this.requestIp(request),
        request?.get?.('user-agent') ?? request?.headers?.['user-agent'] ?? null,
        JSON.stringify({ source: 'terminal_punch' }),
      ],
    );
    if (sharedRowCount === 0) {
      await this.recordReplayBlocked(tenantId, terminalId, nonce, 'shared_nonce_conflict');
      throw new ConflictException('Duplicate request detected (nonce already used)');
    }

    await this.redis.setex(nonceKey, 600, '1');
  }

  private async recordReplayBlocked(
    tenantId: string,
    terminalId: string,
    requestId: string,
    reason: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO biometric_operational_events (
         tenant_id, event_type, severity, source, terminal_id,
         request_id, summary, metadata
       )
       VALUES ($1, 'replay_attack_blocked', 'critical', 'terminal_punch', $2, $3, $4, $5::jsonb)`,
      [
        tenantId,
        terminalId,
        requestId,
        'Duplicate terminal punch request blocked',
        JSON.stringify({ reason }),
      ],
    ).catch(() => undefined);
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
      return Object.keys(value).sort().reduce((acc, key) => {
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

  private requestIp(request?: any): string | null {
    return (
      request?.headers?.['x-real-ip'] ??
      String(request?.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() ??
      request?.ip ??
      request?.socket?.remoteAddress ??
      null
    ) || null;
  }
}
