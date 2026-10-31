import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyPayment: vi.fn(),
  db: {
    paymentGatewayLog: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    paymentGatewayLog: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    job: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    warranty: { upsert: vi.fn() },
    notification: { create: vi.fn() },
    userVipSubscription: { updateMany: vi.fn() },
    wallet: { upsert: vi.fn(), update: vi.fn() },
    walletTransaction: { create: vi.fn() },
    message: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/payment-provider", () => ({ verifyPayment: mocks.verifyPayment }));

describe("verified payment fulfillment", () => {
  const invoiceLog = {
    id: "gateway-log-1",
    code: "PG-invoice-1",
    status: "REDIRECTED",
    paymentId: "payment-1",
    userId: "customer-1",
    amount: 120_000_000,
    gateway: "ZARINPAL",
    referenceId: "bank-authority-1",
    description: JSON.stringify({
      kind: "invoice",
      invoiceId: "invoice-1",
      amountUsd: 10,
      exchangeRate: 12_000_000,
      exchangeRateSource: "telegram",
      exchangeRateUpdatedAt: Date.now(),
    }),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.db.paymentGatewayLog.findUnique.mockResolvedValue(invoiceLog);
    mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
    mocks.tx.paymentGatewayLog.findUnique.mockResolvedValue(invoiceLog);
    mocks.tx.paymentGatewayLog.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.paymentGatewayLog.update.mockResolvedValue({});
    mocks.tx.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      userId: "customer-1",
      amount: 10,
      invoiceId: "invoice-1",
    });
    mocks.tx.payment.update.mockResolvedValue({ id: "payment-1" });
    mocks.tx.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      code: "INV-1",
      status: "SENT",
      total: 10,
      jobId: "job-1",
      job: { technician: null },
    });
    mocks.tx.invoice.update.mockResolvedValue({});
    mocks.tx.job.update.mockResolvedValue({});
    mocks.tx.warranty.upsert.mockResolvedValue({});
    mocks.tx.notification.create.mockResolvedValue({});
    mocks.tx.userVipSubscription.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.job.findUnique.mockResolvedValue(null);
    mocks.tx.job.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.wallet.upsert.mockResolvedValue({ id: "wallet-1" });
    mocks.tx.wallet.update.mockResolvedValue({});
    mocks.tx.walletTransaction.create.mockResolvedValue({});
    mocks.tx.message.create.mockResolvedValue({});
    mocks.verifyPayment.mockResolvedValue({ success: true, refId: "bank-ref-1", amount: 120_000_000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies with the provider before marking an invoice paid and granting warranty", async () => {
    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");

    const result = await verifyAndFulfillGatewayCallback(
      "PG-invoice-1",
      "bank-authority-1",
      "OK",
      { Status: "OK" },
    );

    expect(mocks.verifyPayment).toHaveBeenCalledWith("bank-authority-1", 120_000_000, "PG-invoice-1");
    expect(result).toEqual({ paymentId: "payment-1", alreadyProcessed: false });
    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: expect.objectContaining({ status: "SUCCEEDED", amount: 10, currency: "IRR" }),
    });
    expect(mocks.tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "invoice-1" },
      data: { status: "PAID" },
    });
    expect(mocks.tx.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(mocks.tx.warranty.upsert).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
      create: { jobId: "job-1", months: 6, active: true },
      update: { months: 6, active: true },
    });
  });

  it("rejects a mismatched callback authority before contacting the provider", async () => {
    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");

    await expect(
      verifyAndFulfillGatewayCallback("PG-invoice-1", "wrong-authority", "OK", {}),
    ).rejects.toThrow("Gateway reference does not match");
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a provider-verified amount that differs from the reserved order", async () => {
    mocks.verifyPayment.mockResolvedValue({ success: true, refId: "bank-ref-1", amount: 119_999_999 });
    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");

    await expect(
      verifyAndFulfillGatewayCallback("PG-invoice-1", "bank-authority-1", "OK", {}),
    ).rejects.toThrow("Verified amount does not match");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("activates VIP using the USD base price and the reserved IRR amount", async () => {
    const vipLog = {
      ...invoiceLog,
      code: "PG-vip-1",
      amount: 228_000_000,
      referenceId: "vip-authority",
      description: JSON.stringify({
        kind: "vip",
        subscriptionId: "subscription-1",
        planId: "gold",
        durationDays: 30,
        planName: "Gold",
        amountUsd: 19,
        exchangeRate: 12_000_000,
        exchangeRateSource: "telegram",
        exchangeRateUpdatedAt: Date.now(),
      }),
    };
    mocks.db.paymentGatewayLog.findUnique.mockResolvedValue(vipLog);
    mocks.tx.paymentGatewayLog.findUnique.mockResolvedValue(vipLog);
    mocks.tx.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      userId: "customer-1",
      amount: 19,
      invoiceId: null,
    });
    mocks.verifyPayment.mockResolvedValue({ success: true, refId: "vip-bank-ref", amount: 228_000_000 });

    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");
    await verifyAndFulfillGatewayCallback("PG-vip-1", "vip-authority", "OK", { Status: "OK" });

    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: expect.objectContaining({ status: "SUCCEEDED", amount: 19, currency: "IRR" }),
    });
    expect(mocks.tx.userVipSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "subscription-1", status: "PENDING_PAYMENT" }),
      data: expect.objectContaining({ status: "ACTIVE", paymentId: "payment-1" }),
    }));
  });

  it("credits prepayment wallet transactions in USD base after verifying the IRR charge", async () => {
    const prepayLog = {
      ...invoiceLog,
      code: "PG-prepay-1",
      amount: 360_000_000,
      referenceId: "prepay-authority",
      description: JSON.stringify({
        kind: "prepay",
        jobId: "job-1",
        inspectionFee: 25,
        travelFee: 5,
        heavy: true,
        amountUsd: 30,
        exchangeRate: 12_000_000,
        exchangeRateSource: "telegram",
        exchangeRateUpdatedAt: Date.now(),
      }),
    };
    mocks.db.paymentGatewayLog.findUnique.mockResolvedValue(prepayLog);
    mocks.tx.paymentGatewayLog.findUnique.mockResolvedValue(prepayLog);
    mocks.tx.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      status: "PENDING",
      userId: "customer-1",
      amount: 30,
      invoiceId: null,
    });
    mocks.tx.job.findUnique.mockResolvedValue({
      id: "job-1",
      code: "JOB-1",
      prepayPaid: false,
      request: { customer: { userId: "customer-1" }, vehicle: { type: "EXCAVATOR" } },
      technician: {
        id: "technician-1",
        userId: "technician-user-1",
        user: { name: "Technician" },
        wallet: { id: "wallet-1" },
      },
    });
    mocks.verifyPayment.mockResolvedValue({ success: true, refId: "prepay-bank-ref", amount: 360_000_000 });

    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");
    await verifyAndFulfillGatewayCallback("PG-prepay-1", "prepay-authority", "OK", { Status: "OK" });

    expect(mocks.tx.payment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: expect.objectContaining({ status: "SUCCEEDED", amount: 30, currency: "IRR" }),
    });
    expect(mocks.tx.job.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", prepayPaid: false },
      data: expect.objectContaining({ inspectionFee: 25, travelFee: 5, platformCommission: 3, netEarnings: 27 }),
    }));
    expect(mocks.tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ grossAmount: 30, commissionAmount: 3, netAmount: 27 }),
    }));
    expect(mocks.tx.wallet.update).toHaveBeenCalledWith({
      where: { id: "wallet-1" },
      data: {
        pendingBalance: { increment: 27 },
        totalEarned: { increment: 30 },
        totalCommission: { increment: 3 },
      },
    });
  });

  it("returns an idempotent success for a callback already fulfilled", async () => {
    mocks.db.paymentGatewayLog.findUnique.mockResolvedValue({
      ...invoiceLog,
      status: "VERIFIED",
    });
    const { verifyAndFulfillGatewayCallback } = await import("@/lib/payment-fulfillment");

    await expect(
      verifyAndFulfillGatewayCallback("PG-invoice-1", "any-authority", "OK", {}),
    ).resolves.toEqual({ paymentId: "payment-1", alreadyProcessed: true });
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
