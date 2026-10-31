import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payment-provider";

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
      if (!invoice || invoice.status === "PAID" || Math.round(Number(invoice.total)) !== Number(log.amount)) {
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
      if (!job || job.prepayPaid || Math.round(Number(job.inspectionFee) + Number(job.travelFee)) !== Number(log.amount)) {
        throw new Error("Prepayment is unavailable or its amount changed");
      }
      const prepayment = await tx.job.updateMany({
        where: { id: metadata.jobId, prepayPaid: false },
        data: { prepayPaid: true, prepayPaidAt: new Date() },
      });
      if (prepayment.count !== 1) throw new Error("Prepayment was already processed");
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
