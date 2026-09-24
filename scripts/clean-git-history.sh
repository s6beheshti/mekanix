#!/bin/bash
# MEKANIX — Git History Cleanup Script
# Runs every 24 hours via cron to squash all commits into one,
# keeping the repo lightweight and removing old history (which may
# contain previously-tracked sensitive files).
#
# What it does:
#   1. Creates a fresh "root" commit with current state
#   2. Force-pushes to GitHub (rewrites history)
#   3. Old commits are no longer accessible
#
# Safety: local files are NEVER touched — only git history changes.

set -e

REPO_DIR="/home/z/my-project"
cd "$REPO_DIR"

LOG_FILE="/home/z/my-project/dev.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "[$TIMESTAMP] 🧹 Starting git history cleanup..." >> "$LOG_FILE"

# Check if there are any commits to clean
COMMIT_COUNT=$(git log --oneline 2>/dev/null | wc -l)
if [ "$COMMIT_COUNT" -le 1 ]; then
  echo "[$TIMESTAMP] ℹ️  Only $COMMIT_COUNT commit(s), nothing to clean." >> "$LOG_FILE"
  exit 0
fi

# Get current remote URL (token should be in ~/.git-credentials)
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ -z "$REMOTE_URL" ]; then
  echo "[$TIMESTAMP] ❌ No remote 'origin' configured, skipping." >> "$LOG_FILE"
  exit 1
fi

# Check for credentials
if [ ! -f ~/.git-credentials ]; then
  echo "[$TIMESTAMP] ❌ No git credentials found (~/.git-credentials), skipping." >> "$LOG_FILE"
  exit 1
fi

# Create orphan branch (fresh history with no parent)
echo "[$TIMESTAMP] 📦 Creating fresh history..." >> "$LOG_FILE"
git checkout --orphan temp-cleanup-branch 2>>"$LOG_FILE"

# Stage all current files (respecting .gitignore)
git add -A 2>>"$LOG_FILE"

# Create a single commit with current state
COMMIT_MSG="MEKANIX — snapshot $(date '+%Y-%m-%d %H:%M')

Auto-squashed by cleanup script. Previous history removed to keep
repository lightweight and purge any previously-tracked sensitive files."

git commit -m "$COMMIT_MSG" 2>>"$LOG_FILE"

# Delete old main branch
git branch -D main 2>>"$LOG_FILE" || true

# Rename temp branch to main
git branch -m main 2>>"$LOG_FILE"

# Force push to GitHub (overwrites remote history)
echo "[$TIMESTAMP] 📤 Force-pushing to GitHub..." >> "$LOG_FILE"
git push --force origin main 2>>"$LOG_FILE"

# Clean up old objects
git gc --prune=now --aggressive 2>>"$LOG_FILE" || true

NEW_COUNT=$(git log --oneline 2>/dev/null | wc -l)
echo "[$TIMESTAMP] ✅ Done. History squashed to $NEW_COUNT commit(s)." >> "$LOG_FILE"
echo "[$TIMESTAMP] ✅ Repository is now clean." >> "$LOG_FILE"
