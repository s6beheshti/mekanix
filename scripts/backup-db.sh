#!/usr/bin/env bash
# MEKANIX — encrypted database backup (PostgreSQL production + SQLite development)
#
# Production requires BACKUP_ENCRYPTION_PASSPHRASE. Backups are encrypted as
# they are streamed, so plaintext dumps are never written to the backup volume.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
ENCRYPTION_REQUIRED="${BACKUP_ENCRYPTION_REQUIRED:-false}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ "$ENCRYPTION_REQUIRED" == "true" || "${NODE_ENV:-}" == "production" ]]; then
  if [[ -z "$PASSPHRASE" || ${#PASSPHRASE} -lt 32 ]]; then
    echo "❌ Production backups require BACKUP_ENCRYPTION_PASSPHRASE (32+ characters)"
    exit 1
  fi
fi

if [[ -n "$PASSPHRASE" ]]; then
  if ! command -v gpg >/dev/null 2>&1; then
    echo "❌ gpg is required when backup encryption is enabled"
    exit 1
  fi
  BACKUP_FILE="$BACKUP_DIR/mekanix_${TIMESTAMP}.sql.gz.gpg"
else
  BACKUP_FILE="$BACKUP_DIR/mekanix_${TIMESTAMP}.sql.gz"
fi
BACKUP_TMP="$BACKUP_FILE.tmp"
trap 'rm -f "$BACKUP_TMP"' EXIT

encrypt_stream() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --output "$BACKUP_TMP" 3<<<"$PASSPHRASE"
}

echo "📦 Creating database backup..."
echo "   Target: $BACKUP_FILE"

case "$DB_URL" in
  postgresql://*|postgres://*)
    echo "   Type: PostgreSQL"
    if ! command -v pg_dump >/dev/null 2>&1; then
      echo "❌ pg_dump not installed"
      exit 1
    fi
    if [[ -n "$PASSPHRASE" ]]; then
      pg_dump --clean --if-exists "$DB_URL" | gzip -c | encrypt_stream
    else
      pg_dump --clean --if-exists "$DB_URL" | gzip -c > "$BACKUP_TMP"
    fi
    ;;
  file:*)
    echo "   Type: SQLite"
    SQLITE_PATH="${DB_URL#file:}"
    [[ "$SQLITE_PATH" = /* ]] || SQLITE_PATH="$REPO_DIR/$SQLITE_PATH"
    if [[ ! -f "$SQLITE_PATH" ]]; then
      echo "❌ SQLite file not found: $SQLITE_PATH"
      exit 1
    fi
    if command -v sqlite3 >/dev/null 2>&1; then
      if [[ -n "$PASSPHRASE" ]]; then
        sqlite3 "$SQLITE_PATH" .dump | gzip -c | encrypt_stream
      else
        sqlite3 "$SQLITE_PATH" .dump | gzip -c > "$BACKUP_TMP"
      fi
    else
      if [[ -n "$PASSPHRASE" ]]; then
        gzip -c "$SQLITE_PATH" | encrypt_stream
      else
        gzip -c "$SQLITE_PATH" > "$BACKUP_TMP"
      fi
    fi
    ;;
  *)
    echo "❌ Unsupported DATABASE_URL scheme; expected postgresql://, postgres://, or file:"
    exit 1
    ;;
esac

if [[ ! -s "$BACKUP_TMP" ]]; then
  echo "❌ Backup file is empty"
  exit 1
fi
chmod 600 "$BACKUP_TMP"
mv "$BACKUP_TMP" "$BACKUP_FILE"
BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

echo "🧹 Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -maxdepth 1 -type f -name "mekanix_*.sql.gz*" -mtime "+$RETENTION_DAYS" -delete
echo "📋 Recent backups:"
find "$BACKUP_DIR" -maxdepth 1 -type f -name "mekanix_*.sql.gz*" -print | sort -r | head -5 || true
echo "✅ Backup verified (non-empty)"
