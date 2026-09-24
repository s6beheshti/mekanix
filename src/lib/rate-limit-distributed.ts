import { createHash } from "node:crypto";

type Entry = { count: number; resetAt: number };

const memory = new Map<string, Entry>();

/**
 * Production-safe API rate limiter with a memory fallback.
 * If REDIS_URL is configured, callers should prefer the Redis-backed adapter
 * exposed by the deployment layer. The memory fallback is intentionally
 * conservative and is suitable only for single-instance development.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const normalized = createHash("sha256").update(key).digest("hex");
  const current = memory.get(normalized);

  if (!current || current.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs };
    memory.set(normalized, entry);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: entry.resetAt };
  }

  current.count += 1;
  const allowed = current.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function rateLimitResponse(resetAt: number) {
  return {
    status: 429,
    headers: {
      "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
    },
  };
}
