/**
 * ZKTeco ADMS protocol endpoints + backward-compatible REST punch endpoint.
 *
 * ADMS endpoints must keep their plain-text protocol responses. The legacy
 * /integrations/zkteco/iclock/* paths delegate to the hardened root ADMS
 * lifecycle service so both deployment styles enforce the same device checks.
 */

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdmsService } from '../../biometrics/adms/adms.service';
import { PunchIngestionService } from '../../biometrics/services/punch-ingestion.service';
import { ZktecoService } from '../services/zkteco.service';

@ApiTags('Integrations')
@Controller('integrations/zkteco')
export class ZktecoController {
  constructor(
    private readonly zktecoService: ZktecoService,
    private readonly punchIngestion: PunchIngestionService,
    private readonly admsService: AdmsService,
  ) {}

  @Get('iclock/cdata')
  @ApiOperation({ summary: 'ZKTeco ADMS Device Handshake' })
  async getAdmsCdata(
    @Query() query: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.sendAdms(res, this.admsService.handleRegistration(this.admsContext(query, req)));
  }

  @Post('iclock/cdata')
  @ApiOperation({ summary: 'ZKTeco ADMS Attendance Logs Push Receiver' })
  async postAdmsCdata(
    @Query() query: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.sendAdms(
      res,
      this.admsService.handleCdataUpload(this.admsContext(query, req), query.table, this.rawBody(req)),
    );
  }

  @Get('iclock/getrequest')
  @ApiOperation({ summary: 'ZKTeco ADMS Command Queue' })
  async getAdmsRequest(
    @Query() query: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.sendAdms(res, this.admsService.handleGetRequest(this.admsContext(query, req)));
  }

  @Post('iclock/devicecmd')
  @ApiOperation({ summary: 'ZKTeco ADMS Device Command Feedback' })
  async postAdmsDevicecmd(
    @Query() query: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.sendAdms(
      res,
      this.admsService.handleDeviceCommand(this.admsContext(query, req), this.rawBody(req)),
    );
  }

  /**
   * Backward-compatible REST endpoint for pushing ZKTeco punches via JSON.
   *
   * @deprecated Use POST /api/biometrics/punch instead.
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

    const events = this.zktecoService.parseJsonPunches(body.deviceSn, body.punches);

    const result = await this.punchIngestion.submit({
      tenantId,
      integrationId: integration.id,
      providerName: 'zkteco',
      events,
    });

    return { success: true, data: result, error: null };
  }

  private admsContext(query: Record<string, any>, req: Request) {
    return {
      sn: String(query.SN ?? query.sn ?? ''),
      query,
      sourceIp: this.remoteIp(req),
      remoteIp: this.remoteIp(req),
      forwardedFor: this.forwardedFor(req),
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  private rawBody(req: Request): string {
    const body = req.body;
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    if (body && typeof body === 'object') return new URLSearchParams(body as Record<string, string>).toString();
    const rawBody = (req as any).rawBody;
    return Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '';
  }

  private remoteIp(req: Request): string | undefined {
    return (req.ip ?? req.socket?.remoteAddress)?.replace(/^::ffff:/, '');
  }

  private forwardedFor(req: Request): string[] {
    const forwarded = req.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return value
      ? value.split(',').map((ip) => ip.trim()).filter(Boolean)
      : [];
  }

  private async sendAdms(res: Response, responsePromise: Promise<string>) {
    try {
      const body = await responsePromise;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(HttpStatus.OK).send(body);
    } catch (error: any) {
      const status = typeof error?.getStatus === 'function' ? error.getStatus() : error?.status;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(status && Number.isInteger(status) ? status : HttpStatus.INTERNAL_SERVER_ERROR)
        .send(`${error?.message ?? 'ERROR'}\n`);
    }
  }
}
