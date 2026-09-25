import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRedisAvailable } from "@/lib/redis";

// GET /api/health — health check for deployment monitoring.
//
// Shape (HTTP 200 when fully healthy, 503 when any service is down):
//   {
//     ok: boolean,
//     timestamp: ISO string,
//     uptime: seconds,
//     environment: "production" | "development" | ...,
//     services: {
//       database: "healthy" | "unhealthy" | "unknown",
//       redis:    "healthy" | "not-configured" | "unhealthy" | "unknown"
//     }
//   }
//
// `ok` is true only when the database is reachable. Redis is optional —
// when REDIS_URL is unset, `services.redis` is "not-configured" and the
// overall check still returns 200 (single-instance dev mode).
export async function GET() {
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    services: {
      database: "unknown" as string,
      redis: "unknown" as string,
    },
  };

  // Check database
  try {
    await db.$queryRaw`SELECT 1`;
    health.services.database = "healthy";
  } catch {
    health.services.database = "unhealthy";
    health.ok = false;
  }

  // Check Redis (optional — degrades gracefully to in-memory)
  try {
    const redisOk = await isRedisAvailable();
    health.services.redis = redisOk ? "healthy" : "not-configured";
  } catch {
    health.services.redis = "unhealthy";
  }

  const status = health.ok ? 200 : 503;
  return NextResponse.json(health, { status });
}
