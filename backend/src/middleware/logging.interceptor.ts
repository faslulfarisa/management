import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { BiometricsMetricsService } from '../shared/metrics/biometrics-metrics.service';

// Above this, a request is logged at warn level (in addition to always being
// recorded in the hms_http_request_duration_ms histogram).
const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS ?? '1000', 10);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly metrics: BiometricsMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) || randomUUID();
    req.correlationId = correlationId;

    const { method, url } = req;
    // Use the matched route pattern (e.g. /employees/:id), not the raw URL,
    // so the Prometheus label doesn't explode in cardinality per resource id.
    const route: string = req.route?.path ?? url;
    const tenantId: string | undefined = req.user?.tenantId ?? req.user?.tenant_id;
    const userId: string | undefined = req.user?.id ?? req.user?.sub;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          res.setHeader?.('x-correlation-id', correlationId);
          const duration = Date.now() - start;
          this.metrics.httpRequestDuration.observe(
            { method, route, status: String(res.statusCode) },
            duration,
          );
          process.stdout.write(
            JSON.stringify({
              level: duration > SLOW_REQUEST_MS ? 'warn' : 'info',
              correlationId,
              tenantId,
              userId,
              method,
              url,
              status: res.statusCode,
              duration,
              slow: duration > SLOW_REQUEST_MS,
              timestamp: new Date().toISOString(),
              service: 'ai-hrms-backend',
            }) + '\n',
          );
        },
        error: (err: any) => {
          const duration = Date.now() - start;
          this.metrics.httpRequestDuration.observe(
            { method, route, status: String(err?.status ?? 500) },
            duration,
          );
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              correlationId,
              tenantId,
              userId,
              method,
              url,
              error: err?.message,
              status: err?.status ?? 500,
              duration,
              timestamp: new Date().toISOString(),
              service: 'ai-hrms-backend',
            }) + '\n',
          );
        },
      }),
    );
  }
}
