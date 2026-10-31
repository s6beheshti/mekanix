import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pingMock, disconnectMock } = vi.hoisted(() => ({
  pingMock: vi.fn(),
  disconnectMock: vi.fn(),
}));

vi.mock("ioredis", () => ({
  Redis: class {
    ping() {
      return pingMock();
    }
    disconnect() {
      disconnectMock();
    }
  },
}));

describe("Redis connection recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("REDIS_URL", "redis://:test-password@localhost:6379/0");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("retries after a failed startup ping instead of caching a dead client", async () => {
    pingMock
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce("PONG");

    const { isRedisAvailable } = await import("@/lib/redis");

    await expect(isRedisAvailable()).resolves.toBe(false);
    expect(disconnectMock).toHaveBeenCalledTimes(1);

    await expect(isRedisAvailable()).resolves.toBe(true);
    expect(pingMock).toHaveBeenCalledTimes(2);
  });
});
