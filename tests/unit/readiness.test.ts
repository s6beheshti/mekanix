import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, redisAvailable, exchangeRateSnapshot } = vi.hoisted(() => ({
  queryRaw: vi.fn(async () => [{ count: 1 }]),
  redisAvailable: vi.fn(async () => true),
  exchangeRateSnapshot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: queryRaw },
}));

vi.mock("@/lib/redis", () => ({
  isRedisAvailable: redisAvailable,
}));

vi.mock("@/lib/exchange-rate", () => ({
  getUsdIrrRateSnapshot: exchangeRateSnapshot,
}));

vi.mock("@/lib/sms-provider", () => ({
  getSmsProviderStatus: () => ({
    provider: "kavenegar",
    configured: true,
    warnings: [],
  }),
}));

vi.mock("@/lib/payment-provider", () => ({
  getPaymentProviderStatus: () => ({
    provider: "zarinpal",
    configured: true,
  }),
}));

describe("production readiness URL and deployment mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://mekanix:test-database-password-long-enough@localhost:5432/mekanix");
    vi.stubEnv("REDIS_URL", "redis://:test-redis-password-long-enough-for-ci@localhost:6379/0");
    vi.stubEnv("JWT_SECRET", "unit-test-secret-with-at-least-32-characters");
    vi.stubEnv("APP_URL", "https://mekanix.ir");
    queryRaw.mockResolvedValue([{ count: 1 }]);
    redisAvailable.mockResolvedValue(true);
    exchangeRateSnapshot.mockResolvedValue({
      rate: 6_000_000,
      baseRate: 6_000_000,
      multiplier: 1,
      source: "telegram",
      fetchedAt: Date.now(),
      rateUpdatedAt: Date.now(),
      ageMs: 0,
      trustedForPayments: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  async function getReadyResponse() {
    const { GET } = await import("@/app/api/ready/route");
    return GET();
  }

  it("accepts a public HTTPS origin in production", async () => {
    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.paymentCallbackUrl).toBe(true);
  });

  it("requires a fresh trusted Telegram rate for production payments", async () => {
    exchangeRateSnapshot.mockResolvedValue({
      rate: 6_000_000,
      baseRate: 6_000_000,
      multiplier: 1,
      source: "mekanix-internal",
      fetchedAt: Date.now(),
      rateUpdatedAt: null,
      ageMs: null,
      trustedForPayments: false,
    });

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.exchangeRateTrusted).toBe(false);
  });

  it("rejects weak PostgreSQL credentials in production", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://mekanix:short@localhost:5432/mekanix");

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.databaseProvider).toBe(false);
  });

  it("rejects a weak Redis password even when Redis responds", async () => {
    vi.stubEnv("REDIS_URL", "redis://:short@localhost:6379/0");
    redisAvailable.mockResolvedValue(true);

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.redis).toBe(false);
  });

  it("requires live Redis in staging instead of accepting in-memory fallback", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    redisAvailable.mockResolvedValue(false);

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.redis).toBe(false);
  });

  it("rejects a weak production JWT signing secret", async () => {
    vi.stubEnv("JWT_SECRET", "short-secret");

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.jwtSecret).toBe(false);
  });

  it("rejects localhost as the production payment callback origin", async () => {
    vi.stubEnv("APP_URL", "https://localhost:3000");

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.paymentCallbackUrl).toBe(false);
    expect(body.errors.join(" ")).toContain("inspect server logs");
  });

  it("rejects APP_URL values containing paths or credentials", async () => {
    vi.stubEnv("APP_URL", "https://user:pass@mekanix.ir/callback");

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.paymentCallbackUrl).toBe(false);
  });

  it("allows local HTTP and simulator providers only in explicit staging mode", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    vi.stubEnv("APP_URL", "http://localhost:3001");

    const response = await getReadyResponse();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe(true);
    expect(body.checks.migrationsApplied).toBe(true);
    expect(body.checks.paymentCallbackUrl).toBe(true);
  });
});
