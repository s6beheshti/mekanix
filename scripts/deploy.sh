#!/bin/bash
# MEKANIX — Production Deployment Script
#
# Builds and deploys MEKANIX via Docker Compose with PostgreSQL 16 + Redis 7.
# Does NOT mutate the developer's working tree — all PostgreSQL migration
# swapping happens inside a temporary build context.
#
# Usage:
#   bash scripts/deploy.sh
#
# Required env vars:
#   DB_PASSWORD      — PostgreSQL password
#   JWT_SECRET       — JWT signing secret
#   REDIS_PASSWORD   — Redis password
#   APP_URL          — public HTTPS origin
#   SMS_PROVIDER     — kavenegar / melipayamak / farapayamak
#   PAYMENT_PROVIDER — zarinpal / idpay

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

echo "🚀 MEKANIX Production Deployment"
echo "   Repo: $REPO_DIR"
echo ""

# ─── Validate required production env vars ───
MISSING=0
for VAR in DB_PASSWORD JWT_SECRET REDIS_PASSWORD APP_URL SMS_PROVIDER PAYMENT_PROVIDER; do
  if [ -z "${!VAR:-}" ]; then
    echo "❌ $VAR not set"
    MISSING=1
  fi
done
if [ -n "${APP_URL:-}" ] && [[ "$APP_URL" != https://* ]]; then
  echo "❌ APP_URL must start with https://"
  MISSING=1
fi
case "${SMS_PROVIDER:-}" in
  kavenegar|melipayamak|farapayamak) ;;
  *) echo "❌ SMS_PROVIDER must be a real provider (not console)"; MISSING=1 ;;
esac
case "${PAYMENT_PROVIDER:-}" in
  zarinpal|idpay) ;;
  *) echo "❌ PAYMENT_PROVIDER must be zarinpal or idpay (not simulator)"; MISSING=1 ;;
esac
if [ "$MISSING" = "1" ]; then
  echo ""
  echo "Set all required production environment variables before deployment."
  exit 1
fi

# ─── Create temporary build context with PostgreSQL config ───
BUILD_CTX="$(mktemp -d /tmp/mekanix-build.XXXXXX)"
trap 'rm -rf "$BUILD_CTX"' EXIT

echo "📦 Preparing build context (PostgreSQL migrations)..."
rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='db/*.db' --exclude='*.log' \
  "$REPO_DIR/" "$BUILD_CTX/"

# Replace SQLite migrations with the complete PostgreSQL migration history.
rm -rf "$BUILD_CTX/prisma/migrations"
mkdir -p "$BUILD_CTX/prisma/migrations"
cp -a "$REPO_DIR/prisma/migrations-postgresql/." "$BUILD_CTX/prisma/migrations/"

# Switch schema.prisma to PostgreSQL (in build context only)
sed -i 's/provider = "sqlite"/provider = "postgresql"/' \
  "$BUILD_CTX/prisma/schema.prisma"

echo "   ✅ Build context ready (PostgreSQL provider + migrations)"
echo "   ✅ Developer working tree: UNCHANGED"
echo ""

# ─── Build and deploy ───
echo "🏗️  Building and deploying with docker compose..."
cd "$BUILD_CTX"
docker compose up -d --build

# ─── Wait for production readiness (not merely process health) ───
echo "⏳ Waiting for production readiness..."
READY_URL="http://localhost:3000/api/ready"
READY_JSON="{}"
for i in $(seq 1 60); do
  READY_JSON="$(curl -fsS "$READY_URL" 2>/dev/null || echo '{}')"
  if echo "$READY_JSON" | grep -q '"ok":true'; then
    echo "✅ App is production-ready!"
    echo ""
    echo "$READY_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('  Checks:', ', '.join(k for k, v in d['checks'].items() if v))
" 2>/dev/null || true
    break
  fi
  if [ "$i" = "60" ]; then
    echo "❌ App did not become production-ready within 120s"
    echo "   Last readiness response: $READY_JSON"
    echo "   Check logs: docker compose logs"
    exit 1
  fi
  echo "   Waiting... ($i/60)"
  sleep 2
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Deployment complete!                                ║"
echo "║                                                          ║"
echo "║  App:    http://localhost:3000                           ║"
echo "║  Health: http://localhost:3000/api/health               ║"
echo "║  DB:     localhost:5432 (PostgreSQL 16)                ║"
echo "║  Redis:  localhost:6379 (Redis 7)                      ║"
echo "║                                                          ║"
echo "║  Logs:   docker compose logs -f                         ║"
echo "║  Stop:   docker compose down                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
