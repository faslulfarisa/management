import { Controller, Get, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AdmsService } from './adms.service';

@ApiExcludeController()
@Controller('iclock')
export class AdmsController {
  constructor(private readonly admsService: AdmsService) {}

  @Get('cdata')
  async getCdata(@Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    try {
      const body = await this.admsService.handleRegistration(this.context(query, req));
      return this.sendText(res, HttpStatus.OK, body);
    } catch (error: any) {
      return this.sendText(res, this.statusCode(error), `${error?.message ?? 'ERROR'}\n`);
    }
  }

  @Get('getrequest')
  async getRequest(@Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    try {
      const body = await this.admsService.handleGetRequest(this.context(query, req));
      return this.sendText(res, HttpStatus.OK, body);
    } catch (error: any) {
      return this.sendText(res, this.statusCode(error), `${error?.message ?? 'ERROR'}\n`);
    }
  }

  @Post('devicecmd')
  async postDeviceCommand(@Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    try {
      const body = await this.admsService.handleDeviceCommand(this.context(query, req), this.rawBody(req));
      return this.sendText(res, HttpStatus.OK, body);
    } catch (error: any) {
      return this.sendText(res, this.statusCode(error), `${error?.message ?? 'ERROR'}\n`);
    }
  }

  @Post('cdata')
  async postCdata(@Query() query: Record<string, any>, @Req() req: Request, @Res() res: Response) {
    try {
      const body = await this.admsService.handleCdataUpload(
        this.context(query, req),
        query.table,
        this.rawBody(req),
      );
      return this.sendText(res, HttpStatus.OK, body);
    } catch (error: any) {
      return this.sendText(res, this.statusCode(error), `${error?.message ?? 'ERROR'}\n`);
    }
  }

  private context(query: Record<string, any>, req: Request) {
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

  private sendText(res: Response, status: number, body: string) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(status).send(body);
  }

  private statusCode(error: any): number {
    const status = typeof error?.getStatus === 'function' ? error.getStatus() : error?.status;
    return status && Number.isInteger(status) ? status : HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
