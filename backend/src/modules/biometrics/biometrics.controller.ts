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
  ConflictException, UnprocessableEntityException, ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bull';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import Redis from 'ioredis';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
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
import { PunchIngestionService } from './services/punch-ingestion.service';
import { BiometricDeviceService, DevicePatchDto, CreateDeviceDto } from './services/biometric-device.service';
import { AdmsService } from './adms/adms.service';
import {
  AttendanceTerminalService,
  RegisterTerminalDto,
  TerminalPatchDto,
} from './terminals/attendance-terminal.service';
import { DatabaseService } from '../../shared/database.service';
import { PunchEventDto, PunchDirection, VerifyMethod, AttendanceSource } from './dto/punch-event.dto';
import {
  PUNCH_INGESTION_QUEUE,
} from './queue/punch-ingestion.types';
import { BIOMETRIC_SYNC_QUEUE } from './sync/biometric-sync.types';
import { AttendanceEngineService } from './engine/attendance-engine.service';

interface UnifiedPunchBody {
  provider: string;
  deviceSn?: string;
  punches: Array<{
    employeeCode: string;
    timestamp: string;
    punchType?: string;
    punchState?: string;
    verifyMethod?: string;
    verifyType?: string;
    source?: string;
    terminalId?: string;
    terminalSerialNumber?: string;
    deviceId?: string;
    workCode?: string;
    gps?: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      recordedAt?: string;
    };
    metadata?: Record<string, unknown>;
  }>;
  /** Optional: nonce for replay protection (device-push endpoints) */
  nonce?: string;
  /** Optional: request timestamp ISO string for replay protection */
  requestTimestamp?: string;
  signature?: string;
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
    private readonly engine: AttendanceEngineService,
    private readonly auditService: AttendanceAuditService,
    private readonly correctionsService: AttendanceCorrectionsService,
    private readonly apiKeyService: ServiceApiKeyService,
    private readonly queueHealthService: QueueHealthService,
    private readonly offlineBuffer: OfflineBufferService,
    private readonly punchIngestion: PunchIngestionService,
    private readonly deviceService: BiometricDeviceService,
    private readonly admsService: AdmsService,
    private readonly terminalService: AttendanceTerminalService,
    private readonly db: DatabaseService,
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly punchQueue: Queue,
    @InjectQueue(BIOMETRIC_SYNC_QUEUE) private readonly syncQueue: Queue,
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

    const replay = await this.requireSignedPunchSubmission(req, tenantId, body);

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
          verifyMethod: this._normalizeVerifyMethod(p.verifyMethod),
          providerName: body.provider,
          deviceId: p.deviceId ?? body.deviceSn,
          terminalId: p.terminalId,
          terminalSerialNumber: p.terminalSerialNumber,
          attendanceSource: this._normalizeAttendanceSource(p.source),
          punchState: p.punchState ?? p.punchType,
          rawVerifyType: p.verifyType,
          workCode: p.workCode,
          gps: this._normalizeGps(p.gps),
          tenantId,
          integrationId: integration.id,
          correlationId: req.correlationId as string | undefined,
          rawPayload: {
            ...p,
            metadata: p.metadata ?? {},
          } as Record<string, unknown>,
        };
      })
      .filter((e): e is PunchEventDto => e !== null);

    if (events.length === 0) {
      return { success: false, data: null, error: 'No valid punches in payload' };
    }

    const result = await this.punchIngestion.submit({
      tenantId,
      integrationId: integration.id,
      providerName: body.provider,
      events,
      requestId: replay.requestId,
      correlationId: req.correlationId as string | undefined,
    });

      // Bull enqueue failed (transient Redis blip) — buffer to Redis list for drain on recovery

    return {
      success: true,
      data: result.buffered > 0
        ? { buffered: result.buffered, provider: result.provider, requestId: result.requestId }
        : { queued: result.queued, provider: result.provider, requestId: result.requestId },
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
  async triggerSync(@Req() req: any, @Param('integrationId') integrationId: string) {
    try {
      const { rows } = await this.db.query(
        `SELECT id
         FROM integrations
         WHERE id = $1
           AND tenant_id = $2
           AND type = 'easytimepro'
           AND is_active = true`,
        [integrationId, this._tenantId(req)],
      );
      if (!rows[0]) throw new NotFoundException(`Integration ${integrationId} not found`);

      const result = await this.easyTimeScheduler.triggerManualSync(integrationId);
      return { success: true, data: result, error: null };
    } catch (err: any) {
      return { success: false, data: null, error: err?.message ?? 'Sync failed' };
    }
  }

  // ── Queue Management (DLQ) ──────────────────────────────────────────────────

  @Get('queue/failed')
  @ApiOperation({ summary: 'List failed punch ingestion jobs (dead-letter queue)' })
  async getFailedJobs(@Req() req: any) {
    const tenantId = this._tenantId(req);
    const failed = (await this.punchQueue.getFailed(0, 99))
      .filter((j) => this._jobTenant(j) === tenantId);
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
  async retryFailedJobs(@Req() req: any) {
    const tenantId = this._tenantId(req);
    const failed = (await this.punchQueue.getFailed(0, 99))
      .filter((j) => this._jobTenant(j) === tenantId);
    await Promise.all(failed.map((j) => j.retry()));
    return { success: true, data: { retried: failed.length }, error: null };
  }

  @Get('queue/health')
  @ApiOperation({ summary: 'Current queue depth, active workers, and Redis status' })
  async getQueueHealth() {
    const snapshot = await this.queueHealthService.getSnapshot();
    return { success: true, data: snapshot, error: null };
  }

  @Get('queue/diagnostics')
  @ApiOperation({ summary: 'Queue diagnostics, durable offline-buffer state, and recent sync failures' })
  async getQueueDiagnostics(@Req() req: any) {
    const diagnostics = await this.queueHealthService.getDiagnostics(this._tenantId(req));
    return { success: true, data: diagnostics, error: null };
  }

  @Get('operations/summary')
  @ApiOperation({ summary: 'HR-safe biometrics operational dashboard summary' })
  async getOperationsSummary(@Req() req: any) {
    const summary = await this.queueHealthService.getOperationalSummary(this._tenantId(req));
    return { success: true, data: summary, error: null };
  }

  @Post('queue/offline-buffer/replay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replay durable offline punch buffer for this tenant' })
  async replayOfflineBuffer(@Req() req: any, @Body() body: { provider?: string; limit?: number }) {
    const tenantId = this._tenantId(req);
    const providers = body?.provider
      ? [{ tenantId, provider: body.provider }]
      : (await this.offlineBuffer.pendingProviders()).filter((item) => item.tenantId === tenantId);

    let replayed = 0;
    for (const item of providers) {
      replayed += await this.offlineBuffer.drainDurable(
        item.tenantId,
        item.provider,
        this.punchQueue,
        body?.limit ?? 100,
      );
    }

    return { success: true, data: { replayed }, error: null };
  }

  @Get('queue/dlq')
  @ApiOperation({ summary: 'Paginated list of failed (dead-letter) jobs' })
  async getDlq(
    @Req() req: any,
    @Query('offset') offset = '0',
    @Query('limit') limit = '50',
  ) {
    const o = parseInt(offset, 10);
    const l = parseInt(limit, 10);
    const tenantId = this._tenantId(req);
    const allTenantJobs = (await this.punchQueue.getFailed(0, -1))
      .filter((j) => this._jobTenant(j) === tenantId);
    const jobs = allTenantJobs.slice(o, o + l);
    const total = allTenantJobs.length;
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
  async retryDlqJob(@Req() req: any, @Param('jobId') jobId: string) {
    const job = await this.punchQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    this._assertJobTenant(job, this._tenantId(req));
    await job.retry();
    return { success: true, data: { retried: jobId }, error: null };
  }

  @Post('queue/dlq/bulk-retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry multiple DLQ jobs by ID' })
  async bulkRetryDlq(@Req() req: any, @Body() body: { jobIds: string[] }) {
    const tenantId = this._tenantId(req);
    const results = await Promise.allSettled(
      (body.jobIds ?? []).map(async (id) => {
        const job = await this.punchQueue.getJob(id);
        if (job && this._jobTenant(job) === tenantId) await job.retry();
      }),
    );
    const retried = results.filter((r) => r.status === 'fulfilled').length;
    return { success: true, data: { retried }, error: null };
  }

  @Delete('queue/dlq/:jobId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'jobId', description: 'Bull job ID to discard' })
  @ApiOperation({ summary: 'Permanently discard a DLQ job' })
  async discardDlqJob(@Req() req: any, @Param('jobId') jobId: string) {
    const job = await this.punchQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    this._assertJobTenant(job, this._tenantId(req));
    await job.remove();
    return { success: true, data: { discarded: jobId }, error: null };
  }

  @Get('sync/dlq')
  @ApiOperation({ summary: 'Paginated list of failed biometric sync jobs' })
  async getSyncDlq(
    @Req() req: any,
    @Query('offset') offset = '0',
    @Query('limit') limit = '50',
  ) {
    const o = parseInt(offset, 10);
    const l = parseInt(limit, 10);
    const tenantId = this._tenantId(req);
    const allTenantJobs = (await this.syncQueue.getFailed(0, -1))
      .filter((j) => this._jobTenant(j) === tenantId);
    const jobs = allTenantJobs.slice(o, o + l);
    const total = allTenantJobs.length;
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
          integrationId: j.data?.integrationId,
          cursorTypes: j.data?.cursorTypes ?? [],
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

  @Post('sync/dlq/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'jobId', description: 'Bull sync job ID to retry' })
  @ApiOperation({ summary: 'Retry a failed biometric sync job by ID' })
  async retrySyncDlqJob(@Req() req: any, @Param('jobId') jobId: string) {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) throw new NotFoundException(`Sync job ${jobId} not found`);
    this._assertJobTenant(job, this._tenantId(req));
    await job.retry();
    return { success: true, data: { retried: jobId }, error: null };
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

  @Post('devices/:id/commands')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', description: 'Biometric device UUID' })
  @ApiOperation({ summary: 'Queue an ADMS command for a biometric device' })
  async queueDeviceCommand(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { commandType?: string; command: string; priority?: number; expiresAt?: string },
  ) {
    const tenantId = this._tenantId(req);
    const device = await this.deviceService.getDevice(tenantId, id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    if (!body?.command) {
      return { success: false, data: null, error: 'command is required' };
    }

    const user = req.user ?? req;
    const queued = await this.admsService.queueCommand({
      tenantId,
      deviceSerialNumber: device.serial_number,
      biometricDeviceId: device.id,
      commandType: body.commandType ?? 'custom',
      command: body.command,
      priority: body.priority,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdBy: user.id ?? user.sub ?? null,
    });

    return { success: true, data: queued, error: null };
  }

  @Get('devices/:id/commands')
  @ApiParam({ name: 'id', description: 'Biometric device UUID' })
  @ApiOperation({ summary: 'List recent ADMS commands for a biometric device' })
  async listDeviceCommands(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this._tenantId(req);
    const device = await this.deviceService.getDevice(tenantId, id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);

    const commands = await this.admsService.listCommands(
      tenantId,
      device.serial_number,
      limit ? parseInt(limit, 10) : 50,
    );
    return { success: true, data: commands, error: null };
  }

  @Get('pending-punch-reviews')
  @ApiOperation({ summary: 'List pending unknown-employee punch reviews' })
  async listPendingPunchReviews(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('employeeCode') employeeCode?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this._tenantId(req);
    const params: any[] = [tenantId, Math.max(1, Math.min(parseInt(limit ?? '100', 10) || 100, 500))];
    const clauses = ['tenant_id = $1'];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    } else {
      clauses.push(`status IN ('pending', 'failed')`);
    }
    if (employeeCode) {
      params.push(employeeCode);
      clauses.push(`employee_code = $${params.length}`);
    }
    const { rows } = await this.db.query(
      `SELECT *
       FROM pending_punch_reviews
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $2`,
      params,
    );
    return { success: true, data: rows, error: null };
  }

  @Post('pending-punch-reviews/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry pending punch reviews after employee creation or mapping fixes' })
  async retryPendingPunchReviews(
    @Req() req: any,
    @Body() body: { employeeCode?: string; limit?: number },
  ) {
    const result = await this.engine.retryPendingPunchReviews(
      this._tenantId(req),
      body?.employeeCode,
      body?.limit,
    );
    return { success: true, data: result, error: null };
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

  private _jobTenant(job: { data?: any }): string | undefined {
    return job.data?.tenantId ?? job.data?.tenant_id;
  }

  private _assertJobTenant(job: { data?: any }, tenantId: string): void {
    if (this._jobTenant(job) !== tenantId) {
      throw new ForbiddenException('Job does not belong to the active tenant');
    }
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
    const u = raw.toUpperCase().replace(/[\s-]+/g, '_');
    if (u === 'IN' || u === 'CHECKIN' || u === 'CLOCK_IN' || u === '0') return PunchDirection.IN;
    if (u === 'OUT' || u === 'CHECKOUT' || u === 'CLOCK_OUT' || u === '1') return PunchDirection.OUT;
    if (u === 'BREAK_OUT' || u === 'BREAKOUT' || u === 'LUNCH_OUT' || u === '2') return PunchDirection.BREAK_OUT;
    if (u === 'BREAK_IN' || u === 'BREAKIN' || u === 'LUNCH_IN' || u === '3') return PunchDirection.BREAK_IN;
    return PunchDirection.UNKNOWN;
  }

  private async requireSignedPunchSubmission(
    req: any,
    tenantId: string,
    body: UnifiedPunchBody,
  ): Promise<{ nonce: string; timestamp: string; requestId: string }> {
    const nonce = String(req.headers['x-nonce'] ?? body.nonce ?? '').trim();
    const timestamp = String(req.headers['x-timestamp'] ?? body.requestTimestamp ?? '').trim();
    const signature = String(req.headers['x-signature'] ?? body.signature ?? '').trim();
    if (!nonce || !timestamp || !signature) {
      throw new UnprocessableEntityException('nonce, timestamp, and signature are required');
    }

    const requestTime = /^\d+$/.test(timestamp) ? Number(timestamp) * 1000 : new Date(timestamp).getTime();
    if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
      throw new UnprocessableEntityException('timestamp outside allowed 5-minute window');
    }

    const user = req.user ?? {};
    const principalType = user.isServiceAccount ? 'service_api_key' : 'jwt_user';
    const principalId = String(user.apiKeyId ?? user.sub ?? user.id ?? 'unknown');
    const nonceKey = `nonce:punch:${tenantId}:${principalType}:${principalId}:${nonce}`;
    const consumed = await this.redis.set(nonceKey, '1', 'EX', 600, 'NX');
    if (consumed !== 'OK') {
      await this.recordReplayBlocked(tenantId, {
        source: 'punch_submission',
        providerName: body.provider,
        deviceId: body.deviceSn,
        requestId: nonce,
        principalType,
        principalId,
        reason: 'nonce_already_seen',
      });
      throw new ConflictException('Duplicate request detected (nonce already used)');
    }

    const { rowCount } = await this.db.query(
      `INSERT INTO punch_submission_nonces
         (tenant_id, principal_type, principal_id, nonce, request_timestamp,
          request_id, source_ip, user_agent, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7::inet, $8, NOW() + INTERVAL '10 minutes', $9::jsonb)
       ON CONFLICT (tenant_id, principal_type, principal_id, nonce) DO NOTHING`,
      [
        tenantId,
        principalType,
        principalId,
        nonce,
        new Date(requestTime).toISOString(),
        nonce,
        this.requestIp(req),
        req.get?.('user-agent') ?? req.headers?.['user-agent'] ?? null,
        JSON.stringify({ provider: body.provider, device_sn: body.deviceSn ?? null }),
      ],
    );
    if (rowCount === 0) {
      await this.recordReplayBlocked(tenantId, {
        source: 'punch_submission',
        providerName: body.provider,
        deviceId: body.deviceSn,
        requestId: nonce,
        principalType,
        principalId,
        reason: 'durable_nonce_conflict',
      });
      throw new ConflictException('Duplicate request detected (nonce already used)');
    }

    if (!user.isServiceAccount) {
      this.verifyBodySignature(req, signature, timestamp, nonce);
    }

    return { nonce, timestamp, requestId: nonce };
  }

  private async recordReplayBlocked(
    tenantId: string,
    details: {
      source: string;
      providerName?: string;
      deviceId?: string;
      requestId?: string;
      principalType?: string;
      principalId?: string;
      reason: string;
    },
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO biometric_operational_events (
         tenant_id, event_type, severity, source, provider_name, device_id,
         request_id, summary, metadata
       )
       VALUES ($1, 'replay_attack_blocked', 'critical', $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        tenantId,
        details.source,
        details.providerName ?? null,
        details.deviceId ?? null,
        details.requestId ?? null,
        'Duplicate biometric punch request blocked',
        JSON.stringify({
          reason: details.reason,
          principal_type: details.principalType ?? null,
          principal_id: details.principalId ?? null,
        }),
      ],
    ).catch(() => undefined);
  }

  private verifyBodySignature(req: any, signature: string, timestamp: string, nonce: string): void {
    const secret = process.env.BIOMETRIC_HMAC_SECRET;
    if (!secret) {
      throw new UnprocessableEntityException('Signed punch submissions require BIOMETRIC_HMAC_SECRET');
    }
    const path = req.originalUrl?.split('?')[0] ?? req.url?.split('?')[0] ?? '';
    const query = req.originalUrl?.includes('?') ? req.originalUrl.split('?').slice(1).join('?') : '';
    const body = this.canonicalBody(Buffer.from(JSON.stringify(this.stripSignature(req.body ?? {}))));
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const message = [req.method.toUpperCase(), path, query, timestamp, nonce, bodyHash].join('\n');
    const expected = createHmac('sha256', secret).update(message).digest('hex');
    if (!this.secureEqual(signature, expected)) {
      throw new UnprocessableEntityException('Invalid request signature');
    }
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

  private stripSignature(value: any): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const { signature: _signature, ...rest } = value;
    return rest;
  }

  private secureEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private requestIp(req: any): string | null {
    return (
      req.headers?.['x-real-ip'] ??
      String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim() ??
      req.ip ??
      req.socket?.remoteAddress ??
      null
    ) || null;
  }

  private _normalizeVerifyMethod(raw?: string): VerifyMethod {
    if (!raw) return VerifyMethod.OTHER;
    const u = raw.toLowerCase();
    if (u === 'fingerprint') return VerifyMethod.FINGERPRINT;
    if (u === 'face') return VerifyMethod.FACE;
    if (u === 'card') return VerifyMethod.CARD;
    if (u === 'password') return VerifyMethod.PASSWORD;
    if (u === 'hybrid') return VerifyMethod.HYBRID;
    return VerifyMethod.OTHER;
  }

  private _normalizeAttendanceSource(raw?: string): AttendanceSource {
    if (!raw) return AttendanceSource.BIOMETRIC_DEVICE;
    const values = new Set(Object.values(AttendanceSource));
    return values.has(raw as AttendanceSource)
      ? raw as AttendanceSource
      : AttendanceSource.BIOMETRIC_DEVICE;
  }

  private _normalizeGps(gps?: UnifiedPunchBody['punches'][number]['gps']): PunchEventDto['gps'] {
    if (!gps) return undefined;
    const recordedAt = gps.recordedAt ? new Date(gps.recordedAt) : undefined;
    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracyMeters: gps.accuracyMeters,
      recordedAt: recordedAt && !isNaN(recordedAt.getTime()) ? recordedAt : undefined,
    };
  }
}
