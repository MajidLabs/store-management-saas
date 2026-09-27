#!/bin/sh
set -eu

: "${APP_RUNTIME_DB_PASSWORD:=app_runtime_pw}"

# Runs automatically on the postgres container's first boot (mounted into
# /docker-entrypoint-initdb.d/ - see docker-compose.yml; the official
# postgres image executes every .sh/.sql file there, once, only when the
# data directory is first initialized - it will NOT re-run on an existing
# volume, so this needs a fresh `docker compose down -v` + `up` to take
# effect on a database that already exists without app_runtime).
#
# Creates the non-superuser, non-bypassrls role RLS on `products` actually
# depends on (see docs/ARCHITECTURE.md §20's RLS section) - the default
# POSTGRES_USER (postgres) is a superuser, and superusers unconditionally
# bypass Row-Level Security regardless of any policy. Migrations still run
# as postgres (see apps/api/Dockerfile's CMD, which uses
# MIGRATION_DATABASE_URL for that one step) - only the running app
# connects as app_runtime, via DATABASE_URL.
#
# Unlike the old .sql version of this file, the password below is read
# from APP_RUNTIME_DB_PASSWORD (set on the postgres service in
# docker-compose.yml, same variable the api service's DATABASE_URL uses)
# instead of being hardcoded - so it can never drift out of sync with the
# value the app actually connects with. Falls back to app_runtime_pw only
# if the variable is entirely unset, matching this project's local-dev
# default.
#
# Written with psql meta-commands (\gset/\if), not a DO $$ ... $$ block:
# psql does NOT interpolate :'variables' inside a dollar-quoted string,
# since dollar-quoting exists precisely to embed literal text - so a
# password variable placed inside DO $$ ... $$ would reach the server as
# the literal 5 characters ":'app_runtime_password'", not the password.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_runtime_password="$APP_RUNTIME_DB_PASSWORD" \
  -v app_db="$POSTGRES_DB" <<-'EOSQL'
SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') AS role_exists \gset

\if :role_exists
\echo 'app_runtime role already exists, skipping creation'
\else
CREATE ROLE app_runtime WITH LOGIN PASSWORD :'app_runtime_password' NOSUPERUSER NOBYPASSRLS;
\endif

GRANT CONNECT ON DATABASE :"app_db" TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
-- Applies to tables created by LATER migrations too, not just whatever
-- exists at the moment this script runs (which is none - this file runs
-- before the app's own migrations ever do).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
EOSQL
