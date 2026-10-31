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
export function parseTelegramUsdIrrRate(html: string): number | null {
  const patterns: Array<{ regex: RegExp; unitGroup?: number }> = [
    { regex: /دلار[^0-9۰-۹٠-٩]*([\d,٬۰-۹٠-٩\s]+)\s*(ریال|تومان)?/i, unitGroup: 2 },
    { regex: /USD[^0-9۰-۹٠-٩]*([\d,٬۰-۹٠-٩]+)/i },
    { regex: /dollar[^0-9۰-۹٠-٩]*([\d,٬۰-۹٠-٩]+)/i },
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern.regex);
    if (!match?.[1]) continue;

    const raw = normalizeDigits(match[1]).replace(/[٬,‌\s]/g, "");
    let rate = Number.parseInt(raw, 10);
    if (!Number.isFinite(rate)) continue;

    if (pattern.unitGroup && match[pattern.unitGroup] === "تومان") {
      rate *= 10;
    }

    if (rate >= 100_000 && rate <= 100_000_000) {
      return rate;
    }
  }

  return null;
}
