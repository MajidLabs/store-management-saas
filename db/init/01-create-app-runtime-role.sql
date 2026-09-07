-- Runs automatically on the postgres container's first boot (mounted into
-- /docker-entrypoint-initdb.d/ - see docker-compose.yml; the official
-- postgres image executes every .sql file there, once, only when the data
-- directory is first initialized - it will NOT re-run on an existing
-- volume, so this needs a fresh `docker compose down -v` + `up` to take
-- effect on a database that already exists without app_runtime).
--
-- Creates the non-superuser, non-bypassrls role RLS on `products` actually
-- depends on (see docs/ARCHITECTURE.md §20's RLS section) - the default
-- POSTGRES_USER (postgres) is a superuser, and superusers unconditionally
-- bypass Row-Level Security regardless of any policy. Migrations still run
-- as postgres (see apps/api/Dockerfile's CMD, which uses
-- MIGRATION_DATABASE_URL for that one step) - only the running app
-- connects as app_runtime, via DATABASE_URL.
--
-- The password below matches this sandbox's own local testing
-- (app_runtime_pw) purely so the docker-compose.yml env var default and
-- this script agree out of the box - change both together via
-- APP_RUNTIME_DB_PASSWORD if you're not just running this locally.
--
-- NOT verified against a real `docker compose up` - this sandbox has no
-- Docker to run that in. The equivalent role creation, grants, and RLS
-- enforcement (including a raw unfiltered query proving RLS actually
-- blocks cross-tenant access) WAS verified directly against a real local
-- PostgreSQL 16 instance - see the e2e Row-Level Security suite in
-- apps/api/test/app.e2e-spec.ts and docs/ARCHITECTURE.md §20. This file
-- mirrors that same logic for the Docker Compose path; verify it once
-- with a real `docker compose up` before trusting it there too.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime WITH LOGIN PASSWORD 'app_runtime_pw' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE store_saas TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
-- Applies to tables created by LATER migrations too, not just whatever
-- exists at the moment this script runs (which is none - this file runs
-- before the app's own migrations ever do).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
