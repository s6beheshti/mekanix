import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/exchange-rate
// Returns the current USD→IRR exchange rate.
// Priority: Telegram bot rate (@NerkhDollarIRT) > official API > fallback
// Also applies admin-configured multiplier if set.
export async function GET() {
  // 1. Try Telegram rate (stored by mini-services/telegram-rate-bot)
  let rate: number | null = null;
  let source = "unknown";

  try {
    const telegramSetting = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_telegram" } });
    const sourceSetting = await db.platformSetting.findUnique({ where: { key: "usd_irr_rate_source" } });
    
    if (telegramSetting?.value) {
      rate = parseFloat(telegramSetting.value);
      source = sourceSetting?.value || "telegram";
    }
  } catch {}

  // 2. Fallback to official API if Telegram rate not available
  if (!rate || rate < 100000) {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const irr = data?.rates?.IRR;
        if (typeof irr === "number" && irr > 0) {
          rate = irr;
          source = "open.er-api.com";
        }
      }
    } catch {}
  }

  // 3. Final fallback
  if (!rate) {
    rate = 6000000; // realistic Iranian free market rate
    source = "mekanix-internal";
  }

  // 4. Apply admin-configured multiplier (default 1.0)
  let multiplier = 1.0;
  try {
    const multSetting = await db.platformSetting.findUnique({ where: { key: "usd_irr_multiplier" } });
    if (multSetting?.value) {
      multiplier = parseFloat(multSetting.value);
    }
  } catch {}

  const finalRate = Math.round(rate * multiplier);

  return NextResponse.json({
    rate: finalRate,
    baseRate: rate,
    multiplier,
    source,
    fetchedAt: Date.now(),
  });
}
