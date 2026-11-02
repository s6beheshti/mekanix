import type { Prisma } from "@prisma/client";

export type PrepayFees = {
  inspectionFee: number;
  travelFee: number;
  gross: number;
  commission: number;
  net: number;
};

export function calculatePrepayFees(job: {
  request: { vehicle: { type: string } };
  technician: { inspectionFee: unknown; inspectionFeeHeavy: unknown; travelFeeBase: unknown };
}): PrepayFees {
  const heavy = job.request.vehicle.type !== "CAR";
  const inspectionFee = Math.round(Number(heavy ? job.technician.inspectionFeeHeavy : job.technician.inspectionFee));
  const travelFee = Math.round(Number(job.technician.travelFeeBase));
  const gross = inspectionFee + travelFee;
  const commission = Math.round(gross * 0.1);
  const net = gross - commission;
  if (![inspectionFee, travelFee, gross, commission, net].every(Number.isSafeInteger) || gross <= 0 || net < 0) {
    throw new Error("Invalid pre-service fee configuration");
  }
  return { inspectionFee, travelFee, gross, commission, net };
}

export async function settlePrepay(
  tx: Prisma.TransactionClient,
  jobId: string,
  payerUserId: string,
  expectedAmount: number
) {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    include: {
      request: { include: { vehicle: true, customer: true } },
      technician: { include: { wallet: true, user: true } },
    },
  });
  if (!job) throw new Error("Prepay job not found");
  if (job.request.customer.userId !== payerUserId) throw new Error("Prepay payer does not own this job");
  if (job.prepayPaid) throw new Error("Pre-service payment already settled");
  if (["CANCELLED", "REJECTED", "COMPLETED"].includes(job.status)) {
    throw new Error("Job is no longer eligible for pre-service payment");
  }

  const fees = calculatePrepayFees(job);
  if (fees.gross !== expectedAmount) throw new Error("Pre-service amount does not match current server-side fee");

  const updatedJob = await tx.job.update({
    where: { id: job.id },
    data: {
      prepayPaid: true,
      prepayPaidAt: new Date(),
      inspectionFee: fees.inspectionFee,
      travelFee: fees.travelFee,
      platformCommission: fees.commission,
      netEarnings: fees.net,
      holdUntil: null,
    },
  });

  const wallet = await tx.wallet.upsert({
    where: { technicianId: job.technicianId },
    create: { technicianId: job.technicianId },
    update: {},
  });

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      jobId: job.id,
      kind: "PREPAY",
      status: "PENDING",
      grossAmount: fees.gross,
      commissionAmount: fees.commission,
      netAmount: fees.net,
      holdUntil: null,
      description: "Pre-service payment — " + job.code,
    },
  });
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      jobId: job.id,
      kind: "COMMISSION",
      status: "COMPLETED",
      grossAmount: 0,
      commissionAmount: fees.commission,
      netAmount: -fees.commission,
      description: "Platform commission (10%) — " + job.code,
    },
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      pendingBalance: { increment: fees.net },
      totalEarned: { increment: fees.gross },
      totalCommission: { increment: fees.commission },
    },
  });

  await tx.notification.create({
    data: {
      userId: payerUserId,
      type: "payment_required",
      title: "Pre-service payment received",
      body: "Chat and call with " + job.technician.user.name + " are now active for " + job.code,
      category: "payment",
      link: "customer/track",
    },
  });
  await tx.notification.create({
    data: {
      userId: job.technician.userId,
      type: "payment_required",
      title: "Pre-service payment received",
      body: job.code + " — customer paid inspection and travel fees.",
      category: "payment",
      link: "technician/requests",
    },
  });
  await tx.message.create({
    data: {
      jobId: job.id,
      fromUserId: payerUserId,
      kind: "system",
      body: "Pre-service payment received — chat unlocked.",
    },
  });

  return { job: updatedJob, amount: fees.gross, commission: fees.commission, net: fees.net };
}
