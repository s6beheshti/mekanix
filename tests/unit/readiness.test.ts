import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(async () => [{ count: 1 }]),
}));

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: queryRaw },
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
    vi.stubEnv("DATABASE_URL", "postgresql://mekanix:test@localhost:5432/mekanix");
    vi.stubEnv("JWT_SECRET", "unit-test-secret-with-at-least-32-characters");
    vi.stubEnv("APP_URL", "https://mekanix.ir");
    queryRaw.mockResolvedValue([{ count: 1 }]);
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
