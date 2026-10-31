#!/bin/bash
# MEKANIX — Repository Hygiene Check
# Checks for forbidden artifacts that should not be in git.

set -e

echo "🔍 Checking repository hygiene..."

ERRORS=0

# Check for database files
if git ls-files | grep -qE "\.db$|\.sqlite$|\.sqlite3$"; then
  echo "❌ Database files tracked by git:"
  git ls-files | grep -E "\.db$|\.sqlite$|\.sqlite3$"
  ERRORS=$((ERRORS + 1))
fi

# Check for tracked environment files (only root .env.example is allowed).
TRACKED_ENV_FILES="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '^\.env\.example

# Check for forbidden directories
for dir in upload download tool-results backups agent-ctx .zscripts; do
  if git ls-files | grep -q "^${dir}/"; then
    echo "❌ Forbidden directory tracked: $dir/"
    git ls-files | grep "^${dir}/" | head -5
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for large binary files (>10MB)
for file in $(git ls-files); do
  if [ -f "$file" ]; then
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    if [ "$size" -gt 10485760 ]; then
      echo "❌ Large file (>10MB): $file (${size} bytes)"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "❌ $ERRORS hygiene issue(s) found."
  exit 1
fi

echo "✅ Repository hygiene is clean."
 || true)"
if [ -n "$TRACKED_ENV_FILES" ]; then
  echo "❌ Environment files tracked by git:"
  echo "$TRACKED_ENV_FILES"
  ERRORS=$((ERRORS + 1))
fi

# Docker builds must exclude real env files and explicitly allow only .env.example.
if [ ! -f .dockerignore ] ||
   ! grep -Fxq '.env' .dockerignore ||
   ! grep -Fxq '.env.*' .dockerignore ||
   ! grep -Fxq '!.env.example' .dockerignore; then
  echo "❌ .dockerignore must exclude .env and .env.* while allowing .env.example"
  ERRORS=$((ERRORS + 1))
fi

# Check for forbidden directories
for dir in upload download tool-results backups agent-ctx .zscripts; do
  if git ls-files | grep -q "^${dir}/"; then
    echo "❌ Forbidden directory tracked: $dir/"
    git ls-files | grep "^${dir}/" | head -5
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for large binary files (>10MB)
for file in $(git ls-files); do
  if [ -f "$file" ]; then
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    if [ "$size" -gt 10485760 ]; then
      echo "❌ Large file (>10MB): $file (${size} bytes)"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "❌ $ERRORS hygiene issue(s) found."
  exit 1
fi

echo "✅ Repository hygiene is clean."
