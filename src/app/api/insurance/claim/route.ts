import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { requirePolicyOwner } from "@/lib/auth";

// POST /api/insurance/claim
// File a new insurance claim against a policy.
// - policyId must be owned by the calling user (BOLA).
// - amount/description validated.
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { policyId, jobId, description, amount } = body;
  if (typeof policyId !== "string" || !policyId) {
    return NextResponse.json({ error: "policyId الزامی است" }, { status: 400 });
  }
  if (typeof description !== "string" || description.trim().length < 5) {
    return NextResponse.json({ error: "توضیحات حداقل ۵ نویسه باشد" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount باید بیشتر از صفر باشد" }, { status: 400 });
  }

  // BOLA: must own the policy (or be admin)
  const access = await requirePolicyOwner(session, policyId);
  if (access) return access;

  const policy = await db.insurancePolicy.findUnique({
    where: { id: policyId },
    select: { id: true, userId: true, status: true },
  });
  if (!policy) return NextResponse.json({ error: "بیمه‌نامه یافت نشد" }, { status: 404 });
  if (policy.status === "expired" || policy.status === "cancelled") {
    return NextResponse.json({ error: "این بیمه‌نامه فعال نیست" }, { status: 400 });
  }

  // If jobId is provided, ensure it's a job the user participates in
  if (jobId) {
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { request: { select: { customerId: true } }, technicianId: true },
    });
    if (job) {
      const customer = await db.customer.findUnique({ where: { userId: session.userId } });
      const technician = await db.technician.findUnique({ where: { userId: session.userId } });
      const isOwner =
        session.role === "ADMIN" ||
        (customer && job.request.customerId === customer.id) ||
        (technician && job.technicianId === technician.id);
      if (!isOwner) {
        return NextResponse.json({ error: "کار متعلق به این کاربر نیست" }, { status: 403 });
      }
    }
  }

  const code = `CLM-${Math.floor(7000 + Math.random() * 2000)}`;
  const claim = await db.insuranceClaim.create({
    data: {
      code,
      policyId,
      jobId: typeof jobId === "string" && jobId ? jobId : null,
      description: description.trim().slice(0, 2000),
      amount,
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
