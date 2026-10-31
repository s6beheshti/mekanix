#!/bin/bash
# MEKANIX — Staging Deployment
# Deploys to staging environment (port 3001, separate DB)
#
# Required env vars (NO fallbacks — must be set explicitly):
#   DB_PASSWORD     — PostgreSQL password
#   JWT_SECRET      — JWT signing secret
#   REDIS_PASSWORD  — Redis password
#
# Usage: bash scripts/deploy-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/secret-validation.sh"

# ─── Validate required env vars (NO defaults) ───
: "${DB_PASSWORD:?DB_PASSWORD is required for staging}"
: "${JWT_SECRET:?JWT_SECRET is required for staging}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required for staging}"

if ! is_strong_secret "$JWT_SECRET" 32; then
  echo "❌ JWT_SECRET must be at least 32 characters and must not be a placeholder"
  exit 1
fi
if ! is_strong_secret "$DB_PASSWORD" 16; then
  echo "❌ DB_PASSWORD must be at least 16 characters and must not be a placeholder"
  exit 1
fi
if ! is_strong_secret "$REDIS_PASSWORD" 24; then
  echo "❌ REDIS_PASSWORD must be at least 24 characters and must not be a placeholder"
  exit 1
fi

if [[ ! "$DB_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "❌ DB_PASSWORD must use URL-safe characters only (A-Z, a-z, 0-9, _ and -)"
  exit 1
fi
if [[ ! "$REDIS_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "❌ REDIS_PASSWORD must use URL-safe characters only (A-Z, a-z, 0-9, _ and -)"
  exit 1
fi

echo "🚀 MEKANIX Staging Deployment"
echo "   Port: 3001"
echo "   DB: mekanix_staging"
echo "   Repo: $REPO_DIR"
echo ""

# ─── Create temporary build context ───
BUILD_CTX="$(mktemp -d /tmp/mekanix-staging.XXXXXX)"
trap 'rm -rf "$BUILD_CTX"' EXIT

rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='db/*.db' --exclude='*.log' \
  "$REPO_DIR/" "$BUILD_CTX/"

# Copy the complete PostgreSQL migration history, including future migrations.
rm -rf "$BUILD_CTX/prisma/migrations"
mkdir -p "$BUILD_CTX/prisma/migrations"
cp -a "$REPO_DIR/prisma/migrations-postgresql/." "$BUILD_CTX/prisma/migrations/"
sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$BUILD_CTX/prisma/schema.prisma"

cd "$BUILD_CTX"
docker compose -f docker-compose.staging.yml up -d --build

echo "⏳ Waiting for staging readiness..."
for i in $(seq 1 90); do
  READY_JSON="$(curl -sS http://localhost:3001/api/ready 2>/dev/null || echo '{}')"
  if echo "$READY_JSON" | grep -q '"ok":true'; then
    echo "✅ Staging is ready!"
    echo ""
    echo "   URL:    http://localhost:3001"
    echo "   Health: http://localhost:3001/api/health"
    echo "   Ready:  http://localhost:3001/api/ready"
    exit 0
  fi
  echo "   Waiting... ($i/90)"
  sleep 2
done
echo "❌ Staging did not become ready"
echo "Last readiness response: $READY_JSON"
docker compose -f docker-compose.staging.yml logs
exit 1
