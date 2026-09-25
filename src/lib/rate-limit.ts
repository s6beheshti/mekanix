// MEKANIX — Rate Limiting (Redis-backed with in-memory fallback)
//
// When REDIS_URL is set, rate limiting is distributed across all instances.
// Otherwise, falls back to in-memory (single-instance dev mode).

import { kvIncr } from "./redis";

// ──────────── Rate limit configuration ────────────

export const RATE_LIMITS = {
  OTP_SEND: { max: 5, windowMs: 10 * 60_000 },   // 5 per 10 minutes
  OTP_VERIFY: { max: 5, windowMs: 60_000 },       // 5 per minute
  PAYMENT: { max: 5, windowMs: 60_000 },           // 5 per minute
  WITHDRAW: { max: 3, windowMs: 3_600_000 },       // 3 per hour
  API_DEFAULT: { max: 60, windowMs: 60_000 },      // 60 per minute
} as const;

// ──────────── Client ID extraction ────────────

export function getClientId(req: Request, userId?: string): string {
  if (userId) return userId;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

// ──────────── In-memory store (fast path) ────────────
// Used when Redis is not available (dev mode).

const memStore = new Map<string, { count: number; resetAt: number }>();

function memRateLimit(key: string, max: number, windowMs: number): { success: boolean; resetMs: number } {
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || entry.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, resetMs: windowMs };
  }

  if (entry.count >= max) {
    return { success: false, resetMs: entry.resetAt - now };
  }

  entry.count++;
  return { success: true, resetMs: entry.resetAt - now };
}

// ──────────── Unified rate limit function ────────────
// Synchronous version (uses in-memory) — for backward compat.
// Existing callers use rateLimit(key, max, windowMs) synchronously.

export function rateLimit(key: string, max: number, windowMs: number): { success: boolean; resetMs: number } {
  return memRateLimit(key, max, windowMs);
}

// Async version that uses Redis when available.
// New callers should use this for distributed rate limiting.

export async function rateLimitAsync(key: string, max: number, windowMs: number): Promise<{ success: boolean; resetMs: number }> {
  // Try Redis first
  const redisKey = `rl:${key}`;
  try {
    const count = await kvIncr(redisKey, windowMs);
    if (count > max) {
      return { success: false, resetMs: windowMs };
    }
    return { success: true, resetMs: windowMs };
  } catch {
    // Fall back to in-memory
    return memRateLimit(key, max, windowMs);
  }
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore.entries()) {
    if (entry.resetAt < now) memStore.delete(key);
  }
}, 5 * 60 * 1000);
