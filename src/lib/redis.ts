// MEKANIX — Redis adapter
//
// Redis is mandatory in production/staging. In-memory fallback is development/test only.
// A Redis outage must never silently disable distributed rate limits or idempotency.
//
// Used by: rate-limit.ts, auth.ts (idempotency), sync-engine.ts

import type { LRUCache } from "lru-cache";

// ──────────── In-memory store (fallback) ────────────
const memStore = new Map<string, { value: string; expiresAt: number }>();

function memGet(key: string): string | null {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlMs: number): void {
  memStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memDel(key: string): void {
  memStore.delete(key);
}

function memIncr(key: string, ttlMs: number): number {
  const current = parseInt(memGet(key) ?? "0", 10);
  const next = current + 1;
  memSet(key, String(next), ttlMs);
  return next;
}

// ──────────── Redis client (lazy-loaded) ────────────
let redisClient: any = null;
let redisAvailable = false;

async function getRedisClient(): Promise<any | null> {
  if (redisClient !== null) return redisClient;
  
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    redisAvailable = false;
    return null;
  }

  let candidate: any = null;
  try {
    // Dynamic import so the dependency is optional.
    const { Redis } = await import("ioredis");
    candidate = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });

    // Cache only a client that has completed a successful health check.
    await candidate.ping();
    redisClient = candidate;
    redisAvailable = true;
    console.log("✅ Redis connected for distributed state");
    return redisClient;
  } catch (e) {
    // Do not retain a failed client: the next request must be able to retry
    // after Redis recovers, rather than remaining on the in-memory fallback.
    try {
      candidate?.disconnect();
    } catch {
      // Ignore cleanup errors; Redis is already unavailable.
    }
    redisClient = null;
    redisAvailable = false;
    console.warn("⚠️  Redis unavailable, falling back to in-memory:", (e as Error).message);
    return null;
  }
}

// ──────────── Unified key-value interface ────────────
// Works with Redis (distributed) or in-memory (single instance).

export async function kvGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  if (client) {
    try {
      return await client.get(key);
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis GET failed in production", { cause: error });
      }
      return memGet(key);
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Redis is required in production");
  }
  return memGet(key);
}

export async function kvSet(key: string, value: string, ttlMs: number): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.set(key, value, "PX", ttlMs);
      return;
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis SET failed in production", { cause: error });
      }
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Redis is required in production");
  }
  memSet(key, value, ttlMs);
}

export async function kvDel(key: string): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.del(key);
      return;
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis DEL failed in production", { cause: error });
      }
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Redis is required in production");
  }
  memDel(key);
}

export async function kvIncr(key: string, ttlMs: number): Promise<number> {
  const client = await getRedisClient();
  if (client) {
    try {
      const multi = client.multi();
      multi.incr(key);
      multi.pexpire(key, ttlMs);
      const results = await multi.exec();
      return results[0][1] as number;
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis INCR failed in production", { cause: error });
      }
      return memIncr(key, ttlMs);
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Redis is required in production");
  }
  return memIncr(key, ttlMs);
}

// Check if Redis is available (for health checks)
export async function isRedisAvailable(): Promise<boolean> {
  const client = await getRedisClient();
  return client !== null && redisAvailable;
}

// Clean up in-memory store periodically (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore.entries()) {
    if (entry.expiresAt < now) memStore.delete(key);
  }
}, 5 * 60 * 1000);
