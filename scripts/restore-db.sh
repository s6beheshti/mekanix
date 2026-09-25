#!/bin/bash
# MEKANIX — Database Restore Script (SQLite dev + PostgreSQL prod)
#
# Restores a database from a backup file created by scripts/backup-db.sh.
#
# Usage:
#   bash scripts/restore-db.sh <backup-file>
#   bash scripts/restore-db.sh /backups/mekanix_20260925_120000.sql.gz
#
# Environment:
#   DATABASE_URL — connection string (sqlite or postgresql)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="${1:?Usage: bash scripts/restore-db.sh <backup-file>}"
DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will DROP and RESTORE the database!"
echo "   Backup: $BACKUP_FILE"
echo "   Target: $DB_URL"
echo ""
read -p "Are you sure? (type RESTORE to continue): " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "📦 Restoring database..."

# ─── Detect database type ───
case "$DB_URL" in
  postgresql://*|postgres://*)
    echo "   Type: PostgreSQL"
    if ! command -v psql &> /dev/null; then
      echo "❌ psql not installed — install postgresql-client"
      exit 1
    fi
    # Drop existing connections, then restore
    # NOTE: For production, consider using pg_restore with --clean --if-exists
    gunzip -c "$BACKUP_FILE" | psql "$DB_URL"
    ;;
  file:*)
    echo "   Type: SQLite"
    SQLITE_PATH="${DB_URL#file:}"
    # For SQLite, decompress then overwrite the DB file
    # If the backup is a SQL dump (.sql.gz), use sqlite3 .read
    # If the backup is a binary .db.gz, just decompress and copy
    if command -v sqlite3 &> /dev/null; then
      # Try as SQL dump first
      if gunzip -c "$BACKUP_FILE" | head -1 | grep -qi "PRAGMA\|BEGIN TRANSACTION\|CREATE TABLE"; then
        echo "   Restoring from SQL dump..."
        rm -f "$SQLITE_PATH"
        sqlite3 "$SQLITE_PATH" < <(gunzip -c "$BACKUP_FILE")
      else
        echo "   Restoring from binary copy..."
        gunzip -c "$BACKUP_FILE" > "$SQLITE_PATH"
      fi
    else
      # No sqlite3 available — assume binary copy
      echo "   Restoring from binary copy (sqlite3 not available)..."
      gunzip -c "$BACKUP_FILE" > "$SQLITE_PATH"
    fi
    ;;
  *)
    echo "❌ Unsupported DATABASE_URL scheme: $DB_URL"
    exit 1
    ;;
esac

echo "✅ Restore complete!"
echo ""
echo "Verifying..."

# ─── Verify restore ───
case "$DB_URL" in
  postgresql://*|postgres://*)
    psql "$DB_URL" -c "SELECT count(*) FROM \"_prisma_migrations\";" 2>/dev/null || true
    psql "$DB_URL" -c "SELECT count(*) FROM \"User\";" 2>/dev/null || true
    ;;
  file:*)
    if command -v sqlite3 &> /dev/null; then
      SQLITE_PATH="${DB_URL#file:}"
      sqlite3 "$SQLITE_PATH" "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null || true
      sqlite3 "$SQLITE_PATH" "SELECT count(*) FROM User;" 2>/dev/null || true
    fi
    ;;
esac
