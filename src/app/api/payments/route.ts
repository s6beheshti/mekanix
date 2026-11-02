import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { rateLimitAsync, getClientId, RATE_LIMITS } from "@/lib/rate-limit";
import { createPayment, getPaymentProviderStatus } from "@/lib/payment-provider";

// POST /api/payments — create a real external checkout for an invoice.
// The invoice, amount, payer and currency are always resolved server-side.
// A payment is not successful until /api/gateway/callback verifies it with the provider.
async function startVipCheckout(planId: string, userId: string, providerName: string) {
  const plan = await db.vipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "طرح VIP فعال یا معتبر نیست" }, { status: 404 });
  }
  const amount = Math.round(Number(plan.priceIrr));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "مبلغ طرح VIP معتبر نیست" }, { status: 422 });
  }
  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.json({ error: "APP_URL برای callback درگاه تنظیم نشده است" }, { status: 503 });
  let callbackUrl: string;
  try {
    const base = new URL(appUrl);
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      return NextResponse.json({ error: "APP_URL در محیط تولید باید HTTPS باشد" }, { status: 503 });
    }
    callbackUrl = new URL("/api/gateway/callback", base).toString();
  } catch {
    return NextResponse.json({ error: "APP_URL معتبر نیست" }, { status: 503 });
  }

  const activeCheckout = await db.paymentGatewayLog.findFirst({
    where: {
      userId,
      purpose: "vip",
      description: "VIP_PLAN:" + plan.id,
      status: "REDIRECTED",
      initiatedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });
  if (activeCheckout) {
    return NextResponse.json({ error: "یک پرداخت برای این طرح در حال انجام است؛ ابتدا نتیجه آن را بررسی کنید" }, { status: 409 });
  }

  const code = "PG-" + randomUUID();
  const paymentCode = "PAY-" + randomUUID();
  const gateway = providerName === "zarinpal" ? "ZARINPAL" : "IDPAY";
  const created = await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { code: paymentCode, userId, amount, currency: "IRR", method: "card", status: "PENDING" },
    });
    const log = await tx.paymentGatewayLog.create({
      data: {
        code,
        userId,
        amount,
        currency: "IRR",
        gateway,
        status: "INITIATED",
        purpose: "vip",
        description: "VIP_PLAN:" + plan.id,
        paymentId: payment.id,
      },
    });
    return { paymentId: payment.id, logId: log.id };
  });

  const result = await createPayment({
    amount,
    description: "MEKANIX VIP " + plan.name,
    callbackUrl,
    orderId: code,
  });
  if (!result.success || !result.paymentUrl || !result.authority) {
    await db.$transaction([
      db.paymentGatewayLog.update({ where: { id: created.logId }, data: { status: "FAILED" } }),
      db.payment.update({ where: { id: created.paymentId }, data: { status: "FAILED" } }),
    ]);
    return NextResponse.json({ error: result.error || "ایجاد پرداخت درگاه ناموفق بود" }, { status: 502 });
  }
  await db.paymentGatewayLog.update({
    where: { id: created.logId },
    data: { status: "REDIRECTED", referenceId: result.authority },
  });
  return NextResponse.json({
    ok: true,
    paymentId: created.paymentId,
    redirectUrl: result.paymentUrl,
    amount,
    currency: "IRR",
  });
}

export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const provider = getPaymentProviderStatus();
  if (!provider.configured || (provider.provider === "simulator" && process.env.NODE_ENV === "production")) {
    return NextResponse.json(
      { error: "درگاه پرداخت واقعی پیکربندی نشده است" },
      { status: 503 }
    );
  }

  const clientId = getClientId(req);
  const rl = await rateLimitAsync(
    `payment:${clientId}`,
    RATE_LIMITS.PAYMENT.max,
    RATE_LIMITS.PAYMENT.windowMs
  );
  if (!rl.success) {
    return NextResponse.json(
      { error: "درخواست‌های پرداخت بیش از حد، بعداً دوباره تلاش کنید" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body as { invoiceId?: unknown; planId?: unknown };
  if (typeof payload.planId === "string" && payload.planId.trim()) {
    return startVipCheckout(payload.planId, session.userId, provider.provider);
  }
  const invoiceId = payload.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) {
    return NextResponse.json({ error: "invoiceId یا planId الزامی است" }, { status: 400 });
  }

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      job: { include: { request: { include: { customer: true } } } },
      payment: true,
    },
  });
  if (!invoice) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

  if (session.role === "CUSTOMER") {
    if (invoice.job?.request?.customer?.userId !== session.userId) {
      return NextResponse.json({ error: "شما مالک این فاکتور نیستید" }, { status: 403 });
    }
  } else if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  if (invoice.status === "PAID" || invoice.payment?.status === "SUCCEEDED") {
    return NextResponse.json({ error: "این فاکتور قبلاً پرداخت شده است" }, { status: 409 });
  }
  if (!["SENT", "APPROVED", "OVERDUE"].includes(invoice.status)) {
    return NextResponse.json({ error: "این فاکتور در وضعیت قابل پرداخت نیست" }, { status: 409 });
  }
  if (invoice.currency !== "IRR") {
    return NextResponse.json({ error: "واحد پول فاکتور برای پرداخت بانکی پشتیبانی نمی‌شود" }, { status: 422 });
  }

  const amount = Math.round(Number(invoice.total));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "مبلغ فاکتور معتبر نیست" }, { status: 422 });
  }

  if (invoice.payment?.status === "PENDING") {
    const activeLog = await db.paymentGatewayLog.findFirst({
      where: { paymentId: invoice.payment.id, status: "REDIRECTED" },
      orderBy: { initiatedAt: "desc" },
    });
    if (activeLog) {
      return NextResponse.json({ error: "برای این فاکتور یک پرداخت در حال انجام وجود دارد" }, { status: 409 });
    }
  }

  // Local-only simulator keeps development and automated UI tests usable.
  // It is unreachable in production and never represents a real bank transaction.
  if (provider.provider === "simulator" && process.env.NODE_ENV !== "production") {
    const succeeded = Math.random() > 0.05;
    const payment = await db.payment.upsert({
      where: { invoiceId: invoice.id },
      create: {
        code: "PAY-DEV-" + randomUUID(),
        invoiceId: invoice.id,
        userId: session.userId,
        amount,
        currency: "IRR",
        method: "card",
        status: succeeded ? "SUCCEEDED" : "FAILED",
      },
      update: { status: succeeded ? "SUCCEEDED" : "FAILED", amount, userId: session.userId, method: "card" },
    });
    if (succeeded) {
      await db.$transaction(async (tx) => {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
        await tx.job.update({ where: { id: invoice.jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
        await tx.warranty.upsert({
          where: { jobId: invoice.jobId },
          create: { jobId: invoice.jobId, months: 6, active: true },
          update: { active: true },
        });
      });
    }
    return NextResponse.json(payment);
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "APP_URL برای callback درگاه تنظیم نشده است" }, { status: 503 });
  }
  let callbackUrl: string;
  try {
    const base = new URL(appUrl);
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      return NextResponse.json({ error: "APP_URL در محیط تولید باید HTTPS باشد" }, { status: 503 });
    }
    callbackUrl = new URL("/api/gateway/callback", base).toString();
  } catch {
    return NextResponse.json({ error: "APP_URL معتبر نیست" }, { status: 503 });
  }

  const code = "PG-" + randomUUID();
  const paymentCode = "PAY-" + randomUUID();
  const gateway = provider.provider === "zarinpal" ? "ZARINPAL" : "IDPAY";

  let paymentId: string;
  let logId: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const payment = invoice.payment
        ? await tx.payment.update({
            where: { id: invoice.payment.id },
            data: { status: "PENDING", amount, currency: "IRR", method: "card", userId: session.userId },
          })
        : await tx.payment.create({
            data: {
              code: paymentCode,
              invoiceId: invoice.id,
              userId: session.userId,
              amount,
              currency: "IRR",
              method: "card",
              status: "PENDING",
            },
          });

      const log = await tx.paymentGatewayLog.create({
        data: {
          code,
          userId: session.userId,
          amount,
          currency: "IRR",
          gateway,
          status: "INITIATED",
          purpose: "invoice",
          description: "Payment for invoice " + invoice.code,
          paymentId: payment.id,
        },
      });
      return { paymentId: payment.id, logId: log.id };
    });
    paymentId = created.paymentId;
    logId = created.logId;
  } catch (error) {
    console.error("Unable to create invoice payment record", error);
    return NextResponse.json({ error: "ثبت درخواست پرداخت انجام نشد؛ دوباره تلاش کنید" }, { status: 409 });
  }

  const result = await createPayment({
    amount,
    description: "MEKANIX invoice " + invoice.code,
    callbackUrl,
    mobile: undefined,
    orderId: code,
  });

  if (!result.success || !result.paymentUrl || !result.authority) {
    await db.$transaction([
      db.paymentGatewayLog.update({ where: { id: logId }, data: { status: "FAILED" } }),
      db.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } }),
    ]);
    return NextResponse.json({ error: result.error || "ایجاد پرداخت در درگاه ناموفق بود" }, { status: 502 });
  }

  await db.paymentGatewayLog.update({
    where: { id: logId },
    data: { status: "REDIRECTED", referenceId: result.authority },
  });

  return NextResponse.json({
    ok: true,
    paymentId,
    redirectUrl: result.paymentUrl,
    amount,
    currency: "IRR",
  });
}
