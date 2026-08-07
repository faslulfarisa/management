import { Controller, Get, Post, Body, Res, HttpCode } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { DbHealthIndicator } from './db-health.indicator';
import { RedisHealthIndicator } from './redis-health.indicator';
import { BiometricsMetricsService } from '../metrics/biometrics-metrics.service';
import { WebVitalDto } from './web-vitals.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DbHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly metrics: BiometricsMetricsService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check (Postgres + Redis)' })
  check() {
    return this.health.check([
      () => this.db.isHealthy('postgres'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — returns 200 if process is running' })
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks database connectivity' })
  readiness() {
    return this.health.check([() => this.db.isHealthy('postgres')]);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics scrape endpoint' })
  async scrapeMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }

  @Post('web-vitals')
  @HttpCode(204)
  @ApiOperation({ summary: 'Browser-reported Core Web Vitals (FCP/LCP/TTFB/INP) — feeds the Grafana performance dashboard' })
  reportWebVital(@Body() body: WebVitalDto) {
    this.metrics.webVitals.observe({ metric: body.name }, body.value);
  }
}
