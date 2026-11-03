#!/usr/bin/env bash
# Destructive integration test for PostgreSQL backup/restore.
# The target must be a separate disposable database whose name includes
# test, staging, or restore. Production/source targets are never restored over.

set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_URL="${DATABASE_URL:?DATABASE_URL is required}"
TEST_URL="${TEST_DB_URL:?TEST_DB_URL is required}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
(( ${#PASSPHRASE} >= 32 )) || { echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE must contain at least 32 characters" >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump is required" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql is required" >&2; exit 1; }
command -v gpg >/dev/null 2>&1 || { echo "ERROR: gpg is required" >&2; exit 1; }

PROD_TARGET="$(psql "$PROD_URL" -Atc "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || COALESCE(inet_server_port()::text, 'local')")"
TEST_TARGET="$(psql "$TEST_URL" -Atc "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || COALESCE(inet_server_port()::text, 'local')")"
PROD_DB="${PROD_TARGET%%|*}"
TEST_DB="${TEST_TARGET%%|*}"

[[ "$PROD_TARGET" != "$TEST_TARGET" ]] || { echo "ERROR: source and restore targets are identical" >&2; exit 1; }
case "${TEST_DB,,}" in
  *test*|*staging*|*restore*) ;;
  *) echo "ERROR: TEST_DB_URL must target a disposable database named with test, staging, or restore" >&2; exit 1 ;;
esac

BACKUP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BACKUP_DIR"; }
trap cleanup EXIT
export BACKUP_DIR
export BACKUP_ENCRYPTION_REQUIRED=true
export NODE_ENV=production

echo "Creating encrypted PostgreSQL backup from source database '$PROD_DB'..."
DATABASE_URL="$PROD_URL" bash "$ROOT/scripts/backup-db.sh"
BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz.gpg' -print -quit)"
[[ -n "$BACKUP_FILE" && -s "$BACKUP_FILE" ]] || { echo "ERROR: encrypted backup artifact missing" >&2; exit 1; }

echo "Preparing disposable restore database '$TEST_DB'..."
psql --set ON_ERROR_STOP=on "$TEST_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Restoring encrypted backup into the isolated target..."
DATABASE_URL="$TEST_URL" BACKUP_ENCRYPTION_PASSPHRASE="$PASSPHRASE" RESTORE_CONFIRM=RESTORE \
  bash "$ROOT/scripts/restore-db.sh" "$BACKUP_FILE"

SOURCE_USERS="$(psql --set ON_ERROR_STOP=on "$PROD_URL" -Atc 'SELECT count(*) FROM "User"')"
RESTORED_USERS="$(psql --set ON_ERROR_STOP=on "$TEST_URL" -Atc 'SELECT count(*) FROM "User"')"
SOURCE_VEHICLES="$(psql --set ON_ERROR_STOP=on "$PROD_URL" -Atc 'SELECT count(*) FROM "Vehicle"')"
RESTORED_VEHICLES="$(psql --set ON_ERROR_STOP=on "$TEST_URL" -Atc 'SELECT count(*) FROM "Vehicle"')"

[[ "$SOURCE_USERS" == "$RESTORED_USERS" ]] || { echo "ERROR: restored User count differs" >&2; exit 1; }
[[ "$SOURCE_VEHICLES" == "$RESTORED_VEHICLES" ]] || { echo "ERROR: restored Vehicle count differs" >&2; exit 1; }

echo "Encrypted PostgreSQL backup/restore passed. User=$RESTORED_USERS Vehicle=$RESTORED_VEHICLES"
