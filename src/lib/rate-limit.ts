// MEKANIX — Rate Limiting (sliding window, in-memory)
import type { LRUCache } from "lru-cache";

// Use a simple Map-based approach for in-memory rate limiting
const store = new Map<string, { count: number; resetAt: number }>();

export const RATE_LIMITS = {
  OTP_SEND: { max: 3, windowMs: 60_000 },       // 3 per minute
  OTP_VERIFY: { max: 5, windowMs: 60_000 },      // 5 per minute
  PAYMENT: { max: 5, windowMs: 60_000 },         // 5 per minute
  WITHDRAW: { max: 3, windowMs: 3_600_000 },     // 3 per hour
  API_DEFAULT: { max: 60, windowMs: 60_000 },    // 60 per minute
} as const;

export function getClientId(req: Request, userId?: string): string {
  if (userId) return userId;
  // Try X-Forwarded-For, then X-Real-IP, then fall back
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}

export function rateLimit(key: string, max: number, windowMs: number): { success: boolean; resetMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, resetMs: windowMs };
  }

  if (entry.count >= max) {
    return { success: false, resetMs: entry.resetAt - now };
  }

  entry.count++;
  return { success: true, resetMs: entry.resetAt - now };
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);
