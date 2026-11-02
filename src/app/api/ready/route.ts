import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSmsProviderStatus } from "@/lib/sms-provider";
import { getPaymentProviderStatus } from "@/lib/payment-provider";

// GET /api/ready — readiness check (different from liveness)
// /api/health = is the process alive? (always 200 if running)
// /api/ready = is the app ready to serve production traffic?
//
// Production safety gates:
//   - Database must be reachable (PostgreSQL, not SQLite in production)
//   - Migrations must be applied
//   - SMS provider must NOT be "console" in production
//   - Payment provider must be a configured live provider; sandbox is forbidden in production
//   - DATABASE_URL must start with "postgresql://" in production
//
// Returns 200 if ready, 503 if not ready.

export async function GET() {
  const isProduction = process.env.NODE_ENV === "production";
  
  const ready = {
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: false,
      migrationsApplied: false,
      smsProvider: false,
      paymentProvider: false,
      databaseProvider: false,
    },
    errors: [] as string[],
  };

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
      // Real invoice checkout + verified callback are implemented. Do not permit sandbox
      // credentials or an insecure/missing public callback base in production.
      const appUrl = process.env.APP_URL || "";
      const sandboxEnabled = process.env.IDPAY_SANDBOX === "true" || process.env.ZARINPAL_SANDBOX === "true";
      let secureAppUrl = false;
      try {
        secureAppUrl = new URL(appUrl).protocol === "https:";
      } catch {}
      if (sandboxEnabled) {
        ready.ok = false;
        ready.errors.push("Payment: sandbox mode must be disabled in production");
      } else if (!secureAppUrl) {
        ready.ok = false;
        ready.errors.push("Payment: APP_URL must be a valid HTTPS origin for bank callbacks");
      } else {
        ready.checks.paymentProvider = true;
      }
    }

    // 3c. Database must be PostgreSQL in production (not SQLite)
    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
      ready.ok = false;
      ready.errors.push("Database: production requires a PostgreSQL DATABASE_URL");
    } else {
      ready.checks.databaseProvider = true;
    }
  } else {
    // Non-production: all providers allowed
    ready.checks.smsProvider = true;
    ready.checks.paymentProvider = true;
    ready.checks.databaseProvider = true;
  }

  const status = ready.ok ? 200 : 503;
  return NextResponse.json(ready, { status });
}
