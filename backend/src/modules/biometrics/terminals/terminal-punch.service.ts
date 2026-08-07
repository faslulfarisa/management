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
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../shared/redis.provider';
import { AttendanceTerminalService } from './attendance-terminal.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import {
  PUNCH_INGESTION_QUEUE,
  PUNCH_INGESTION_JOB,
  PunchIngestionJobData,
} from '../queue/punch-ingestion.types';
import {
  PunchDirection,
  VerifyMethod,
  AttendanceSource,
} from '../dto/punch-event.dto';

// ── Request DTO ───────────────────────────────────────────────────────────────

export interface TerminalPunchBody {
  /** Must match employees.employee_code */
  employeeCode: string;
  /** UTC ISO-8601 timestamp of the punch event */
  timestamp: string;
  punchType?: 'IN' | 'OUT';
  /** How the employee authenticated at this terminal */
  verifyMethod?: 'fingerprint' | 'face' | 'card' | 'password' | 'other';
  /**
   * Replay-protection nonce — strongly recommended for production terminals.
   * Must be paired with requestTimestamp. A UUID or CSPRNG hex string is ideal.
   */
  nonce?: string;
  /** ISO-8601 timestamp of when the terminal built this request. */
  requestTimestamp?: string;
  /** Arbitrary terminal-app context attached to the raw payload for audit. */
  metadata?: Record<string, unknown>;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TerminalPunchService {
  private readonly logger = new Logger(TerminalPunchService.name);

  constructor(
    private readonly terminalService: AttendanceTerminalService,
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly punchQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly metrics: BiometricsMetricsService,
  ) {}

  async enqueuePunch(
    terminal: Record<string, unknown>,
    body: TerminalPunchBody,
    correlationId?: string,
  ): Promise<{ queued: number; requestId: string }> {
    const tenantId   = terminal['tenant_id']  as string;
    const terminalId = terminal['id']          as string;
    const deviceType = terminal['device_type'] as string;

    // Replay protection — nonce + requestTimestamp must appear together
    if (body.nonce || body.requestTimestamp) {
      if (!body.nonce || !body.requestTimestamp) {
        throw new UnprocessableEntityException(
          'Both nonce and requestTimestamp are required together',
        );
      }

      const reqTs = new Date(body.requestTimestamp).getTime();
      if (isNaN(reqTs) || Math.abs(Date.now() - reqTs) > 5 * 60 * 1000) {
        throw new UnprocessableEntityException(
          'requestTimestamp is outside the allowed 5-minute window',
        );
      }

      const nonceKey = `nonce:terminal:${tenantId}:${body.nonce}`;
      const seen = await this.redis.exists(nonceKey);
      if (seen) throw new ConflictException('Duplicate request detected (nonce already used)');
      await this.redis.setex(nonceKey, 600, '1'); // 10-min TTL matches device path
    }

    const ts = new Date(body.timestamp);
    if (isNaN(ts.getTime())) {
      throw new UnprocessableEntityException('Invalid punch timestamp');
    }

    const attendanceSource = this._deviceTypeToSource(deviceType);
    const requestId = randomUUID();

    const jobData: PunchIngestionJobData = {
      tenantId,
      integrationId: null,   // terminal punches have no biometric integration
      providerName: 'terminal',
      terminalId,
      events: [
        {
          employeeCode: body.employeeCode,
          timestamp:    ts.toISOString(),
          punchType:    this._normalizePunchType(body.punchType),
          verifyMethod: body.verifyMethod ?? VerifyMethod.OTHER,
          providerName: 'terminal',
          deviceId:     terminalId,
          terminalId,
          attendanceSource,
          rawPayload: {
            terminalName: terminal['device_name'],
            deviceType,
            metadata: body.metadata ?? {},
          },
        },
      ],
      requestId,
      submittedAt: new Date().toISOString(),
      correlationId,
    };

    await this.punchQueue.add(PUNCH_INGESTION_JOB, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail:     { count: 500 },
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
      case 'kiosk':   return AttendanceSource.KIOSK_TERMINAL;
      case 'laptop':
      case 'tablet':
      default:        return AttendanceSource.LAPTOP_TERMINAL;
    }
  }

  private _normalizePunchType(raw?: string): PunchDirection {
    if (!raw) return PunchDirection.UNKNOWN;
    return raw.toUpperCase() === 'OUT' ? PunchDirection.OUT : PunchDirection.IN;
  }
}
