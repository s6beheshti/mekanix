import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const include = {
  request: { include: { customer: { include: { user: true } }, vehicle: true } },
  technician: { include: { user: true, specialties: true } },
  parts: true,
  diagnosisRecords: true,
  invoice: true,
  reviews: true,
  messages: { include: { fromUser: true }, orderBy: { createdAt: "asc" } },
  tracking: { orderBy: { ts: "asc" } },
} as const;

// 12-hour hold from job completion before funds become withdrawable
const HOLD_HOURS = 12;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { status, ...extra } = body;

  const data: any = { status };
  if (status === "ACCEPTED") {
    data.startedAt = new Date();
    data.request = { update: { status: "ASSIGNED" } };
  }
  if (status === "ARRIVED") data.arrivedAt = new Date();
  if (status === "COMPLETED") data.completedAt = new Date();
  if (status === "CANCELLED") data.request = { update: { status: "CANCELLED" } };
  // REJECTED: technician declined the request — set request back to OPEN so it
  // re-enters the matching pool, and remove the technician assignment so the
  // request can be matched with another technician.
  if (status === "REJECTED") {
    data.request = { update: { status: "OPEN", matchedTechId: null } };
  }

  if (extra.technicianNotes != null) data.technicianNotes = extra.technicianNotes;
  if (extra.customerApproved != null) data.customerApproved = extra.customerApproved;

  const job = await db.job.update({ where: { id }, data, include });

  // When job is COMPLETED, start the 12-hour hold countdown on all PENDING
  // prepay transactions for this job. Funds become AVAILABLE after holdUntil.
  if (status === "COMPLETED") {
    const holdUntil = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000);
    await db.walletTransaction.updateMany({
      where: { jobId: job.id, status: "PENDING" },
      data: { holdUntil },
    });
  }

  // Side-effects: notifications + system messages
  const cust = job.request.customer.user;
  const tech = job.technician.user;
  const notifMap: Record<string, { type: string; title: string; body: string; category: string; link: string }> = {
    ACCEPTED: {
      type: "request_accepted",
      title: "Technician accepted your request",
      body: `${tech.name} is preparing to depart — ETA ${job.etaMins} min`,
      category: "job",
      link: "customer/track",
    },
    EN_ROUTE: {
      type: "technician_arriving",
      title: "Technician en route",
      body: `${tech.name} is on the way to your location`,
      category: "job",
      link: "customer/track",
    },
    ARRIVED: {
      type: "technician_arriving",
      title: "Technician arrived",
      body: `${tech.name} has arrived and will begin diagnosis`,
      category: "job",
      link: "customer/track",
    },
    DIAGNOSING: {
      type: "technician_arriving",
      title: "Diagnosis started",
      body: `${tech.name} is inspecting your machine`,
      category: "job",
      link: "customer/track",
    },
    WAITING_APPROVAL: {
      type: "estimate_ready",
      title: "Estimate ready for approval",
      body: `Review and approve your repair estimate for ${job.code}`,
      category: "job",
      link: "customer/invoice",
    },
    COMPLETED: {
      type: "job_completed",
      title: "Job completed",
      body: `${job.code} is complete. Please review & pay.`,
      category: "job",
      link: "customer/completion",
    },
    REJECTED: {
      type: "request_rejected",
      title: `Mechanic declined your request`,
      body: `${tech.name} could not accept ${job.code}. We're finding another mechanic for you.`,
      category: "job",
      link: "customer/home",
    },
  };
  const notif = notifMap[status];
  if (notif) {
    // For REJECTED, use a special "alert" category to trigger the special
    // customer-facing alert UI (different from regular notifications).
    const notifCategory = status === "REJECTED" ? "alert" : notif.category;
    await db.notification.create({
      data: {
        userId: cust.id,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        category: notifCategory,
        link: notif.link,
      },
    });
    await db.message.create({
      data: {
        jobId: job.id,
        fromUserId: tech.id,
        kind: "system",
        body: notif.title,
      },
    });
  }

  // Auto-create invoice on WAITING_APPROVAL if none exists
  if (status === "WAITING_APPROVAL" && !job.invoice) {
    const laborHours = extra.laborHours ?? 1.5;
    const laborRate = job.technician.hourlyRate;
    const laborTotal = laborHours * laborRate;
    const partsTotal = job.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
    const travelFee = job.technician.travelFeeBase;
    const subtotal = laborTotal + partsTotal + travelFee;
    const taxTotal = subtotal * 0.09;
    const total = subtotal + taxTotal;
    await db.invoice.create({
      data: {
        code: `INV-${Math.floor(3000 + Math.random() * 6000)}`,
        jobId: job.id,
        laborHours,
        laborRate,
        laborTotal,
        partsTotal,
        travelFee,
        subtotal,
        taxRate: 0.09,
        taxTotal,
        discount: 0,
        total,
        currency: "USD",
        status: "SENT",
        notes: "Parts covered by 6-month warranty.",
      },
    });
    const fresh = await db.job.findUnique({ where: { id }, include });
    return NextResponse.json(fresh);
  }

  return NextResponse.json(job);
}
