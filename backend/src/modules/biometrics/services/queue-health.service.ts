import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Interval } from '@nestjs/schedule';
import { PUNCH_INGESTION_QUEUE } from '../queue/punch-ingestion.types';
import { BIOMETRIC_SYNC_QUEUE } from '../sync/biometric-sync.types';
import { BiometricsGateway, QueueHealthDto } from '../gateways/biometrics.gateway';
import { SchedulerControlService } from '../../../shared/scheduler-control.service';
import { OfflineBufferService } from './offline-buffer.service';
import { DatabaseService } from '../../../shared/database.service';

const QUEUE_HEALTH_BROADCAST_MS = parseInt(process.env.QUEUE_HEALTH_BROADCAST_MS ?? '15000', 10);

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  constructor(
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly queue: Queue,
    @InjectQueue(BIOMETRIC_SYNC_QUEUE) private readonly syncQueue: Queue,
    private readonly gateway: BiometricsGateway,
    private readonly offlineBuffer: OfflineBufferService,
    private readonly db: DatabaseService,
    private readonly schedulerControl: SchedulerControlService = new SchedulerControlService(),
  ) {}

  @Interval(QUEUE_HEALTH_BROADCAST_MS)
  async broadcastHealth() {
    await this.schedulerControl.run('queue-health-broadcast', async () => {
      try {
        const snapshot = await this.getSnapshot();
        this.gateway.broadcastQueueHealth('*', snapshot);
      } catch (err) {
        this.logger.warn('Failed to broadcast queue health', err);
      }
    });
  }

  async getSnapshot(): Promise<QueueHealthDto> {
    const [waiting, active, failed, delayed, workers] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getWorkers(),
    ]);

    return {
      depth: waiting + delayed,
      active,
      failed,
      workers: workers.length,
      timestamp: new Date().toISOString(),
    };
  }

  async getDiagnostics(tenantId?: string): Promise<any> {
    const [punch, sync, offlineBuffer, recentSyncFailures] = await Promise.all([
      this.queueSnapshot(this.queue),
      this.queueSnapshot(this.syncQueue),
      this.offlineBuffer.summary(tenantId),
      this.recentSyncFailures(tenantId),
    ]);

    return {
      status: this.resolveStatus(punch, sync, offlineBuffer.total),
      queues: {
        punchIngestion: punch,
        biometricSync: sync,
      },
      offlineBuffer,
      recentSyncFailures,
      timestamp: new Date().toISOString(),
    };
  }

  async getOperationalSummary(tenantId: string): Promise<any> {
    const [diagnostics, platform, tenant, system, devices, terminals, commandHistory, syncHistory, punchHistory] = await Promise.all([
      this.getDiagnostics(tenantId),
      this.platformMetrics(tenantId),
      this.tenantMetrics(tenantId),
      this.systemMetrics(tenantId),
      this.deviceMetrics(tenantId),
      this.terminalMetrics(tenantId),
      this.commandHistory(tenantId),
      this.syncHistory(tenantId),
      this.punchHistory(tenantId),
    ]);

    const queueDepth = diagnostics.queues.punchIngestion.depth + diagnostics.queues.biometricSync.depth;
    const failedQueueItems = diagnostics.queues.punchIngestion.failed + diagnostics.queues.biometricSync.failed;
    const attentionItems =
      Number(tenant.unknownEmployees) +
      Number(tenant.rejectedPunches) +
      Number(system.failedSyncs) +
      Number(devices.offlineDevices) +
      failedQueueItems;

    return {
      status: attentionItems > 0 ? (attentionItems > 10 ? 'action_required' : 'needs_review') : 'healthy',
      generatedAt: new Date().toISOString(),
      platform: {
        ...platform,
        queueDepth,
        failedQueueItems,
        protectedSubmissions24h: platform.protectedSubmissions24h,
        replayAttacksBlocked24h: platform.replayAttacksBlocked24h,
      },
      tenant,
      system: {
        ...system,
        retryQueueDepth: diagnostics.queues.punchIngestion.active + diagnostics.queues.biometricSync.active,
        deadLetterQueueDepth: failedQueueItems,
        offlineBufferDepth: diagnostics.offlineBuffer.total,
      },
      devices,
      terminals,
      history: {
        sync: syncHistory,
        commands: commandHistory,
        punches: punchHistory,
      },
    };
  }

  private async queueSnapshot(queue: Queue): Promise<any> {
    const [waiting, active, failed, delayed, completed, paused, workers] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getCompletedCount(),
      queue.isPaused(),
      queue.getWorkers(),
    ]);

    return {
      waiting,
      active,
      failed,
      delayed,
      completed,
      paused,
      workers: workers.length,
      depth: waiting + delayed,
    };
  }

  private async recentSyncFailures(tenantId?: string): Promise<any[]> {
    const params = tenantId ? [tenantId] : [];
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, provider_name, cursor_type, status, error_summary,
              started_at, completed_at, records_fetched, records_synced, records_failed
       FROM biometric_sync_logs
       ${tenantFilter}
       ${tenantFilter ? 'AND' : 'WHERE'} status IN ('failed', 'partial')
       ORDER BY started_at DESC
       LIMIT 20`,
      params,
    );
    return rows;
  }

  private async platformMetrics(tenantId: string): Promise<any> {
    const [{ rows: integrationRows }, { rows: nonceRows }] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS integrations,
           COUNT(*) FILTER (WHERE is_active = true)::int AS active_integrations,
           COUNT(DISTINCT type)::int AS provider_types
         FROM integrations
         WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*)::int AS protected_submissions_24h,
           (
             SELECT COUNT(*)::int
             FROM biometric_operational_events
             WHERE tenant_id = $1
               AND event_type = 'replay_attack_blocked'
               AND occurred_at >= NOW() - INTERVAL '24 hours'
           ) AS replay_attacks_blocked_24h
         FROM punch_submission_nonces
         WHERE tenant_id = $1
           AND consumed_at >= NOW() - INTERVAL '24 hours'`,
        [tenantId],
      ),
    ]);

    const integrations = integrationRows[0] ?? {};
    const nonces = nonceRows[0] ?? {};
    return {
      integrations: Number(integrations.integrations ?? 0),
      activeIntegrations: Number(integrations.active_integrations ?? 0),
      providerTypes: Number(integrations.provider_types ?? 0),
      protectedSubmissions24h: Number(nonces.protected_submissions_24h ?? 0),
      replayAttacksBlocked24h: Number(nonces.replay_attacks_blocked_24h ?? 0),
    };
  }

  private async tenantMetrics(tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending', 'failed'))::int AS unknown_employees,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS rejected_punches,
         COUNT(*) FILTER (WHERE status = 'processed')::int AS recovered_punches,
         COUNT(DISTINCT employee_code) FILTER (WHERE status IN ('pending', 'failed'))::int AS affected_employees
       FROM pending_punch_reviews
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = rows[0] ?? {};
    return {
      unknownEmployees: Number(row.unknown_employees ?? 0),
      rejectedPunches: Number(row.rejected_punches ?? 0),
      recoveredPunches: Number(row.recovered_punches ?? 0),
      affectedEmployees: Number(row.affected_employees ?? 0),
    };
  }

  private async systemMetrics(tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('failed', 'partial'))::int AS failed_syncs,
         COALESCE(SUM(records_failed) FILTER (WHERE status IN ('failed', 'partial')), 0)::int AS failed_sync_records,
         COALESCE(SUM(records_synced) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours'), 0)::int AS synced_records_24h,
         MAX(completed_at) FILTER (WHERE status = 'success') AS last_successful_sync_at
       FROM biometric_sync_logs
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = rows[0] ?? {};
    return {
      failedSyncs: Number(row.failed_syncs ?? 0),
      failedSyncRecords: Number(row.failed_sync_records ?? 0),
      syncedRecords24h: Number(row.synced_records_24h ?? 0),
      lastSuccessfulSyncAt: row.last_successful_sync_at ?? null,
    };
  }

  private async deviceMetrics(tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*)::int AS total_devices,
         COUNT(*) FILTER (WHERE is_active = true AND is_online = true)::int AS online_devices,
         COUNT(*) FILTER (WHERE is_active = true AND is_online = false)::int AS offline_devices,
         COUNT(*) FILTER (
           WHERE is_active = true
             AND COALESCE(last_heartbeat_at, last_seen_at) < NOW() - INTERVAL '15 minutes'
         )::int AS stale_heartbeats,
         MAX(COALESCE(last_heartbeat_at, last_seen_at)) AS last_heartbeat_at
       FROM biometric_devices
       WHERE tenant_id = $1
         AND is_active = true`,
      [tenantId],
    );
    const row = rows[0] ?? {};
    return {
      totalDevices: Number(row.total_devices ?? 0),
      onlineDevices: Number(row.online_devices ?? 0),
      offlineDevices: Number(row.offline_devices ?? 0),
      staleHeartbeats: Number(row.stale_heartbeats ?? 0),
      lastHeartbeatAt: row.last_heartbeat_at ?? null,
    };
  }

  private async terminalMetrics(tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*)::int AS total_terminals,
         COUNT(*) FILTER (WHERE is_active = true AND is_online = true)::int AS online_terminals,
         COUNT(*) FILTER (WHERE is_active = true AND is_online = false)::int AS offline_terminals,
         MAX(COALESCE(last_heartbeat_at, last_ping_at)) AS last_heartbeat_at
       FROM attendance_terminals
       WHERE tenant_id = $1
         AND is_active = true`,
      [tenantId],
    );
    const row = rows[0] ?? {};
    return {
      totalTerminals: Number(row.total_terminals ?? 0),
      onlineTerminals: Number(row.online_terminals ?? 0),
      offlineTerminals: Number(row.offline_terminals ?? 0),
      lastHeartbeatAt: row.last_heartbeat_at ?? null,
    };
  }

  private async commandHistory(tenantId: string): Promise<any[]> {
    const { rows } = await this.db.query(
      `SELECT id, device_serial_number, command_type, status, queued_at, completed_at,
              COALESCE(result_message, last_error) AS summary
       FROM biometric_device_commands
       WHERE tenant_id = $1
       ORDER BY queued_at DESC
       LIMIT 10`,
      [tenantId],
    );
    return rows;
  }

  private async syncHistory(tenantId: string): Promise<any[]> {
    const { rows } = await this.db.query(
      `SELECT id, provider_name, cursor_type, status, started_at, completed_at,
              records_fetched, records_synced, records_failed, error_summary
       FROM biometric_sync_logs
       WHERE tenant_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [tenantId],
    );
    return rows;
  }

  private async punchHistory(tenantId: string): Promise<any[]> {
    const { rows } = await this.db.query(
      `SELECT ar.id, ar.date, ar.clock_in, ar.clock_out, ar.status, ar.provider_name,
              ar.attendance_source, ar.punch_count, e.employee_code,
              CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name
       FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id
       WHERE ar.tenant_id = $1
       ORDER BY COALESCE(ar.clock_out, ar.clock_in, ar.updated_at) DESC
       LIMIT 10`,
      [tenantId],
    );
    return rows;
  }

  private resolveStatus(punch: any, sync: any, offlineBufferTotal: number): 'healthy' | 'degraded' | 'critical' {
    if (punch.workers === 0 && (punch.waiting > 0 || punch.active > 0)) return 'critical';
    if (sync.workers === 0 && (sync.waiting > 0 || sync.active > 0)) return 'critical';
    if (punch.failed > 0 || sync.failed > 0 || offlineBufferTotal > 0) return 'degraded';
    return 'healthy';
  }
}
