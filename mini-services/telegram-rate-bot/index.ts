// Telegram rate scraper — stores a fresh USD/IRR market rate in the shared database.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const channel = process.env.TELEGRAM_RATE_CHANNEL || "NerkhDollarIRT";
const port = Number(process.env.PORT || 3004);
const pollIntervalMs = Math.max(30_000, Number(process.env.POLL_INTERVAL_MS || 60_000));

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, channel, port });
    if (url.pathname === "/fetch-now") {
      const rate = await fetchAndStoreRate();
      return Response.json({ rate, channel, fetchedAt: new Date().toISOString() });
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
    const rate = parseRateFromHtml(html);
    if (rate && rate > 100000 && rate < 10000000) {
      await db.platformSetting.upsert({
        where: { key: "usd_irr_rate_telegram" },
        update: { value: String(rate), description: `@${channel}`, updatedAt: new Date() },
        create: { key: "usd_irr_rate_telegram", value: String(rate), description: `@${channel}` },
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
