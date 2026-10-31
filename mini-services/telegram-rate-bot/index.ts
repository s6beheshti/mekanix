// Telegram rate scraper — stores a fresh USD/IRR market rate in the shared database.
import { PrismaClient } from "@prisma/client";
import { parseFreshTelegramUsdIrrQuote } from "../../src/lib/rate-parser";

const db = new PrismaClient();
const channel = process.env.TELEGRAM_RATE_CHANNEL || "NerkhDollarIRT";
const rateUnit = process.env.TELEGRAM_RATE_UNIT === "rial" ? "rial" : "toman";
const port = Number(process.env.PORT || 3004);
const pollIntervalMs = Math.max(30_000, Number(process.env.POLL_INTERVAL_MS || 60_000));
const MAX_RATE_AGE_MS = 15 * 60 * 1000;

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, channel, rateUnit, port });
    if (url.pathname === "/ready") {
      const [rateSetting, sourceSetting] = await Promise.all([
        db.platformSetting.findUnique({ where: { key: "usd_irr_rate_telegram" } }),
        db.platformSetting.findUnique({ where: { key: "usd_irr_rate_source" } }),
      ]);
      const rate = Number(rateSetting?.value);
      const updatedAt = rateSetting?.updatedAt ? new Date(rateSetting.updatedAt).getTime() : null;
      const ageMs = updatedAt === null ? null : Date.now() - updatedAt;
      const ok =
        sourceSetting?.value === "telegram" &&
        Number.isSafeInteger(rate) &&
        rate >= 1_000_000 &&
        rate <= 100_000_000 &&
        ageMs !== null &&
        ageMs >= 0 &&
        ageMs <= MAX_RATE_AGE_MS;
      return Response.json(
        { ok, rate: Number.isFinite(rate) ? rate : null, source: sourceSetting?.value ?? "unknown", ageMs },
        { status: ok ? 200 : 503 },
      );
    }
    if (url.pathname === "/fetch-now") {
      const rate = await fetchAndStoreRate();
      return Response.json({ rate, channel, rateUnit, fetchedAt: new Date().toISOString() });
    }
    if (url.pathname === "/latest") {
      const setting = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_telegram" } });
      const source = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_source" } });
      return Response.json({
        rate: setting?.value ? parseFloat(setting.value) : null,
        source: source?.value ?? "telegram",
        channel,
        updatedAt: setting?.updatedAt,
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[rate-bot] listening on ${port}; polling @${channel} every ${pollIntervalMs}ms`);

async function fetchAndStoreRate(): Promise<number | null> {
  try {
    const res = await fetch(`https://t.me/s/${channel}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MekanixBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log(`⚠️ Telegram ${res.status}, fallback API`);
      return await fetchFallbackApi();
    }
    const html = await res.text();
    const quote = parseFreshTelegramUsdIrrQuote(html, rateUnit, Date.now(), MAX_RATE_AGE_MS);
    if (
      quote &&
      Number.isSafeInteger(quote.rate) &&
      quote.rate >= 1_000_000 &&
      quote.rate <= 100_000_000
    ) {
      const quotedAt = new Date(quote.quotedAt);
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_telegram" },
        update: { value: String(quote.rate), description: `@${channel}`, updatedAt: quotedAt },
        create: {
          key: "usd_irr_rate_telegram",
          value: String(quote.rate),
          description: `@${channel}`,
          updatedAt: quotedAt,
        },
      });
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_source" },
        update: { value: "telegram", updatedAt: new Date() },
        create: { key: "usd_irr_rate_source", value: "telegram" },
      });
      console.log(`✓ Telegram: ${quote.rate.toLocaleString()} IRR/USD (quoted ${quotedAt.toISOString()})`);
      return quote.rate;
    }
    console.log("⚠️ No fresh timestamped Telegram quote, fallback API");
    return await fetchFallbackApi();
  } catch (e: any) {
    console.log(`⚠️ Error: ${e.message}, fallback`);
    return await fetchFallbackApi();
  }
}

async function fetchFallbackApi(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const rate = data?.rates?.IRR;
    if (rate && rate > 1_000_000) {
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_telegram" },
        update: { value: String(rate), description: "open.er-api.com", updatedAt: new Date() },
        create: { key: "usd_irr_rate_telegram", value: String(rate), description: "open.er-api.com" },
      });
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_source" },
        update: { value: "api", updatedAt: new Date() },
        create: { key: "usd_irr_rate_source", value: "api" },
      });
      console.log(`✓ API: ${rate.toLocaleString()} IRR/USD`);
      return rate;
    }
  } catch (e: any) {
    console.log(`✗ Fallback failed: ${e.message}`);
  }
  return null;
}

fetchAndStoreRate();
const pollTimer = setInterval(fetchAndStoreRate, pollIntervalMs);


async function shutdown(signal: string) {
  console.log(`[rate-bot] ${signal} received; shutting down`);
  clearInterval(pollTimer);
  server.stop();
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
