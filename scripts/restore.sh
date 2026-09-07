#!/usr/bin/env bash
# Restores a pg_dump custom-format backup (see backup.sh) into the database
# at DATABASE_URL. Destructive: drops every existing object in the target
# database first (--clean --if-exists), so this always restores into a
# clean copy of exactly what the dump contains, never a merge with whatever
# the target already had.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/restore.sh backups/store-saas-20260101T000000Z.dump
#
# Verified in this sandbox: restored a real dump (produced by backup.sh)
# into a real local PostgreSQL 16 database and confirmed the row counts and
# actual data matched the pre-backup state exactly - the round trip that
# matters, not just that pg_restore exits 0. NOT verified: restoring into
# the Dockerized postgres service, or a managed/cloud target - see
# backup.sh's comment for the same boundary.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Usage: DATABASE_URL=... ./scripts/restore.sh <path-to-dump-file>" >&2
  exit 1
fi

DB_NAME=$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')
echo "About to restore '$DUMP_FILE' into database '$DB_NAME', dropping everything currently in it first."
if [ -t 0 ]; then
  read -r -p "Type the database name to confirm: " CONFIRM
  if [ "$CONFIRM" != "$DB_NAME" ]; then
    echo "Names didn't match - aborting, nothing was touched." >&2
    exit 1
  fi
else
  # Non-interactive (CI, a script calling this) - require the same
  # confirmation as an explicit env var instead of a TTY prompt, so this
  # can't be triggered by accident by something non-interactive.
  if [ "${CONFIRM_RESTORE:-}" != "$DB_NAME" ]; then
    echo "Non-interactive shell: set CONFIRM_RESTORE=$DB_NAME to proceed." >&2
    exit 1
  fi
fi

echo "Restoring ..."
pg_restore -d "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$DUMP_FILE"
echo "Restore complete."
