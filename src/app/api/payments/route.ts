import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { rateLimitAsync, getClientId, RATE_LIMITS } from "@/lib/rate-limit";
import { createPayment, getPaymentProviderStatus } from "@/lib/payment-provider";
import { calculatePrepayFees } from "@/lib/prepay-settlement";
import {
  gatewayTypeForProvider,
  isTrustedGatewayRedirect,
  isUniqueConstraintError,
} from "@/lib/payment-intents";

const PENDING_INITIATION_TTL_MS = 5 * 60 * 1000;
const PENDING_REDIRECT_TTL_MS = 24 * 60 * 60 * 1000;
type PendingGatewayLog = NonNullable<Awaited<ReturnType<typeof db.paymentGatewayLog.findFirst>>>;

async function resumePendingCheckout(
  log: PendingGatewayLog,
  expected: {
    userId: string;
    purpose: "vip" | "prepay" | "invoice";
    description: string;
    amount: number;
    callbackOrigin: string;
  },
): Promise<NextResponse | null> {
  if (
    log.userId !== expected.userId ||
    log.purpose !== expected.purpose ||
    log.description !== expected.description ||
    Math.round(Number(log.amount)) !== expected.amount ||
    !log.paymentId
  ) {
    return NextResponse.json(
      { error: "برای این حساب یک تلاش پرداخت دیگر در حال بررسی است؛ ابتدا وضعیت آن را مشخص کنید" },
      { status: 409 },
    );
  }

  const ageMs = Date.now() - log.initiatedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return NextResponse.json({ error: "وضعیت تلاش پرداخت قابل بررسی نیست" }, { status: 409 });
  }

  if (log.status === "INITIATED") {
    if (ageMs <= PENDING_INITIATION_TTL_MS) {
      return NextResponse.json({ error: "درخواست پرداخت قبلی هنوز در حال پردازش است" }, { status: 409 });
    }
    const expired = await db.paymentGatewayLog.updateMany({
      where: { id: log.id, status: "INITIATED" },
      data: { status: "CANCELLED" },
    });
    if (expired.count !== 1) {
      return NextResponse.json({ error: "وضعیت پرداخت هم‌زمان تغییر کرده است؛ دوباره وضعیت را بررسی کنید" }, { status: 409 });
    }
    await db.payment.updateMany({
      where: { id: log.paymentId, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return null;
  }

  if (log.status !== "REDIRECTED" || ageMs > PENDING_REDIRECT_TTL_MS || !log.paymentUrl) {
    return NextResponse.json(
      { error: "تلاش پرداخت قبلی هنوز تعیین‌تکلیف نشده است؛ برای جلوگیری از پرداخت تکراری با پشتیبانی تماس بگیرید" },
      { status: 409 },
    );
  }

  if (!isTrustedGatewayRedirect(log.gateway, log.paymentUrl, expected.callbackOrigin, process.env.NODE_ENV === "production")) {
    console.error("Stored gateway redirect failed allowlist validation", log.id, log.gateway);
    return NextResponse.json({ error: "نشانی درگاه پرداخت معتبر نیست؛ با پشتیبانی تماس بگیرید" }, { status: 409 });
  }

  const payment = await db.payment.findUnique({ where: { id: log.paymentId } });
  if (
    !payment ||
    payment.userId !== expected.userId ||
    payment.status !== "PENDING" ||
    payment.currency !== "IRR" ||
    Math.round(Number(payment.amount)) !== expected.amount
  ) {
    return NextResponse.json({ error: "رکورد پرداخت با درخواست فعلی مطابقت ندارد" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    paymentId: payment.id,
    redirectUrl: log.paymentUrl,
    amount: expected.amount,
    currency: "IRR",
    reused: true,
  });
}

async function markInitiationFailed(logId: string, paymentId: string) {
  await db.$transaction([
    db.paymentGatewayLog.updateMany({
      where: { id: logId, status: "INITIATED" },
      data: { status: "FAILED" },
    }),
    db.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "FAILED" },
    }),
  ]);
}

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

  const description = "VIP_PLAN:" + plan.id;
  const callbackOrigin = new URL(callbackUrl).origin;
  const pending = await db.paymentGatewayLog.findFirst({
    where: { userId, purpose: "vip", status: { in: ["INITIATED", "REDIRECTED"] } },
    orderBy: { initiatedAt: "desc" },
  });
  if (pending) {
    const resumed = await resumePendingCheckout(pending, {
      userId, purpose: "vip", description, amount, callbackOrigin,
    });
    if (resumed) return resumed;
  }

  const code = "PG-" + randomUUID();
  const paymentCode = "PAY-" + randomUUID();
  const gateway = gatewayTypeForProvider(providerName);
  let created: { paymentId: string; logId: string };
  try {
    created = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { code: paymentCode, userId, amount, currency: "IRR", method: "card", status: "PENDING" },
      });
      const log = await tx.paymentGatewayLog.create({
        data: { code, userId, amount, currency: "IRR", gateway, status: "INITIATED", purpose: "vip", description, paymentId: payment.id },
      });
      return { paymentId: payment.id, logId: log.id };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.paymentGatewayLog.findFirst({
      where: { userId, purpose: "vip", status: { in: ["INITIATED", "REDIRECTED"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (raced) {
      const resumed = await resumePendingCheckout(raced, { userId, purpose: "vip", description, amount, callbackOrigin });
      if (resumed) return resumed;
    }
    return NextResponse.json({ error: "درخواست پرداخت هم‌زمان دیگری ثبت شده است؛ وضعیت آن را بررسی کنید" }, { status: 409 });
  }

  const result = await createPayment({
    amount,
    description: "MEKANIX VIP " + plan.name,
    callbackUrl,
    orderId: code,
  });
  if (!result.success || !result.paymentUrl || !result.authority) {
    await markInitiationFailed(created.logId, created.paymentId);
    return NextResponse.json({ error: result.error || "ایجاد پرداخت درگاه ناموفق بود" }, { status: 502 });
  }
  if (!isTrustedGatewayRedirect(gateway, result.paymentUrl, callbackOrigin, process.env.NODE_ENV === "production")) {
    await markInitiationFailed(created.logId, created.paymentId);
    console.error("Gateway returned a redirect URL outside the allowlist", gateway);
    return NextResponse.json({ error: "نشانی بازگشت درگاه پرداخت معتبر نیست" }, { status: 502 });
  }
  const redirected = await db.paymentGatewayLog.updateMany({
    where: { id: created.logId, status: "INITIATED" },
    data: { status: "REDIRECTED", referenceId: result.authority, paymentUrl: result.paymentUrl },
  });
  if (redirected.count !== 1) {
    await db.payment.updateMany({ where: { id: created.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "وضعیت درخواست پرداخت تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    paymentId: created.paymentId,
    redirectUrl: result.paymentUrl,
    amount,
    currency: "IRR",
  });
}

async function startPrepayCheckout(jobId: string, userId: string, providerName: string) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      request: { include: { vehicle: true, customer: true } },
      technician: true,
    },
  });
  if (!job) return NextResponse.json({ error: "درخواست تعمیر پیدا نشد" }, { status: 404 });
  if (job.request.customer.userId !== userId) {
    return NextResponse.json({ error: "شما مالک این درخواست نیستید" }, { status: 403 });
  }
  if (job.prepayPaid) return NextResponse.json({ error: "هزینه پیش‌خدمت قبلاً پرداخت شده است" }, { status: 409 });
  if (["CANCELLED", "REJECTED", "COMPLETED"].includes(job.status)) {
    return NextResponse.json({ error: "این درخواست در وضعیت قابل پرداخت نیست" }, { status: 409 });
  }

  let fees: ReturnType<typeof calculatePrepayFees>;
  try {
    fees = calculatePrepayFees(job);
  } catch {
    return NextResponse.json({ error: "هزینه پیش‌خدمت برای این مکانیک به‌درستی تنظیم نشده است" }, { status: 422 });
  }
  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.json({ error: "APP_URL برای callback درگاه تنظیم نشده است" }, { status: 503 });
  let callbackUrl: string;
  try {
    const base = new URL(appUrl);
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      return NextResponse.json({ error: "APP_URL در محیط عملیاتی باید HTTPS باشد" }, { status: 503 });
    }
    callbackUrl = new URL("/api/gateway/callback", base).toString();
  } catch {
    return NextResponse.json({ error: "APP_URL معتبر نیست" }, { status: 503 });
  }

  const description = "PREPAY_JOB:" + job.id;
  const callbackOrigin = new URL(callbackUrl).origin;
  const pending = await db.paymentGatewayLog.findFirst({
    where: { userId, purpose: "prepay", status: { in: ["INITIATED", "REDIRECTED"] } },
    orderBy: { initiatedAt: "desc" },
  });
  if (pending) {
    const resumed = await resumePendingCheckout(pending, {
      userId, purpose: "prepay", description, amount: fees.gross, callbackOrigin,
    });
    if (resumed) return resumed;
  }

  const code = "PG-" + randomUUID();
  const paymentCode = "PAY-" + randomUUID();
  const gateway = gatewayTypeForProvider(providerName);
  let created: { paymentId: string; logId: string };
  try {
    created = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { code: paymentCode, userId, amount: fees.gross, currency: "IRR", method: "card", status: "PENDING" },
      });
      const log = await tx.paymentGatewayLog.create({
        data: { code, userId, amount: fees.gross, currency: "IRR", gateway, status: "INITIATED", purpose: "prepay", description, paymentId: payment.id },
      });
      return { paymentId: payment.id, logId: log.id };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.paymentGatewayLog.findFirst({
      where: { userId, purpose: "prepay", status: { in: ["INITIATED", "REDIRECTED"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (raced) {
      const resumed = await resumePendingCheckout(raced, { userId, purpose: "prepay", description, amount: fees.gross, callbackOrigin });
      if (resumed) return resumed;
    }
    return NextResponse.json({ error: "درخواست پرداخت هم‌زمان دیگری ثبت شده است؛ وضعیت آن را بررسی کنید" }, { status: 409 });
  }

  const result = await createPayment({
    amount: fees.gross,
    description: "MEKANIX pre-service " + job.code,
    callbackUrl,
    orderId: code,
  });
  if (!result.success || !result.paymentUrl || !result.authority) {
    await markInitiationFailed(created.logId, created.paymentId);
    return NextResponse.json({ error: result.error || "ایجاد پرداخت درگاه ناموفق بود" }, { status: 502 });
  }
  if (!isTrustedGatewayRedirect(gateway, result.paymentUrl, callbackOrigin, process.env.NODE_ENV === "production")) {
    await markInitiationFailed(created.logId, created.paymentId);
    console.error("Gateway returned a redirect URL outside the allowlist", gateway);
    return NextResponse.json({ error: "نشانی بازگشت درگاه پرداخت معتبر نیست" }, { status: 502 });
  }
  const redirected = await db.paymentGatewayLog.updateMany({
    where: { id: created.logId, status: "INITIATED" },
    data: { status: "REDIRECTED", referenceId: result.authority, paymentUrl: result.paymentUrl },
  });
  if (redirected.count !== 1) {
    await db.payment.updateMany({ where: { id: created.paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "وضعیت درخواست پرداخت تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    paymentId: created.paymentId,
    redirectUrl: result.paymentUrl,
    amount: fees.gross,
    currency: "IRR",
  });
}

export async function POST(req: Request) {
  const provider = getPaymentProviderStatus();
  const isProduction = process.env.NODE_ENV === "production";
  const isLiveProduction = isProduction && process.env.APP_ENV !== "staging";
  const sandboxEnabled = process.env.IDPAY_SANDBOX === "true" || process.env.ZARINPAL_SANDBOX === "true";
  if (!provider.configured || (provider.provider === "simulator" && isProduction) || (isLiveProduction && sandboxEnabled)) {
    return NextResponse.json(
      { error: "درگاه پرداخت واقعی پیکربندی نشده است" },
      { status: 503 }
    );
  }

  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

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
  const payload = body as { invoiceId?: unknown; planId?: unknown; jobId?: unknown };
  if (typeof payload.planId === "string" && payload.planId.trim()) {
    if (session.role !== "CUSTOMER" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
    }
    return startVipCheckout(payload.planId, session.userId, provider.provider);
  }
  if (typeof payload.jobId === "string" && payload.jobId.trim()) {
    if (session.role !== "CUSTOMER") {
      return NextResponse.json({ error: "فقط مشتری می‌تواند هزینه پیش‌خدمت را پرداخت کند" }, { status: 403 });
    }
    return startPrepayCheckout(payload.jobId, session.userId, provider.provider);
  }
  const invoiceId = payload.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) {
    return NextResponse.json({ error: "invoiceId، planId یا jobId الزامی است" }, { status: 400 });
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

  const callbackOrigin = new URL(callbackUrl).origin;
  if (invoice.payment?.status === "PENDING") {
    const activeLog = await db.paymentGatewayLog.findFirst({
      where: { paymentId: invoice.payment.id, status: { in: ["INITIATED", "REDIRECTED"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (activeLog) {
      const resumed = await resumePendingCheckout(activeLog, {
        userId: session.userId,
        purpose: "invoice",
        description: "Payment for invoice " + invoice.code,
        amount,
        callbackOrigin,
      });
      if (resumed) return resumed;
    }
  }

  const code = "PG-" + randomUUID();
  const paymentCode = "PAY-" + randomUUID();
  const gateway = gatewayTypeForProvider(provider.provider);

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
    if (isUniqueConstraintError(error)) {
      const existingPayment = await db.payment.findUnique({ where: { invoiceId: invoice.id } });
      const raced = existingPayment
        ? await db.paymentGatewayLog.findFirst({
            where: { paymentId: existingPayment.id, status: { in: ["INITIATED", "REDIRECTED"] } },
            orderBy: { initiatedAt: "desc" },
          })
        : null;
      if (raced) {
        const resumed = await resumePendingCheckout(raced, {
          userId: session.userId,
          purpose: "invoice",
          description: "Payment for invoice " + invoice.code,
          amount,
          callbackOrigin,
        });
        if (resumed) return resumed;
      }
    }
    console.error("Unable to create invoice payment record", error);
    return NextResponse.json({ error: "ثبت درخواست پرداخت انجام نشد؛ وضعیت تلاش قبلی را بررسی کنید" }, { status: 409 });
  }

  const result = await createPayment({
    amount,
    description: "MEKANIX invoice " + invoice.code,
    callbackUrl,
    mobile: undefined,
    orderId: code,
  });

  if (!result.success || !result.paymentUrl || !result.authority) {
    await markInitiationFailed(logId, paymentId);
    return NextResponse.json({ error: result.error || "ایجاد پرداخت در درگاه ناموفق بود" }, { status: 502 });
  }
  if (!isTrustedGatewayRedirect(gateway, result.paymentUrl, callbackOrigin, process.env.NODE_ENV === "production")) {
    await markInitiationFailed(logId, paymentId);
    console.error("Gateway returned a redirect URL outside the allowlist", gateway);
    return NextResponse.json({ error: "نشانی بازگشت درگاه پرداخت معتبر نیست" }, { status: 502 });
  }
  const redirected = await db.paymentGatewayLog.updateMany({
    where: { id: logId, status: "INITIATED" },
    data: { status: "REDIRECTED", referenceId: result.authority, paymentUrl: result.paymentUrl },
  });
  if (redirected.count !== 1) {
    await db.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    return NextResponse.json({ error: "وضعیت درخواست پرداخت تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    paymentId,
    redirectUrl: result.paymentUrl,
    amount,
    currency: "IRR",
  });
}
