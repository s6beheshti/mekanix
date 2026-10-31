import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

type PaymentMetadata =
  | { kind: "vip"; subscriptionId: string; planId: string }
  | { kind: "invoice"; invoiceId: string }
  | { kind: "prepay"; jobId: string };

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
      where: { id: log.id, status: "REDIRECTED", paymentId: null },
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
      if (!invoice || invoice.status === "PAID" || Number(invoice.total) !== Number(log.amount)) {
        throw new Error("Invoice is unavailable or its amount changed");
      }
      invoiceId = invoice.id;
    }

    const payment = await tx.payment.create({
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

    if (metadata.kind === "vip") {
      const plan = await tx.vipPlan.findUnique({ where: { id: metadata.planId } });
      if (!plan || !plan.active) throw new Error("VIP plan is no longer available");
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
          expiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
          paymentId: payment.id,
        },
      });
      if (activation.count !== 1) throw new Error("VIP subscription could not be activated");
    } else if (metadata.kind === "invoice") {
      await tx.invoice.update({
        where: { id: metadata.invoiceId },
        data: { status: "PAID" },
      });
    } else {
      const job = await tx.job.findUnique({ where: { id: metadata.jobId } });
      if (!job || job.prepayPaid || Number(job.inspectionFee) + Number(job.travelFee) !== Number(log.amount)) {
        throw new Error("Prepayment is unavailable or its amount changed");
      }
      await tx.job.update({
        where: { id: metadata.jobId },
        data: { prepayPaid: true, prepayPaidAt: new Date() },
      });
    }

    await tx.paymentGatewayLog.update({
      where: { id: log.id },
      data: { paymentId: payment.id },
    });

    return { paymentId: payment.id, alreadyProcessed: false };
  });
}
