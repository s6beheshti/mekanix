import { describe, expect, it } from "vitest";
import { parseTelegramUsdIrrQuote, parseTelegramUsdIrrRate } from "@/lib/rate-parser";

describe("parseTelegramUsdIrrRate", () => {
  it("normalizes Persian Toman quotes to Rial", () => {
    expect(parseTelegramUsdIrrRate("قیمت دلار ۱,۲۰۰,۰۰۰ تومان")).toBe(12_000_000);
  });

  it("normalizes bare Tehran Telegram quotes from Toman to Rial", () => {
    expect(parseTelegramUsdIrrRate("دلار تهران⛳️: 270,380 خرید🔵")).toBe(2_703_800);
  });

  it("keeps Rial quotes unchanged", () => {
    expect(parseTelegramUsdIrrRate("قیمت دلار ۱۲,۰۰۰,۰۰۰ ریال")).toBe(12_000_000);
  });

  it("uses the configured Toman unit for unitless ASCII USD quotes", () => {
    expect(parseTelegramUsdIrrRate("USD 1,200,000")).toBe(12_000_000);
  });

  it("treats unitless Tehran channel quotes as Toman", () => {
    expect(parseTelegramUsdIrrRate("دلار تهران⛳️: 270,380 خرید")).toBe(2_703_800);
  });

  it("prefers sell quotes over buy quotes in plain text", () => {
    expect(parseTelegramUsdIrrRate("دلار خرید: 270,300\nدلار فروش: 270,390")).toBe(2_703_900);
  });

  it("allows channels with unitless Rial quotes to override the default", () => {
    expect(parseTelegramUsdIrrRate("دلار تهران: 12,000,000", "rial")).toBe(12_000_000);
  });

  it("supports Arabic-Indic digits", () => {
    expect(parseTelegramUsdIrrRate("دلار ١٢,٠٠٠,٠٠٠ ریال")).toBe(12_000_000);
  });

  it("rejects implausible or missing rates", () => {
    expect(parseTelegramUsdIrrRate("دلار ۶,۰۰۰ تومان")).toBeNull();
    expect(parseTelegramUsdIrrRate("دلار تهران: 270,380", "rial")).toBeNull();
    expect(parseTelegramUsdIrrRate("No exchange quote available")).toBeNull();
  });
});

describe("parseTelegramUsdIrrQuote", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");

  it("returns the Rial value, quote type, and original post timestamp", () => {
    const html = `
      <div class="tgme_widget_message_wrap js-widget_message_wrap">
        <time datetime="2026-10-31T11:55:00.000Z"></time>
        <div class="tgme_widget_message_text">دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)).toEqual({
      rate: 2_703_800,
      quoteType: "sell",
      postedAt: new Date("2026-10-31T11:55:00.000Z"),
    });
  });

  it("rejects posts more than five minutes in the future", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T12:06:00.000Z"></time>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)).toBeNull();
  });

  it("allows a small future timestamp skew", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T12:03:00.000Z"></time>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)?.postedAt).toEqual(
      new Date("2026-10-31T12:03:00.000Z"),
    );
  });

  it("rejects old Telegram posts even when the page was fetched just now", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:44:00.000Z"></time>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)).toBeNull();
  });

  it("rejects messages without a Telegram timestamp", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)).toBeNull();
  });

  it("chooses the newest fresh sell quote even when blocks are not newest-first", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:40:00.000Z"></time>
        <div>دلار تهران: 270,300 فروش</div>
      </div>
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:58:00.000Z"></time>
        <div>دلار تهران: 270,500 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)).toEqual({
      rate: 2_705_000,
      quoteType: "sell",
      postedAt: new Date("2026-10-31T11:58:00.000Z"),
    });
  });

  it("prefers a sell quote over a newer buy quote", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:59:00.000Z"></time>
        <div>دلار تهران: 270,600 خرید</div>
      </div>
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:55:00.000Z"></time>
        <div>دلار تهران: 270,500 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)?.rate).toBe(2_705_000);
  });

  it("ignores rates embedded in script and style markup", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T11:55:00.000Z"></time>
        <script>دلار تهران: 999,999 فروش</script>
        <style>دلار تهران: 888,888 فروش</style>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseTelegramUsdIrrQuote(html, "toman", now)?.rate).toBe(2_703_800);
  });
});
