import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRedisAvailable } from "@/lib/redis";
import { getSmsProviderStatus } from "@/lib/sms-provider";

// GET /api/health — comprehensive health check for deployment monitoring
//
// Checks:
//   1. Database connectivity (raw query)
//   2. Redis availability (if configured)
//   3. SMS provider configuration
//   4. ETA provider configuration
//   5. Migration status (if _prisma_migrations table exists)
//
// Returns HTTP 200 if all critical services are healthy, 503 otherwise.

export async function GET() {
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    services: {
      database: "unknown" as string,
      redis: "unknown" as string,
      sms: "unknown" as string,
      eta: "unknown" as string,
    },
    warnings: [] as string[],
  };

  // ─── 1. Database ───
  try {
    await db.$queryRaw`SELECT 1`;
    health.services.database = "healthy";
  } catch (e) {
    health.services.database = "unhealthy";
    health.ok = false;
    health.warnings.push(`Database: ${(e as Error).message}`);
  }

  // ─── 2. Redis ───
  // Redis is optional — in-memory fallback works. Don't fail health check
  // if Redis is unreachable, just warn.
  try {
    const redisOk = await isRedisAvailable();
    if (process.env.REDIS_URL) {
      if (redisOk) {
        health.services.redis = "healthy";
      } else {
        health.services.redis = "unhealthy (using in-memory fallback)";
        health.warnings.push("Redis: configured but not reachable — using in-memory fallback");
      }
    } else {
      health.services.redis = "not-configured";
      health.warnings.push("Redis: not configured (rate limiting is in-memory)");
    }
  } catch (e) {
    health.services.redis = "unhealthy (using in-memory fallback)";
    health.warnings.push(`Redis: ${(e as Error).message} — using in-memory fallback`);
  }

  // ─── 3. SMS Provider ───
  try {
    const smsStatus = getSmsProviderStatus();
    if (smsStatus.provider === "console") {
      health.services.sms = "dev-mode (console)";
      health.warnings.push("SMS: running in console mode (no real SMS delivery)");
    } else if (smsStatus.configured) {
      health.services.sms = `healthy (${smsStatus.provider})`;
    } else {
      health.services.sms = `misconfigured (${smsStatus.provider})`;
      health.warnings.push(`SMS: ${smsStatus.warnings.join(", ")}`);
    }
  } catch (e) {
    health.services.sms = "unknown";
    health.warnings.push(`SMS: ${(e as Error).message}`);
  }

  // ─── 4. ETA Provider ───
  try {
    const neshan = process.env.NESHAN_API_KEY;
    const google = process.env.GOOGLE_MAPS_API_KEY;
    const osrm = process.env.OSRM_API_URL;
    if (neshan) {
      health.services.eta = "healthy (neshan)";
    } else if (google) {
      health.services.eta = "healthy (google-maps)";
    } else if (osrm) {
      health.services.eta = "healthy (osrm)";
    } else {
      health.services.eta = "default (40km/h estimate)";
      health.warnings.push("ETA: no routing provider configured — using 40km/h default");
    }
  } catch (e) {
    health.services.eta = "unknown";
  }

  // ─── 5. Migration status (non-critical, informational) ───
  try {
    // Check if _prisma_migrations table exists and count applied migrations
    const migrations = await db.$queryRaw`SELECT count(*)::int as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL` as any[];
    if (migrations && migrations[0]) {
      health.warnings.push(`Migrations: ${migrations[0].count} applied`);
    }
  } catch {
    // Table doesn't exist (SQLite dev mode without migrations) — not critical
  }

  const status = health.ok ? 200 : 503;
  return NextResponse.json(health, { status });
}
