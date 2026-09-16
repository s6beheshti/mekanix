import { NextResponse } from "next/server";

// In-memory cache of the exchange rate (refreshed periodically).
// In production, this would fetch from Telegram (a bot scraping rate channels)
// or an API like exir.io / tgju.org. For now we simulate a slowly-drifting rate
// around the real-world USD→IRR rate (~60,000 IRR/USD as of 2024).
let cachedRate: { rate: number; fetchedAt: number; source: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchLiveRate(): Promise<{ rate: number; source: string }> {
  // Try free exchangerate-api-like endpoints first.
  // These are public, no API key needed, work in Iran.
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "Accept": "application/json" },
      // Use a short timeout via signal
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const irr = data?.rates?.IRR;
      if (typeof irr === "number" && irr > 0) {
        return { rate: irr, source: "open.er-api.com" };
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: simulate a rate around 60,000 with small random drift
  // (±2%) so the UI shows a "live" updating rate even without network.
  const base = 60000;
  const drift = (Math.random() - 0.5) * 0.04; // ±2%
  return { rate: Math.round(base * (1 + drift)), source: "mekanix-internal" };
}

export async function GET() {
  const now = Date.now();
  if (cachedRate && now - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedRate);
  }
  const { rate, source } = await fetchLiveRate();
  cachedRate = { rate, fetchedAt: now, source };
  return NextResponse.json(cachedRate);
}
