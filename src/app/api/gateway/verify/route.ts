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

  const { code, otp } = await req.json();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });
  if (typeof otp !== "string" || !/^\d{4,8}$/.test(otp)) {
    return NextResponse.json({ error: "کد تایید نامعتبر است" }, { status: 400 });
  }

  const log = await db.paymentGatewayLog.findUnique({ where: { code } });
  if (!log) return NextResponse.json({ error: "Payment log not found" }, { status: 404 });
  if (log.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی به این پرداخت مجاز نیست" }, { status: 403 });
  }
  if (log.status === "VERIFIED") {
    return NextResponse.json({ error: "Already verified" }, { status: 400 });
  }

  const payment = await db.payment.create({
    data: {
      code: `PAY-${Date.now()}-${randomInt(100000, 999999)}`,
      invoiceId: null,
      userId: session.userId,
      amount: log.amount,
      currency: log.currency,
      method: "card",
      status: "SUCCEEDED",
    },
  });

  await db.paymentGatewayLog.update({
    where: { id: log.id },
    data: { status: "VERIFIED", verifiedAt: new Date(), paymentId: payment.id },
  });

  return NextResponse.json({
    ok: true,
    mode: "mock",
    paymentId: payment.id,
    amount: log.amount,
    currency: log.currency,
    purpose: log.purpose,
  });
}
