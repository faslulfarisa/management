/**
 * zkteco.service.ts
 *
 * ZKTeco-specific concerns ONLY:
 *   - Look up ZKTeco integrations by device serial number
 *   - Parse ADMS plain-text punch payloads → PunchEventDto[]
 *   - Parse JSON punch arrays → PunchEventDto[]
 *
 * Attendance engine logic has been extracted to AttendanceEngineService.
 * This service is now a thin parsing adapter.
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import {
  PunchEventDto,
  PunchDirection,
  VerifyMethod,
} from '../../biometrics/dto/punch-event.dto';

@Injectable()
export class ZktecoService {
  private readonly logger = new Logger(ZktecoService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Integration Lookups ─────────────────────────────────────────────────────

  /**
   * Look up an active ZKTeco integration by Device Serial Number (SN) + Tenant ID.
   */
  async getZktecoIntegration(tenantId: string, deviceSn: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM integrations
       WHERE type = 'zkteco'
         AND tenant_id = $1
         AND config->>'device_sn' = $2
         AND is_active = true`,
      [tenantId, deviceSn],
    );
    return rows[0] ?? null;
  }

  /**
   * Look up an active ZKTeco integration globally by Device Serial Number.
   * Used for ADMS pushes where the device identifies itself only by SN.
   */
  async getZktecoIntegrationBySn(deviceSn: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM integrations
       WHERE type = 'zkteco'
         AND config->>'device_sn' = $1
         AND is_active = true`,
      [deviceSn],
    );
    return rows[0] ?? null;
  }

  // ── Parsers ─────────────────────────────────────────────────────────────────

  /**
   * Parse the raw ADMS plain-text body into normalized PunchEventDto[].
   *
   * ADMS line format (tab/space-separated):
   *   [EnrollNumber] [Date] [Time] [PunchType] [VerifyType] [Workcode]
   *   e.g.: "EMP001 2026-05-29 09:05:00 0 1 0"
   */
  parseAdmsPunchText(deviceSn: string, rawText: string): PunchEventDto[] {
    const lines = rawText.split(/\r?\n/);
    const events: PunchEventDto[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

      const cols = trimmed.split(/\s+/);
      if (cols.length < 2) continue;

      const employeeCode = cols[0];
      const timeStr = cols[1] + (cols[2] ? ' ' + cols[2] : '');
      const timestamp = new Date(timeStr);
      if (isNaN(timestamp.getTime())) continue;

      // cols[3]: punch direction (0=IN, 1=OUT); cols[4]: verify type
      const dirCode = parseInt(cols[3] ?? '0', 10);
      const verCode = parseInt(cols[4] ?? '1', 10);

      events.push({
        employeeCode,
        timestamp,
        punchType: this._mapPunchDirection(dirCode),
        verifyMethod: this._mapVerifyMethod(verCode),
        providerName: 'zkteco',
        deviceId: deviceSn,
        rawPayload: { line: trimmed },
      });
    }

    this.logger.debug(
      `Parsed ${events.length} events from ADMS text (device: ${deviceSn})`,
    );
    return events;
  }

  /**
   * Parse a JSON punch array into normalized PunchEventDto[].
   */
  parseJsonPunches(
    deviceSn: string,
    input: Array<{ employeeCode: string; timestamp: string }>,
  ): PunchEventDto[] {
    return input
      .map((p): PunchEventDto | null => {
        const ts = new Date(p.timestamp);
        if (isNaN(ts.getTime())) return null;
        const event: PunchEventDto = {
          employeeCode: p.employeeCode,
          timestamp: ts,
          punchType: PunchDirection.UNKNOWN,
          verifyMethod: VerifyMethod.OTHER,
          providerName: 'zkteco',
          deviceId: deviceSn,
          rawPayload: p as unknown as Record<string, unknown>,
        };
        return event;
      })
      .filter((e): e is PunchEventDto => e !== null);
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private _mapPunchDirection(code: number): PunchDirection {
    if (code === 0) return PunchDirection.IN;
    if (code === 1) return PunchDirection.OUT;
    return PunchDirection.UNKNOWN;
  }

  private _mapVerifyMethod(code: number): VerifyMethod {
    const map: Record<number, VerifyMethod> = {
      0: VerifyMethod.PASSWORD,
      1: VerifyMethod.FINGERPRINT,
      2: VerifyMethod.CARD,
      15: VerifyMethod.FACE,
    };
    return map[code] ?? VerifyMethod.OTHER;
  }
}
