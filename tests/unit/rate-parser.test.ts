import { describe, expect, it } from "vitest";
import { parseFreshTelegramUsdIrrQuote, parseTelegramUsdIrrRate } from "@/lib/rate-parser";

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

  it("prefers the latest sell quote over buy quotes in Telegram HTML", () => {
    const html = [
      "<div>دلار تهران: 270,380 خرید</div>",
      "<div>دلار تهران: 270,390 فروش</div>",
    ].join("");
    expect(parseTelegramUsdIrrRate(html)).toBe(2_703_900);
  });

  it("allows channels with unitless Rial quotes to override the default", () => {
    expect(parseTelegramUsdIrrRate("دلار تهران: 12,000,000", "rial")).toBe(12_000_000);
  });

  it("supports Arabic-Indic digits", () => {
    expect(parseTelegramUsdIrrRate("دلار ١٢,٠٠٠,٠٠٠ ریال")).toBe(12_000_000);
  });

  it("rejects implausible or missing rates", () => {
    expect(parseTelegramUsdIrrRate("دلار ۶,۰۰۰ تومان")).toBeNull();
    expect(parseTelegramUsdIrrRate("No exchange quote available")).toBeNull();
  });
});


describe("parseFreshTelegramUsdIrrQuote", () => {
  const now = Date.parse("2026-10-31T12:00:00.000Z");

  it("returns the Rial value and original post timestamp for a fresh quote", () => {
    const html = `
      <div class="tgme_widget_message_wrap js-widget_message_wrap">
        <time datetime="2026-10-31T11:55:00.000Z"></time>
        <div class="tgme_widget_message_text">دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseFreshTelegramUsdIrrQuote(html, "toman", now)).toEqual({
      rate: 2_703_800,
      quotedAt: Date.parse("2026-10-31T11:55:00.000Z"),
    });
  });

  it("rejects future-dated Telegram posts", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T12:01:00.000Z"></time>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseFreshTelegramUsdIrrQuote(html, "toman", now)).toBeNull();
  });

  it("rejects old Telegram posts even when the page was fetched just now", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <time datetime="2026-10-31T10:00:00.000Z"></time>
        <div>دلار تهران: 270,380 فروش</div>
      </div>
    `;
    expect(parseFreshTelegramUsdIrrQuote(html, "toman", now)).toBeNull();
  });

  it("chooses the newest fresh USD quote from multiple message blocks", () => {
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
    expect(parseFreshTelegramUsdIrrQuote(html, "toman", now)).toEqual({
      rate: 2_705_000,
      quotedAt: Date.parse("2026-10-31T11:58:00.000Z"),
    });
  });
});
