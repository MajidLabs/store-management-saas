# Deployment

Everything is containerized (see the root `Dockerfile`s and `docker-compose.yml`), so any Docker-capable host works. Two concrete options, from least to most effort. **Neither of these was executed from the sandbox this project was built in** - outbound network access there is limited to package registries and GitHub, not cloud providers, and doing so would require your own account's credentials, which weren't available and shouldn't be pasted into a chat. Both are standard, well-documented paths; follow them directly against your own account.

## Option A: A single VPS (cheapest, full control)

Any $5-6/month VPS (DigitalOcean, Hetzner, Linode, etc.) with Docker installed works.

```bash
# On the VPS, once, after installing Docker + Docker Compose:
git clone <this-repo-url>
cd store-saas
cp .env.example .env
nano .env   # set real JWT secrets, CORS_ORIGIN to your real domain, etc.
docker compose up --build -d
```

Put a reverse proxy (Caddy or nginx) in front for HTTPS - Caddy is the least config:

```
# Caddyfile
your-domain.com {
    handle_path /api/* {
        reverse_proxy localhost:3000
    }
    reverse_proxy localhost:3001
}
```

`handle_path` (not a plain `reverse_proxy` path matcher) matters here: it strips the `/api` prefix before forwarding, matching this API's routes (`/auth/login`, `/products`, etc. - no `/api` prefix internally). Without it, `your-domain.com/api/auth/login` would forward as `/api/auth/login` to a backend that only has `/auth/login`, a 404 that only shows up once actually deployed behind this proxy - set `NEXT_PUBLIC_API_URL=https://your-domain.com/api` accordingly.

To deploy new changes: `git pull && docker compose up --build -d`. Automating this over SSH from a CI workflow (a `deploy` job triggered on merge to `main`) is the natural next step - see `docs/ARCHITECTURE.md` §16 for what that workflow doesn't yet have (no `ci.yml` or build/push workflow exists in this repository as of this writing).

## Option B: A managed container platform (least effort)

Railway, Render, and Fly.io all support "point at a Dockerfile in my repo" deployment with a free or low-cost tier, good for a demo or early users. The general shape on any of them:

1. Connect your GitHub repo.
2. Create two services, one per Dockerfile: `apps/api/Dockerfile` and `apps/web/Dockerfile` (context: repo root - both Dockerfiles expect that).
3. Add a managed PostgreSQL addon (or point `DATABASE_URL` at one you already have).
4. Set the same environment variables as `.env.example` on the API service, and `NEXT_PUBLIC_API_URL` as a **build-time** variable on the web service (Next.js bakes `NEXT_PUBLIC_*` vars in at build, not runtime - see the `ARG`/`ENV` lines in `apps/web/Dockerfile`).
5. Point the web service's `NEXT_PUBLIC_API_URL` at the API service's public URL once you have it (may take one redeploy after the API service is up, to get its final URL).

Mailhog doesn't belong in a real deployment. Set `MAIL_TRANSPORT=smtp` plus `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` for your real provider (SendGrid, Postmark, SES, etc. - see `apps/api/.env.example`) - this is a genuine env-var switch as of §20's hardening pass, which built and tested `SmtpMailProvider` against a real (local) SMTP server. See `docs/ARCHITECTURE.md` §11 and §20 for what was and wasn't verified (a real local server, not a real provider account - test against your actual provider before relying on it).

## Either way, before going live

- [ ] Real, random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (not the `.env.example` placeholders)
- [ ] `CORS_ORIGIN` set to your real frontend domain, not `localhost`
- [ ] Real SMTP configured (Mailhog is dev-only)
- [ ] If using Stripe: real `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_PRO` from your Stripe dashboard, and the webhook endpoint (`/billing/webhook`) registered there
- [ ] Change or delete the seeded SuperAdmin/demo-owner accounts (see the root README's Quick Start)
- [ ] HTTPS in front of both services (a reverse proxy on a VPS, or handled automatically by the managed platform)
- [ ] `REDIS_URL` pointed at a real Redis instance - required at runtime once `QueueModule`/`TenantContextModule` are in the boot path, not optional (see `docs/ARCHITECTURE.md` §20)
- [ ] The non-superuser `app_runtime` database role from `docs/ARCHITECTURE.md` §20's RLS section - `DATABASE_URL` for the running app (not migrations) needs to point at this role, not `postgres`, or Row-Level Security on `products` silently does nothing
- [ ] `monitoring/prometheus.yml` and `monitoring/alerts.yml` pointed at your real deployment target and a real Alertmanager (or equivalent) - see that section below

## Monitoring

`GET /metrics` (see `docs/ARCHITECTURE.md` §20) exposes real Prometheus-format metrics - it needs something actually scraping and alerting on it to be useful, which this repo doesn't run for you:

1. Point a Prometheus instance at `monitoring/prometheus.yml` (edit the `targets` under `scrape_configs` first - it's currently the Docker Compose service name, not a real deployed host).
2. `monitoring/alerts.yml` has four starting alerts (`HighErrorRate`, `HighLatencyP99`, `EventLoopLagHigh`, `ServiceDown`) - syntax and firing behavior are both verified (`promtool check rules` / `promtool test rules monitoring/alerts.test.yml`), but the thresholds are reasonable starting points, not tuned against this app's real traffic, since it doesn't have any yet. Revisit them once it does.
3. Wire Prometheus's Alertmanager (or your platform's equivalent - Grafana Cloud, Datadog, etc. all have a "receive alerts from a Prometheus-compatible source" path) to actually notify someone - a firing alert nobody sees is no better than no alert.

## Rollback

If a deploy goes bad, in order of how fast each one is to actually do:

1. **Redeploy the previous image tag.** This assumes CI builds and tags images per-commit (e.g. by commit SHA) - confirm whether `.github/workflows/` actually has a build-and-push workflow doing that in your copy of this repo before relying on it; only `backup.yml` (this pass's own addition) is present as of this writing, so if there's no image-tagging workflow yet, this step means building and pushing the previous commit's image by hand instead of pulling an already-tagged one. Either way, the fastest rollback on Railway/Render/Fly is usually "redeploy this specific previous build" from their own dashboard/CLI. On a bare VPS: `docker compose pull api:<previous-tag> && docker compose up -d api` (adjust to however your compose file references the image tag).
2. **Database migrations are the part that doesn't automatically roll back with the code.** Check whether the bad deploy included a migration:
   - If it didn't: step 1 alone is a complete rollback.
   - If it did, and the migration is purely additive (a new nullable column, a new table): the previous code version usually still runs fine against the new schema - step 1 alone is often still enough. Confirm the specific migration is additive before assuming this.
   - If the migration changed or removed something the previous code depends on: run that migration's `down()` explicitly before redeploying the old image - `docker compose exec api node_modules/.bin/typeorm migration:revert -d dist/database/data-source.js` (reverts exactly one migration; run it again to revert further back). Every migration in this repo has a real `down()` - see `apps/api/src/database/migrations/`.
3. **If the database itself is corrupted, not just the schema** (bad data written by the bad deploy, not a schema mismatch): restore from the most recent backup instead of trying to hand-fix data - see `scripts/restore.sh` and the backup section in `docs/ARCHITECTURE.md` §20. This loses any writes since that backup, which is exactly why automated, frequent backups (the scheduled `.github/workflows/backup.yml`) matter more than this runbook does.

None of the above has been executed as a drill in this sandbox (no live deployment exists to roll back - see README.md's "Known limitations"). `migration:revert` itself was exercised locally against a real Postgres instance (each migration's `down()` runs as part of local development, not just written and assumed correct), but the *deploy-a-previous-image* half of this runbook is guidance based on how these platforms document rollback, not something run end-to-end.

## Staging environment

Not run anywhere (no cloud deployment exists yet at all - see README.md's "Known limitations"), but the shape of one, using what this repo already has:

- A second, separate deployment of the same setup above (Option A or B), with its own database, its own `.env` values, and ideally its own Stripe/SMTP/S3 credentials in test/sandbox mode rather than the same production ones.
- Point CI at it: a `deploy-staging` job that runs on every merge to `main`, before anything resembling a manual production deploy step, so staging always reflects what's about to ship. This repo doesn't have a CI/CD workflow file for this yet (`.github/workflows/` currently only has `backup.yml`, added in this same pass) - it's a real gap, not something to assume is already wired up.
- The main thing a staging environment is actually for here: running `docs/TESTING_CHECKLIST.md`'s full interactive browser pass (never done anywhere yet - see `docs/ARCHITECTURE.md`'s status line) somewhere that isn't production, before it's ever run there instead.
