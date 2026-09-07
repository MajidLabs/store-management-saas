import * as client from 'prom-client';

/**
 * A single shared registry for the whole process - both the default
 * process metrics (CPU, memory, event loop lag, GC) and the HTTP request
 * metrics recorded by HttpMetricsInterceptor live here, so GET /metrics
 * (see metrics.controller.ts) returns everything in one scrape.
 */
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Tuned for a typical CRUD API - sub-10ms for a cache hit or a health
  // check, up to a few seconds for something doing real work. A route
  // consistently landing in the top bucket is worth a closer look.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});
