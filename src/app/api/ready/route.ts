import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSmsProviderStatus } from "@/lib/sms-provider";
import { getPaymentProviderStatus } from "@/lib/payment-provider";
import { isPublicHttpsOrigin } from "@/lib/url-validation";
import { isRedisAvailable } from "@/lib/redis";
import { getUsdIrrRateSnapshot } from "@/lib/exchange-rate";

// GET /api/ready — readiness check (different from liveness)
// /api/health = is the process alive? (always 200 if running)
// /api/ready = is the app ready to serve production traffic?
//
// Production safety gates:
//   - Database reachable and migrations applied
//   - Redis reachable (no in-memory fallback in production/staging)
//   - JWT_SECRET contains at least 32 characters in production/staging
//   - Production uses PostgreSQL, real SMS/payment providers and a public HTTPS APP_URL
//   - Local simulator providers are allowed only in explicit staging mode
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
      exchangeRateTrusted: false,
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
  const requiresProductionInfra = isProduction || process.env.DEPLOYMENT_ENV === "staging";
  let redisPasswordIsStrong = false;
  try {
    const redisUrl = new URL(process.env.REDIS_URL || "");
    redisPasswordIsStrong = decodeURIComponent(redisUrl.password).length >= 24;
  } catch {
    // Missing or malformed Redis URL is not production-ready.
  }
  if (!requiresProductionInfra || (redisPasswordIsStrong && (await isRedisAvailable()))) {
    ready.checks.redis = true;
  } else {
    ready.ok = false;
    ready.errors.push("Redis: requires a reachable Redis service with a 24+ character password");
  }

  if (requiresProductionInfra) {
    try {
      const databaseUrl = new URL(process.env.DATABASE_URL || "");
      const databasePasswordIsStrong = decodeURIComponent(databaseUrl.password).length >= 16;
      if (databaseUrl.protocol === "postgresql:" && databasePasswordIsStrong) {
        ready.checks.databaseProvider = true;
      } else {
        ready.ok = false;
        ready.errors.push("Database: production/staging requires PostgreSQL and a 16+ character password");
      }
    } catch {
      ready.ok = false;
      ready.errors.push("Database: production/staging requires a valid PostgreSQL DATABASE_URL");
    }
  } else {
    ready.checks.databaseProvider = true;
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
    // 2c. A fresh Telegram market rate is mandatory for real-money collection.
    const exchangeRate = await getUsdIrrRateSnapshot();
    if (exchangeRate.trustedForPayments) {
      ready.checks.exchangeRateTrusted = true;
    } else {
      ready.ok = false;
      ready.errors.push("Exchange rate: a fresh trusted Telegram USD/IRR rate is required for production payments");
    }

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
    ready.checks.paymentCallbackUrl = true;
    ready.checks.exchangeRateTrusted = true;
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
