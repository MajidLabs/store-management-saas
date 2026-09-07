#!/usr/bin/env bash
# Dumps the database at DATABASE_URL to backups/, in pg_dump's custom
# format (-Fc): compressed, and restorable with pg_restore (including
# selective/parallel restore), unlike a plain .sql file.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/backup.sh
#   (inside docker-compose: docker compose exec api ./scripts/backup.sh,
#   using the DATABASE_URL already set in that container's environment)
#
# Verified in this sandbox against a real local PostgreSQL 16 instance -
# dumped a database with real rows in it, dropped the database entirely, and
# restored it with scripts/restore.sh, confirming the round trip actually
# works, not just that pg_dump exits 0. NOT verified: running this against
# the Dockerized postgres service specifically (needs Docker, which this
# sandbox doesn't have) or any managed/cloud Postgres (RDS, Supabase, etc,
# which need their own account). Try both once you have either.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUTPUT_FILE="$BACKUP_DIR/store-saas-$TIMESTAMP.dump"

echo "Backing up to $OUTPUT_FILE ..."
pg_dump "$DATABASE_URL" -Fc -f "$OUTPUT_FILE"

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "Done: $OUTPUT_FILE ($SIZE)"

# Retention: keep the most recent N dumps, delete anything older. A backup
# that fills the disk it lives on is its own kind of outage - N=14 with a
# daily cron is two weeks of history, adjust to what your recovery-point
# objective (how much data you can afford to lose) actually needs.
KEEP="${BACKUP_RETENTION_COUNT:-14}"
ls -1t "$BACKUP_DIR"/store-saas-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "Removing old backup: $old"
  rm -f "$old"
done
