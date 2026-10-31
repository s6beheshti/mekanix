const PERSIAN_AND_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
export const TELEGRAM_RATE_MAX_AGE_MS = 15 * 60 * 1000;
export const TELEGRAM_RATE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(PERSIAN_AND_ARABIC_DIGITS.indexOf(digit) % 10),
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|article|section|li)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

type QuoteType = "sell" | "trade" | "buy" | "unknown";

interface ParsedRate {
  rate: number;
  quoteType: QuoteType;
}

export interface TelegramUsdIrrQuote extends ParsedRate {
  postedAt: Date;
}

function parseQuoteFromText(text: string, defaultUnit: "rial" | "toman"): ParsedRate | null {
  const patterns: Array<{ regex: RegExp; unitGroup?: number }> = [
    { regex: /دلار[^0-9۰-۹٠-٩\n]{0,50}([\d,٬۰-۹٠-٩]+)\s*(ریال|تومان)?[^\n]{0,20}/gi, unitGroup: 2 },
    { regex: /USD[^0-9۰-۹٠-٩\n]{0,30}([\d,٬۰-۹٠-٩]+)[^\n]{0,20}/gi },
    { regex: /dollar[^0-9۰-۹٠-٩\n]{0,30}([\d,٬۰-۹٠-٩]+)[^\n]{0,20}/gi },
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern.regex)];
    if (!matches.length) continue;

    const match =
      matches.find((item) => /فروش/.test(item[0])) ||
      matches.find((item) => /معامله/.test(item[0])) ||
      matches[0];
    if (!match?.[1]) continue;

    const raw = normalizeDigits(match[1]).replace(/[٬,‌\s]/g, "");
    let rate = Number.parseInt(raw, 10);
    if (!Number.isFinite(rate)) continue;

    const unit = pattern.unitGroup ? match[pattern.unitGroup] : undefined;
    if (unit === "تومان" || (!unit && defaultUnit === "toman")) {
      rate *= 10;
    }

    if (rate < 100_000 || rate > 100_000_000) continue;

    const quoteType: QuoteType = /فروش/.test(match[0])
      ? "sell"
      : /معامله/.test(match[0])
        ? "trade"
        : /خرید/.test(match[0])
          ? "buy"
          : "unknown";
    return { rate, quoteType };
  }

  return null;
}

/**
 * Parse a USD quote from plain text or Telegram HTML.
 * Unitless NerkhDollarIRT quotes default to Toman; explicit labels override it.
 */
export function parseTelegramUsdIrrRate(html: string, defaultUnit: "rial" | "toman" = "toman"): number | null {
  return parseQuoteFromText(htmlToText(html), defaultUnit)?.rate ?? null;
}

/**
 * Parse a quote from the same Telegram message block as its timestamp.
 * Only posts newer than 15 minutes (with 5 minutes of future clock skew) are accepted.
 * Telegram's public channel page is newest-first; prefer a fresh sell quote, then trade.
 */
export function parseTelegramUsdIrrQuote(
  html: string,
  defaultUnit: "rial" | "toman" = "toman",
  now = Date.now(),
): TelegramUsdIrrQuote | null {
  const blocks = [
    ...html.matchAll(/<div class="tgme_widget_message_wrap\b[\s\S]*?(?=<div class="tgme_widget_message_wrap\b|$)/gi),
  ].map((match) => match[0]);

  const candidates: TelegramUsdIrrQuote[] = [];
  for (const block of blocks) {
    const timeMatch = block.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    if (!timeMatch?.[1]) continue;

    const postedAtMs = Date.parse(timeMatch[1]);
    if (!Number.isFinite(postedAtMs)) continue;
    const ageMs = now - postedAtMs;
    if (ageMs < -TELEGRAM_RATE_MAX_FUTURE_SKEW_MS || ageMs > TELEGRAM_RATE_MAX_AGE_MS) continue;

    const parsed = parseQuoteFromText(htmlToText(block), defaultUnit);
    if (parsed) candidates.push({ ...parsed, postedAt: new Date(postedAtMs) });
  }

  const priority = (candidate: TelegramUsdIrrQuote) =>
    candidate.quoteType === "sell" ? 0 : candidate.quoteType === "trade" ? 1 : 2;

  candidates.sort(
    (left, right) =>
      priority(left) - priority(right) ||
      right.postedAt.getTime() - left.postedAt.getTime(),
  );
  return candidates[0] ?? null;
}
