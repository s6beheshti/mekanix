import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("real payment provider contracts", () => {
  it("creates and verifies IDPay transactions against the same order and amount", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_PROVIDER", "idpay");
    vi.stubEnv("IDPAY_API_KEY", "test-idpay-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "idpay-transaction-123",
        link: "https://idpay.ir/p/ws-sandbox/idpay-transaction-123",
      }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 100,
        track_id: 987654,
        id: "idpay-transaction-123",
        order_id: "PG-test-order",
        amount: "250000",
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = await import("@/lib/payment-provider");
    const created = await gateway.createPayment({
      amount: 250000,
      description: "MEKANIX invoice",
      callbackUrl: "https://mekanix.ir/api/gateway/callback",
      orderId: "PG-test-order",
    });
    expect(created.success).toBe(true);
    expect(created.authority).toBe("idpay-transaction-123");

    const verified = await gateway.verifyPayment("idpay-transaction-123", 250000, "PG-test-order");
    expect(verified).toEqual({ success: true, refId: "987654", amount: 250000 });

    const createCall = fetchMock.mock.calls[0];
    expect(createCall[0]).toBe("https://api.idpay.ir/v1.1/payment");
    expect(JSON.parse(String(createCall[1]?.body))).toMatchObject({
      order_id: "PG-test-order",
      amount: 250000,
      callback: "https://mekanix.ir/api/gateway/callback",
    });
    const verifyCall = fetchMock.mock.calls[1];
    expect(verifyCall[0]).toBe("https://api.idpay.ir/v1.1/payment/verify");
    expect(JSON.parse(String(verifyCall[1]?.body))).toEqual({
      id: "idpay-transaction-123",
      order_id: "PG-test-order",
    });
  });

  it("simulator verification returns the server-provided expected amount", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_PROVIDER", "simulator");

    const gateway = await import("@/lib/payment-provider");
    const created = await gateway.createPayment({
      amount: 250000,
      description: "MEKANIX VIP",
      callbackUrl: "https://mekanix.test/api/gateway/callback",
      orderId: "PG-simulator-order",
    });
    expect(created.success).toBe(true);
    expect(created.paymentUrl).toContain("simulator=true");

    const verified = await gateway.verifyPayment(created.authority!, 250000, "PG-simulator-order");
    expect(verified).toEqual({
      success: true,
      refId: `ref_${created.authority}`,
      amount: 250000,
    });
  });

  it("uses the Zarinpal sandbox host and requires a successful request code", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_PROVIDER", "zarinpal");
    vi.stubEnv("ZARINPAL_MERCHANT_ID", "test-merchant-id");
    vi.stubEnv("ZARINPAL_SANDBOX", "true");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { code: 100, authority: "A000000000000000000000000000000123" },
        errors: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { code: 100, ref_id: 123456789 },
        errors: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = await import("@/lib/payment-provider");
    const created = await gateway.createPayment({
      amount: 250000,
      description: "MEKANIX invoice",
      callbackUrl: "https://mekanix.ir/api/gateway/callback",
      orderId: "PG-zarinpal-order",
    });
    expect(created.success).toBe(true);
    expect(created.paymentUrl).toContain("https://sandbox.zarinpal.com/pg/StartPay/");
    const verified = await gateway.verifyPayment(created.authority!, 250000, "PG-zarinpal-order");
    expect(verified.success).toBe(true);
    expect(verified.refId).toBe("123456789");
    expect(fetchMock.mock.calls[0][0]).toBe("https://sandbox.zarinpal.com/pg/v4/payment/request.json");
    expect(fetchMock.mock.calls[1][0]).toBe("https://sandbox.zarinpal.com/pg/v4/payment/verify.json");
  });
});
