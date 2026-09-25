#!/bin/bash
# MEKANIX — Database Backup Script (SQLite dev + PostgreSQL prod)
#
# Creates a compressed backup of the database.
# Auto-detects database type from DATABASE_URL:
#   - PostgreSQL (postgresql://...) → pg_dump | gzip
#   - SQLite       (file:...)        → cp + gzip (fallback if pg_dump missing)
#
# Usage:
#   bash scripts/backup-db.sh
#
# Environment:
#   DATABASE_URL              — connection string (sqlite or postgresql)
#   BACKUP_DIR                — directory for backups (default: ./backups)
#   BACKUP_RETENTION_DAYS     — days to keep backups (default: 30)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mekanix_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

DB_URL="${DATABASE_URL:-file:$REPO_DIR/db/custom.db}"

echo "📦 Creating database backup..."
echo "   Source: $DB_URL"
echo "   Target: $BACKUP_FILE"

# ─── Detect database type ───
case "$DB_URL" in
  postgresql://*|postgres://*)
    echo "   Type:   PostgreSQL"
    if ! command -v pg_dump &> /dev/null; then
      echo "❌ pg_dump not installed — install postgresql-client or run inside docker"
      exit 1
    fi
    pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"
    ;;
  file:*)
    echo "   Type:   SQLite"
    SQLITE_PATH="${DB_URL#file:}"
    if [ ! -f "$SQLITE_PATH" ]; then
      echo "❌ SQLite file not found: $SQLITE_PATH"
      exit 1
    fi
    # Use sqlite3 .dump if available, else plain file copy
    if command -v sqlite3 &> /dev/null; then
      sqlite3 "$SQLITE_PATH" .dump | gzip > "$BACKUP_FILE"
    else
      # Fallback: copy the binary file and gzip it
      cp "$SQLITE_PATH" "$BACKUP_FILE.tmp"
      gzip -f "$BACKUP_FILE.tmp"
      mv "$BACKUP_FILE.tmp.gz" "$BACKUP_FILE"
    fi
    ;;
  *)
    echo "❌ Unsupported DATABASE_URL scheme: $DB_URL"
    echo "   Expected: postgresql://... or file:..."
    exit 1
    ;;
esac

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# ─── Clean up old backups ───
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "mekanix_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
# Also clean up legacy .db backup naming
find "$BACKUP_DIR" -name "mekanix_db_*.db" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
echo "✅ Old backups cleaned"

# ─── List recent backups ───
echo ""
echo "📋 Recent backups:"
ls -lh "$BACKUP_DIR"/mekanix_*.sql.gz 2>/dev/null | tail -5 || true
# Also list legacy .db backups for backward compat
ls -lh "$BACKUP_DIR"/mekanix_db_*.db 2>/dev/null | tail -3 || true

# ─── Verify backup is not empty ───
if [ ! -s "$BACKUP_FILE" ]; then
  echo "❌ Backup file is empty!"
  exit 1
fi

echo ""
echo "✅ Backup verified (non-empty)"
