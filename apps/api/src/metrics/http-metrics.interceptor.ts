import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { httpRequestDuration, httpRequestTotal } from './metrics.registry';

/**
 * Records every HTTP request's duration and outcome. Registered globally
 * (see MetricsModule) so it wraps every route without each controller
 * needing to know it exists.
 *
 * Uses res.on('finish') rather than tapping the interceptor's Observable
 * directly - on an error path, AllExceptionsFilter is what actually sets
 * the final status code and sends the response, and it runs *after* this
 * interceptor's Observable has already errored out. Recording
 * res.statusCode at that point would read whatever it was before the
 * filter ran (default 200), not the real error status. 'finish' fires only
 * once the response is genuinely complete, on both the success and error
 * paths, so the status code it reads is always the one actually sent.
 *
 * Route label uses req.route?.path (the matched route pattern, e.g.
 * `/products/:id`) rather than the raw URL - the raw URL would create a
 * new, ever-growing label value per distinct product ID requested, which
 * is exactly the "unbounded cardinality" mistake that quietly makes a
 * Prometheus instance fall over in production.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const route = req.route?.path ?? req.path ?? 'unknown';
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestTotal.inc(labels);
    });

    return next.handle();
  }
}
