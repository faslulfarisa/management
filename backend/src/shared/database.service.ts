import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolConfig } from 'pg';
import { BiometricsMetricsService } from './metrics/biometrics-metrics.service';

// Above this, a query is logged as slow (in addition to always being recorded
// in the hms_db_query_duration_ms histogram).
const SLOW_QUERY_MS = parseInt(process.env.DATABASE_SLOW_QUERY_MS ?? '200', 10);
const POOL_METRICS_INTERVAL_MS = 5000;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  private readonly pool: Pool;
  private poolMetricsTimer?: ReturnType<typeof setInterval>;
  private poolEndPromise?: Promise<void>;

  constructor(private readonly metrics: BiometricsMetricsService) {
    const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '');
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalDb ? false : { rejectUnauthorized: false },
      // Supabase's Session Pooler caps connections per project — keep this at
      // or below that cap, and tune per-instance via env rather than a
      // hardcoded constant when running multiple backend replicas.
      max: parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
      idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS ?? '5000', 10),
    };
    this.pool = new Pool(config);
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle database connection', err);
    });
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    console.log(`Database connected (pool max=${this.pool.options.max})`);

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
