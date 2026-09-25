import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Verify a payment (simulate Shaparak OTP verify).
// In production: would call Zarinpal/IDPay verify API with the authority.
// Here: any non-empty OTP succeeds; we mark the log as VERIFIED and create a Payment.
export async function POST(req: Request) {
  const { code, otp, purpose, userId } = await req.json();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });
  if (!otp || otp.length < 4) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  const log = await db.paymentGatewayLog.findUnique({ where: { code } });
  if (!log) return NextResponse.json({ error: "Payment log not found" }, { status: 404 });
  if (log.status === "VERIFIED") return NextResponse.json({ error: "Already verified" }, { status: 400 });

  // Resolve userId: prefer explicit from client, else log.userId, else error
  const payerUserId = userId ?? log.userId;
  if (!payerUserId) {
    return NextResponse.json({ error: "userId required for payment record" }, { status: 400 });
  }

  // Simulate success (any 4+ digit OTP succeeds in demo mode)
  const verified = await db.paymentGatewayLog.update({
    where: { id: log.id },
    data: { status: "VERIFIED", verifiedAt: new Date() },
  });

  // Create a Payment record linked to the user
  const payment = await db.payment.create({
    data: {
      code: `PAY-${Math.floor(8000 + Math.random() * 1000)}`,
      invoiceId: null, // gateway payments are standalone (not tied to invoice)
      userId: payerUserId,
      amount: log.amount,
      currency: "IRR",
      method: "card",
      status: "SUCCEEDED",
    },
  });

  // Link the gateway log to the payment
  await db.paymentGatewayLog.update({
    where: { id: log.id },
    data: { paymentId: payment.id },
  });

  return NextResponse.json({ ok: true, paymentId: payment.id, amount: log.amount, purpose: log.purpose });
}
