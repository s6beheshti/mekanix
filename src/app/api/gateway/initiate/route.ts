import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: Request) {
  if (process.env.PAYMENT_GATEWAY !== "mock") {
    return NextResponse.json({ error: "درگاه پرداخت واقعی هنوز پیکربندی نشده است" }, { status: 503 });
  }

  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const { amount, purpose, description, mobile } = await req.json();
  if (!amount || !Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "مبلغ پرداخت نامعتبر است" }, { status: 400 });
  }

  const code = `PG-${Date.now()}-${randomInt(100000, 999999)}`;
  const referenceId = `SIM-${Date.now()}-${randomInt(100000, 999999)}`;

  const log = await db.paymentGatewayLog.create({
    data: {
      code,
      userId: session.userId,
      amount,
      currency: "TOMAN",
      gateway: "SHAPARAK_SIM",
      status: "REDIRECTED",
      purpose: purpose || "vip",
      referenceId,
      mobile: mobile ?? null,
      description: description ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: "mock",
    code: log.code,
    referenceId,
    amount: log.amount,
    currency: log.currency,
  });
}
