// Telegram rate scraper — reads @NerkhDollarIRT channel and writes rate to DB
import { PrismaClient } from "/home/z/my-project/node_modules/.prisma/client/index.js";

const db = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } },
});
const CHANNEL = "NerkhDollarIRT";
const PORT = 3004;
const POLL_INTERVAL_MS = 60 * 1000;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, channel: CHANNEL, port: PORT });
    if (url.pathname === "/fetch-now") {
      const rate = await fetchAndStoreRate();
      return Response.json({ rate, channel: CHANNEL, fetchedAt: new Date().toISOString() });
    }
    if (url.pathname === "/latest") {
      const setting = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_telegram" } });
      const source = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_source" } });
      return Response.json({
        rate: setting?.value ? parseFloat(setting.value) : null,
        source: source?.value ?? "telegram",
        channel: CHANNEL,
        updatedAt: setting?.updatedAt,
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`📡 Telegram rate scraper on port ${PORT} — reading @${CHANNEL} every 1 min`);

async function fetchAndStoreRate(): Promise<number | null> {
  try {
    const res = await fetch(`https://t.me/s/${CHANNEL}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MekanixBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.log(`⚠️ Telegram ${res.status}, fallback API`);
      return await fetchFallbackApi();
    }
    const html = await res.text();
    const rate = parseRateFromHtml(html);
    if (rate && rate > 100000 && rate < 10000000) {
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_telegram" },
        update: { value: String(rate), description: `@${CHANNEL}`, updatedAt: new Date() },
        create: { key: "usd_irr_rate_telegram", value: String(rate), description: `@${CHANNEL}` },
      });
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_source" },
        update: { value: "telegram", updatedAt: new Date() },
        create: { key: "usd_irr_rate_source", value: "telegram" },
      });
      console.log(`✓ Telegram: ${rate.toLocaleString()} IRR/USD`);
      return rate;
    }
    console.log("⚠️ Parse failed, fallback API");
    return await fetchFallbackApi();
  } catch (e: any) {
    console.log(`⚠️ Error: ${e.message}, fallback`);
    return await fetchFallbackApi();
  }
}

function parseRateFromHtml(html: string): number | null {
  const patterns = [
    /دلار[^0-9۰-۹]*([\d,٬۰-۹\s]+)\s*(ریال|تومان)?/i,
    /USD[^0-9]*([\d,۰-۹]+)/i,
    /dollar[^0-9]*([\d,۰-۹]+)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      let raw = m[1].trim().replace(/[۰-۹٠-٩]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(d) % 10));
      raw = raw.replace(/[٬,‌\s]/g, "");
      const rate = parseInt(raw, 10);
      if (!isNaN(rate) && rate > 100000 && rate < 10000000) return rate;
    }
  }
  return null;
}

async function fetchFallbackApi(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const rate = data?.rates?.IRR;
    if (rate && rate > 100000) {
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
setInterval(fetchAndStoreRate, POLL_INTERVAL_MS);
