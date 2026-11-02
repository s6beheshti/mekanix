#!/bin/bash
# MEKANIX — Production Deployment
# Requires real production credentials. Demo SMS/payment providers are rejected.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

fail() { echo "❌ $*" >&2; exit 1; }
require_var() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "$name is required"
}

echo "MEKANIX production preflight"

for name in DB_PASSWORD JWT_SECRET REDIS_PASSWORD SMS_PROVIDER PAYMENT_PROVIDER; do
  require_var "$name"
done

[[ ${#DB_PASSWORD} -ge 24 ]] || fail "DB_PASSWORD must be at least 24 characters"
[[ ${#JWT_SECRET} -ge 32 ]] || fail "JWT_SECRET must be at least 32 characters"
[[ ${#REDIS_PASSWORD} -ge 24 ]] || fail "REDIS_PASSWORD must be at least 24 characters"

case "$SMS_PROVIDER" in
  kavenegar) require_var KAVENEGAR_API_KEY ;;
  melipayamak)
    require_var MELIPAYAMAK_USERNAME
    require_var MELIPAYAMAK_PASSWORD
    require_var MELIPAYAMAK_SENDER
    ;;
  farapayamak)
    require_var FARAPAYAMAK_USERNAME
    require_var FARAPAYAMAK_PASSWORD
    require_var FARAPAYAMAK_SENDER
    ;;
  *) fail "Unsupported SMS_PROVIDER: $SMS_PROVIDER" ;;
esac

case "$PAYMENT_PROVIDER" in
  zarinpal) require_var ZARINPAL_MERCHANT_ID ;;
  idpay) require_var IDPAY_API_KEY ;;
  *) fail "PAYMENT_PROVIDER must be zarinpal or idpay (simulator/NextPay are not production-ready)" ;;
esac

[[ -n "${ADMIN_BOOTSTRAP_PASSWORD:-}" ]] || fail "ADMIN_BOOTSTRAP_PASSWORD is required for the initial admin account"
[[ ${#ADMIN_BOOTSTRAP_PASSWORD} -ge 16 ]] || fail "ADMIN_BOOTSTRAP_PASSWORD must be at least 16 characters"

echo "✅ Required production secrets/providers validated"

BUILD_CTX="$(mktemp -d /tmp/mekanix-build.XXXXXX)"
trap 'rm -rf "$BUILD_CTX"' EXIT

echo "Preparing PostgreSQL build context..."
rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='db/*.db' --exclude='*.log' "$REPO_DIR/" "$BUILD_CTX/"

rm -rf "$BUILD_CTX/prisma/migrations"
mkdir -p "$BUILD_CTX/prisma/migrations/20260925000000_init"
cp "$REPO_DIR/prisma/migrations-postgresql/20260925000000_init/migration.sql" \
  "$BUILD_CTX/prisma/migrations/20260925000000_init/"
cp "$REPO_DIR/prisma/migrations-postgresql/migration_lock.toml" \
  "$BUILD_CTX/prisma/migrations/"
sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$BUILD_CTX/prisma/schema.prisma"

cd "$BUILD_CTX"
echo "Building and starting services..."
docker compose up -d --build

echo "Waiting for liveness..."
for i in $(seq 1 60); do
  HEALTH="$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if echo "$HEALTH" | grep -q '"ok":true'; then
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    docker compose logs --tail=150
    fail "Application did not become live within 120 seconds"
  fi
  sleep 2
done

echo "Waiting for production readiness (real SMS + payment + PostgreSQL)..."
for i in $(seq 1 30); do
  READY="$(curl -sS http://127.0.0.1:3000/api/ready 2>/dev/null || true)"
  if echo "$READY" | grep -q '"ok":true'; then
    echo "✅ Production readiness passed"
    echo "$READY"
    exit 0
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "$READY"
    docker compose logs --tail=150
    fail "Production readiness failed. Do not expose this deployment to users."
  fi
  sleep 2
done
