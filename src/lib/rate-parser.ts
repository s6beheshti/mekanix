const PERSIAN_AND_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(PERSIAN_AND_ARABIC_DIGITS.indexOf(digit) % 10),
  );
}

/**
 * Parse a USD quote from the configured Tehran Telegram channel.
 * The platform stores and charges in Rial, so Toman quotes are multiplied by 10.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|article|section|li)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

/**
 * Parse the Tehran Telegram market quote. The channel publishes unitless
 * quotes in Toman by default; explicit Rial/Toman labels always take priority.
 * The most recent sell quote is preferred because it is the customer's buy rate.
 */
export function parseTelegramUsdIrrRate(html: string, defaultUnit: "rial" | "toman" = "toman"): number | null {
  const text = htmlToText(html).replace(/\r/g, "");
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

    if (rate >= 100_000 && rate <= 100_000_000) {
      return rate;
    }
  }

  return null;
}
