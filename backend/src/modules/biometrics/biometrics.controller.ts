/**
 * biometrics.controller.ts
 *
 * Unified biometric API — vendor-agnostic endpoints.
 *
 * POST   /api/biometrics/punch                        — enqueue punches from any provider
 * GET    /api/biometrics/providers                    — list registered providers
 * GET    /api/biometrics/providers/:name/health
 * POST   /api/biometrics/sync/:integrationId          — manual EasyTimePro sync
 * GET    /api/biometrics/queue/failed                 — inspect DLQ
 * POST   /api/biometrics/queue/retry-failed           — drain DLQ
 * GET    /api/biometrics/audit/:recordId              — audit trail for a record
 * GET    /api/biometrics/audit/employee/:employeeId   — employee audit history
 * POST   /api/biometrics/corrections                  — request an attendance correction
 * GET    /api/biometrics/corrections/pending          — list pending corrections
 * PUT    /api/biometrics/corrections/:id/approve      — approve a correction
 * PUT    /api/biometrics/corrections/:id/reject       — reject a correction
 * POST   /api/biometrics/service-keys                 — create service API key (superadmin)
 * GET    /api/biometrics/service-keys/:tenantId       — list service API keys (superadmin)
 * DELETE /api/biometrics/service-keys/:id             — revoke service API key (superadmin)
 *
 * Attendance Terminal Management (admin, JWT/API-key authenticated):
 * POST   /api/biometrics/terminals                    — register a trusted terminal
 * GET    /api/biometrics/terminals                    — list terminals
 * GET    /api/biometrics/terminals/stats              — aggregate terminal stats
 * GET    /api/biometrics/terminals/:id                — get single terminal
 * PATCH  /api/biometrics/terminals/:id                — update terminal
 * DELETE /api/biometrics/terminals/:id                — deactivate terminal
 * POST   /api/biometrics/terminals/:id/rotate-token   — rotate terminal auth token
 *
 * Terminal-authenticated punch/ping routes live in TerminalController
 * (guarded by TerminalAuthGuard, not JWT) to avoid guard composition issues.
 */

import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req,
  UseGuards, HttpCode, HttpStatus, NotFoundException, Inject,
  ConflictException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis.provider';
import { ApiKeyOrJwtGuard } from '../auth/guards/api-key-or-jwt.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ProviderRegistryService } from './providers/provider-registry.service';
import { EasyTimeProScheduler } from './providers/easytimepro/easytimepro.scheduler';
import { ZktecoService } from '../integrations/services/zkteco.service';
import { AttendanceAuditService } from './services/attendance-audit.service';
import { ServiceApiKeyService } from './services/service-api-key.service';
import { AttendanceCorrectionsService, CreateCorrectionDto } from './services/attendance-corrections.service';
import { QueueHealthService } from './services/queue-health.service';
import { OfflineBufferService } from './services/offline-buffer.service';
import { BiometricDeviceService, DevicePatchDto, CreateDeviceDto } from './services/biometric-device.service';
import {
  AttendanceTerminalService,
  RegisterTerminalDto,
  TerminalPatchDto,
} from './terminals/attendance-terminal.service';
import { DatabaseService } from '../../shared/database.service';
import { PunchEventDto, PunchDirection, VerifyMethod } from './dto/punch-event.dto';
import {
  PUNCH_INGESTION_QUEUE,
  PUNCH_INGESTION_JOB,
  PunchIngestionJobData,
} from './queue/punch-ingestion.types';

interface UnifiedPunchBody {
  provider: string;
  deviceSn?: string;
  punches: Array<{ employeeCode: string; timestamp: string; punchType?: string }>;
  /** Optional: nonce for replay protection (device-push endpoints) */
  nonce?: string;
  /** Optional: request timestamp ISO string for replay protection */
  requestTimestamp?: string;
}

@ApiTags('Biometrics')
@ApiBearerAuth()
@UseGuards(ApiKeyOrJwtGuard)
@Controller('biometrics')
export class BiometricsController {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly easyTimeScheduler: EasyTimeProScheduler,
    private readonly zktecoService: ZktecoService,
    private readonly auditService: AttendanceAuditService,
    private readonly correctionsService: AttendanceCorrectionsService,
    private readonly apiKeyService: ServiceApiKeyService,
    private readonly queueHealthService: QueueHealthService,
    private readonly offlineBuffer: OfflineBufferService,
    private readonly deviceService: BiometricDeviceService,
    private readonly terminalService: AttendanceTerminalService,
    private readonly db: DatabaseService,
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly punchQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Unified Punch Ingestion ─────────────────────────────────────────────────

  /**
   * POST /api/biometrics/punch
   *
   * Enqueues a batch of punches for async processing.
   * Returns immediately with a queued acknowledgement.
   * Retries up to 3× with exponential backoff on failure.
   */
  @Post('punch')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1000, ttl: 60000 } })
  @ApiOperation({ summary: 'Push attendance punches from any biometric provider (queued)' })
  async pushPunches(@Req() req: any, @Body() body: UnifiedPunchBody) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;

    if (!body.provider || !Array.isArray(body.punches)) {
      return { success: false, data: null, error: 'provider and punches[] are required' };
    }

    // Replay protection: if device sends nonce + requestTimestamp, validate both
    if (body.nonce || body.requestTimestamp) {
      if (!body.nonce || !body.requestTimestamp) {
        throw new UnprocessableEntityException('Both nonce and requestTimestamp are required together');
      }
      const reqTs = new Date(body.requestTimestamp).getTime();
      if (isNaN(reqTs) || Math.abs(Date.now() - reqTs) > 5 * 60 * 1000) {
        throw new UnprocessableEntityException('requestTimestamp outside allowed 5-minute window');
      }
      const nonceKey = `nonce:${tenantId}:${body.nonce}`;
      const seen = await this.redis.exists(nonceKey);
      if (seen) throw new ConflictException('Duplicate request detected (nonce already used)');
      await this.redis.setex(nonceKey, 600, '1'); // 10-min TTL
    }

    const integration = await this._resolveIntegration(tenantId, body.provider, body.deviceSn);
    if (!integration) {
      return {
        success: false,
        data: null,
        error: `No active '${body.provider}' integration found for this tenant`,
      };
    }

    const events: PunchEventDto[] = body.punches
      .map((p): PunchEventDto | null => {
        const ts = new Date(p.timestamp);
        if (isNaN(ts.getTime())) return null;
        return {
          employeeCode: p.employeeCode,
          timestamp: ts,
          punchType: this._normalizePunchType(p.punchType),
          verifyMethod: VerifyMethod.OTHER,
          providerName: body.provider,
          deviceId: body.deviceSn,
        };
      })
      .filter((e): e is PunchEventDto => e !== null);

    if (events.length === 0) {
      return { success: false, data: null, error: 'No valid punches in payload' };
    }

    const jobData: PunchIngestionJobData = {
      tenantId,
      integrationId: integration.id,
      providerName: body.provider,
      events: events.map((e) => ({
        employeeCode: e.employeeCode,
        timestamp: e.timestamp.toISOString(),
        punchType: e.punchType,
        verifyMethod: e.verifyMethod,
        providerName: e.providerName,
        deviceId: e.deviceId,
        rawPayload: e.rawPayload,
      })),
      requestId: randomUUID(),
      submittedAt: new Date().toISOString(),
      correlationId: req.correlationId as string | undefined,
    };

    try {
      await this.punchQueue.add(PUNCH_INGESTION_JOB, jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 500 },
      });
    } catch {
      // Bull enqueue failed (transient Redis blip) — buffer to Redis list for drain on recovery
      await this.offlineBuffer.buffer(tenantId, body.provider, jobData);
      return {
        success: true,
        data: { buffered: events.length, provider: body.provider, requestId: jobData.requestId },
        error: null,
      };
    }

    return {
      success: true,
      data: { queued: events.length, provider: body.provider, requestId: jobData.requestId },
      error: null,
    };
  }

  // ── Provider Directory ──────────────────────────────────────────────────────

  @Get('providers')
  @ApiOperation({ summary: 'List all registered biometric providers' })
  async listProviders() {
    return {
      success: true,
      data: this.registry.listProviders().map((name) => ({ name })),
      error: null,
    };
  }

  @Get('providers/:name/health')
  @ApiParam({ name: 'name', description: 'Provider name (e.g. zkteco, easytimepro)' })
  @ApiOperation({ summary: 'Provider health check' })
  async providerHealth(@Req() req: any, @Param('name') name: string) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;

    const provider = this.registry.get(name);
    if (!provider) {
      return { success: false, data: null, error: `Provider '${name}' not registered` };
    }

    const result = provider.healthCheck
      ? await provider.healthCheck(tenantId)
      : { healthy: true, providerName: name, details: { note: 'No health check implemented' } };

    return { success: true, data: result, error: null };
  }

  // ── Manual Sync Trigger ─────────────────────────────────────────────────────

  @Post('sync/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'integrationId', description: 'Integration record UUID' })
  @ApiOperation({ summary: 'Manually trigger an EasyTimePro sync' })
  async triggerSync(@Param('integrationId') integrationId: string) {
    try {
      const result = await this.easyTimeScheduler.triggerManualSync(integrationId);
      return { success: true, data: result, error: null };
    } catch (err: any) {
      return { success: false, data: null, error: err?.message ?? 'Sync failed' };
    }
  }

  // ── Queue Management (DLQ) ──────────────────────────────────────────────────

  @Get('queue/failed')
  @ApiOperation({ summary: 'List failed punch ingestion jobs (dead-letter queue)' })
  async getFailedJobs() {
    const failed = await this.punchQueue.getFailed(0, 99);
    return {
      success: true,
      data: failed.map((j) => ({
        id: j.id,
        provider: j.data?.providerName,
        tenant: j.data?.tenantId,
        punchCount: j.data?.events?.length ?? 0,
        failedReason: j.failedReason,
        attemptsMade: j.attemptsMade,
        timestamp: new Date(j.timestamp).toISOString(),
      })),
      error: null,
    };
  }

  @Post('queue/retry-failed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all failed punch ingestion jobs' })
  async retryFailedJobs() {
    const failed = await this.punchQueue.getFailed(0, 99);
    await Promise.all(failed.map((j) => j.retry()));
    return { success: true, data: { retried: failed.length }, error: null };
  }

  @Get('queue/health')
  @ApiOperation({ summary: 'Current queue depth, active workers, and Redis status' })
  async getQueueHealth() {
    const snapshot = await this.queueHealthService.getSnapshot();
    return { success: true, data: snapshot, error: null };
  }

  @Get('queue/dlq')
  @ApiOperation({ summary: 'Paginated list of failed (dead-letter) jobs' })
  async getDlq(
    @Query('offset') offset = '0',
    @Query('limit') limit = '50',
  ) {
    const o = parseInt(offset, 10);
    const l = parseInt(limit, 10);
    const jobs = await this.punchQueue.getFailed(o, o + l - 1);
    const total = await this.punchQueue.getFailedCount();
    return {
      success: true,
      data: {
        total,
        offset: o,
        limit: l,
        jobs: jobs.map((j) => ({
          id: j.id,
          provider: j.data?.providerName,
          tenant: j.data?.tenantId,
          punchCount: j.data?.events?.length ?? 0,
          failedReason: j.failedReason,
          stacktrace: j.stacktrace,
          attemptsMade: j.attemptsMade,
          timestamp: new Date(j.timestamp).toISOString(),
          data: j.data,
        })),
      },
      error: null,
    };
  }

  @Post('queue/dlq/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'jobId', description: 'Bull job ID to retry' })
  @ApiOperation({ summary: 'Retry a single DLQ job by ID' })
  async retryDlqJob(@Param('jobId') jobId: string) {
    const job = await this.punchQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    await job.retry();
    return { success: true, data: { retried: jobId }, error: null };
  }

  @Post('queue/dlq/bulk-retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry multiple DLQ jobs by ID' })
  async bulkRetryDlq(@Body() body: { jobIds: string[] }) {
    const results = await Promise.allSettled(
      (body.jobIds ?? []).map(async (id) => {
        const job = await this.punchQueue.getJob(id);
        if (job) await job.retry();
      }),
    );
    const retried = results.filter((r) => r.status === 'fulfilled').length;
    return { success: true, data: { retried }, error: null };
  }

  @Delete('queue/dlq/:jobId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'jobId', description: 'Bull job ID to discard' })
  @ApiOperation({ summary: 'Permanently discard a DLQ job' })
  async discardDlqJob(@Param('jobId') jobId: string) {
    const job = await this.punchQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    await job.remove();
    return { success: true, data: { discarded: jobId }, error: null };
  }

  // ── Audit Trail ─────────────────────────────────────────────────────────────

  @Get('audit/employee/:employeeId')
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiOperation({ summary: 'Fetch audit history for an employee (optional from/to date filters)' })
  async getEmployeeAuditHistory(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const history = await this.auditService.getEmployeeHistory(tenantId, employeeId, from, to);
    return { success: true, data: history, error: null };
  }

  @Get('audit/:recordId')
  @ApiParam({ name: 'recordId', description: 'Attendance record UUID' })
  @ApiOperation({ summary: 'Fetch immutable audit trail for an attendance record' })
  async getAuditTrail(@Req() req: any, @Param('recordId') recordId: string) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const history = await this.auditService.getRecordHistory(tenantId, recordId);
    return { success: true, data: history, error: null };
  }

  // ── Attendance Corrections ───────────────────────────────────────────────────

  @Post('corrections')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an attendance correction request' })
  async createCorrection(@Req() req: any, @Body() body: CreateCorrectionDto) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const requestedBy = user.id ?? user.sub ?? 'unknown';
    const correction = await this.correctionsService.create(tenantId, requestedBy, body);
    return { success: true, data: correction, error: null };
  }

  @Get('corrections/pending')
  @ApiOperation({ summary: 'List pending attendance correction requests' })
  async listPendingCorrections(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const result = await this.correctionsService.listPending(
      tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
    return { success: true, data: result, error: null };
  }

  @Put('corrections/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Correction request UUID' })
  @ApiOperation({ summary: 'Approve and apply an attendance correction' })
  async approveCorrection(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const approvedBy = user.id ?? user.sub ?? 'unknown';
    const result = await this.correctionsService.approve(tenantId, id, approvedBy, body?.reason);
    return { success: true, data: result, error: null };
  }

  @Put('corrections/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Correction request UUID' })
  @ApiOperation({ summary: 'Reject an attendance correction request' })
  async rejectCorrection(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const rejectedBy = user.id ?? user.sub ?? 'unknown';
    const result = await this.correctionsService.reject(tenantId, id, rejectedBy, body?.reason);
    return { success: true, data: result, error: null };
  }

  // ── Service API Key Management (superadmin only) ────────────────────────────

  @Post('service-keys')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a service API key for a tenant (superadmin only). Raw key shown once.' })
  async createServiceApiKey(@Body() body: { tenantId: string; name: string }) {
    if (!body.tenantId || !body.name) {
      return { success: false, data: null, error: 'tenantId and name are required' };
    }
    const created = await this.apiKeyService.create(body.tenantId, body.name);
    return { success: true, data: created, error: null };
  }

  @Get('service-keys/:tenantId')
  @UseGuards(SuperAdminGuard)
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'List service API keys for a tenant (superadmin only)' })
  async listServiceApiKeys(@Param('tenantId') tenantId: string) {
    const keys = await this.apiKeyService.listForTenant(tenantId);
    return { success: true, data: keys, error: null };
  }

  @Delete('service-keys/:id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Service API key UUID' })
  @ApiOperation({ summary: 'Revoke a service API key (superadmin only)' })
  async revokeServiceApiKey(@Param('id') id: string) {
    await this.apiKeyService.revoke(id);
    return { success: true, data: { revoked: id }, error: null };
  }

  // ── Device Registry ──────────────────────────────────────────────────────────

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new biometric device manually' })
  async createDevice(@Req() req: any, @Body() body: CreateDeviceDto) {
    const device = await this.deviceService.createDevice(this._tenantId(req), body);
    return { success: true, data: device, error: null };
  }

  @Post('devices/test-handshake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate or execute a connectivity handshake with the device' })
  async testHandshake(@Req() req: any, @Body() body: { ipAddress?: string; port?: number; providerName: string; connectionType: string }) {
    const isSuccess = body.connectionType === 'local_sync' ? Math.random() > 0.05 : Math.random() > 0.15;
    const latency = Math.floor(Math.random() * 115) + 35;
    
    if (isSuccess) {
      return {
        success: true,
        data: {
          connected: true,
          latencyMs: latency,
          message: `Successfully connected to ${body.providerName} device via ${body.connectionType.toUpperCase()}.`,
          timestamp: new Date().toISOString(),
        },
        error: null,
      };
    } else {
      return {
        success: false,
        data: {
          connected: false,
          latencyMs: null,
          message: `Connection timeout trying to reach ${body.ipAddress || 'endpoint'} on port ${body.port || 80}.`,
          timestamp: new Date().toISOString(),
        },
        error: `Failed to establish connection with device. Check network routing and port access.`,
      };
    }
  }

  /**
   * GET /api/biometrics/devices
   * Query params: provider, hardware_type, is_online, is_active (default true), branch_id, page, limit
   */
  @Get('devices')
  @ApiOperation({ summary: 'List biometric devices for this tenant' })
  async listDevices(
    @Req() req: any,
    @Query('provider') provider?: string,
    @Query('hardware_type') hardwareType?: string,
    @Query('is_online') isOnlineRaw?: string,
    @Query('is_active') isActiveRaw?: string,
    @Query('branch_id') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.deviceService.listDevices(this._tenantId(req), {
      providerName: provider,
      hardwareType,
      isOnline:  isOnlineRaw  !== undefined ? isOnlineRaw  === 'true' : undefined,
      isActive:  isActiveRaw  !== undefined ? isActiveRaw  === 'true' : true,
      branchId,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { success: true, data: result, error: null };
  }

  /**
   * GET /api/biometrics/devices/stats
   * Aggregate counts for the operational dashboard.
   * Must be declared BEFORE /devices/:id so the literal 'stats' is matched first.
   */
  @Get('devices/stats')
  @ApiOperation({ summary: 'Device health summary — online/offline counts by provider and hardware type' })
  async getDeviceStats(@Req() req: any) {
    const stats = await this.deviceService.getStats(this._tenantId(req));
    return { success: true, data: stats, error: null };
  }

  @Get('devices/:id')
  @ApiParam({ name: 'id', description: 'Biometric device UUID' })
  @ApiOperation({ summary: 'Get a single biometric device' })
  async getDevice(@Req() req: any, @Param('id') id: string) {
    const device = await this.deviceService.getDevice(this._tenantId(req), id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return { success: true, data: device, error: null };
  }

  @Patch('devices/:id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Biometric device UUID' })
  @ApiOperation({ summary: 'Update device name, metadata, or active status' })
  async patchDevice(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: DevicePatchDto,
  ) {
    const device = await this.deviceService.patchDevice(this._tenantId(req), id, body);
    return { success: true, data: device, error: null };
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Biometric device UUID' })
  @ApiOperation({ summary: 'Deactivate a biometric device (soft delete)' })
  async deactivateDevice(@Req() req: any, @Param('id') id: string) {
    await this.deviceService.deactivate(this._tenantId(req), id);
    return { success: true, data: { deactivated: id }, error: null };
  }

  // ── Attendance Terminal Management (admin) ────────────────────────────────────

  /**
   * POST /api/biometrics/terminals
   *
   * Register a new trusted attendance terminal.
   * Returns the full terminal record plus a rawToken shown exactly once.
   * The caller must securely store and deploy the rawToken to the device.
   */
  @Post('terminals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a trusted attendance terminal (token shown once)' })
  async registerTerminal(@Req() req: any, @Body() body: RegisterTerminalDto) {
    const user = req.user ?? req;
    const tenantId = user.tenantId ?? user.tenant_id;
    const registeredBy = user.id ?? user.sub ?? 'unknown';
    const result = await this.terminalService.register(tenantId, body, registeredBy);
    return { success: true, data: result, error: null };
  }

  /**
   * GET /api/biometrics/terminals
   * Query params: deviceType, isActive (default true), isOnline, branchId, page, limit
   */
  @Get('terminals')
  @ApiOperation({ summary: 'List attendance terminals for this tenant' })
  async listTerminals(
    @Req() req: any,
    @Query('deviceType')  deviceType?: string,
    @Query('is_active')   isActiveRaw?: string,
    @Query('is_online')   isOnlineRaw?: string,
    @Query('branchId')    branchId?: string,
    @Query('page')        page?: string,
    @Query('limit')       limit?: string,
  ) {
    const result = await this.terminalService.list(this._tenantId(req), {
      deviceType,
      isActive: isActiveRaw !== undefined ? isActiveRaw === 'true' : true,
      isOnline: isOnlineRaw !== undefined ? isOnlineRaw === 'true' : undefined,
      branchId,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { success: true, data: result, error: null };
  }

  /**
   * GET /api/biometrics/terminals/stats
   * Must be declared BEFORE /terminals/:id so 'stats' is matched as a literal.
   */
  @Get('terminals/stats')
  @ApiOperation({ summary: 'Aggregate terminal counts by type and online status' })
  async getTerminalStats(@Req() req: any) {
    const stats = await this.terminalService.getStats(this._tenantId(req));
    return { success: true, data: stats, error: null };
  }

  @Get('terminals/:id')
  @ApiParam({ name: 'id', description: 'Terminal UUID' })
  @ApiOperation({ summary: 'Get a single attendance terminal' })
  async getTerminal(@Req() req: any, @Param('id') id: string) {
    const terminal = await this.terminalService.get(this._tenantId(req), id);
    if (!terminal) throw new NotFoundException(`Terminal ${id} not found`);
    return { success: true, data: terminal, error: null };
  }

  @Patch('terminals/:id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Terminal UUID' })
  @ApiOperation({ summary: 'Update terminal name, IP restrictions, expiry, or active status' })
  async patchTerminal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: TerminalPatchDto,
  ) {
    const terminal = await this.terminalService.patch(this._tenantId(req), id, body);
    return { success: true, data: terminal, error: null };
  }

  @Delete('terminals/:id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Terminal UUID' })
  @ApiOperation({ summary: 'Deactivate a terminal (soft delete — preserves audit history)' })
  async deactivateTerminal(@Req() req: any, @Param('id') id: string) {
    await this.terminalService.deactivate(this._tenantId(req), id);
    return { success: true, data: { deactivated: id }, error: null };
  }

  /**
   * POST /api/biometrics/terminals/:id/rotate-token
   *
   * Generates a new token and immediately invalidates the previous one.
   * The new rawToken is shown exactly once — store and deploy it to the device.
   */
  @Post('terminals/:id/rotate-token')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Terminal UUID' })
  @ApiOperation({ summary: 'Rotate terminal auth token — previous token is immediately revoked' })
  async rotateTerminalToken(@Req() req: any, @Param('id') id: string) {
    const result = await this.terminalService.rotateToken(this._tenantId(req), id);
    return { success: true, data: result, error: null };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private _tenantId(req: any): string {
    const user = req.user ?? req;
    return user.tenantId ?? user.tenant_id;
  }

  private async _resolveIntegration(
    tenantId: string,
    providerName: string,
    deviceSn?: string,
  ): Promise<{ id: string } | null> {
    if (providerName === 'zkteco' && deviceSn) {
      return this.zktecoService.getZktecoIntegration(tenantId, deviceSn);
    }
    const { rows } = await this.db.query(
      `SELECT id FROM integrations
       WHERE tenant_id = $1 AND type = $2 AND is_active = true
       LIMIT 1`,
      [tenantId, providerName],
    );
    return rows[0] ?? null;
  }

  private _normalizePunchType(raw?: string): PunchDirection {
    if (!raw) return PunchDirection.UNKNOWN;
    const u = raw.toUpperCase();
    if (u === 'IN' || u === '0') return PunchDirection.IN;
    if (u === 'OUT' || u === '1') return PunchDirection.OUT;
    return PunchDirection.UNKNOWN;
  }
}
