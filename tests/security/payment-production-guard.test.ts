// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as invoicePaymentPOST } from "@/app/api/payments/route";
import { POST as gatewayInitiatePOST } from "@/app/api/gateway/initiate/route";
import { POST as gatewayVerifyPOST } from "@/app/api/gateway/verify/route";
import { POST as vipSubscribePOST } from "@/app/api/vip/subscribe/route";
import { POST as prepayPOST } from "@/app/api/prepay/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production payment safety gates", () => {
  it("blocks simulated invoice settlement in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await invoicePaymentPOST(new Request("https://mekanix.test/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: "inv_test", method: "card" }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error");
  });

  it("blocks legacy simulated gateway initiation in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await gatewayInitiatePOST(new Request("https://mekanix.test/api/gateway/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user_test", amount: 1000 }),
    }));
    expect(response.status).toBe(503);
  });

  it("rejects sandbox credentials in live production checkout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "idpay");
    vi.stubEnv("IDPAY_API_KEY", "test-key");
    vi.stubEnv("IDPAY_SANDBOX", "true");
    const response = await invoicePaymentPOST(new Request("https://mekanix.test/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: "inv_test" }),
    }));
    expect(response.status).toBe(503);
  });

  it("blocks direct simulated prepay settlement in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await prepayPOST(new Request("https://mekanix.test/api/prepay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_test", cardNumber: "4111111111111111" }),
    }));
    expect(response.status).toBe(503);
  });

  it("rejects unauthenticated direct VIP activation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await vipSubscribePOST(new Request("https://mekanix.test/api/vip/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user_attacker", planId: "vip_plan", paymentId: "fake_payment" }),
    }));
    expect(response.status).toBe(401);
  });

  it("blocks legacy simulated gateway verification in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await gatewayVerifyPOST(new Request("https://mekanix.test/api/gateway/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "fake", otp: "1234" }),
    }));
    expect(response.status).toBe(503);
  });
});
