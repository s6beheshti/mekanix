import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST: file a new insurance claim
export async function POST(req: Request) {
  const { policyId, jobId, description, amount } = await req.json();
  if (!policyId || !description?.trim()) {
    return NextResponse.json({ error: "policyId and description required" }, { status: 400 });
  }
  const policy = await db.insurancePolicy.findUnique({ where: { id: policyId } });
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  const code = `CLM-${Math.floor(7000 + Math.random() * 2000)}`;
  const claim = await db.insuranceClaim.create({
    data: {
      code,
      policyId,
      jobId: jobId ?? null,
      description: description.trim(),
      amount: parseFloat(amount) || 0,
      status: "submitted",
    },
  });
  // Update policy status to "claimed"
  await db.insurancePolicy.update({
    where: { id: policyId },
    data: { status: "claimed" },
  });
  // Notify user + admins
  await db.notification.create({
    data: {
      userId: policy.userId,
      type: "insurance_claim",
      title: `Claim ${code} submitted`,
      body: `Your claim for ${claim.amount} is under review.`,
      category: "system",
      link: "customer/insurance",
    },
  });
  return NextResponse.json({ ok: true, claim });
}
