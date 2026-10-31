import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, pingMock, disconnectMock, multiExecMock, multiIncrMock, multiPexpireMock } = vi.hoisted(() => ({
  connectMock: vi.fn().mockResolvedValue(undefined),
  pingMock: vi.fn(),
  disconnectMock: vi.fn(),
  multiExecMock: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
  multiIncrMock: vi.fn(),
  multiPexpireMock: vi.fn(),
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
    multi() {
      const chain: any = {};
      chain.incr = (...args: any[]) => { multiIncrMock(...args); return chain; };
      chain.pexpire = (...args: any[]) => { multiPexpireMock(...args); return chain; };
      chain.exec = () => multiExecMock();
      return chain;
    }
  },
}));

describe("Redis connection recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    pingMock.mockResolvedValue("PONG");
    multiExecMock.mockResolvedValue([[null, 1], [null, 1]]);
    vi.useFakeTimers();
    vi.stubEnv("REDIS_URL", "redis://:test-password@localhost:6379/0");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("fails closed when Redis reports an INCR command error inside MULTI", async () => {
    vi.stubEnv("NODE_ENV", "production");
    multiExecMock.mockResolvedValueOnce([[new Error("WRONGTYPE"), null], [null, 0]]);

    const { kvIncr } = await import("@/lib/redis");
    await expect(kvIncr("rl:otp:phone", 60_000)).rejects.toThrow(
      "Redis INCR failed in production",
    );
  });

  it("fails closed when PEXPIRE does not attach a TTL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    multiExecMock.mockResolvedValueOnce([[null, 1], [null, 0]]);

    const { kvIncr } = await import("@/lib/redis");
    await expect(kvIncr("rl:otp:phone", 60_000)).rejects.toThrow(
      "Redis INCR failed in production",
    );
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
