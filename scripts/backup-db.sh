#!/bin/bash
# MEKANIX — Daily database backup
DB_FILE="/home/z/my-project/db/custom.db"
BACKUP_DIR="/home/z/my-project/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/mekanix_db_$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "✗ Database file not found: $DB_FILE"
  exit 1
fi

# Copy database
cp "$DB_FILE" "$BACKUP_FILE"
echo "✓ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "mekanix_db_*" -mtime +7 -delete 2>/dev/null
echo "✓ Old backups cleaned (keeping last 7 days)"

# Count remaining backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/mekanix_db_*.db 2>/dev/null | wc -l)
echo "✓ Total backups: $BACKUP_COUNT"
