import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSmsProviderStatus } from "@/lib/sms-provider";
import { getPaymentProviderStatus } from "@/lib/payment-provider";
import { isPublicHttpsOrigin } from "@/lib/url-validation";
import { isRedisAvailable } from "@/lib/redis";

// GET /api/ready — readiness check (different from liveness)
// /api/health = is the process alive? (always 200 if running)
// /api/ready = is the app ready to serve production traffic?
//
// Production safety gates:
//   - Database must be reachable (PostgreSQL, not SQLite in production)
//   - Migrations must be applied
//   - SMS provider must NOT be "console" in production
//   - Payment provider must NOT be "simulator" in production
//   - DATABASE_URL must start with "postgresql://" in production
//
// Returns 200 if ready, 503 if not ready.

export async function GET() {
  const isProduction = process.env.NODE_ENV === "production" && process.env.DEPLOYMENT_ENV !== "staging";
  
  const ready = {
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: false,
      migrationsApplied: false,
      redis: false,
      jwtSecret: false,
      smsProvider: false,
      paymentProvider: false,
      databaseProvider: false,
      paymentCallbackUrl: false,
    },
    errors: [] as string[],
  };

  // Production and staging must never use a short or missing signing secret.
  const requiresStrongJwt = isProduction || process.env.DEPLOYMENT_ENV === "staging";
  if (!requiresStrongJwt || (process.env.JWT_SECRET || "").length >= 32) {
    ready.checks.jwtSecret = true;
  } else {
    ready.ok = false;
    ready.errors.push("JWT_SECRET must contain at least 32 characters");
  }

  // Production and staging require Redis; in-memory fallback is not distributed.
  const requiresRedis = isProduction || process.env.DEPLOYMENT_ENV === "staging";
  if (!requiresRedis || (await isRedisAvailable())) {
    ready.checks.redis = true;
  } else {
    ready.ok = false;
    ready.errors.push("Redis: not reachable; production/staging cannot use in-memory fallback");
  }

  // ─── 1. Database reachable ───
  try {
    await db.$queryRaw`SELECT 1`;
    ready.checks.database = true;
  } catch {
    ready.ok = false;
    ready.errors.push("Database: not reachable");
  }

  // ─── 2. Migrations applied ───
  try {
    const result = await db.$queryRaw`SELECT count(*)::int as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL` as any[];
    if (result[0]?.count > 0) {
      ready.checks.migrationsApplied = true;
    } else {
      ready.ok = false;
      ready.errors.push("Migrations: none applied");
    }
  } catch {
    ready.ok = false;
    ready.errors.push("Migrations: _prisma_migrations table not found");
  }

  // ─── 3. Production safety gates ───
  if (isProduction) {
    // 3a. SMS must NOT be console in production
    const smsStatus = getSmsProviderStatus();
    if (smsStatus.provider === "console") {
      ready.ok = false;
      ready.errors.push("SMS: console provider not allowed in production — set SMS_PROVIDER to kavenegar/melipayamak/farapayamak");
    } else if (!smsStatus.configured) {
      ready.ok = false;
      ready.errors.push(`SMS: ${smsStatus.provider} provider misconfigured — ${smsStatus.warnings.join(", ")}`);
    } else {
      ready.checks.smsProvider = true;
    }

    // 3b. Payment must NOT be simulator in production
    const payStatus = getPaymentProviderStatus();
    if (payStatus.provider === "simulator") {
      ready.ok = false;
      ready.errors.push("Payment: simulator provider not allowed in production — set PAYMENT_PROVIDER to zarinpal/idpay");
    } else if (!payStatus.configured) {
      ready.ok = false;
      ready.errors.push(`Payment: ${payStatus.provider} provider misconfigured`);
    } else {
      ready.checks.paymentProvider = true;
    }

    // 3c. Database must be PostgreSQL in production (not SQLite)
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl.startsWith("file:")) {
      ready.ok = false;
      ready.errors.push("Database: SQLite (file:) not allowed in production — use PostgreSQL (postgresql://)");
    } else {
      ready.checks.databaseProvider = true;
    }

    // 3d. Payment callbacks require a stable public HTTPS origin.
    try {
      if (isPublicHttpsOrigin(process.env.APP_URL)) {
        ready.checks.paymentCallbackUrl = true;
      } else {
        ready.ok = false;
        ready.errors.push("Payment callback: APP_URL must be a public HTTPS origin without credentials, path, query, or fragment");
      }
    } catch {
      ready.ok = false;
      ready.errors.push("Payment callback: APP_URL is missing or invalid");
    }
  } else {
    // Non-production: all providers allowed
    ready.checks.smsProvider = true;
    ready.checks.paymentProvider = true;
    ready.checks.databaseProvider = true;
    ready.checks.paymentCallbackUrl = true;
  }

  const status = ready.ok ? 200 : 503;
  if (isProduction && !ready.ok) {
    console.error("[readiness] Production checks failed:", ready.errors);
    return NextResponse.json(
      {
        ok: false,
        timestamp: ready.timestamp,
        checks: ready.checks,
        errors: ["One or more production readiness checks failed; inspect server logs"],
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(ready, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
