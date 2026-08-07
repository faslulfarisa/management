import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { BiometricsMetricsService } from './metrics/biometrics-metrics.service';

// Above this, a query is logged as slow (in addition to always being recorded
// in the legacy hms_db_query_duration_ms histogram).
const SLOW_QUERY_MS = parseInt(process.env.DATABASE_SLOW_QUERY_MS ?? '200', 10);
const POOL_METRICS_INTERVAL_MS = 5000;
const DEFAULT_POOL_MAX_BY_ENV: Record<string, number> = {
  development: 8,
  test: 4,
  production: 10,
};
const DEFAULT_SESSION_POOL_MAX = 3;
const DEFAULT_AWS_PROXY_POOL_MAX = 5;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getDatabaseUrl(): URL | undefined {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    return new URL(process.env.DATABASE_URL);
  } catch {
    return undefined;
  }
}

function isLocalDatabase(url: URL | undefined): boolean {
  return !!url && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
}

function isSupabaseSessionPooler(url: URL | undefined): boolean {
  return !!url && url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432';
}

function isAwsPostgresHost(url: URL | undefined): boolean {
  if (!url) return false;
  return /\.rds\.amazonaws\.com$/.test(url.hostname) || /\.rds\.amazonaws\.com\.cn$/.test(url.hostname);
}

function isRdsProxyHost(url: URL | undefined): boolean {
  if (!url) return false;
  return /\.proxy-[a-z0-9-]+\.rds\.amazonaws\.com$/.test(url.hostname)
    || /\.proxy-[a-z0-9-]+\.rds\.amazonaws\.com\.cn$/.test(url.hostname);
}

function getSslConfig(url: URL | undefined): PoolConfig['ssl'] {
  const mode = (process.env.DATABASE_SSL_MODE || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require' || mode === 'verify-full') {
    return { rejectUnauthorized: parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, mode === 'verify-full') };
  }
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (isLocalDatabase(url)) return false;
  return { rejectUnauthorized: parseBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, false) };
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly pool: Pool;
  private poolMetricsTimer?: ReturnType<typeof setInterval>;
  private poolEndPromise?: Promise<void>;

  constructor(private readonly metrics: BiometricsMetricsService) {
    const databaseUrl = getDatabaseUrl();
    const defaultPoolMax = isRdsProxyHost(databaseUrl)
      ? DEFAULT_AWS_PROXY_POOL_MAX
      : isSupabaseSessionPooler(databaseUrl)
        ? DEFAULT_SESSION_POOL_MAX
        : DEFAULT_POOL_MAX_BY_ENV[process.env.NODE_ENV ?? 'development'] ?? 8;
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig(databaseUrl),
      application_name: process.env.DATABASE_APPLICATION_NAME || 'hrms-backend',
      keepAlive: parseBoolean(process.env.DATABASE_TCP_KEEPALIVE, true),
      keepAliveInitialDelayMillis: parsePositiveInt(process.env.DATABASE_TCP_KEEPALIVE_INITIAL_DELAY_MS, 10000),
      // Managed PostgreSQL poolers and proxies cap backend connections. Keep
      // this at or below the provider cap divided by backend replica count.
      max: parsePositiveInt(process.env.DATABASE_POOL_MAX, defaultPoolMax),
      idleTimeoutMillis: parsePositiveInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, 30000),
      connectionTimeoutMillis: parsePositiveInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS, 5000),
      maxLifetimeSeconds: parsePositiveInt(process.env.DATABASE_POOL_MAX_LIFETIME_SECONDS, 300),
    };
    this.pool = new Pool(config);
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle database connection', err);
    });
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    const databaseUrl = getDatabaseUrl();
    console.log(
      `Database connected (pool max=${this.pool.options.max}, ssl=${this.pool.options.ssl ? 'enabled' : 'disabled'}, aws=${isAwsPostgresHost(databaseUrl) ? 'yes' : 'no'})`,
    );

    this.poolMetricsTimer = setInterval(() => {
      this.metrics.dbPoolTotal.set(this.pool.totalCount);
      this.metrics.dbPoolIdle.set(this.pool.idleCount);
      this.metrics.dbPoolWaiting.set(this.pool.waitingCount);
    }, POOL_METRICS_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.poolMetricsTimer) clearInterval(this.poolMetricsTimer);
  }

  async onApplicationShutdown() {
    if (!this.poolEndPromise) {
      this.poolEndPromise = this.pool.end();
    }
    await this.poolEndPromise;
  }

  getPool() {
    return this.pool;
  }

  getPoolStats() {
    return {
      max: this.pool.options.max,
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async query(text: string, params?: any[]) {
    return this.timeQuery(text, () => this.pool.query(text, params));
  }

  private async timeQuery<T>(text: string, query: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await query();
    } finally {
      const duration = Date.now() - start;
      this.metrics.dbQueryDuration.observe(duration);
      if (duration > SLOW_QUERY_MS) {
        process.stdout.write(
          JSON.stringify({
            level: 'warn',
            message: 'slow_query',
            duration,
            query: text.slice(0, 300),
            timestamp: new Date().toISOString(),
            service: 'ai-hrms-backend',
          }) + '\n',
        );
      }
    }
  }

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const instrumentedClient = Object.create(client);
    instrumentedClient.query = (text: string, params?: any[]) => this.timeQuery(text, () => client.query(text, params));
    try {
      await client.query('BEGIN');
      const result = await fn(instrumentedClient);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
