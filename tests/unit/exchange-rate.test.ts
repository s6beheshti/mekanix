import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    platformSetting: { findUnique },
  },
}));

describe("USD/IRR payment rate trust", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const updatedAt = new Date(Date.now() - 60_000);
    findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === "usd_irr_rate_telegram") {
        return Promise.resolve({ value: "12000000", updatedAt });
      }
      if (where.key === "usd_irr_rate_source") {
        return Promise.resolve({ value: "telegram" });
      }
      if (where.key === "usd_irr_multiplier") {
        return Promise.resolve({ value: "1.1" });
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trusts a fresh Telegram rate and applies the configured multiplier", async () => {
    const { getUsdIrrRateSnapshot } = await import("@/lib/exchange-rate");
    const snapshot = await getUsdIrrRateSnapshot();

    expect(snapshot.rate).toBe(13_200_000);
    expect(snapshot.source).toBe("telegram");
    expect(snapshot.trustedForPayments).toBe(true);
  });

  it("allows a small future timestamp skew from the Telegram source", async () => {
    findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === "usd_irr_rate_telegram") {
        return Promise.resolve({ value: "12000000", updatedAt: new Date(Date.now() + 3 * 60_000) });
      }
      if (where.key === "usd_irr_rate_source") return Promise.resolve({ value: "telegram" });
      if (where.key === "usd_irr_multiplier") return Promise.resolve({ value: "1" });
      return Promise.resolve(null);
    });

    const { getUsdIrrRateSnapshot } = await import("@/lib/exchange-rate");
    expect((await getUsdIrrRateSnapshot()).trustedForPayments).toBe(true);
  });

  it("does not trust a stale Telegram rate", async () => {
    findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === "usd_irr_rate_telegram") {
        return Promise.resolve({ value: "12000000", updatedAt: new Date(Date.now() - 16 * 60_000) });
      }
      if (where.key === "usd_irr_rate_source") return Promise.resolve({ value: "telegram" });
      if (where.key === "usd_irr_multiplier") return Promise.resolve({ value: "1" });
      return Promise.resolve(null);
    });

    const { getUsdIrrRateSnapshot } = await import("@/lib/exchange-rate");
    expect((await getUsdIrrRateSnapshot()).trustedForPayments).toBe(false);
  });

  it("does not trust an official-API fallback for payment collection", async () => {
    findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === "usd_irr_rate_telegram") {
        return Promise.resolve({ value: "12000000", updatedAt: new Date(Date.now() - 60_000) });
      }
      if (where.key === "usd_irr_rate_source") return Promise.resolve({ value: "api" });
      if (where.key === "usd_irr_multiplier") return Promise.resolve({ value: "1" });
      return Promise.resolve(null);
    });

    const { getUsdIrrRateSnapshot } = await import("@/lib/exchange-rate");
    expect((await getUsdIrrRateSnapshot()).trustedForPayments).toBe(false);
  });

  it("uses the internal display fallback but never marks it payment-trusted", async () => {
    findUnique.mockResolvedValue(null);

    const { getUsdIrrRateSnapshot } = await import("@/lib/exchange-rate");
    const snapshot = await getUsdIrrRateSnapshot();

    expect(snapshot.rate).toBe(6_000_000);
    expect(snapshot.source).toBe("mekanix-internal");
    expect(snapshot.trustedForPayments).toBe(false);
  });
});
