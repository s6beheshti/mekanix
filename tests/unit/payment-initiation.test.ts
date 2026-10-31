import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimitAsync: vi.fn(),
  getClientId: vi.fn(),
  getPaymentProviderStatus: vi.fn(),
  createPayment: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    vipPlan: { findFirst: vi.fn() },
    userVipSubscription: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    paymentGatewayLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    invoice: { findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitAsync: mocks.rateLimitAsync,
  getClientId: mocks.getClientId,
}));
vi.mock("@/lib/payment-provider", () => ({
  getPaymentProviderStatus: mocks.getPaymentProviderStatus,
  createPayment: mocks.createPayment,
}));

describe("payment initiation server-side authority", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("APP_URL", "");
    mocks.requireAuth.mockResolvedValue({ userId: "customer-1", role: "CUSTOMER" });
    mocks.rateLimitAsync.mockResolvedValue({ success: true, resetMs: 60_000 });
    mocks.getClientId.mockReturnValue("127.0.0.1");
    mocks.getPaymentProviderStatus.mockReturnValue({ configured: true, provider: "simulator" });
    mocks.db.user.findUnique.mockResolvedValue({ id: "customer-1", phone: "09120000000" });
    mocks.db.vipPlan.findFirst.mockResolvedValue({
      id: "plan-1",
      active: true,
      priceIrr: 125_000,
      durationDays: 365,
      name: "سالانه",
    });
    mocks.db.userVipSubscription.findFirst.mockResolvedValue(null);
    mocks.db.userVipSubscription.create.mockResolvedValue({ id: "subscription-1" });
    mocks.db.userVipSubscription.update.mockResolvedValue({});
    mocks.db.payment.findUnique.mockResolvedValue(null);
    mocks.db.payment.create.mockResolvedValue({ id: "payment-1" });
    mocks.db.payment.update.mockResolvedValue({});
    mocks.db.paymentGatewayLog.findFirst.mockResolvedValue(null);
    mocks.db.paymentGatewayLog.create.mockResolvedValue({ id: "gateway-log-1" });
    mocks.db.paymentGatewayLog.update.mockResolvedValue({});
    mocks.createPayment.mockImplementation(async (input: { orderId: string }) => ({
      success: true,
      authority: `sim_${input.orderId}`,
      paymentUrl: `http://localhost:3000/api/gateway/callback?Authority=sim_${input.orderId}&Status=OK&simulator=true`,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function postPayment(body: Record<string, unknown>) {
    const { initiatePayment } = await import("@/lib/payment-initiation");
    const request = new Request("http://localhost:3000/api/gateway/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return initiatePayment(request);
  }

  it("uses the stored VIP plan price and authenticated customer, not client values", async () => {
    const response = await postPayment({
      purpose: "vip",
      planId: "plan-1",
      amount: 1,
      userId: "another-customer",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.amount).toBe(125_000);
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "customer-1",
        amount: 125_000,
        status: "PENDING",
        method: "gateway_pending",
      }),
    });
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: 125_000,
      orderId: body.code,
      mobile: "09120000000",
    }));
    expect(mocks.db.paymentGatewayLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "customer-1",
        purpose: "vip",
        status: "INITIATED",
        amount: 125_000,
        paymentId: "payment-1",
      }),
    });
  });

  it("refuses production payment initiation when APP_URL is private", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("APP_URL", "https://localhost:3000");

    const response = await postPayment({ purpose: "vip", planId: "plan-1" });

    expect(response.status).toBe(503);
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.db.userVipSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "CANCELLED" },
    });
  });

  it("accepts a production redirect only from the configured gateway host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("APP_URL", "https://mekanix.ir");
    mocks.getPaymentProviderStatus.mockReturnValue({ configured: true, provider: "idpay" });
    mocks.createPayment.mockResolvedValue({
      success: true,
      authority: "idpay-authority",
      paymentUrl: "https://idpay.ir/p/secure-payment",
    });

    const response = await postPayment({ purpose: "vip", planId: "plan-1" });

    expect(response.status).toBe(200);
  });

  it("rejects a production redirect to an untrusted host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("APP_URL", "https://mekanix.ir");
    mocks.getPaymentProviderStatus.mockReturnValue({ configured: true, provider: "idpay" });
    mocks.createPayment.mockResolvedValue({
      success: true,
      authority: "idpay-authority",
      paymentUrl: "https://evil.example/collect",
    });

    const response = await postPayment({ purpose: "vip", planId: "plan-1" });

    expect(response.status).toBe(502);
    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "FAILED" },
    });
    expect(mocks.db.userVipSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "CANCELLED" },
    });
  });

  it("blocks a second pending VIP subscription before reserving another payment", async () => {
    mocks.db.userVipSubscription.findFirst.mockResolvedValue({ id: "pending-subscription" });

    const response = await postPayment({ purpose: "vip", planId: "plan-1" });

    expect(response.status).toBe(409);
    expect(mocks.db.userVipSubscription.create).not.toHaveBeenCalled();
    expect(mocks.db.payment.create).not.toHaveBeenCalled();
  });

  it("returns HTTP 409 when the database unique guard catches a concurrent pending intent", async () => {
    mocks.db.paymentGatewayLog.create.mockRejectedValue({ code: "P2002" });

    const response = await postPayment({ purpose: "vip", planId: "plan-1" });

    expect(response.status).toBe(409);
    expect(mocks.db.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "FAILED" },
    });
    expect(mocks.db.userVipSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { status: "CANCELLED" },
    });
  });

  it("calculates heavy-equipment prepayment from technician fees", async () => {
    mocks.db.job.findUnique.mockResolvedValue({
      id: "job-1",
      code: "JOB-1",
      prepayPaid: false,
      request: {
        customer: { userId: "customer-1" },
        vehicle: { type: "EXCAVATOR" },
      },
      technician: {
        inspectionFeeHeavy: 25_000,
        inspectionFee: 7_000,
        travelFeeBase: 5_000,
      },
    });

    const response = await postPayment({
      purpose: "prepay",
      jobId: "job-1",
      amount: 1,
      inspectionFee: 1,
      travelFee: 0,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.amount).toBe(30_000);
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 30_000 }));
    expect(mocks.db.paymentGatewayLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "prepay",
        amount: 30_000,
        description: expect.stringContaining('"jobId":"job-1"'),
      }),
    });
  });

  it("uses the persisted invoice total and rejects client-supplied amounts", async () => {
    mocks.db.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      code: "INV-1",
      status: "SENT",
      total: 150_000,
      job: { request: { customer: { userId: "customer-1" } } },
    });

    const response = await postPayment({
      purpose: "invoice",
      invoiceId: "invoice-1",
      amount: 1,
      userId: "another-customer",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.amount).toBe(150_000);
    expect(mocks.db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: "invoice-1",
        userId: "customer-1",
        amount: 150_000,
      }),
    });
  });
});
