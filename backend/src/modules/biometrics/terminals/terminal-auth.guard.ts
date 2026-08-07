/**
 * terminal-auth.guard.ts
 *
 * Validates X-Terminal-Token on requests from trusted attendance terminals.
 *
 * On success:
 *   - Attaches the terminal row to req.terminal
 *   - Sets req.user = { tenantId, terminalId, isTerminal: true }
 *     so downstream services can read tenantId via the same convention
 *     used everywhere in the codebase.
 *
 * On failure: throws 401 (missing / invalid token) or 403 (deactivated /
 * expired / IP not allowed) — both sourced from AttendanceTerminalService.
 * Every failure is also counted in hms_terminal_auth_failures_total.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AttendanceTerminalService } from './attendance-terminal.service';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';

@Injectable()
export class TerminalAuthGuard implements CanActivate {
  constructor(
    private readonly terminalService: AttendanceTerminalService,
    private readonly metrics: BiometricsMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawToken: string | undefined = request.headers['x-terminal-token'];

    if (!rawToken) {
      this.metrics.terminalAuthFailuresTotal.inc({ reason: 'missing_token' });
      throw new UnauthorizedException('X-Terminal-Token header is required');
    }

    const requestIp = this._extractIp(request);

    let terminal: Record<string, unknown>;
    try {
      terminal = await this.terminalService.validateToken(rawToken, requestIp);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      const reason =
        err?.status === 403
          ? msg.includes('expired')     ? 'token_expired'
          : msg.includes('deactivated') ? 'deactivated'
          :                               'ip_rejected'
          : 'invalid_token';
      this.metrics.terminalAuthFailuresTotal.inc({ reason });
      throw err;
    }

    request.terminal = terminal;
    request.user = {
      tenantId:   terminal['tenant_id'] as string,
      terminalId: terminal['id'] as string,
      isTerminal: true,
    };

    return true;
  }

  /**
   * Extracts the real client IP.
   * Prefers X-Forwarded-For (reverse-proxy environments), then X-Real-Ip,
   * then falls back to the raw socket address.
   */
  private _extractIp(request: any): string {
    return (
      (request.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      (request.headers['x-real-ip'] as string | undefined) ??
      request.connection?.remoteAddress ??
      request.socket?.remoteAddress ??
      '0.0.0.0'
    );
  }
}
