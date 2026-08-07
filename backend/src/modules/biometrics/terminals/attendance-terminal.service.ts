/**
 * attendance-terminal.service.ts
 *
 * Owns the attendance_terminals registry: registration, token lifecycle,
 * IP-restriction validation, heartbeat tracking, and stale-terminal sweep.
 *
 * Token model:
 *   Raw token  : hms_tk_<64 hex chars>  — generated here, shown exactly once
 *   Stored     : SHA-256(rawToken)       — token_hash column
 *   Transport  : X-Terminal-Token: <rawToken>  header on every terminal request
 *
 * IP validation supports exact IPv4 match and CIDR notation with no external deps.
 * An empty allowed_ips array means no IP restriction is enforced.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface RegisterTerminalDto {
  deviceName: string;
  deviceType: 'laptop' | 'tablet' | 'mobile' | 'kiosk';
  branchId?: string;
  /** CIDR or exact IPv4 entries. Empty = no IP restriction. */
  allowedIps?: string[];
  /** ISO date string; omit or null for never-expiring tokens. */
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TerminalPatchDto {
  deviceName?: string;
  isActive?: boolean;
  allowedIps?: string[];
  /** Merged shallowly into existing metadata via jsonb || operator. */
  metadata?: Record<string, unknown>;
  /** Pass null to clear expiry. */
  expiresAt?: string | null;
}

export interface TerminalListFilters {
  deviceType?: string;
  isActive?: boolean;
  isOnline?: boolean;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface RegistrationResult {
  terminal: Record<string, unknown>;
  /** Raw token — shown exactly once. The device must store it securely. */
  rawToken: string;
}

/** Minutes without a ping before a terminal is considered offline. */
const STALE_MINUTES = 10;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AttendanceTerminalService {
  private readonly logger = new Logger(AttendanceTerminalService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly metrics: BiometricsMetricsService,
  ) {}

  // ── Registration & token lifecycle ──────────────────────────────────────────

  async register(
    tenantId: string,
    dto: RegisterTerminalDto,
    registeredBy: string,
  ): Promise<RegistrationResult> {
    const rawToken = this._generateRawToken();
    const tokenHash = this._hashToken(rawToken);

    const { rows } = await this.db.query(
      `INSERT INTO attendance_terminals
         (tenant_id, branch_id, device_name, device_type,
          token_hash, allowed_ips, is_active, is_online,
          registered_by, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, false, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        tenantId,
        dto.branchId ?? null,
        dto.deviceName,
        dto.deviceType,
        tokenHash,
        JSON.stringify(dto.allowedIps ?? []),
        registeredBy,
        dto.expiresAt ?? null,
        JSON.stringify(dto.metadata ?? {}),
      ],
    );

    this.logger.log(
      JSON.stringify({
        event: 'terminal_registered',
        tenantId,
        terminalId: rows[0].id,
        deviceType: dto.deviceType,
        registeredBy,
      }),
    );

    this._refreshTerminalGauges().catch(() => {});
    return { terminal: this._safe(rows[0]), rawToken };
  }

  /**
   * Generates a new raw token and replaces the stored hash.
   * The previous token is immediately invalid.
   */
  async rotateToken(tenantId: string, id: string): Promise<{ rawToken: string }> {
    const rawToken = this._generateRawToken();
    const tokenHash = this._hashToken(rawToken);

    const { rows } = await this.db.query(
      `UPDATE attendance_terminals
       SET token_hash = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING id`,
      [tokenHash, id, tenantId],
    );

    if (!rows[0]) throw new NotFoundException(`Terminal ${id} not found`);

    this.logger.log(
      JSON.stringify({ event: 'terminal_token_rotated', tenantId, terminalId: id }),
    );

    return { rawToken };
  }

  // ── Token validation (hot path — called on every terminal request) ──────────

  /**
   * Resolves and validates a raw terminal token.
   * Throws UnauthorizedException / ForbiddenException on any security failure.
   * On success returns the full terminal row (token_hash stripped).
   */
  async validateToken(
    rawToken: string,
    requestIp: string,
  ): Promise<Record<string, unknown>> {
    const tokenHash = this._hashToken(rawToken);

    const { rows } = await this.db.query(
      `SELECT * FROM attendance_terminals WHERE token_hash = $1`,
      [tokenHash],
    );

    const terminal = rows[0];
    if (!terminal) throw new UnauthorizedException('Invalid terminal token');

    if (!terminal.is_active) {
      throw new ForbiddenException('Terminal is deactivated');
    }

    if (terminal.expires_at && new Date(terminal.expires_at) < new Date()) {
      throw new ForbiddenException('Terminal token has expired');
    }

    const allowedIps: string[] = terminal.allowed_ips ?? [];
    if (allowedIps.length > 0 && !this._ipAllowed(requestIp, allowedIps)) {
      this.logger.warn(
        JSON.stringify({
          event: 'terminal_ip_rejected',
          terminalId: terminal.id,
          requestIp,
          allowedIps,
        }),
      );
      throw new ForbiddenException(`IP ${requestIp} is not permitted for this terminal`);
    }

    return terminal;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  async recordPing(terminalId: string): Promise<void> {
    await this.db.query(
      `UPDATE attendance_terminals
       SET is_online = true, last_ping_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [terminalId],
    );
  }

  async recordPunch(terminalId: string): Promise<void> {
    await this.db.query(
      `UPDATE attendance_terminals
       SET last_punch_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [terminalId],
    );
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    filters: TerminalListFilters = {},
  ): Promise<{ items: any[]; total: number; page: number; limit: number }> {
    const {
      deviceType,
      isActive = true,
      isOnline,
      branchId,
      page = 1,
      limit = 20,
    } = filters;

    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let p = 2;

    conditions.push(`is_active = $${p++}`);
    params.push(isActive);

    if (deviceType !== undefined) {
      conditions.push(`device_type = $${p++}`);
      params.push(deviceType);
    }
    if (isOnline !== undefined) {
      conditions.push(`is_online = $${p++}`);
      params.push(isOnline);
    }
    if (branchId !== undefined) {
      conditions.push(`branch_id = $${p++}`);
      params.push(branchId);
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.db.query(
        `SELECT id, tenant_id, branch_id, device_name, device_type,
                allowed_ips, is_active, is_online,
                last_ping_at, last_punch_at,
                registered_by, expires_at, metadata,
                created_at, updated_at
         FROM attendance_terminals
         WHERE ${where}
         ORDER BY is_online DESC, device_name ASC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      ),
      this.db.query(
        `SELECT COUNT(*) AS total FROM attendance_terminals WHERE ${where}`,
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

  async get(tenantId: string, id: string): Promise<any | null> {
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, branch_id, device_name, device_type,
              allowed_ips, is_active, is_online,
              last_ping_at, last_punch_at,
              registered_by, expires_at, metadata,
              created_at, updated_at
       FROM attendance_terminals
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ?? null;
  }

  async getStats(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_active)                       AS total,
         COUNT(*) FILTER (WHERE is_active AND is_online)         AS online,
         COUNT(*) FILTER (WHERE is_active AND NOT is_online)     AS offline,
         COUNT(*) FILTER (WHERE is_active AND device_type = 'laptop')  AS laptops,
         COUNT(*) FILTER (WHERE is_active AND device_type = 'tablet')  AS tablets,
         COUNT(*) FILTER (WHERE is_active AND device_type = 'mobile')  AS mobiles,
         COUNT(*) FILTER (WHERE is_active AND device_type = 'kiosk')   AS kiosks
       FROM attendance_terminals
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const r = rows[0] as Record<string, string>;
    return {
      total:   parseInt(r.total,   10),
      online:  parseInt(r.online,  10),
      offline: parseInt(r.offline, 10),
      byType: {
        laptops: parseInt(r.laptops, 10),
        tablets: parseInt(r.tablets, 10),
        mobiles: parseInt(r.mobiles, 10),
        kiosks:  parseInt(r.kiosks,  10),
      },
    };
  }

  async patch(tenantId: string, id: string, dto: TerminalPatchDto): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let p = 1;

    if (dto.deviceName !== undefined) {
      setClauses.push(`device_name = $${p++}`);
      params.push(dto.deviceName);
    }
    if (dto.isActive !== undefined) {
      setClauses.push(`is_active = $${p++}`);
      params.push(dto.isActive);
      if (!dto.isActive) setClauses.push('is_online = false');
    }
    if (dto.allowedIps !== undefined) {
      setClauses.push(`allowed_ips = $${p++}::jsonb`);
      params.push(JSON.stringify(dto.allowedIps));
    }
    if (dto.metadata !== undefined) {
      setClauses.push(`metadata = metadata || $${p++}::jsonb`);
      params.push(JSON.stringify(dto.metadata));
    }
    if ('expiresAt' in dto) {
      setClauses.push(`expires_at = $${p++}`);
      params.push(dto.expiresAt ?? null);
    }

    const { rows } = await this.db.query(
      `UPDATE attendance_terminals
       SET ${setClauses.join(', ')}
       WHERE id = $${p} AND tenant_id = $${p + 1}
       RETURNING id, tenant_id, branch_id, device_name, device_type,
                 allowed_ips, is_active, is_online,
                 last_ping_at, last_punch_at,
                 registered_by, expires_at, metadata,
                 created_at, updated_at`,
      [...params, id, tenantId],
    );

    if (!rows[0]) throw new NotFoundException(`Terminal ${id} not found`);
    return rows[0];
  }

  async deactivate(tenantId: string, id: string): Promise<void> {
    const { rowCount } = await this.db.query(
      `UPDATE attendance_terminals
       SET is_active = false, is_online = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    if (rowCount === 0) throw new NotFoundException(`Terminal ${id} not found`);

    this.logger.log(
      JSON.stringify({ event: 'terminal_deactivated', tenantId, terminalId: id }),
    );

    this._refreshTerminalGauges().catch(() => {});
  }

  // ── Stale terminal sweep ─────────────────────────────────────────────────────

  /**
   * Marks online terminals offline if last_ping_at has exceeded STALE_MINUTES.
   * Runs every 5 minutes via @Cron.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'terminal-stale-sweep' })
  async sweepStaleTerminals(): Promise<{ markedOffline: number }> {
    const { rows } = await this.db.query(
      `UPDATE attendance_terminals
       SET is_online = false, updated_at = NOW()
       WHERE is_online = true
         AND is_active = true
         AND (
           last_ping_at IS NULL
           OR last_ping_at < NOW() - ($1 * INTERVAL '1 minute')
         )
       RETURNING id`,
      [STALE_MINUTES],
    );

    const markedOffline = rows.length;
    if (markedOffline > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'terminals_marked_stale',
          markedOffline,
          staleMinutes: STALE_MINUTES,
        }),
      );
    }

    await this._refreshTerminalGauges();
    return { markedOffline };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _generateRawToken(): string {
    return `hms_tk_${randomBytes(32).toString('hex')}`;
  }

  private _hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Strip token_hash before returning terminal data to callers. */
  private _safe(row: Record<string, unknown>): Record<string, unknown> {
    const { token_hash: _h, ...safe } = row;
    return safe;
  }

  /**
   * Returns true if requestIp matches any entry in allowedIps.
   * Supports exact IPv4 match and CIDR notation.
   */
  private _ipAllowed(requestIp: string, allowedIps: string[]): boolean {
    for (const entry of allowedIps) {
      if (entry === requestIp) return true;
      if (entry.includes('/') && this._ipInCidr(requestIp, entry)) return true;
    }
    return false;
  }

  /** Minimal IPv4 CIDR check — no external dependencies. */
  private _ipInCidr(ip: string, cidr: string): boolean {
    try {
      const [range, bitsStr] = cidr.split('/');
      const bits = parseInt(bitsStr, 10);
      if (isNaN(bits) || bits < 0 || bits > 32) return false;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      const ipNum    = this._ipToUint32(ip);
      const rangeNum = this._ipToUint32(range);
      if (ipNum === null || rangeNum === null) return false;
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  private _ipToUint32(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  /**
   * Resets and re-sets hms_terminals_total with current counts grouped by
   * device_type × online/offline.  Queries all tenants intentionally —
   * operational dashboards need fleet-wide totals.
   * Never throws; safe to call fire-and-forget.
   */
  private async _refreshTerminalGauges(): Promise<void> {
    try {
      const { rows } = await this.db.query(
        `SELECT
           device_type,
           is_online,
           COUNT(*) AS count
         FROM attendance_terminals
         WHERE is_active = true
         GROUP BY device_type, is_online`,
      );

      this.metrics.terminalsTotal.reset();
      for (const row of rows as any[]) {
        this.metrics.terminalsTotal.set(
          {
            device_type: row.device_type as string,
            status: row.is_online ? 'online' : 'offline',
          },
          parseInt(row.count, 10),
        );
      }
    } catch {
      // Gauge staleness is acceptable
    }
  }
}
