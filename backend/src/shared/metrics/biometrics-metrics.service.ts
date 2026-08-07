import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class BiometricsMetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  // ── Punch ingestion ───────────────────────────────────────────────────────

  readonly punchesTotal = new Counter({
    name: 'hms_punches_total',
    help: 'Total punch events ingested successfully',
    labelNames: ['provider', 'direction'],
    registers: [this.registry],
  });

  readonly duplicatesTotal = new Counter({
    name: 'hms_duplicate_punches_total',
    help: 'Punch events rejected as duplicates by fingerprint check',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  readonly ingestionDuration = new Histogram({
    name: 'hms_punch_ingestion_duration_ms',
    help: 'Punch batch processing duration in milliseconds',
    labelNames: ['provider'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });

  /** Counter per verify method + provider — powers distribution dashboards. */
  readonly verifyMethodTotal = new Counter({
    name: 'hms_verify_method_total',
    help: 'Punch events counted by verification method and provider',
    labelNames: ['method', 'provider'],
    registers: [this.registry],
  });

  /** Counter per normalized attendance source — powers source-mix dashboards. */
  readonly attendanceSourceTotal = new Counter({
    name: 'hms_attendance_source_total',
    help: 'Punch events counted by normalized attendance source',
    labelNames: ['source'],
    registers: [this.registry],
  });

  // ── Queue health ──────────────────────────────────────────────────────────

  readonly queueDepth = new Gauge({
    name: 'hms_queue_depth',
    help: 'BullMQ punch-ingestion queue depth by state',
    labelNames: ['state'],
    registers: [this.registry],
  });

  readonly dlqTotal = new Gauge({
    name: 'hms_dlq_total',
    help: 'Current number of jobs in the dead-letter queue',
    registers: [this.registry],
  });

  readonly offlineBufferSize = new Gauge({
    name: 'hms_offline_buffer_size',
    help: 'Number of punch jobs currently held in the offline Redis buffer',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  // ── Provider / circuit breaker ────────────────────────────────────────────

  readonly providerSyncDuration = new Histogram({
    name: 'hms_provider_sync_duration_ms',
    help: 'Time to complete a full provider sync cycle (all cursor types)',
    labelNames: ['provider'],
    buckets: [100, 500, 1000, 2500, 5000, 10000, 30000],
    registers: [this.registry],
  });

  readonly circuitBreakerOpenTotal = new Counter({
    name: 'hms_circuit_breaker_open_total',
    help: 'Number of times a provider circuit breaker transitioned to open state',
    labelNames: ['provider', 'transport'],
    registers: [this.registry],
  });

  // ── Sync pipeline ─────────────────────────────────────────────────────────

  readonly syncRunsTotal = new Counter({
    name: 'hms_sync_runs_total',
    help: 'Total biometric sync runs by provider, cursor type, and final status',
    labelNames: ['provider', 'cursor_type', 'status'],
    registers: [this.registry],
  });

  readonly syncRecordsFetched = new Counter({
    name: 'hms_sync_records_fetched_total',
    help: 'Total records fetched from provider during sync runs',
    labelNames: ['provider', 'cursor_type'],
    registers: [this.registry],
  });

  /** Records successfully enqueued (attendance) or upserted (devices) per sync pass. */
  readonly syncRecordsSynced = new Counter({
    name: 'hms_sync_records_synced_total',
    help: 'Records successfully enqueued or upserted during a sync pass',
    labelNames: ['provider', 'cursor_type'],
    registers: [this.registry],
  });

  /** Records that failed to enqueue or upsert — non-zero triggers partial/failed status. */
  readonly syncRecordsFailed = new Counter({
    name: 'hms_sync_records_failed_total',
    help: 'Records that failed to enqueue or upsert during a sync pass',
    labelNames: ['provider', 'cursor_type'],
    registers: [this.registry],
  });

  /** Per-cursor-type sync duration — more granular than hms_provider_sync_duration_ms. */
  readonly syncCursorDuration = new Histogram({
    name: 'hms_sync_cursor_duration_ms',
    help: 'Duration of a single cursor-type sync pass in milliseconds',
    labelNames: ['provider', 'cursor_type'],
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
    registers: [this.registry],
  });

  readonly syncLagSeconds = new Gauge({
    name: 'hms_sync_lag_seconds',
    help: 'Seconds between now and the last successfully synced cursor timestamp',
    labelNames: ['provider', 'cursor_type'],
    registers: [this.registry],
  });

  readonly syncQueueDepth = new Gauge({
    name: 'hms_sync_queue_depth',
    help: 'BullMQ biometric-sync queue depth by state',
    labelNames: ['state'],
    registers: [this.registry],
  });

  // ── Device health ─────────────────────────────────────────────────────────

  /** Legacy simple gauge — kept for backwards-compatible Grafana panels. */
  readonly devicesOnline = new Gauge({
    name: 'hms_devices_online',
    help: 'Number of biometric devices currently reported as online per provider',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  /** Richer gauge with hardware_type + online/offline status labels. */
  readonly devicesByHardwareType = new Gauge({
    name: 'hms_devices_by_hardware_type',
    help: 'Biometric device count by provider, hardware type, and online status',
    labelNames: ['provider', 'hardware_type', 'status'],
    registers: [this.registry],
  });

  /**
   * Age in seconds of the oldest last_seen_at among currently-online devices
   * per provider.  Rising values indicate a device that has stopped checking in
   * but hasn't been marked offline yet (stale sweep runs every 5 min).
   */
  readonly deviceLastSeenAgeSeconds = new Gauge({
    name: 'hms_device_last_seen_age_seconds',
    help: 'Age in seconds of the oldest last_seen_at among online devices per provider',
    labelNames: ['provider'],
    registers: [this.registry],
  });

  // ── Terminal health ───────────────────────────────────────────────────────

  /** Gauge per device_type × online/offline — reset and re-set on every sweep. */
  readonly terminalsTotal = new Gauge({
    name: 'hms_terminals_total',
    help: 'Registered attendance terminals by device type and online status',
    labelNames: ['device_type', 'status'],
    registers: [this.registry],
  });

  readonly terminalPunchesTotal = new Counter({
    name: 'hms_terminal_punches_total',
    help: 'Punch events submitted from trusted attendance terminals',
    labelNames: ['device_type'],
    registers: [this.registry],
  });

  readonly terminalAuthFailuresTotal = new Counter({
    name: 'hms_terminal_auth_failures_total',
    help: 'Terminal authentication or authorization failures by reason',
    labelNames: ['reason'],
    registers: [this.registry],
  });

  // ── HTTP / DB performance (cross-cutting, not biometrics-specific) ────────

  readonly httpRequestDuration = new Histogram({
    name: 'hms_http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000],
    registers: [this.registry],
  });

  readonly dbQueryDuration = new Histogram({
    name: 'hms_db_query_duration_ms',
    help: 'Postgres query duration in milliseconds',
    buckets: [5, 10, 25, 50, 100, 200, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });

  readonly dbPoolTotal = new Gauge({
    name: 'hms_db_pool_total_connections',
    help: 'Total connections currently open in the Postgres pool',
    registers: [this.registry],
  });

  readonly dbPoolIdle = new Gauge({
    name: 'hms_db_pool_idle_connections',
    help: 'Idle connections currently available in the Postgres pool',
    registers: [this.registry],
  });

  readonly dbPoolWaiting = new Gauge({
    name: 'hms_db_pool_waiting_requests',
    help: 'Number of queries waiting for a free connection in the Postgres pool',
    registers: [this.registry],
  });

  readonly webVitals = new Histogram({
    name: 'hms_web_vitals_ms',
    help: 'Browser-reported Core Web Vitals (FCP, LCP, TTFB, INP) in milliseconds',
    labelNames: ['metric'],
    buckets: [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000],
    registers: [this.registry],
  });

  onModuleDestroy() {
    this.registry.clear();
  }
}
