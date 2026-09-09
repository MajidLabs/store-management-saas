# Store Management SaaS

A multi-tenant SaaS for managing retail stores: store owners sign up, subscribe to a plan, and manage their product catalog, inventory, and orders through an admin panel. Staff can be invited with limited permissions. A platform SuperAdmin oversees every tenant store. This is a back-office management tool, not a public customer-facing storefront.

## Stack

Next.js 14 (admin panel) · NestJS + TypeORM + PostgreSQL (API) · Docker Compose · GitHub Actions (scheduled database backups)

## Architecture

Full system design, data model, and the reasoning behind every architectural trade-off: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Security

- Passwords hashed with bcrypt; short-lived JWT access token + rotated refresh token via Passport.js
- Tokens stored in `httpOnly` cookies, not `localStorage` — invisible to JavaScript, so an XSS bug elsewhere can't exfiltrate them
- CSRF protection (double-submit cookie pattern) enforced on every mutating request
- Rate limiting on every auth endpoint (register, login, refresh, password reset)
- Role-based access control (SuperAdmin / StoreOwner / Staff), enforced by guards reading the verified JWT
- Tenant isolation: every query scoped by `storeId` taken from the JWT, never from client-supplied input
- Self-service password reset: enumeration-safe (always 204), single-use token, 1-hour expiry, invalidates the user's existing session
- Every DTO validated (`class-validator`), all queries parameterized (TypeORM), `helmet` security headers

Full detail on each of these, including how they were actually verified: **[docs/ARCHITECTURE.md §9](docs/ARCHITECTURE.md)**.

## Features

- Multi-tenant store isolation
- JWT authentication with refresh-token rotation
- httpOnly cookie auth + CSRF protection
- Role-based access control
- SuperAdmin store management and suspension
- Product / category / order management with search, filter, and pagination
- Inventory tracking with atomic stock updates
- Staff management with plan-based seat limits
- Self-service password reset; password fields include a show/hide toggle
- Subscription billing (mock by default; Stripe test mode with signature-verified, idempotent webhooks optional) - handles both checkout completion and subscription cancellation
- Product image uploads, validated against the file's actual bytes, not just the client-supplied Content-Type
- Email: Mailhog locally by default; a real SMTP provider (SendGrid/Postmark/SES/etc, `MAIL_TRANSPORT=smtp`) is implemented and tested against a real SMTP server, not just local disk
- File storage: local disk by default; S3-compatible storage (`STORAGE_PROVIDER=s3` - AWS S3, R2, Spaces, MinIO) is implemented and tested against a real S3-compatible server
- Prometheus metrics (`/metrics`) alongside structured logs
- Swagger / OpenAPI docs
- Unit + API/e2e test suites, run locally against a real PostgreSQL service
- Docker Compose for local development and deployment; a scheduled GitHub Actions workflow for automated database backups (no CI pipeline yet — see docs/ARCHITECTURE.md §16)
- Backup/restore scripts, verified against a real PostgreSQL instance

## Testing

Unit and API/e2e suites are included and run locally against a real PostgreSQL service — nothing is mocked at the database layer. No CI workflow runs them automatically yet (see `docs/ARCHITECTURE.md` §16). The SMTP and S3 storage providers are each tested against a real local server of their kind (not a mock of the SDK), and Stripe webhook handling is tested with genuinely-signed test events. See **[docs/ARCHITECTURE.md §13](docs/ARCHITECTURE.md)** for coverage detail, and **§20** for an August 2026 pass that found and fixed a real e2e-suite bug (stale from the cookie-auth migration) alongside the additions above.

```bash
pnpm --filter api test           # unit
pnpm --filter api test:e2e       # API/e2e, against a real Postgres connection
pnpm --filter web lint
```

An interactive browser checklist (**[docs/TESTING_CHECKLIST.md](docs/TESTING_CHECKLIST.md)**) now covers tenant-isolation cross-store checks and password-reset/CSRF/rate-limit checks specifically (§9-10), plus a focused §11 that re-verified the 5 September 2026 fixes below - both the full §1-10 pass and the §11 re-verification are done, neither repeated here. The first full run, in September 2026, was manual: the developer clicking through the actual running app in a real Chrome tab, not code review and not automated tooling — and that hands-on pass is exactly how the 4 real bugs below were caught (2 with a different root cause than first suspected - see `docs/ARCHITECTURE.md` §21). None of them were visible from the API-level tests alone; that's the gap manual browser testing exists to catch. All 4 are fixed, covered by new/updated unit and e2e tests, and the fixes themselves have since been re-confirmed directly in an actual browser tab too (§11, see `docs/ARCHITECTURE.md` §22). Every other check in this project remains at the API level (curl / Supertest).

## Deployment

### Quick start (local)

```bash
git clone <this-repo-url>
cd store-saas
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---|---|
| Admin panel | http://localhost:3001 |
| API | http://localhost:3000 |
| Swagger / OpenAPI docs | http://localhost:3000/api/docs |
| Mailhog (catches every email sent locally) | http://localhost:8025 |

First boot runs database migrations automatically. The database starts **empty** — create a store from the admin panel's "Create your store" screen, or seed sample data:

```bash
docker compose exec api node dist/database/seed.js
```

Creates a SuperAdmin (`admin@example.com` / `ChangeMe123!`) and a demo store with sample products. **Change both passwords before using this anywhere but your own machine** — override `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD`, `SEED_DEMO_OWNER_EMAIL`, `SEED_DEMO_OWNER_PASSWORD` in `.env` before seeding if you want different values from the start.

```bash
docker compose down          # stop everything, keep the database volume
docker compose down -v       # stop and wipe the database too
```

### Local development (without Docker)

Requires Node 20+, pnpm (`corepack enable`), and a local PostgreSQL instance.

```bash
pnpm install

# apps/api/.env - see apps/api/.env.example
pnpm --filter api migration:run
pnpm --filter api start:dev      # http://localhost:3000

# apps/web/.env.local - NEXT_PUBLIC_API_URL=http://localhost:3000
pnpm --filter web dev            # http://localhost:3001
```

### Cloud deployment

Two runbooks — a VPS with `docker compose`, or a managed container platform: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

### Zero-config by default

Every third-party integration has a zero-config local/default implementation, so the app is fully usable immediately after `docker compose up`:

| Concern | Default (zero config) | Real provider (opt-in) |
|---|---|---|
| Payments | Mock provider — instant simulated upgrade | Stripe test mode via `PAYMENT_PROVIDER=stripe` + `STRIPE_*` vars |
| Email | Mailhog — catches everything at `:8025` | Real SMTP via `MAIL_TRANSPORT=smtp` + `SMTP_*` vars — see `docs/ARCHITECTURE.md` §11 |
| File storage | Local disk, served from the API container | S3-compatible storage via `STORAGE_PROVIDER=s3` + `S3_*` vars — see `docs/ARCHITECTURE.md` §10 |

## Known limitations

This is a production-capable MVP foundation, not yet hardened for commercial-scale workloads. Before real customers and real money:

- Live cloud deployment (Docker images are ready; no CI/CD pipeline exists yet - only a scheduled backup workflow, see `docs/ARCHITECTURE.md` §16)
- Real Stripe/S3 verification (code paths exist and are tested against local stand-ins - Stripe test-mode webhooks, `s3rver` - not the real services); SMTP is the exception, now verified against a real production provider on an authenticated sending domain, not just a local stand-in (see `docs/ARCHITECTURE.md` §11/§20)
- PostgreSQL Row-Level Security is scoped to the `products` table only - `categories`, `orders`, and other tables still rely on application-level tenant filtering alone, not a database-level policy (see `docs/ARCHITECTURE.md` §7/§20)
- Production backup/restore verification (tested locally against real PostgreSQL, not against a deployed target)
- Monitoring/alerting deployment (a Prometheus metrics endpoint and alert definitions exist and are tested with `promtool`; nothing live is scraping or alerting on them yet)
- Dependency upgrades (Next.js 14→15, `@nestjs/core` 10→11 — both flagged, deliberately not attempted this pass)

A hardening pass (see `docs/ARCHITECTURE.md` §20) already closed a substantial list of related gaps at the code level — a background job queue, the outbox pattern, audit logs, an automated tenant-isolation suite, PostgreSQL Row-Level Security on `products`, and more — each genuinely tested locally, not just written. A follow-up pass (§21) ran the first real browser testing checklist and fixed everything it found, and a later pass (§22) re-confirmed all 5 of those fixes directly in a browser too - the full checklist (§1-11) is now complete. Full breakdown of what's implemented-and-tested vs. only planned: **[docs/ARCHITECTURE.md §19-22](docs/ARCHITECTURE.md)**.

## License

Apache 2.0 - see [LICENSE](LICENSE).
