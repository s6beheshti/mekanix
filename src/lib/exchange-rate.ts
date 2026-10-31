import { db } from "@/lib/db";

export interface UsdIrrRateSnapshot {
  rate: number;
  baseRate: number;
  multiplier: number;
  source: string;
  fetchedAt: number;
  rateUpdatedAt: number | null;
  ageMs: number | null;
  trustedForPayments: boolean;
}

interface CachedRate {
  baseRate: number;
  multiplier: number;
  multiplierValid: boolean;
  source: string;
  rateUpdatedAt: number | null;
  fetchedAt: number;
}

const FALLBACK_RATE = 6_000_000;
const MIN_RATE = 100_000;
const MAX_RATE = 20_000_000;
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 2;
const MAX_RATE_AGE_MS = 15 * 60 * 1000;
const CACHE_TTL_MS = 30 * 1000;

let cachedRate: CachedRate | null = null;
let cacheExpiresAt = 0;

function parseNumericSetting(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Number(value.replace(/[,_\s]/g, ""));
}

async function loadRate(): Promise<CachedRate> {
  const now = Date.now();
  try {
    const [rateSetting, sourceSetting, multiplierSetting] = await Promise.all([
      db.platformSetting.findUnique({ where: { key: "usd_irr_rate_telegram" } }),
      db.platformSetting.findUnique({ where: { key: "usd_irr_rate_source" } }),
      db.platformSetting.findUnique({ where: { key: "usd_irr_multiplier" } }),
    ]);

    const rawRate = parseNumericSetting(rateSetting?.value);
    const validRate = Number.isFinite(rawRate) && rawRate >= MIN_RATE && rawRate <= MAX_RATE;
    const rawMultiplier = multiplierSetting
      ? parseNumericSetting(multiplierSetting.value)
      : 1;
    const multiplierValid =
      Number.isFinite(rawMultiplier) &&
      rawMultiplier >= MIN_MULTIPLIER &&
      rawMultiplier <= MAX_MULTIPLIER;
    const multiplier = multiplierValid ? rawMultiplier : 1;
    const rateUpdatedAt = rateSetting?.updatedAt
      ? new Date(rateSetting.updatedAt).getTime()
      : null;

    return {
      baseRate: validRate ? rawRate : FALLBACK_RATE,
      multiplier,
      multiplierValid,
      source: validRate ? (sourceSetting?.value?.toLowerCase() || "unknown") : "mekanix-internal",
      rateUpdatedAt: validRate ? rateUpdatedAt : null,
      fetchedAt: now,
    };
  } catch (error) {
    console.error("[exchange-rate] Could not load the market rate:", error);
    return {
      baseRate: FALLBACK_RATE,
      multiplier: 1,
      multiplierValid: false,
      source: "mekanix-internal",
      rateUpdatedAt: null,
      fetchedAt: now,
    };
  }
}

export async function getUsdIrrRateSnapshot(options?: {
  forceRefresh?: boolean;
}): Promise<UsdIrrRateSnapshot> {
  const now = Date.now();
  if (!options?.forceRefresh && cachedRate && now < cacheExpiresAt) {
    return toSnapshot(cachedRate, now);
  }

  cachedRate = await loadRate();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return toSnapshot(cachedRate, now);
}

function toSnapshot(rate: CachedRate, now: number): UsdIrrRateSnapshot {
  const finalRate = Math.round(rate.baseRate * rate.multiplier);
  const ageMs = rate.rateUpdatedAt === null ? null : now - rate.rateUpdatedAt;
  const trustedForPayments =
    rate.source === "telegram" &&
    rate.multiplierValid &&
    ageMs !== null &&
    ageMs >= 0 &&
    ageMs <= MAX_RATE_AGE_MS &&
    finalRate >= MIN_RATE &&
    finalRate <= MAX_RATE;

  return {
    rate: finalRate,
    baseRate: rate.baseRate,
    multiplier: rate.multiplier,
    source: rate.source,
    fetchedAt: rate.fetchedAt,
    rateUpdatedAt: rate.rateUpdatedAt,
    ageMs,
    trustedForPayments,
  };
}
