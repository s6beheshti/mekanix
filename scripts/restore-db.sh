#!/usr/bin/env bash
# MEKANIX — database restore (encrypted .gpg and legacy .gz backups)
# Stop application writers before restoring. Use a separate test database first.

set -Eeuo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="${1:?Usage: bash scripts/restore-db.sh <backup-file>}"
DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
RESTORE_TMP="$(mktemp)"
SQLITE_TMP=""
cleanup() {
  rm -f "$RESTORE_TMP"
  [[ -z "$SQLITE_TMP" ]] || rm -f "$SQLITE_TMP"
}
trap cleanup EXIT

[[ -f "$BACKUP_FILE" ]] || { echo "ERROR: backup file not found" >&2; exit 1; }
case "$DB_URL" in
  postgresql://*|postgres://*) TARGET_KIND="PostgreSQL";;
  file:*) TARGET_KIND="SQLite";;
  *) echo "ERROR: unsupported DATABASE_URL scheme" >&2; exit 1;;
esac

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  (( ${#PASSPHRASE} >= 1 )) || { echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE is required" >&2; exit 1; }
  GNUPGHOME="${GNUPGHOME:-${HOME:-/tmp}/.gnupg}"
  mkdir -p "$GNUPGHOME"
  chmod 700 "$GNUPGHOME"
  export GNUPGHOME
  echo "Decrypting and validating encrypted backup..."
  gpg --batch --yes --no-tty --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt "$BACKUP_FILE" 3<<<"$PASSPHRASE" | gzip -dc > "$RESTORE_TMP"
else
  [[ "$BACKUP_FILE" == *.gz ]] || { echo "ERROR: unsupported backup format" >&2; exit 1; }
  echo "WARNING: restoring a legacy unencrypted backup"
  gzip -dc "$BACKUP_FILE" > "$RESTORE_TMP"
fi
[[ -s "$RESTORE_TMP" ]] || { echo "ERROR: decrypted backup is empty" >&2; exit 1; }

echo "Restore target: $TARGET_KIND"
if [[ "${RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  read -r -p "This operation replaces database contents. Type RESTORE to continue: " CONFIRM
  [[ "$CONFIRM" == "RESTORE" ]] || { echo "Restore aborted"; exit 1; }
fi

case "$DB_URL" in
  postgresql://*|postgres://*)
    command -v psql >/dev/null 2>&1 || { echo "ERROR: psql is not installed" >&2; exit 1; }
    # The dump is applied transactionally; a failed statement does not leave a
    # partially restored schema. The dump must target an isolated/approved DB.
    psql --set ON_ERROR_STOP=on --single-transaction "$DB_URL" < "$RESTORE_TMP"
    psql --set ON_ERROR_STOP=on "$DB_URL" -Atc 'SELECT count(*) FROM "_prisma_migrations";' >/dev/null
    ;;
  file:*)
    SQLITE_PATH="${DB_URL#file:}"
    [[ "$SQLITE_PATH" = /* ]] || SQLITE_PATH="$REPO_DIR/$SQLITE_PATH"
    SQLITE_DIR="$(dirname "$SQLITE_PATH")"
    mkdir -p "$SQLITE_DIR"
    SQLITE_TMP="$(mktemp "$SQLITE_DIR/.mekanix-restore.XXXXXX")"
    if head -c 256 "$RESTORE_TMP" | grep -aEiq 'PRAGMA|BEGIN TRANSACTION|CREATE TABLE'; then
      command -v sqlite3 >/dev/null 2>&1 || { echo "ERROR: sqlite3 is required to restore a SQL dump" >&2; exit 1; }
      sqlite3 "$SQLITE_TMP" < "$RESTORE_TMP"
    else
      cp "$RESTORE_TMP" "$SQLITE_TMP"
    fi
    if command -v sqlite3 >/dev/null 2>&1; then
      INTEGRITY="$(sqlite3 "$SQLITE_TMP" 'PRAGMA integrity_check;')"
      [[ "$INTEGRITY" == "ok" ]] || { echo "ERROR: SQLite integrity check failed" >&2; exit 1; }
    else
      echo "ERROR: sqlite3 is required to verify a SQLite restore" >&2
      exit 1
    fi
    chmod 600 "$SQLITE_TMP"
    mv -f "$SQLITE_TMP" "$SQLITE_PATH"
    SQLITE_TMP=""
    ;;
esac

echo "Restore completed and verified."
