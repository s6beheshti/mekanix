import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Initiate a payment through the Shaparak-simulator gateway.
// In production: would call Zarinpal/IDPay create-transaction API here.
// Here: we just log the attempt and return a fake reference for verify step.
export async function POST(req: Request) {
  const { userId, amount, purpose, description, mobile, cardNumber } = await req.json();
  if (!userId || !amount) {
    return NextResponse.json({ error: "userId and amount are required" }, { status: 400 });
  }

  const code = `PG-${Math.floor(7000 + Math.random() * 2000)}`;
  const referenceId = `SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const log = await db.paymentGatewayLog.create({
    data: {
      code,
      userId,
      amount,
      currency: "USD",
      gateway: "SHAPARAK_SIM",
      status: "REDIRECTED",
      purpose: purpose || "vip",
      referenceId,
      cardNumber: cardNumber ? maskCard(cardNumber) : null,
      mobile: mobile ?? null,
      description: description ?? null,
    },
  });

  // Return the reference; frontend simulates the OTP step then calls /verify
  return NextResponse.json({ ok: true, code: log.code, referenceId, amount });
}

function maskCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `**** **** **** ${digits.slice(-4)}`;
}
