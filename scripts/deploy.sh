#!/bin/bash
# MEKANIX — Production Deployment Script
# 
# This script:
# 1. Switches schema to PostgreSQL
# 2. Copies PostgreSQL migrations
# 3. Builds and deploys with docker-compose

set -e

REPO_DIR="/home/z/my-project"
cd "$REPO_DIR"

echo "🚀 MEKANIX Production Deployment"
echo ""

# Check required env vars
if [ -z "$DB_PASSWORD" ]; then
  echo "❌ DB_PASSWORD not set"
  echo "   export DB_PASSWORD=your_secure_password"
  exit 1
fi
if [ -z "$JWT_SECRET" ]; then
  echo "❌ JWT_SECRET not set"
  echo "   export JWT_SECRET=your_secure_secret"
  exit 1
fi

# Step 1: Switch to PostgreSQL
echo "1️⃣  Switching to PostgreSQL..."
bash scripts/db-switch-provider.sh postgresql

# Step 2: Copy PostgreSQL migrations
echo "2️⃣  Copying PostgreSQL migrations..."
rm -rf prisma/migrations
mkdir -p prisma/migrations/20260925000000_init
cp prisma/migrations-postgresql/20260925000000_init/migration.sql prisma/migrations/20260925000000_init/
cp prisma/migrations-postgresql/migration_lock.toml prisma/migrations/

# Step 3: Build and deploy
echo "3️⃣  Building and deploying with docker-compose..."
docker-compose up -d --build

# Step 4: Wait for health
echo "4️⃣  Waiting for app to be healthy..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/health | grep -q '"ok":true'; then
    echo "✅ App is healthy!"
    break
  fi
  echo "   Waiting... ($i/30)"
  sleep 2
done

# Step 5: Switch back to SQLite for local dev
echo "5️⃣  Switching schema back to SQLite for local dev..."
bash scripts/db-switch-provider.sh sqlite

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Deployment complete!                                 ║"
echo "║                                                          ║"
echo "║  App: http://localhost:3000                              ║"
echo "║  Health: http://localhost:3000/api/health               ║"
echo "║  PostgreSQL: localhost:5432                              ║"
echo "║  Redis: localhost:6379                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
