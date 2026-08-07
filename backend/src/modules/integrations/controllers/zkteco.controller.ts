/**
 * zkteco.controller.ts
 *
 * ZKTeco ADMS protocol endpoints + backward-compatible REST punch endpoint.
 *
 * ADMS endpoints are ZKTeco proprietary protocol — they must stay at these
 * exact paths and return exact plain-text responses.
 *
 * The JSON /punch endpoint is preserved for backward compatibility;
 * new integrations should use POST /api/biometrics/punch instead.
 */

import {
  Controller, Get, Post, Body, Query, Req, Res, UseGuards, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ZktecoService } from '../services/zkteco.service';
import { AttendanceEngineService } from '../../biometrics/engine/attendance-engine.service';

@ApiTags('Integrations')
@Controller('integrations/zkteco')
export class ZktecoController {
  constructor(
    private readonly zktecoService: ZktecoService,
    private readonly attendanceEngine: AttendanceEngineService,
  ) {}

  // ── ADMS: Handshake / Option Initializer ───────────────────────────────────

  /**
   * GET /integrations/zkteco/iclock/cdata?SN=xxxxx
   * ZKTeco ADMS Device Handshake — returns server config options to device.
   */
  @Get('iclock/cdata')
  @ApiOperation({ summary: 'ZKTeco ADMS Device Handshake' })
  async getAdmsCdata(
    @Query('SN') sn: string,
    @Res() res: Response,
  ) {
    if (!sn) {
      return res.status(HttpStatus.BAD_REQUEST).send('BAD REQUEST: SN is required');
    }

    const integration = await this.zktecoService.getZktecoIntegrationBySn(sn);
    if (!integration) {
      return res.status(HttpStatus.UNAUTHORIZED).send('UNAUTHORIZED: SN not registered or inactive');
    }

    const responseText =
      `RegistryCode=${integration.id}\n` +
      `ServerVersion=3.1.1\n` +
      `ServerName=Ai-HRMS-Cloud-Biometrics\n` +
      `Stamp=10001\n` +
      `OpStamp=10001\n` +
      `ErrorDelay=60\n` +
      `Delay=30\n` +
      `TransInterval=10\n` +
      `TransFlag=1111111111\n` +
      `Realtime=1\n` +
      `Encrypt=0\n` +
      `OK\n`;

    res.setHeader('Content-Type', 'text/plain');
    return res.status(HttpStatus.OK).send(responseText);
  }

  // ── ADMS: Attendance Log Upload ─────────────────────────────────────────────

  /**
   * POST /integrations/zkteco/iclock/cdata?SN=xxxxx&table=ATTLOG
   * ZKTeco ADMS Attendance Log Push — device uploads punch records.
   */
  @Post('iclock/cdata')
  @ApiOperation({ summary: 'ZKTeco ADMS Attendance Logs Push Receiver' })
  async postAdmsCdata(
    @Query('SN') sn: string,
    @Query('table') table: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!sn) {
      return res.status(HttpStatus.BAD_REQUEST).send('BAD REQUEST: SN is required');
    }

    const integration = await this.zktecoService.getZktecoIntegrationBySn(sn);
    if (!integration) {
      return res.status(HttpStatus.UNAUTHORIZED).send('UNAUTHORIZED: SN not registered');
    }

    // Read raw body
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else {
      const buffers: Buffer[] = [];
      for await (const chunk of req as any) buffers.push(chunk);
      rawBody = Buffer.concat(buffers).toString('utf8');
    }

    if (table === 'ATTLOG' || !table) {
      // 1. Parse ADMS text → PunchEventDto[]
      const events = this.zktecoService.parseAdmsPunchText(sn, rawBody);

      // 2. Process through vendor-agnostic engine
      const result = await this.attendanceEngine.processPunchEvents(
        integration.tenant_id,
        integration.id,
        events,
      );

      res.setHeader('Content-Type', 'text/plain');
      return res.status(HttpStatus.OK).send(`OK: ${result.synced}\n`);
    }

    res.setHeader('Content-Type', 'text/plain');
    return res.status(HttpStatus.OK).send('OK\n');
  }

  // ── ADMS: Command Queue Poller ─────────────────────────────────────────────

  /**
   * GET /integrations/zkteco/iclock/getrequest?SN=xxxxx
   * Device polls for pending commands (e.g. user enrollment updates).
   * Currently returns empty OK — no outbound command queue implemented.
   */
  @Get('iclock/getrequest')
  @ApiOperation({ summary: 'ZKTeco ADMS Command Queue' })
  async getAdmsRequest(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(HttpStatus.OK).send('OK\n');
  }

  // ── ADMS: Device Command Feedback ──────────────────────────────────────────

  /**
   * POST /integrations/zkteco/iclock/devicecmd?SN=xxxxx
   * Device reports result of an executed command.
   */
  @Post('iclock/devicecmd')
  @ApiOperation({ summary: 'ZKTeco ADMS Device Command Feedback' })
  async postAdmsDevicecmd(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(HttpStatus.OK).send('OK\n');
  }

  // ── REST JSON Sync ─────────────────────────────────────────────────────────

  /**
   * POST /api/integrations/zkteco/punch
   *
   * Backward-compatible REST endpoint for pushing ZKTeco punches via JSON.
   * New integrations should use POST /api/biometrics/punch with provider='zkteco'.
   *
   * @deprecated Use POST /api/biometrics/punch instead
   */
  @Post('punch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Push ZKTeco punches via JSON (use /biometrics/punch for new integrations)' })
  async pushPunches(
    @Req() req: any,
    @Body() body: { deviceSn: string; punches: Array<{ employeeCode: string; timestamp: string }> },
  ) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;

    if (!body.deviceSn || !body.punches || !Array.isArray(body.punches)) {
      return { success: false, data: null, error: 'deviceSn and punches array are required' };
    }

    const integration = await this.zktecoService.getZktecoIntegration(tenantId, body.deviceSn);
    if (!integration) {
      return {
        success: false,
        data: null,
        error: `No active ZKTeco integration found for SN: ${body.deviceSn}`,
      };
    }

    // 1. Parse JSON → PunchEventDto[]
    const events = this.zktecoService.parseJsonPunches(body.deviceSn, body.punches);

    // 2. Engine processes
    const result = await this.attendanceEngine.processPunchEvents(
      tenantId,
      integration.id,
      events,
    );

    return { success: result.failed === 0, data: result, error: null };
  }
}
