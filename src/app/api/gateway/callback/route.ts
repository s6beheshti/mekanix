import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payment-provider";
import { settlePrepay } from "@/lib/prepay-settlement";

export const runtime = "nodejs";

type CallbackFields = Record<string, string>;

function resultRedirect(req: NextRequest, result: "success" | "failed" | "pending", ref?: string) {
  const base = process.env.APP_URL || req.nextUrl.origin;
  const url = new URL("/payment/result", base);
  url.searchParams.set("payment", result);
  if (ref) url.searchParams.set("ref", ref.slice(0, 80));
  return NextResponse.redirect(url, 303);
}

async function readFields(req: NextRequest): Promise<CallbackFields> {
  const fields: CallbackFields = {};
  if (req.method === "GET") {
    req.nextUrl.searchParams.forEach((value, key) => { fields[key] = value; });
    return fields;
  }
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body: unknown = await req.json().catch(() => ({}));
    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (typeof value === "string" || typeof value === "number") fields[key] = String(value);
      }
    }
    return fields;
  }
  const form = await req.formData().catch(() => null);
  form?.forEach((value, key) => {
    if (typeof value === "string") fields[key] = value;
  });
  return fields;
}

async function handleCallback(req: NextRequest) {
  const fields = await readFields(req);
  const authority = fields.Authority || fields.id || "";
  const isZarinpal = Boolean(fields.Authority);
  const orderId = fields.order_id || "";

  if (!authority) return resultRedirect(req, "failed");

  const log = isZarinpal
    ? await db.paymentGatewayLog.findFirst({
        where: { referenceId: authority, gateway: "ZARINPAL" },
      })
    : orderId
      ? await db.paymentGatewayLog.findUnique({ where: { code: orderId } })
      : null;

  if (!log || (isZarinpal && log.gateway !== "ZARINPAL") || (!isZarinpal && log.gateway !== "IDPAY")) {
    return resultRedirect(req, "failed");
  }
  if (!isZarinpal && log.referenceId !== authority) {
    return resultRedirect(req, "failed");
  }
  if (!["invoice", "vip", "prepay"].includes(log.purpose) || !log.paymentId || log.currency !== "IRR") {
    return resultRedirect(req, "failed");
  }
  if (log.status === "VERIFIED") return resultRedirect(req, "success", log.referenceId || undefined);
  if (log.status !== "REDIRECTED") return resultRedirect(req, "failed");

  // A callback is only a notification. The server-to-server verification response is authoritative.
  const callbackStatus = isZarinpal ? fields.Status : fields.status;
  if (isZarinpal && callbackStatus !== "OK") {
    await db.paymentGatewayLog.update({
      where: { id: log.id },
      data: { status: "CANCELLED", callbackPayload: JSON.stringify(fields) },
    });
    await db.payment.updateMany({ where: { id: log.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return resultRedirect(req, "failed");
  }
  if (!isZarinpal && callbackStatus === "10") {
    // IDPay status 10 means the transaction is still waiting for payer action.
    // Do not mark it failed or settle it; the verified callback may arrive later.
    return resultRedirect(req, "pending");
  }
  if (!isZarinpal && !["100", "101"].includes(callbackStatus || "")) {
    await db.paymentGatewayLog.update({
      where: { id: log.id },
      data: { status: "CANCELLED", callbackPayload: JSON.stringify(fields) },
    });
    await db.payment.updateMany({ where: { id: log.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return resultRedirect(req, "failed");
  }

  const expectedAmount = Math.round(Number(log.amount));
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) return resultRedirect(req, "failed");
  const verified = await verifyPayment(authority, expectedAmount, log.code);
  if (!verified.success || !verified.refId || Number(verified.amount) !== expectedAmount) {
    // Keep the order pending so a transient provider/network failure can be retried.
    // Never mark it failed or settle it based only on callback parameters.
    console.error("Gateway verification pending for order", log.code, verified.error || "amount/reference mismatch");
    return NextResponse.json({ error: "تأیید پرداخت موقتاً انجام نشد؛ callback قابل تکرار است" }, { status: 503 });
  }

  try {
    await db.$transaction(async (tx) => {
      const current = await tx.paymentGatewayLog.findUnique({ where: { id: log.id } });
      if (!current) throw new Error("Payment log disappeared");
      if (current.status === "VERIFIED") return;
      if (current.status !== "REDIRECTED") throw new Error("Payment callback already consumed");

      const paymentUpdate = await tx.payment.updateMany({
        where: { id: log.paymentId!, status: "PENDING" },
        data: { status: "SUCCEEDED" },
      });
      if (paymentUpdate.count !== 1) {
        const existingPayment = await tx.payment.findUnique({ where: { id: log.paymentId! } });
        if (existingPayment?.status !== "SUCCEEDED") throw new Error("Payment record is not pending");
      }

      const payment = await tx.payment.findUnique({ where: { id: log.paymentId! } });
      if (!payment || payment.userId !== log.userId || Math.round(Number(payment.amount)) !== expectedAmount) {
        throw new Error("Payment owner or amount does not match gateway order");
      }

      if (log.purpose === "prepay") {
        const jobId = log.description?.startsWith("PREPAY_JOB:")
          ? log.description.slice("PREPAY_JOB:".length)
          : "";
        if (!jobId) throw new Error("Pre-service job reference is missing");
        await settlePrepay(tx, jobId, payment.userId, expectedAmount);
        await tx.paymentGatewayLog.update({
          where: { id: log.id },
          data: { status: "VERIFIED", verifiedAt: new Date(), callbackPayload: JSON.stringify(fields) },
        });
        return;
      }

      if (log.purpose === "vip") {
        const planId = log.description?.startsWith("VIP_PLAN:") ? log.description.slice("VIP_PLAN:".length) : "";
        if (!planId) throw new Error("VIP plan reference is missing");
        const plan = await tx.vipPlan.findUnique({ where: { id: planId } });
        if (!plan || !plan.active || !Number.isInteger(plan.durationDays) || plan.durationDays <= 0) {
          throw new Error("VIP plan is no longer active or valid");
        }
        const existingSubscription = await tx.userVipSubscription.findFirst({
          where: { paymentId: payment.id },
          include: { plan: true },
        });
        if (!existingSubscription) {
          const startedAt = new Date();
          const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
          await tx.userVipSubscription.updateMany({
            where: { userId: payment.userId, status: "ACTIVE" },
            data: { status: "CANCELLED" },
          });
          await tx.userVipSubscription.create({
            data: {
              userId: payment.userId,
              planId: plan.id,
              status: "ACTIVE",
              startedAt,
              expiresAt,
              paymentId: payment.id,
            },
          });
          await tx.notification.create({
            data: {
              userId: payment.userId,
              type: "vip_activated",
              title: "VIP activated",
              body: "Your " + plan.name + " plan is active until " + expiresAt.toLocaleDateString(),
              category: "system",
              link: "customer/settings",
            },
          });
        }
        await tx.paymentGatewayLog.update({
          where: { id: log.id },
          data: { status: "VERIFIED", verifiedAt: new Date(), callbackPayload: JSON.stringify(fields) },
        });
        return;
      }

      if (!payment.invoiceId) throw new Error("Invoice payment record is missing");
      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { job: { include: { technician: true, request: { include: { customer: true } } } } },
      });
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.currency !== "IRR" || Math.round(Number(invoice.total)) !== expectedAmount) {
        throw new Error("Invoice total changed after checkout; manual reconciliation required");
      }
      if (invoice.status === "PAID") {
        throw new Error("Invoice was paid by another process; manual reconciliation required");
      }
      if (!["SENT", "APPROVED", "OVERDUE"].includes(invoice.status)) {
        throw new Error("Invoice is no longer payable");
      }
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
        await tx.job.update({
          where: { id: invoice.jobId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.warranty.upsert({
          where: { jobId: invoice.jobId },
          create: { jobId: invoice.jobId, months: 6, active: true },
          update: { active: true },
        });
        if (invoice.job?.technician?.userId) {
          await tx.notification.create({
            data: {
              userId: invoice.job.technician.userId,
              type: "job_completed",
              title: "Payment received",
              body: "Invoice " + invoice.code + " paid — " + expectedAmount + " IRR",
              category: "payment",
              link: "technician/earnings",
            },
          });
        }
        if (invoice.job?.request?.customer?.userId) {
          await tx.notification.create({
            data: {
              userId: invoice.job.request.customer.userId,
              type: "payment_success",
              title: "پرداخت با موفقیت انجام شد",
              body: "پرداخت فاکتور " + invoice.code + " تأیید شد.",
              category: "payment",
              link: "customer/invoice",
            },
          });
        }
      await tx.paymentGatewayLog.update({
        where: { id: log.id },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          callbackPayload: JSON.stringify(fields),
        },
      });
    });
    return resultRedirect(req, "success", verified.refId);
  } catch (error) {
    console.error("Payment callback settlement failed", error);
    return NextResponse.json({ error: "ثبت نهایی پرداخت موقتاً ناموفق بود؛ callback قابل تکرار است" }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}
