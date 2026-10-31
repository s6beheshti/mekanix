import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

describe("payment provider production safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_PROVIDER", "simulator");
    vi.stubEnv("ZARINPAL_MERCHANT_ID", "");
    vi.stubEnv("IDPAY_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("never enables the simulator in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const provider = await import("@/lib/payment-provider");

    expect(provider.getPaymentProviderStatus()).toEqual({
      configured: false,
      provider: "simulator",
    });
    await expect(provider.createPayment({
      amount: 1000,
      description: "test",
      callbackUrl: "https://mekanix.ir/api/gateway/callback",
      orderId: "PG-test",
    })).resolves.toMatchObject({ success: false });
  });

  it("fails closed for an unknown or unimplemented provider", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "nextpay");
    vi.stubEnv("NEXTPAY_API_KEY", "configured-but-not-implemented");
    const provider = await import("@/lib/payment-provider");

    expect(provider.getPaymentProviderStatus()).toEqual({
      configured: false,
      provider: "nextpay",
    });
  });

  it("uses the same IDPay order id for create and verify", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "idpay");
    vi.stubEnv("IDPAY_API_KEY", "test-api-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "gateway-id", link: "https://pay.example/1" }))
      .mockResolvedValueOnce(jsonResponse({ status: 100, track_id: 98765, amount: 12000 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = await import("@/lib/payment-provider");
    const created = await provider.createPayment({
      amount: 12000,
      description: "VIP plan",
      callbackUrl: "https://mekanix.ir/api/gateway/callback?code=PG-order-1",
      mobile: "09120000000",
      orderId: "PG-order-1",
    });

    expect(created).toMatchObject({
      success: true,
      authority: "gateway-id",
      orderId: "PG-order-1",
      paymentUrl: "https://pay.example/1",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).order_id).toBe("PG-order-1");

    const verified = await provider.verifyPayment("gateway-id", 12000, "PG-order-1");
    expect(verified).toMatchObject({ success: true, refId: "98765", amount: 12000 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      id: "gateway-id",
      order_id: "PG-order-1",
    });
  });

  it("rejects an IDPay verification response with a mismatched amount", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "idpay");
    vi.stubEnv("IDPAY_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      jsonResponse({ status: 100, track_id: 98765, amount: 9999 })
    ));

    const provider = await import("@/lib/payment-provider");
    await expect(provider.verifyPayment("gateway-id", 12000, "PG-order-1"))
      .resolves.toMatchObject({ success: false });
  });
});
