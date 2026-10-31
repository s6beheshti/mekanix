import { NextResponse } from "next/server";
import { initiatePayment } from "@/lib/payment-initiation";

// Pre-service fees are calculated from the assigned technician's server-side
// rates. No card data or client-supplied amount is accepted by this endpoint.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.jobId !== "string" || !body.jobId.trim()) {
    return NextResponse.json({ error: "jobId الزامی است" }, { status: 400 });
  }
  return initiatePayment(req, {
    purpose: "prepay",
    jobId: body.jobId,
    expectedAmountIrr: typeof body.expectedAmountIrr === "number" ? body.expectedAmountIrr : undefined,
  });
}
