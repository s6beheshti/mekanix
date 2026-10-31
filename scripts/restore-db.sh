#!/usr/bin/env bash
# MEKANIX — Database restore (supports encrypted .gpg and legacy .gz backups)
#
# Usage:
#   DATABASE_URL=... BACKUP_ENCRYPTION_PASSPHRASE=... bash scripts/restore-db.sh /backups/file.sql.gz.gpg
#   Type RESTORE when prompted, or set RESTORE_CONFIRM=RESTORE for automation.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="${1:?Usage: bash scripts/restore-db.sh <backup-file>}"
DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
RESTORE_TMP="$(mktemp)"
trap 'rm -f "$RESTORE_TMP"' EXIT

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ Backup file not found"
  exit 1
fi

if [[ "$BACKUP_FILE" == *.gpg && -z "$PASSPHRASE" ]]; then
  echo "❌ BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backups"
  exit 1
fi

echo "⚠️  WARNING: This replaces database contents."
echo "   Backup: $BACKUP_FILE"
case "$DB_URL" in
  postgresql://*|postgres://*) echo "   Target: PostgreSQL";;
  file:*) echo "   Target: SQLite";;
  *) echo "❌ Unsupported DATABASE_URL scheme"; exit 1;;
esac

if [[ "${RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  read -r -p "Type RESTORE to continue: " CONFIRM
  if [[ "$CONFIRM" != "RESTORE" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "📦 Preparing backup stream..."
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --decrypt "$BACKUP_FILE" 3<<<"$PASSPHRASE" | gzip -dc > "$RESTORE_TMP"
else
  gzip -dc "$BACKUP_FILE" > "$RESTORE_TMP"
fi

case "$DB_URL" in
  postgresql://*|postgres://*)
    if ! command -v psql >/dev/null 2>&1; then
      echo "❌ psql not installed"
      exit 1
    fi
    echo "📥 Restoring PostgreSQL dump..."
    psql --set ON_ERROR_STOP=on "$DB_URL" < "$RESTORE_TMP"
    ;;
  file:*)
    SQLITE_PATH="${DB_URL#file:}"
    [[ "$SQLITE_PATH" = /* ]] || SQLITE_PATH="$REPO_DIR/$SQLITE_PATH"
    mkdir -p "$(dirname "$SQLITE_PATH")"
    if command -v sqlite3 >/dev/null 2>&1 && head -c 128 "$RESTORE_TMP" | grep -aEiq "PRAGMA|BEGIN TRANSACTION|CREATE TABLE"; then
      echo "📥 Restoring SQLite SQL dump..."
      rm -f "$SQLITE_PATH"
      sqlite3 "$SQLITE_PATH" < "$RESTORE_TMP"
    else
      echo "📥 Restoring SQLite database file..."
      cp "$RESTORE_TMP" "$SQLITE_PATH"
    fi
    ;;
esac

echo "✅ Restore completed."
case "$DB_URL" in
  postgresql://*|postgres://*)
    psql "$DB_URL" -c 'SELECT count(*) AS migration_count FROM "_prisma_migrations";'
    ;;
  file:*)
    if command -v sqlite3 >/dev/null 2>&1; then
      SQLITE_PATH="${DB_URL#file:}"
      [[ "$SQLITE_PATH" = /* ]] || SQLITE_PATH="$REPO_DIR/$SQLITE_PATH"
      sqlite3 "$SQLITE_PATH" 'SELECT count(*) AS migration_count FROM "_prisma_migrations";' || true
    fi
    ;;
esac
