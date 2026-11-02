import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payment-provider";

export const runtime = "nodejs";

type CallbackFields = Record<string, string>;

function resultRedirect(req: NextRequest, result: "success" | "failed", ref?: string) {
  const base = process.env.APP_URL || req.nextUrl.origin;
  const url = new URL("/", base);
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
    const body = await req.json().catch(() => ({}));
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") fields[key] = String(value);
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
  if (log.purpose !== "invoice" || !log.paymentId) {
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
  if (!isZarinpal && !["100", "101"].includes(callbackStatus || "")) {
    await db.paymentGatewayLog.update({
      where: { id: log.id },
      data: { status: "CANCELLED", callbackPayload: JSON.stringify(fields) },
    });
    await db.payment.updateMany({ where: { id: log.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return resultRedirect(req, "failed");
  }

  const expectedAmount = Math.round(Number(log.amount));
  const verified = await verifyPayment(authority, expectedAmount, log.code);
  if (!verified.success || !verified.refId || Number(verified.amount) !== expectedAmount) {
    await db.paymentGatewayLog.update({
      where: { id: log.id },
      data: { status: "FAILED", callbackPayload: JSON.stringify(fields) },
    });
    await db.payment.updateMany({ where: { id: log.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return resultRedirect(req, "failed");
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
      if (!payment?.invoiceId) throw new Error("Invoice payment record is missing");
      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { job: { include: { technician: true, request: { include: { customer: true } } } } },
      });
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status !== "PAID") {
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
    return resultRedirect(req, "failed");
  }
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}
