import { describe, expect, it } from "vitest";
import {
  gatewayTypeForProvider,
  isTrustedGatewayRedirect,
  isUniqueConstraintError,
} from "@/lib/payment-intents";

describe("payment intent safety helpers", () => {
  it("maps every configured provider to the correct persisted gateway type", () => {
    expect(gatewayTypeForProvider("zarinpal")).toBe("ZARINPAL");
    expect(gatewayTypeForProvider("idpay")).toBe("IDPAY");
    expect(gatewayTypeForProvider("simulator")).toBe("SHAPARAK_SIM");
  });

  it("accepts only the configured HTTPS Zarinpal and IDPay redirect hosts", () => {
    expect(isTrustedGatewayRedirect("ZARINPAL", "https://www.zarinpal.com/pg/StartPay/abc", "https://mekanix.ir", true)).toBe(true);
    expect(isTrustedGatewayRedirect("ZARINPAL", "https://sandbox.zarinpal.com/pg/StartPay/abc", "https://mekanix.ir", true)).toBe(true);
    expect(isTrustedGatewayRedirect("IDPAY", "https://idpay.ir/p/ws-abc", "https://mekanix.ir", true)).toBe(true);
    expect(isTrustedGatewayRedirect("IDPAY", "https://www.idpay.ir/p/ws-abc", "https://mekanix.ir", true)).toBe(true);
  });

  it("rejects lookalike hosts, HTTP, credentials, fragments, and unexpected ports", () => {
    expect(isTrustedGatewayRedirect("ZARINPAL", "https://www.zarinpal.com.attacker.invalid/pay", "https://mekanix.ir", true)).toBe(false);
    expect(isTrustedGatewayRedirect("IDPAY", "http://idpay.ir/p/ws-abc", "https://mekanix.ir", true)).toBe(false);
    expect(isTrustedGatewayRedirect("IDPAY", "https://user:pass@idpay.ir/p/ws-abc", "https://mekanix.ir", true)).toBe(false);
    expect(isTrustedGatewayRedirect("IDPAY", "https://idpay.ir:8443/p/ws-abc", "https://mekanix.ir", true)).toBe(false);
    expect(isTrustedGatewayRedirect("IDPAY", "https://idpay.ir/p/ws-abc#fragment", "https://mekanix.ir", true)).toBe(false);
  });

  it("allows simulator redirects only to this app's callback in non-production", () => {
    expect(isTrustedGatewayRedirect("SHAPARAK_SIM", "https://mekanix.test/api/gateway/callback?simulator=true", "https://mekanix.test", false)).toBe(true);
    expect(isTrustedGatewayRedirect("SHAPARAK_SIM", "https://attacker.invalid/api/gateway/callback?simulator=true", "https://mekanix.test", false)).toBe(false);
    expect(isTrustedGatewayRedirect("SHAPARAK_SIM", "https://mekanix.test/api/gateway/callback?simulator=true", "https://mekanix.test", true)).toBe(false);
  });

  it("identifies Prisma unique constraint errors without treating other failures as duplicates", () => {
    expect(isUniqueConstraintError({ code: "P2002" })).toBe(true);
    expect(isUniqueConstraintError({ code: "P2025" })).toBe(false);
    expect(isUniqueConstraintError(new Error("database unavailable"))).toBe(false);
  });
});
