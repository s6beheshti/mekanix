import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL ?? "file:./test.db" });
let userId = "";

describe.skipIf(process.env.CI !== "true")("pending gateway intent database guards", () => {
  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "Payment intent index test",
        phone: "+98912" + Date.now().toString().slice(-7),
        role: "CUSTOMER",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.paymentGatewayLog.deleteMany({ where: { userId } });
      await db.payment.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  it("adds the nullable hosted payment URL column", async () => {
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      const columns = await db.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'PaymentGatewayLog'
          AND column_name = 'paymentUrl'
      `;
      expect(columns).toHaveLength(1);
      return;
    }

    const columns = await db.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info("PaymentGatewayLog")',
    );
    expect(columns.some((column) => column.name === "paymentUrl")).toBe(true);
  });

  it("allows only one active VIP/prepay intent per user and purpose", async () => {
    const code1 = "PG-" + randomUUID();
    const code2 = "PG-" + randomUUID();
    const common = {
      userId,
      amount: 250000,
      currency: "IRR",
      gateway: "SHAPARAK_SIM" as const,
      purpose: "vip",
      description: "VIP_PLAN:payment-intent-index-test",
    };

    const first = await db.paymentGatewayLog.create({
      data: { ...common, code: code1, status: "INITIATED" },
    });
    await expect(
      db.paymentGatewayLog.create({
        data: { ...common, code: code2, status: "REDIRECTED" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await db.paymentGatewayLog.update({
      where: { id: first.id },
      data: { status: "FAILED" },
    });
    await expect(
      db.paymentGatewayLog.create({
        data: { ...common, code: code2, status: "INITIATED" },
      }),
    ).resolves.toMatchObject({ code: code2 });
  });

  it("allows only one active gateway attempt for an invoice Payment row", async () => {
    const payment = await db.payment.create({
      data: {
        code: "PAY-" + randomUUID(),
        userId,
        amount: 250000,
        currency: "IRR",
        method: "card",
        status: "PENDING",
      },
    });
    const common = {
      userId,
      amount: 250000,
      currency: "IRR",
      gateway: "SHAPARAK_SIM" as const,
      purpose: "invoice",
      description: "Payment intent index invoice fixture",
      paymentId: payment.id,
    };
    const first = await db.paymentGatewayLog.create({
      data: { ...common, code: "PG-" + randomUUID(), status: "INITIATED" },
    });
    await expect(
      db.paymentGatewayLog.create({
        data: { ...common, code: "PG-" + randomUUID(), status: "REDIRECTED" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await db.paymentGatewayLog.update({
      where: { id: first.id },
      data: { status: "CANCELLED" },
    });
    await expect(
      db.paymentGatewayLog.create({
        data: { ...common, code: "PG-" + randomUUID(), status: "INITIATED" },
      }),
    ).resolves.toMatchObject({ paymentId: payment.id });
  });
});
