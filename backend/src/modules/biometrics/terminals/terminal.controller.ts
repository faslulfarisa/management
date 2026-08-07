/**
 * terminal.controller.ts
 *
 * Terminal-authenticated endpoints — guarded exclusively by TerminalAuthGuard
 * (X-Terminal-Token), not by the JWT/API-key guard on BiometricsController.
 *
 * POST /api/biometrics/terminals/punch  — clock-in / clock-out from a terminal
 * POST /api/biometrics/terminals/ping   — heartbeat / health check
 *
 * These routes live here (not in BiometricsController) so that the class-level
 * ApiKeyOrJwtGuard on BiometricsController does not compose with TerminalAuthGuard.
 * NestJS guards at class + method level are additive, so a separate controller
 * is the correct isolation boundary.
 */

import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Body,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { TerminalAuthGuard } from './terminal-auth.guard';
import { TerminalPunchService, TerminalPunchBody } from './terminal-punch.service';
import { AttendanceTerminalService } from './attendance-terminal.service';

@ApiTags('Terminals')
@ApiSecurity('x-terminal-token')
@UseGuards(TerminalAuthGuard)
@Controller('biometrics/terminals')
export class TerminalController {
  constructor(
    private readonly punchService: TerminalPunchService,
    private readonly terminalService: AttendanceTerminalService,
  ) {}

  /**
   * POST /api/biometrics/terminals/punch
   *
   * Submit a clock-in or clock-out event from a trusted terminal.
   * Rate-limited to 300 requests / minute per terminal IP to absorb burst
   * kiosk traffic while preventing abuse.
   *
   * Body fields:
   *   employeeCode     (required) — must match employees.employee_code
   *   timestamp        (required) — UTC ISO-8601
   *   punchType        (optional) — 'IN' | 'OUT'; defaults to UNKNOWN
   *   verifyMethod     (optional) — fingerprint | face | card | password | other
   *   nonce            (optional) — replay-protection nonce (pair with requestTimestamp)
   *   requestTimestamp (optional) — ISO-8601; validated within ±5 min of server time
   *   metadata         (optional) — arbitrary context stored in rawPayload
   */
  @Post('punch')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a clock-in / clock-out from a trusted terminal' })
  async punch(@Req() req: any, @Body() body: TerminalPunchBody) {
    const terminal = req.terminal as Record<string, unknown>;
    const result = await this.punchService.enqueuePunch(
      terminal,
      body,
      req.correlationId as string | undefined,
      req.terminalRawToken as string | undefined,
      req,
    );
    return { success: true, data: result, error: null };
  }

  /**
   * POST /api/biometrics/terminals/ping
   *
   * Heartbeat endpoint for terminal health monitoring.
   * Records last_ping_at and marks the terminal online.
   * Terminals should call this every 30–60 seconds.
   * Rate-limited to 120 pings / minute — twice per second at most.
   */
  @Post('ping')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Terminal heartbeat — marks terminal online and updates last_ping_at' })
  async ping(@Req() req: any) {
    const terminal = req.terminal as Record<string, unknown>;
    const terminalId = terminal['id'] as string;

    await this.terminalService.recordPing(terminalId);

    return {
      success: true,
      data: {
        terminalId,
        deviceName: terminal['device_name'],
        serverTime: new Date().toISOString(),
      },
      error: null,
    };
  }
}
