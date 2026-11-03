import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = {
    paymentGatewayLog: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    vipPlan: {
      findUnique: vi.fn(),
    },
    userVipSubscription: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  };
  return {
    tx,
    db: {
      paymentGatewayLog: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    verifyPayment: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/payment-provider", () => ({ verifyPayment: mocks.verifyPayment }));
vi.mock("@/lib/prepay-settlement", () => ({ settlePrepay: vi.fn() }));

import { GET } from "@/app/api/gateway/callback/route";

const paymentLog = {
  id: "log_sim_1",
  code: "PG-simulator-1",
  userId: "user_customer",
  amount: 250000,
  currency: "IRR",
  gateway: "SHAPARAK_SIM",
  status: "REDIRECTED",
  purpose: "vip",
  description: "VIP_PLAN:plan_1",
  paymentId: "payment_sim_1",
  referenceId: "sim_123",
  paymentUrl: "https://mekanix.test/api/gateway/callback?Authority=sim_123&Status=OK&simulator=true",
  initiatedAt: new Date(),
};

const payment = {
  id: "payment_sim_1",
  userId: "user_customer",
  amount: 250000,
  currency: "IRR",
  status: "PENDING",
  invoiceId: null,
};

describe("gateway callback simulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", "https://mekanix.test");

    mocks.db.paymentGatewayLog.findFirst.mockResolvedValue(paymentLog);
    mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
    mocks.tx.paymentGatewayLog.findUnique.mockResolvedValue(paymentLog);
    mocks.tx.paymentGatewayLog.update.mockResolvedValue({ ...paymentLog, status: "VERIFIED" });
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.payment.findUnique.mockResolvedValue(payment);
    mocks.tx.vipPlan.findUnique.mockResolvedValue({
      id: "plan_1",
      name: "VIP monthly",
      active: true,
      durationDays: 30,
    });
    mocks.tx.userVipSubscription.findFirst.mockResolvedValue(null);
    mocks.tx.userVipSubscription.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.userVipSubscription.create.mockResolvedValue({ id: "subscription_1" });
    mocks.tx.notification.create.mockResolvedValue({ id: "notification_1" });
    mocks.verifyPayment.mockResolvedValue({
      success: true,
      refId: "ref_sim_123",
      amount: 250000,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("finds the SHAPARAK_SIM log and verifies using the server-side expected amount", async () => {
    const req = new NextRequest(
      "https://mekanix.test/api/gateway/callback?Authority=sim_123&Status=OK&simulator=true",
    );
    const response = await GET(req);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/payment/result?payment=success");
    expect(mocks.db.paymentGatewayLog.findFirst).toHaveBeenCalledWith({
      where: { referenceId: "sim_123", gateway: "SHAPARAK_SIM" },
    });
    expect(mocks.verifyPayment).toHaveBeenCalledWith("sim_123", 250000, "PG-simulator-1");
    expect(mocks.tx.userVipSubscription.create).toHaveBeenCalledTimes(1);
  });

  it("rejects simulator callbacks in production before database lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest(
      "https://mekanix.test/api/gateway/callback?Authority=sim_123&Status=OK&simulator=true",
    );
    const response = await GET(req);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/payment/result?payment=failed");
    expect(mocks.db.paymentGatewayLog.findFirst).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
  });
});
