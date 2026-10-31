import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, pingMock, disconnectMock } = vi.hoisted(() => ({
  connectMock: vi.fn().mockResolvedValue(undefined),
  pingMock: vi.fn(),
  disconnectMock: vi.fn(),
}));

vi.mock("ioredis", () => ({
  Redis: class {
    on() {
      return this;
    }
    connect() {
      return connectMock();
    }
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
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(pingMock).toHaveBeenCalledTimes(2);
  });
});
