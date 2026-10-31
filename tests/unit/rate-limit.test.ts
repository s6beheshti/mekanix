import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { kvIncr } = vi.hoisted(() => ({
  kvIncr: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ kvIncr }));

describe("production rate-limit failure policy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies requests when Redis is unavailable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    kvIncr.mockRejectedValue(new Error("Redis unavailable"));

    const { rateLimitAsync, rateLimit } = await import("@/lib/rate-limit");

    await expect(rateLimitAsync("payment:user-1", 5, 60_000)).resolves.toEqual({
      success: false,
      resetMs: 60_000,
    });
    expect(rateLimit("legacy", 5, 60_000)).toEqual({
      success: false,
      resetMs: 60_000,
    });
  });

  it("keeps the in-memory fallback for development only", async () => {
    vi.stubEnv("NODE_ENV", "development");
    kvIncr.mockRejectedValue(new Error("Redis unavailable"));

    const { rateLimitAsync } = await import("@/lib/rate-limit");

    await expect(rateLimitAsync("dev:user-1", 5, 60_000)).resolves.toEqual({
      success: true,
      resetMs: 60_000,
    });
  });
});
