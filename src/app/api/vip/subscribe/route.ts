import { NextResponse } from "next/server";
import { initiatePayment } from "@/lib/payment-initiation";

// VIP subscriptions are activated only by the verified gateway callback.
// Client-supplied userId and paymentId are intentionally ignored.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.planId !== "string" || !body.planId.trim()) {
    return NextResponse.json({ error: "planId الزامی است" }, { status: 400 });
  }
  return initiatePayment(req, {
    purpose: "vip",
    planId: body.planId,
    expectedAmountIrr: typeof body.expectedAmountIrr === "number" ? body.expectedAmountIrr : undefined,
  });
}
