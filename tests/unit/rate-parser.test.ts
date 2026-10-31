import { describe, expect, it } from "vitest";
import { parseTelegramUsdIrrRate } from "@/lib/rate-parser";

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

  it("parses ASCII USD quotes as Rial when no unit is provided", () => {
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
    expect(parseTelegramUsdIrrRate("دلار تهران: 270,380", "rial")).toBe(270_380);
  });

  it("supports Arabic-Indic digits", () => {
    expect(parseTelegramUsdIrrRate("دلار ١٢,٠٠٠,٠٠٠ ریال")).toBe(12_000_000);
  });

  it("rejects implausible or missing rates", () => {
    expect(parseTelegramUsdIrrRate("دلار ۶,۰۰۰ تومان")).toBeNull();
    expect(parseTelegramUsdIrrRate("No exchange quote available")).toBeNull();
  });
});
