import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payment-provider";

type PaymentMetadata =
  | { kind: "vip"; subscriptionId: string; planId: string; durationDays: number; planName: string }
  | { kind: "invoice"; invoiceId: string }
  | { kind: "prepay"; jobId: string; inspectionFee: number; travelFee: number; heavy: boolean };

function parseMetadata(value: string | null): PaymentMetadata {
  if (!value) throw new Error("Payment metadata is missing");
  const parsed = JSON.parse(value) as PaymentMetadata;
  if (!parsed || !["vip", "invoice", "prepay"].includes(parsed.kind)) {
    throw new Error("Payment metadata is invalid");
  }
  return parsed;
}

/**
 * Apply a provider-verified payment exactly once.
 *
 * This function must only be called after the gateway's server-to-server
 * verification succeeds. The conditional status update is the concurrency
 * guard that prevents duplicate callbacks from creating duplicate payments
 * or granting the same entitlement more than once.
 */
export async function fulfillVerifiedPayment(
  logId: string,
  providerReference: string,
  callbackPayload: Record<string, string>
): Promise<{ paymentId: string; alreadyProcessed: boolean }> {
  return db.$transaction(async (tx) => {
    const log = await tx.paymentGatewayLog.findUnique({ where: { id: logId } });
    if (!log) throw new Error("Payment attempt not found");

    if (log.status === "VERIFIED" && log.paymentId) {
      return { paymentId: log.paymentId, alreadyProcessed: true };
    }
    if (log.status !== "REDIRECTED" || !log.userId) {
      throw new Error("Payment attempt is not eligible for verification");
    }

    const metadata = parseMetadata(log.description);
    const claim = await tx.paymentGatewayLog.updateMany({
      where: { id: log.id, status: "REDIRECTED", paymentId: log.paymentId },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        referenceId: providerReference,
        callbackPayload: JSON.stringify(callbackPayload),
      },
    });

    if (claim.count !== 1) {
      const current = await tx.paymentGatewayLog.findUnique({ where: { id: log.id } });
      if (current?.status === "VERIFIED" && current.paymentId) {
        return { paymentId: current.paymentId, alreadyProcessed: true };
      }
      throw new Error("Payment attempt was concurrently changed");
    }

    let invoiceId: string | null = null;
    if (metadata.kind === "invoice") {
      const invoice = await tx.invoice.findUnique({ where: { id: metadata.invoiceId } });
      if (!invoice || (invoice.status === "PAID" || invoice.status === "DRAFT") || Math.round(Number(invoice.total)) !== Number(log.amount)) {
        throw new Error("Invoice is unavailable or its amount changed");
      }
      invoiceId = invoice.id;
    }

    let payment: { id: string };
    if (log.paymentId) {
      const pendingPayment = await tx.payment.findUnique({ where: { id: log.paymentId } });
      if (
        !pendingPayment ||
        pendingPayment.status !== "PENDING" ||
        pendingPayment.userId !== log.userId ||
        Number(pendingPayment.amount) !== Number(log.amount) ||
        pendingPayment.invoiceId !== invoiceId
      ) {
        throw new Error("Reserved payment record does not match the verified order");
      }
      payment = await tx.payment.update({
        where: { id: pendingPayment.id },
        data: { status: "SUCCEEDED", method: log.gateway.toLowerCase(), amount: log.amount, currency: "IRR" },
      });
    } else {
      payment = await tx.payment.create({
        data: {
          code: `PAY-${randomUUID()}`,
          invoiceId,
          userId: log.userId,
          amount: log.amount,
          currency: "IRR",
          method: log.gateway.toLowerCase(),
          status: "SUCCEEDED",
        },
      });
    }

    if (metadata.kind === "vip") {
      if (!Number.isSafeInteger(metadata.durationDays) || metadata.durationDays <= 0) {
        throw new Error("VIP plan duration snapshot is invalid");
      }
      await tx.userVipSubscription.updateMany({
        where: { userId: log.userId, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      const activation = await tx.userVipSubscription.updateMany({
        where: {
          id: metadata.subscriptionId,
          userId: log.userId,
          planId: metadata.planId,
          status: "PENDING_PAYMENT",
        },
        data: {
          status: "ACTIVE",
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + metadata.durationDays * 24 * 60 * 60 * 1000),
          paymentId: payment.id,
        },
      });
      if (activation.count !== 1) throw new Error("VIP subscription could not be activated");
      await tx.notification.create({
        data: {
          userId: log.userId,
          type: "vip_activated",
          title: "اشتراک VIP فعال شد",
          body: `اشتراک ${metadata.planName} فعال شد.`,
          category: "system",
          link: "customer/settings",
        },
      });
    } else if (metadata.kind === "invoice") {
      const invoice = await tx.invoice.findUnique({
        where: { id: metadata.invoiceId },
        include: { job: { include: { technician: true } } },
      });
      if (!invoice || invoice.status === "PAID" || Math.round(Number(invoice.total)) !== Number(log.amount)) {
        throw new Error("Invoice is unavailable or its amount changed");
      }
      await tx.invoice.update({ where: { id: metadata.invoiceId }, data: { status: "PAID" } });
      await tx.job.update({
        where: { id: invoice.jobId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await tx.warranty.upsert({
        where: { jobId: invoice.jobId },
        create: { jobId: invoice.jobId, months: 6, active: true },
        update: { months: 6, active: true },
      });
      if (invoice.job.technician?.userId) {
        await tx.notification.create({
          data: {
            userId: invoice.job.technician.userId,
            type: "job_completed",
            title: "Payment received",
            body: `Invoice ${invoice.code} paid — ${Number(invoice.total)} IRR`,
            category: "payment",
            link: "technician/earnings",
          },
        });
      }
    } else {
      const job = await tx.job.findUnique({
        where: { id: metadata.jobId },
        include: {
          request: { include: { customer: true, vehicle: true } },
          technician: { include: { wallet: true, user: true } },
        },
      });
      const gross = Math.round(metadata.inspectionFee + metadata.travelFee);
      if (!job || job.prepayPaid || !job.technician || gross !== Number(log.amount)) {
        throw new Error("Prepayment is unavailable or its amount changed");
      }
      const commission = Math.round(gross * 0.10);
      const net = gross - commission;
      const prepayment = await tx.job.updateMany({
        where: { id: metadata.jobId, prepayPaid: false },
        data: {
          prepayPaid: true,
          prepayPaidAt: new Date(),
          inspectionFee: metadata.inspectionFee,
          travelFee: metadata.travelFee,
          platformCommission: commission,
          netEarnings: net,
          holdUntil: null,
        },
      });
      if (prepayment.count !== 1) throw new Error("Prepayment was already processed");
      const wallet = job.technician.wallet ?? await tx.wallet.upsert({
        where: { technicianId: job.technician.id },
        create: { technicianId: job.technician.id },
        update: {},
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          jobId: job.id,
          kind: "PREPAY",
          status: "PENDING",
          grossAmount: gross,
          commissionAmount: commission,
          netAmount: net,
          holdUntil: null,
          description: `Pre-service payment — ${job.code} (${metadata.heavy ? "heavy" : "passenger"})`,
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          jobId: job.id,
          kind: "COMMISSION",
          status: "COMPLETED",
          grossAmount: 0,
          commissionAmount: commission,
          netAmount: -commission,
          description: `Platform commission (10%) — ${job.code}` ,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: { increment: net },
          totalEarned: { increment: gross },
          totalCommission: { increment: commission },
        },
      });
      await tx.notification.create({
        data: {
          userId: job.request.customer.userId,
          type: "payment_required",
          title: "Pre-service payment received",
          body: `Chat & call with ${job.technician.user.name} is now active for ${job.code}`,
          category: "payment",
          link: "customer/track",
        },
      });
      await tx.notification.create({
        data: {
          userId: job.technician.userId,
          type: "payment_required",
          title: "Pre-service payment received",
          body: `${job.code} — customer paid inspection + travel fee. You can start moving now.`,
          category: "payment",
          link: "technician/requests",
        },
      });
      await tx.message.create({
        data: {
          jobId: job.id,
          fromUserId: job.request.customer.userId,
          kind: "system",
          body: "Pre-service payment received — chat unlocked.",
        },
      });
    }

    await tx.paymentGatewayLog.update({
      where: { id: log.id },
      data: { paymentId: payment.id },
    });

    return { paymentId: payment.id, alreadyProcessed: false };
  });
}


/**
 * Validate the browser return against the persisted attempt, then verify
 * directly with the selected payment provider before fulfilling anything.
 */
export async function verifyAndFulfillGatewayCallback(
  code: string,
  authority: string,
  callbackStatus: string,
  callbackPayload: Record<string, string>
): Promise<{ paymentId: string; alreadyProcessed: boolean }> {
  const log = await db.paymentGatewayLog.findUnique({ where: { code } });
  if (!log) throw new Error("Payment attempt not found");

  if (log.status === "VERIFIED" && log.paymentId) {
    return { paymentId: log.paymentId, alreadyProcessed: true };
  }
  if (log.status !== "REDIRECTED" || !log.referenceId || !log.userId) {
    throw new Error("Payment attempt is not awaiting a callback");
  }
  if (authority !== log.referenceId) {
    throw new Error("Gateway reference does not match the payment attempt");
  }

  if (log.gateway === "ZARINPAL" && callbackStatus !== "OK") {
    throw new Error("Zarinpal reported an unsuccessful payment");
  }
  if (log.gateway === "IDPAY") {
    if (callbackStatus !== "1" || callbackPayload.order_id !== log.code) {
      throw new Error("IDPay reported an unsuccessful or mismatched payment");
    }
  }
  if (log.gateway === "SHAPARAK_SIM") {
    if (process.env.NODE_ENV === "production" || callbackStatus !== "OK" || callbackPayload.simulator !== "true") {
      throw new Error("Simulator callbacks are disabled or invalid");
    }
  }

  const amount = Number(log.amount);
  const verification = await verifyPayment(authority, amount, log.code);
  if (!verification.success || !verification.refId) {
    throw new Error(verification.error || "Gateway verification failed");
  }
  if (verification.amount != null && Number(verification.amount) !== amount) {
    throw new Error("Verified amount does not match the stored order amount");
  }

  return fulfillVerifiedPayment(log.id, verification.refId, callbackPayload);
}
