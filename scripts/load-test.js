// Run with: k6 run scripts/load-test.js
// (or against a different target: k6 run -e BASE_URL=https://your-domain.com scripts/load-test.js)
//
// k6 itself was not run in this sandbox - it's a Go binary with no
// straightforward install path here, and no network access to k6's own
// distribution channel from this sandbox's allowlist. The equivalent
// autocannon-based test that WAS actually run, with real results (req/sec,
// latency percentiles, and a rate-limiter finding this test also exercises
// below), is in docs/ARCHITECTURE.md's load testing section. This script
// is the more standard, more full-featured tool for whoever runs the next
// round - multi-stage ramps and scenario-based checks like below are
// awkward in autocannon, which is why this exists as more than a
// duplicate.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    ramping_health_check: {
      executor: 'ramping-vus',
      exec: 'healthCheck',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 500 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // These are starting points, not settled SLOs - tighten once you have
    // a real baseline from your actual deployment target's hardware.
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'not rate-limited': (r) => r.status !== 429,
  });
  sleep(0.1);
}

// A second scenario worth adding once you have test-store credentials to
// script: register a store, log in, then hammer GET /products (a real
// authenticated, database-reading endpoint) rather than only the
// dependency-free /health check above. That's the number that actually
// tells you something about database connection pool sizing under load -
// /health deliberately touches nothing, so it will always be the fastest,
// most misleadingly optimistic result in this file.
