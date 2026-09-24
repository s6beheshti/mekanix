#!/bin/bash
# MEKANIX — Git History Cleanup Daemon
# Runs the cleanup script every 24 hours in a background loop.
# This replaces crontab (not available in sandbox).

CLEANUP_SCRIPT="/home/z/my-project/scripts/clean-git-history.sh"
LOG_FILE="/home/z/my-project/dev.log"
INTERVAL_SECONDS=$((24 * 60 * 60))  # 24 hours

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Git cleanup daemon started (runs every 24h)" >> "$LOG_FILE"

while true; do
  # Run the cleanup
  bash "$CLEANUP_SCRIPT" 2>>"$LOG_FILE"
  
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏰ Next cleanup in 24 hours..." >> "$LOG_FILE"
  
  # Sleep 24 hours
  sleep "$INTERVAL_SECONDS"
done
