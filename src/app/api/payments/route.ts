import { NextResponse } from "next/server";
import { initiatePayment } from "@/lib/payment-initiation";

// Invoice payments always go through the configured gateway.
// The invoice owner and amount are resolved server-side.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.invoiceId !== "string" || !body.invoiceId.trim()) {
    return NextResponse.json({ error: "invoiceId الزامی است" }, { status: 400 });
  }
  return initiatePayment(req, {
    purpose: "invoice",
    invoiceId: body.invoiceId,
    expectedAmountIrr: typeof body.expectedAmountIrr === "number" ? body.expectedAmountIrr : undefined,
  });
}
