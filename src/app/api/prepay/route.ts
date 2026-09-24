import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Pre-service payment: customer pays inspection fee + travel fee.
// This activates chat/call with the mechanic.
// - 10% platform commission deducted immediately
// - Net amount credited to technician's wallet as PENDING (12h hold from job completion)
// - Job.prepayPaid = true, prepayPaidAt = now
// - Inspection fee differs for passenger vs heavy machinery
const COMMISSION_RATE = 0.10; // 10% platform cut
const HOLD_HOURS = 12; // 12-hour hold from job completion

function isHeavyMachine(type: string): boolean {
  return type !== "CAR";
}

export async function POST(req: Request) {
  const { jobId, method, cardNumber, mobile } = await req.json();
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      request: { include: { vehicle: true, customer: { include: { user: true } } } },
      technician: { include: { wallet: true, user: true } },
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.prepayPaid) return NextResponse.json({ error: "Pre-service payment already paid", alreadyPaid: true }, { status: 400 });

  const tech = job.technician;
  if (!tech) return NextResponse.json({ error: "No technician assigned" }, { status: 400 });

  // Determine fee based on machine type (passenger CAR vs heavy)
  const machineType = job.request.vehicle.type;
  const heavy = isHeavyMachine(machineType);
  const inspectionFee = heavy ? tech.inspectionFeeHeavy : tech.inspectionFee;
  const travelFee = tech.travelFeeBase;
  const gross = inspectionFee + travelFee;
  const commission = gross * COMMISSION_RATE;
  const net = gross - commission;

  // Simulate gateway success (in production: call Zarinpal/IDPay verify here)
  // For demo: any non-empty cardNumber succeeds.
  if (!cardNumber && method === "card") {
    return NextResponse.json({ error: "Card number required" }, { status: 400 });
  }

  // 1. Update job: mark prepay paid
  const updatedJob = await db.job.update({
    where: { id: jobId },
    data: {
      prepayPaid: true,
      prepayPaidAt: new Date(),
      inspectionFee,
      travelFee,
      platformCommission: commission,
      netEarnings: net,
      // hold until 12h after job completion (null for now — set when COMPLETED)
      holdUntil: null,
    },
    include: {
      request: { include: { vehicle: true, customer: { include: { user: true } } } },
      technician: { include: { user: true, specialties: true } },
      parts: true,
      diagnosisRecords: true,
      invoice: true,
      reviews: true,
      messages: { include: { fromUser: true }, orderBy: { createdAt: "asc" } },
      tracking: { orderBy: { ts: "asc" } },
    },
  });

  // 2. Create / fetch wallet, record transaction
  let wallet = tech.wallet;
  if (!wallet) {
    wallet = await db.wallet.create({ data: { technicianId: tech.id } });
  }

  // Hold-until is null until job is COMPLETED, then 12h countdown starts.
  // We record the txn with status PENDING; when job completes, the status route
  // sets holdUntil = now + 12h, and a scheduled job flips status → AVAILABLE.
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      jobId: job.id,
      kind: "PREPAY",
      status: "PENDING",
      grossAmount: gross,
      commissionAmount: commission,
      netAmount: net,
      holdUntil: null, // set when job completes
      description: `Pre-service payment — ${job.code} (${heavy ? "heavy" : "passenger"})`,
    },
  });

  // 3. Separate commission txn (for audit clarity)
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      jobId: job.id,
      kind: "COMMISSION",
      status: "COMPLETED",
      grossAmount: 0,
      commissionAmount: commission,
      netAmount: -commission,
      description: `Platform commission (10%) — ${job.code}`,
    },
  });

  // 4. Update wallet aggregates (pendingBalance increases; totalEarned/totalCommission tracked)
  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      pendingBalance: { increment: net },
      totalEarned: { increment: gross },
      totalCommission: { increment: commission },
    },
  });

  // 5. Notify customer + mechanic, system message
  await db.notification.create({
    data: {
      userId: job.request.customer.user.id,
      type: "payment_required",
      title: "Pre-service payment received",
      body: `Chat & call with ${tech.user.name} is now active for ${job.code}`,
      category: "payment",
      link: "customer/track",
    },
  });
  await db.notification.create({
    data: {
      userId: tech.userId,
      type: "payment_required",
      title: "Pre-service payment received",
      body: `${job.code} — customer paid inspection + travel fee. You can start moving now.`,
      category: "payment",
      link: "technician/requests",
    },
  });
  await db.message.create({
    data: {
      jobId: job.id,
      fromUserId: job.request.customer.user.id,
      kind: "system",
      body: "Pre-service payment received — chat unlocked.",
    },
  });

  return NextResponse.json({ ok: true, job: updatedJob, amount: gross, commission, net });
}
