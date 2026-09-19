# Changelog & Build History

This is the historical record of how this project was built, tested, and hardened — including things that were tried, found wrong, and fixed. For the current architecture only, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Phase 1 — Foundation
Monorepo scaffold, TypeORM entities + first migration, Docker Compose (postgres + api), auth (register/login/refresh), RBAC guards, Swagger, health check.

- **ORM changed from Prisma to TypeORM.** `prisma init` needed to fetch query-engine binaries from a domain outside the build sandbox's network allowlist, so the install hard-failed. TypeORM has no external binary dependency.

## Phase 2 — Core Business Logic
Categories/Products CRUD + search/filter/pagination, file upload, staff management with plan-limit enforcement, orders with atomic stock decrement, email (Mailhog), unit + API tests.

- **Bug found and fixed:** `Store.isSuspended` existed on the entity and in the database but nothing ever read it — suspending a store had no effect. Fixed with two layers: login rejects a suspended store's owner/staff, and `StoreSuspensionGuard` blocks an already-issued, still-valid access token immediately rather than waiting for it to expire.

## Phase 3 — Billing + Frontend
Subscription module (mock + Stripe test mode), Next.js admin panel (auth, dashboard, product/order management, staff management, role-gated UI, SuperAdmin view).

- **Gap identified:** interactive browser testing hadn't happened yet — Playwright's browser-binary CDN was outside the build sandbox's network allowlist, so `docs/TESTING_CHECKLIST.md` was written as a stand-in to be run manually. (Later run — see Phases below.)
- Two issues anticipated and fixed ahead of that run: a `pnpm seed:prod` failure in the Docker runtime stage (fixed by running the compiled script directly), and a documented first-boot Postgres WAL-recovery delay.

## Phase 4 — Polish & Delivery
Logging/error handling, security pass (helmet, rate limiting, CORS), CI/CD, README, deployment runbook.

- **False claim, later corrected:** this phase originally claimed `ci.yml` and `build-and-push.yml` existed and had been run "manually in this sandbox." Neither file existed at the time — caught during a later documentation audit, not at the time it was written. A real `ci.yml` was built afterward (see "CI/CD Pipeline" below), with every command individually verified before being committed.
- **Bug found while writing the README:** the documented `pnpm seed` command relied on `ts-node`, which the production Docker image never ships. Added a `seed:prod` script running the compiled `dist/database/seed.js` directly.

## Post-Delivery Security & Documentation Review
A systematic pass that found and fixed eight issues:

1. **pnpm build-script allow-list** — `allowBuilds` must live in `pnpm-workspace.yaml`, not `package.json` or `pnpm config set` (silently ignored in both). Already correct at the repo root; the actual bug was that file being absent from the *runtime* Docker stage.
2. **Dead config removed** — `package.json`'s `onlyBuiltDependencies` block was obsolete under pnpm v11+; `allowBuilds` in `pnpm-workspace.yaml` was already doing the real work.
3. Minor typo/config cleanup (see repo history).
4. **Phantom file reference, fixed:** this document referenced a `docker-compose.test.yml` that never existed in the delivered project. Corrected to describe what actually runs: a local e2e run against whatever `DATABASE_URL` is set in `.env`.
5. **Missing rate limit, fixed:** `POST /auth/refresh` had no endpoint-specific limit. Added 30/min.
6. **Missing feature, built:** no password-reset flow existed for any role. Built self-service request/reset endpoints (SHA-256 hashed, single-use, 1-hour expiry, also revokes the session).
7. **README claim, corrected:** the README claimed a `MAIL_PROVIDER` env var could swap in a real SMTP provider — no such env var existed; `MailModule` hardcoded Mailhog with no switching mechanism. Corrected the README and built the actual switching mechanism (see Hardening Pass below). Also added missing `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` to `.env.example`.
8. **README claim, corrected:** section 10 described `S3StorageProvider` as an existing, optional provider. It didn't exist yet — only local disk storage was built. Corrected the README; built for real in the Hardening Pass below.

Also in this pass: tokens moved from `localStorage` to httpOnly cookies with CSRF protection, verified live end-to-end (including that a stolen refresh token is genuinely rejected after logout) — which also caught a real runtime bug (`cookie-parser`'s default import was `undefined` at runtime under this project's `tsconfig`, fixed by switching to `import x = require('y')`).

## Production Hardening Pass (August 2026)
Working through the "before any real deployment" checklist.

- **Bug found and fixed:** `test/app.e2e-spec.ts` was still reading `res.body.accessToken`, a contract that stopped being true once auth moved to httpOnly cookies. 6 of 10 e2e tests had been silently failing since that migration. Fixed by reading the token from `Set-Cookie` instead.
- **`SmtpMailProvider` built for real** (STARTTLS, tested against a local SMTP server, later verified against a real production account with SPF/DKIM/DMARC passing and a real delivered email).
- **`S3StorageProvider` built for real** (tested against a local S3-compatible server; caught a real bug where the key sanitizer stripped `/` entirely, which would have flattened hierarchical keys). Not yet tested against a real AWS/R2/Spaces bucket.
- **Stripe webhook idempotency added** — a `webhook_events` table prevents redelivered events from being reapplied; added `customer.subscription.deleted` handling (previously only completion was handled, so a cancelled subscription was never reflected).
- **File upload validation added** — magic-byte signature check against the claimed file type, not just the spoofable `Content-Type` header.
- **`/metrics` endpoint added** (Prometheus). Caught a real bug first: the interceptor read `res.statusCode` before the exception filter had set the final status on error paths, recording 200 for failed requests. Fixed with `res.on('finish', ...)`.
- **Backup/restore scripts added and verified** with a real `pg_dump` → `DROP DATABASE` → `pg_restore` round trip against a real local Postgres; row counts and content matched.
- **Dependency audit** — 42 known vulnerabilities found, reduced to 26 via `pnpm-workspace.yaml` overrides. The remaining 26 are dominated by Next.js 14 and `@nestjs/core` both being a major version behind; flagged as needing a dedicated upgrade pass, not fixed here.
- **Load testing with `autocannon`** — found a real bug: the global rate limiter (100/min) applied to the health-check endpoint itself, so a monitoring probe polling frequently would get 429'd. Fixed with `@SkipThrottle()` on health/metrics controllers.
- Background job queue (BullMQ/Redis) for email, the outbox pattern (so a failed email can't roll back a committed order), audit logs, idempotency keys on orders/checkout, and automated tenant-isolation e2e tests were all added in this pass.
- PostgreSQL Row-Level Security added for `products` as a second, database-level tenant-isolation layer independent of application-level filtering.

## Manual Browser Testing Pass (September 2026)
First real interactive pass against `docs/TESTING_CHECKLIST.md`, in an actual browser tab. Found 4 real bugs, all fixed:

- **"Category doesn't persist" — not a persistence bug.** The category was saved correctly; `findAll()`/`findOne()` just never loaded the relation, so the API response's `category` field was always `undefined`. Fixed by adding the join/relation load.
- **"Broken image thumbnails, CORS error" — not a CORS bug.** `Access-Control-Allow-Origin` was already correct; the actual blocker was Helmet's `Cross-Origin-Resource-Policy: same-origin` default, a separate mechanism from CORS. Fixed by overriding that one header, scoped to `/uploads` only.
- **Downgrading Pro→Free didn't enforce the Free plan's staff limit.** Fixed with two layers: a live downgrade request is now rejected with 409 if over the limit; a downgrade arriving via webhook (already happened on Stripe's side) instead blocks staff logins (not the owner) until resolved.
- **Uploaded images were lost on container recreation.** `docker-compose.yml` had a named volume for Postgres but not for the API's upload directory. Added `uploads_data`.

Also flagged (not a bug, not built): a password show/hide toggle on login forms — added in a same-week follow-up once confirmed wanted, verified with 13 passing component-level checks.

## Browser Re-Confirmation (§11 of the Testing Checklist)
All 5 fixes above (4 bugs + the password toggle) were re-confirmed directly in a real browser tab against a real running build — the first Chrome-tab confirmation anywhere in this project's history that goes beyond curl/Supertest/jsdom for these specific fixes. All 5 passed, no regressions found.

## RLS Extended to Categories and Orders
Extended Row-Level Security from `products` alone to `categories` and `orders`, same policy shape. Converting `CategoriesService` to read through the transaction-scoped repository getter was required — a plain injected repository would have started silently returning zero rows the moment `FORCE ROW LEVEL SECURITY` went on. `order_items` deliberately has no policy of its own (no `store_id` column; scoped only through its parent `orders` row).

## CI/CD Pipeline Built
A real `.github/workflows/ci.yml` was built, after two earlier passes over this document first falsely claimed a pipeline existed (Phase 4, above) and then correctly said none did.

- Every command was individually verified locally against a real Postgres/Redis before being committed.
- **The first real run on GitHub's own runners still surfaced two bugs no local check had caught:** a prettier-formatting fix that never made it into the delivered file list, and `JWT_ACCESS_EXPIRY`/`JWT_REFRESH_EXPIRY` missing from the workflow's `env:` block (present locally only via a real `.env` file GitHub Actions has no equivalent for, which crashed nearly the entire e2e suite). Both fixed; the run on `main` has since gone green twice, on two separate commits.
