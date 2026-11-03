#!/usr/bin/env bash
# MEKANIX — encrypted database backup (PostgreSQL production + SQLite development)
# Production requires AES-256 GPG encryption. Plaintext database dumps are never
# written to the backup volume when encryption is required.

set -Eeuo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
ENCRYPTION_REQUIRED="${BACKUP_ENCRYPTION_REQUIRED:-false}"
IS_PRODUCTION=false
[[ "${NODE_ENV:-}" == "production" || "${APP_ENV:-}" == "production" ]] && IS_PRODUCTION=true

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "ERROR: BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi
if [[ "$ENCRYPTION_REQUIRED" != "true" && "$ENCRYPTION_REQUIRED" != "false" ]]; then
  echo "ERROR: BACKUP_ENCRYPTION_REQUIRED must be true or false" >&2
  exit 1
fi
if [[ "$ENCRYPTION_REQUIRED" == "true" || "$IS_PRODUCTION" == "true" ]]; then
  if (( ${#PASSPHRASE} < 32 )) || [[ "$PASSPHRASE" == *$'\n'* ]]; then
    echo "ERROR: production backups require a single-line BACKUP_ENCRYPTION_PASSPHRASE of at least 32 characters" >&2
    exit 1
  fi
fi
if [[ -n "$PASSPHRASE" ]] && ! command -v gpg >/dev/null 2>&1; then
  echo "ERROR: gpg is required when backup encryption is enabled" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
if [[ -n "$PASSPHRASE" ]]; then
  GNUPGHOME="${GNUPGHOME:-${HOME:-/tmp}/.gnupg}"
  mkdir -p "$GNUPGHOME"
  chmod 700 "$GNUPGHOME"
  export GNUPGHOME
  BACKUP_FILE="$BACKUP_DIR/mekanix_${TIMESTAMP}.sql.gz.gpg"
else
  BACKUP_FILE="$BACKUP_DIR/mekanix_${TIMESTAMP}.sql.gz"
fi
BACKUP_TMP="$(mktemp "$BACKUP_DIR/.mekanix_${TIMESTAMP}.XXXXXX")"
trap 'rm -f "$BACKUP_TMP"' EXIT

encrypt_stream() {
  gpg --batch --yes --no-tty --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --output "$BACKUP_TMP" 3<<<"$PASSPHRASE"
}

echo "Creating database backup (encrypted=$([[ -n "$PASSPHRASE" ]] && echo true || echo false))..."
case "$DB_URL" in
  postgresql://*|postgres://*)
    command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump is not installed" >&2; exit 1; }
    if [[ -n "$PASSPHRASE" ]]; then
      pg_dump --no-owner --no-acl --clean --if-exists "$DB_URL" | gzip -c | encrypt_stream
    else
      pg_dump --no-owner --no-acl --clean --if-exists "$DB_URL" | gzip -c > "$BACKUP_TMP"
    fi
    ;;
  file:*)
    SQLITE_PATH="${DB_URL#file:}"
    [[ "$SQLITE_PATH" = /* ]] || SQLITE_PATH="$REPO_DIR/$SQLITE_PATH"
    [[ -f "$SQLITE_PATH" ]] || { echo "ERROR: SQLite database file not found" >&2; exit 1; }
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
    echo "ERROR: unsupported DATABASE_URL scheme; expected postgresql://, postgres://, or file:" >&2
    exit 1
    ;;
esac

[[ -s "$BACKUP_TMP" ]] || { echo "ERROR: backup output is empty" >&2; exit 1; }
if [[ -n "$PASSPHRASE" ]]; then
  # Verify both the GPG envelope and the compressed payload before publishing it.
  gpg --batch --quiet --no-tty --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt "$BACKUP_TMP" 3<<<"$PASSPHRASE" | gzip -t
else
  gzip -t "$BACKUP_TMP"
fi

chmod 600 "$BACKUP_TMP"
mv -f "$BACKUP_TMP" "$BACKUP_FILE"
BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
echo "Backup created and verified: $BACKUP_FILE ($BACKUP_SIZE)"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mekanix_*.sql.gz*' -mtime "+$RETENTION_DAYS" -delete
echo "Backup retention cleanup complete (retention_days=$RETENTION_DAYS)"
