#!/bin/bash
# MEKANIX — Database Provider Switch
#
# Switches between SQLite (dev) and PostgreSQL (production).
# Updates schema.prisma provider and selects the correct migration directory.
#
# Usage:
#   bash scripts/db-switch-provider.sh sqlite       # Dev mode
#   bash scripts/db-switch-provider.sh postgresql  # Production mode

set -e

REPO_DIR="/home/z/my-project"
SCHEMA="$REPO_DIR/prisma/schema.prisma"

if [ "$1" = "" ]; then
  echo "Usage: bash scripts/db-switch-provider.sh <sqlite|postgresql>"
  echo ""
  echo "Current provider:"
  grep "provider = " "$SCHEMA" | head -1
  exit 0
fi

TARGET="$1"

if [ "$TARGET" = "sqlite" ]; then
  echo "🔄 Switching to SQLite (dev mode)..."
  sed -i 's/provider = "postgresql"/provider = "sqlite"/' "$SCHEMA"
  echo "✅ Schema provider set to sqlite"
  echo "✅ Using migrations from: prisma/migrations/"
  echo ""
  echo "Next steps:"
  echo "  bun run db:migrate:dev   # Apply migrations"
  echo "  bun run db:generate      # Regenerate Prisma Client"

elif [ "$TARGET" = "postgresql" ]; then
  echo "🔄 Switching to PostgreSQL (production mode)..."
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
  echo "✅ Schema provider set to postgresql"
  echo "✅ Using migrations from: prisma/migrations/postgresql/"
  echo ""
  echo "⚠️  Before running migrations, copy the PostgreSQL migrations:"
  echo "  cp -r prisma/migrations/postgresql/* prisma/migrations/"
  echo "  # Then remove the SQLite migration_lock.toml and replace with PostgreSQL one"
  echo ""
  echo "Next steps:"
  echo "  export DATABASE_URL=postgresql://user:pass@host:5432/mekanix"
  echo "  cp prisma/migrations/postgresql/migration_lock.toml prisma/migrations/migration_lock.toml"
  echo "  bun run db:migrate       # Deploy migrations (prisma migrate deploy)"
  echo "  bun run db:generate      # Regenerate Prisma Client"

else
  echo "❌ Unknown provider: $TARGET"
  echo "Usage: bash scripts/db-switch-provider.sh <sqlite|postgresql>"
  exit 1
fi
