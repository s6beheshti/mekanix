import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createPayment, getPaymentProviderStatus } from "@/lib/payment-provider";
import { getUsdIrrRateSnapshot } from "@/lib/exchange-rate";
import { isPublicHttpsOrigin } from "@/lib/url-validation";
import { rateLimitAsync, getClientId } from "@/lib/rate-limit";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

type PaymentMetadata = {
  amountUsd: number;
  exchangeRate: number;
  exchangeRateSource: string;
  exchangeRateUpdatedAt: number | null;
} & (
  | { kind: "vip"; subscriptionId: string; planId: string; durationDays: number; planName: string }
  | { kind: "invoice"; invoiceId: string }
  | { kind: "prepay"; jobId: string; inspectionFee: number; travelFee: number; heavy: boolean }
);
const PENDING_REDIRECT_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_INITIATION_TTL_MS = 5 * 60 * 1000;

function parsePendingPaymentMetadata(value: string | null): PaymentMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PaymentMetadata;
    if (
      !parsed ||
      !["vip", "invoice", "prepay"].includes(parsed.kind) ||
      !Number.isFinite(parsed.amountUsd) ||
      parsed.amountUsd <= 0 ||
      !Number.isSafeInteger(parsed.exchangeRate) ||
      parsed.exchangeRate <= 0 ||
      typeof parsed.exchangeRateSource !== "string" ||
      !(parsed.exchangeRateUpdatedAt === null || Number.isFinite(parsed.exchangeRateUpdatedAt)) ||
      (parsed.kind === "vip" && (typeof parsed.subscriptionId !== "string" || typeof parsed.planId !== "string")) ||
      (parsed.kind === "invoice" && typeof parsed.invoiceId !== "string") ||
      (parsed.kind === "prepay" && typeof parsed.jobId !== "string")
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resumePendingIntent(
  log: {
    id: string;
    code: string;
    userId: string | null;
    amount: unknown;
    status: string;
    gateway: string;
    paymentUrl: string | null;
    initiatedAt: Date;
    paymentId: string | null;
    description: string | null;
  },
  kind: PaymentMetadata["kind"],
  resourceId: string,
  expectedAmountIrr: unknown,
  isLiveProduction: boolean,
): Promise<NextResponse | null> {
  const metadata = parsePendingPaymentMetadata(log.description);
  if (!metadata || metadata.kind !== kind) {
    return NextResponse.json({ error: "یک پرداخت قبلی برای این حساب در انتظار تعیین تکلیف است" }, { status: 409 });
  }

  const matchesResource =
    (metadata.kind === "vip" && metadata.planId === resourceId) ||
    (metadata.kind === "invoice" && metadata.invoiceId === resourceId) ||
    (metadata.kind === "prepay" && metadata.jobId === resourceId);
  if (!matchesResource) {
    return NextResponse.json({ error: "ابتدا پرداخت در انتظار قبلی را تکمیل کنید" }, { status: 409 });
  }

  const ageMs = Date.now() - log.initiatedAt.getTime();
  const ttlMs = log.status === "INITIATED" ? PENDING_INITIATION_TTL_MS : PENDING_REDIRECT_TTL_MS;
  if (ageMs < 0) {
    return NextResponse.json({ error: "زمان درخواست پرداخت معتبر نیست؛ صفحه را تازه‌سازی کنید" }, { status: 409 });
  }

  if (ageMs > ttlMs) {
    const expired = await db.paymentGatewayLog.updateMany({
      where: { id: log.id, status: { in: ["INITIATED", "REDIRECTED"] } },
      data: { status: "CANCELLED" },
    });
    if (expired.count === 0) {
      return NextResponse.json({ error: "وضعیت پرداخت هم‌زمان تغییر کرد؛ صفحه را تازه‌سازی کنید" }, { status: 409 });
    }
    if (log.paymentId) {
      await db.payment.updateMany({
        where: { id: log.paymentId, status: "PENDING" },
        data: { status: "FAILED" },
      });
    }
    if (metadata.kind === "vip") {
      await db.userVipSubscription.updateMany({
        where: { id: metadata.subscriptionId, userId: log.userId ?? undefined, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
    }
    return null;
  }

  if (log.status !== "REDIRECTED" || !log.paymentUrl) {
    return NextResponse.json({ error: "درخواست پرداخت قبلی در حال آماده‌سازی است؛ چند لحظه دیگر دوباره تلاش کنید" }, { status: 409 });
  }

  try {
    const redirect = new URL(log.paymentUrl);
    const safeProtocol = redirect.protocol === "https:" || (!isLiveProduction && redirect.protocol === "http:");
    const allowedHosts: Record<string, string[]> = {
      ZARINPAL: ["www.zarinpal.com", "payment.zarinpal.com"],
      IDPAY: ["idpay.ir", "www.idpay.ir"],
    };
    const hostAllowed = (allowedHosts[log.gateway] ?? []).includes(redirect.hostname.toLowerCase());
    if (
      !safeProtocol ||
      Boolean(redirect.username) ||
      Boolean(redirect.password) ||
      (isLiveProduction && !hostAllowed)
    ) throw new Error("Unsafe stored payment URL");
  } catch {
    return NextResponse.json({ error: "نشانی درگاه ذخیره‌شده معتبر نیست؛ با پشتیبانی تماس بگیرید" }, { status: 409 });
  }

  if (!log.paymentId || Math.round(metadata.amountUsd * metadata.exchangeRate) !== Number(log.amount)) {
    return NextResponse.json({ error: "اطلاعات پرداخت قبلی معتبر نیست؛ با پشتیبانی تماس بگیرید" }, { status: 409 });
  }
  if (metadata.kind === "vip") {
    const subscription = await db.userVipSubscription.findUnique({
      where: { id: metadata.subscriptionId },
      select: { userId: true, status: true },
    });
    if (!subscription || subscription.userId !== log.userId || subscription.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ error: "اشتراک در انتظار پرداخت دیگر معتبر نیست" }, { status: 409 });
    }
  }

  const expected = typeof expectedAmountIrr === "number" ? expectedAmountIrr : null;
  if (
    (isLiveProduction && expected === null) ||
    (expected !== null && (!Number.isSafeInteger(expected) || expected !== Number(log.amount)))
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "AMOUNT_CHANGED",
        gatewayAmountIrr: Number(log.amount),
        amountUsd: metadata.amountUsd,
        exchangeRate: metadata.exchangeRate,
        currency: "IRR",
        reused: true,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    code: log.code,
    paymentUrl: log.paymentUrl,
    amount: Number(log.amount),
    currency: "IRR",
    reused: true,
  });
}


function gatewayType(provider: string): "ZARINPAL" | "IDPAY" | "SHAPARAK_SIM" {
  if (provider === "zarinpal") return "ZARINPAL";
  if (provider === "idpay") return "IDPAY";
  return "SHAPARAK_SIM";
}

export async function initiatePayment(req: Request, bodyOverride?: Record<string, unknown>) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "فقط حساب مشتری امکان پرداخت دارد" }, { status: 403 });
  }

  const userLimit = await rateLimitAsync("payment:initiate:user:" + session.userId, 5, 60_000);
  if (!userLimit.success) {
    return NextResponse.json({ error: "تعداد درخواست‌های پرداخت بیش از حد مجاز است" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(userLimit.resetMs / 1000)) },
    });
  }
  const ipLimit = await rateLimitAsync("payment:initiate:ip:" + getClientId(req), 20, 60_000);
  if (!ipLimit.success) {
    return NextResponse.json({ error: "تعداد درخواست‌ها از این آدرس بیش از حد مجاز است" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(ipLimit.resetMs / 1000)) },
    });
  }

  const body = bodyOverride ?? (await req.json().catch(() => null) as Record<string, unknown> | null);
  if (!body || typeof body !== "object" || typeof body.purpose !== "string") {
    return NextResponse.json({ error: "درخواست پرداخت نامعتبر است" }, { status: 400 });
  }

  const provider = getPaymentProviderStatus();
  if (!provider.configured) {
    return NextResponse.json({ error: "درگاه پرداخت عملیاتی پیکربندی نشده است" }, { status: 503 });
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, phone: true },
  });
  if (!user) return NextResponse.json({ error: "حساب کاربری یافت نشد" }, { status: 404 });

  const rateSnapshot = await getUsdIrrRateSnapshot({ forceRefresh: true });
  const isLiveProduction = process.env.NODE_ENV === "production" && process.env.DEPLOYMENT_ENV !== "staging";
  const rateError =
    !Number.isSafeInteger(rateSnapshot.rate) ||
    rateSnapshot.rate <= 0 ||
    (isLiveProduction && !rateSnapshot.trustedForPayments)
      ? NextResponse.json(
          { error: "نرخ تبدیل دلار به ریال برای پرداخت معتبر یا به‌روز نیست؛ لطفاً بعداً دوباره تلاش کنید" },
          { status: 503 },
        )
      : null;
  const exchangeRate = rateSnapshot.rate;
  const exchangeRateSource = rateSnapshot.source;
  const exchangeRateUpdatedAt = rateSnapshot.rateUpdatedAt;

  let amount = 0;
  let amountUsd = 0;
  let title = "";
  let metadata: PaymentMetadata;
  let pendingSubscriptionId: string | null = null;

  if (body.purpose === "vip" && typeof body.planId === "string" && body.planId.trim()) {
    const plan = await db.vipPlan.findFirst({ where: { id: body.planId, active: true } });
    if (!plan) return NextResponse.json({ error: "طرح اشتراک معتبر نیست" }, { status: 404 });
    const pendingGatewayLog = await db.paymentGatewayLog.findFirst({
      where: { userId: user.id, purpose: "vip", status: { in: ["INITIATED", "REDIRECTED"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (pendingGatewayLog) {
      const resumed = await resumePendingIntent(pendingGatewayLog, "vip", plan.id, body.expectedAmountIrr, isLiveProduction);
      if (resumed) return resumed;
    }
    if (rateError) return rateError;

    const pendingVip = await db.userVipSubscription.findFirst({
      where: { userId: user.id, status: "PENDING_PAYMENT" },
    });
    if (pendingVip) {
      const pendingAgeMs = pendingVip.createdAt instanceof Date
        ? Date.now() - pendingVip.createdAt.getTime()
        : 0;
      if (pendingAgeMs > PENDING_INITIATION_TTL_MS) {
        await db.userVipSubscription.updateMany({
          where: { id: pendingVip.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
      } else {
        return NextResponse.json({ error: "یک درخواست اشتراک در حال پرداخت دارید؛ ابتدا همان تراکنش را تعیین تکلیف کنید" }, { status: 409 });
      }
    }
    amountUsd = Math.round(Number(plan.priceUsd) * 100) / 100;
    amount = Math.round(amountUsd * exchangeRate);
    title = `اشتراک MEKANIX ${plan.name}`;
    const subscription = await db.userVipSubscription.create({
      data: { userId: user.id, planId: plan.id, status: "PENDING_PAYMENT" },
    });
    pendingSubscriptionId = subscription.id;
    metadata = {
      kind: "vip",
      subscriptionId: subscription.id,
      planId: plan.id,
      durationDays: plan.durationDays,
      planName: plan.name,
      amountUsd,
      exchangeRate,
      exchangeRateSource,
      exchangeRateUpdatedAt,
    };
  } else if (body.purpose === "invoice" && typeof body.invoiceId === "string" && body.invoiceId.trim()) {
    const invoice = await db.invoice.findUnique({
      where: { id: body.invoiceId },
      include: { job: { include: { request: { include: { customer: true } } } } },
    });
    if (!invoice) return NextResponse.json({ error: "صورتحساب یافت نشد" }, { status: 404 });
    if (invoice.job.request.customer.userId !== user.id) {
      return NextResponse.json({ error: "دسترسی به این صورتحساب مجاز نیست" }, { status: 403 });
    }
    if (invoice.status === "PAID" || invoice.status === "DRAFT") {
      return NextResponse.json({ error: "این صورتحساب در وضعیت قابل پرداخت نیست" }, { status: 409 });
    }
    const pendingGatewayLog = await db.paymentGatewayLog.findFirst({
      where: {
        userId: user.id,
        purpose: "invoice",
        status: { in: ["INITIATED", "REDIRECTED"] },
        description: { contains: invoice.id },
      },
      orderBy: { initiatedAt: "desc" },
    });
    if (pendingGatewayLog) {
      const resumed = await resumePendingIntent(pendingGatewayLog, "invoice", invoice.id, body.expectedAmountIrr, isLiveProduction);
      if (resumed) return resumed;
    }
    if (rateError) return rateError;
    amountUsd = Math.round(Number(invoice.total) * 100) / 100;
    amount = Math.round(amountUsd * exchangeRate);
    title = `پرداخت صورتحساب ${invoice.code}`;
    metadata = {
      kind: "invoice",
      invoiceId: invoice.id,
      amountUsd,
      exchangeRate,
      exchangeRateSource,
      exchangeRateUpdatedAt,
    };
  } else if (body.purpose === "prepay" && typeof body.jobId === "string" && body.jobId.trim()) {
    const job = await db.job.findUnique({
      where: { id: body.jobId },
      include: {
        request: { include: { customer: true, vehicle: true } },
        technician: true,
      },
    });
    if (!job) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    if (job.request.customer.userId !== user.id) {
      return NextResponse.json({ error: "دسترسی به این سفارش مجاز نیست" }, { status: 403 });
    }
    if (job.prepayPaid) return NextResponse.json({ error: "پیش‌پرداخت این سفارش قبلاً انجام شده است" }, { status: 409 });
    if (!job.technician) return NextResponse.json({ error: "مکانیک برای این سفارش تعیین نشده است" }, { status: 409 });
    const pendingGatewayLog = await db.paymentGatewayLog.findFirst({
      where: { userId: user.id, purpose: "prepay", status: { in: ["INITIATED", "REDIRECTED"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (pendingGatewayLog) {
      const resumed = await resumePendingIntent(pendingGatewayLog, "prepay", job.id, body.expectedAmountIrr, isLiveProduction);
      if (resumed) return resumed;
    }
    if (rateError) return rateError;

    const pendingPrepayment = await db.paymentGatewayLog.findFirst({
      where: {
        userId: user.id,
        purpose: "prepay",
        status: { in: ["INITIATED", "REDIRECTED"] },
        description: { contains: job.id },
      },
    });
    if (pendingPrepayment) {
      return NextResponse.json({ error: "برای این سفارش یک پرداخت در حال انجام وجود دارد" }, { status: 409 });
    }
    const heavy = job.request.vehicle.type !== "CAR";
    const inspectionFee = Number((heavy ? job.technician.inspectionFeeHeavy : job.technician.inspectionFee) ?? (heavy ? 20 : 7));
    const travelFee = Number(job.technician.travelFeeBase ?? 3);
    amountUsd = Math.round((inspectionFee + travelFee) * 100) / 100;
    amount = Math.round(amountUsd * exchangeRate);
    title = `پیش‌پرداخت سفارش ${job.code}`;
    metadata = {
      kind: "prepay",
      jobId: job.id,
      inspectionFee,
      travelFee,
      heavy,
      amountUsd,
      exchangeRate,
      exchangeRateSource,
      exchangeRateUpdatedAt,
    };
  } else {
    return NextResponse.json({ error: "نوع پرداخت یا شناسه مرجع معتبر نیست" }, { status: 400 });
  }

  if (
    !Number.isFinite(amountUsd) ||
    amountUsd <= 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json({ error: "مبلغ سفارش معتبر نیست" }, { status: 400 });
  }

  const expectedAmountIrr =
    typeof body.expectedAmountIrr === "number" ? body.expectedAmountIrr : null;
  if (
    (isLiveProduction && expectedAmountIrr === null) ||
    (expectedAmountIrr !== null &&
      (!Number.isSafeInteger(expectedAmountIrr) || expectedAmountIrr !== amount))
  ) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        error: "نرخ تبدیل به‌روزرسانی شده است؛ مبلغ جدید را بررسی و دوباره تأیید کنید",
        code: "AMOUNT_CHANGED",
        gatewayAmountIrr: amount,
        amountUsd,
        exchangeRate,
      },
      { status: 409 },
    );
  }

  const appUrl = process.env.APP_URL?.trim() || (process.env.NODE_ENV === "production" && process.env.DEPLOYMENT_ENV !== "staging" ? "" : new URL(req.url).origin);
  if (!appUrl) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json({ error: "APP_URL برای محیط عملیاتی تنظیم نشده است" }, { status: 503 });
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL("/api/gateway/callback", appUrl);
    if (process.env.NODE_ENV === "production" && process.env.DEPLOYMENT_ENV !== "staging" && !isPublicHttpsOrigin(appUrl)) {
      throw new Error("Production callback URL must use HTTPS");
    }
  } catch {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json({ error: "آدرس بازگشت درگاه معتبر نیست" }, { status: 503 });
  }

  const code = `PG-${randomUUID()}`;
  callbackUrl.searchParams.set("code", code);

  let pendingPayment: { id: string };
  try {
    if (metadata.kind === "invoice") {
      const existingPayment = await db.payment.findUnique({ where: { invoiceId: metadata.invoiceId } });
      if (existingPayment) {
        let canRetry = existingPayment.status === "FAILED" || existingPayment.status === "REFUNDED";
        if (existingPayment.status === "PENDING") {
          const previousLog = await db.paymentGatewayLog.findFirst({
            where: { paymentId: existingPayment.id },
            orderBy: { initiatedAt: "desc" },
          });
          canRetry = previousLog?.status === "FAILED" || previousLog?.status === "CANCELLED";
          if (!previousLog) {
            const paymentAgeMs = existingPayment.createdAt instanceof Date
              ? Date.now() - existingPayment.createdAt.getTime()
              : 0;
            if (paymentAgeMs > PENDING_INITIATION_TTL_MS) {
              await db.payment.updateMany({
                where: { id: existingPayment.id, status: "PENDING" },
                data: { status: "FAILED" },
              });
              canRetry = true;
            }
          }
        }
        if (!canRetry) {
          if (pendingSubscriptionId) await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } });
          return NextResponse.json({ error: "برای این صورتحساب یک پرداخت موفق یا در حال انجام وجود دارد" }, { status: 409 });
        }
        pendingPayment = await db.payment.update({
          where: { id: existingPayment.id },
          data: { code: `PAY-${randomUUID()}`, userId: user.id, amount: amountUsd, currency: "IRR", method: "gateway_pending", status: "PENDING" },
        });
      } else {
        pendingPayment = await db.payment.create({
          data: { code: `PAY-${randomUUID()}`, invoiceId: metadata.invoiceId, userId: user.id, amount: amountUsd, currency: "IRR", method: "gateway_pending", status: "PENDING" },
        });
      }
    } else {
      pendingPayment = await db.payment.create({
        data: { code: `PAY-${randomUUID()}`, invoiceId: null, userId: user.id, amount: amountUsd, currency: "IRR", method: "gateway_pending", status: "PENDING" },
      });
    }
  } catch (error) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "برای این صورتحساب یک پرداخت موفق یا در حال انجام وجود دارد" }, { status: 409 });
    }
    console.error("[payment] Could not reserve payment record:", error);
    return NextResponse.json({ error: "ثبت درخواست پرداخت ممکن نشد" }, { status: 500 });
  }

  let log: { id: string };
  try {
    log = await db.paymentGatewayLog.create({
      data: {
        code,
        userId: user.id,
        amount,
        currency: "IRR",
        gateway: gatewayType(provider.provider),
        status: "INITIATED",
        purpose: body.purpose,
        mobile: user.phone,
        description: JSON.stringify(metadata),
        paymentId: pendingPayment.id,
      },
    });
  } catch (error) {
    await db.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } }).catch(() => undefined);
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "یک پرداخت از همین نوع برای حساب شما در حال انجام است" }, { status: 409 });
    }
    console.error("[payment] Could not create gateway log:", error);
    return NextResponse.json({ error: "ثبت تراکنش در سامانه ممکن نشد" }, { status: 500 });
  }

  try {
    const result = await createPayment({
      amount,
      description: title,
      callbackUrl: callbackUrl.toString(),
      mobile: user.phone ?? undefined,
      orderId: code,
    });

    if (!result.success || !result.authority || !result.paymentUrl) {
      await db.paymentGatewayLog.update({ where: { id: log.id }, data: { status: "FAILED" } });
      await db.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
      if (pendingSubscriptionId) {
        await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } });
      }
      return NextResponse.json({ error: result.error || "ایجاد تراکنش در درگاه ناموفق بود" }, { status: 502 });
    }

    const paymentUrl = new URL(result.paymentUrl);
    const isProductionGateway =
      process.env.NODE_ENV === "production" && process.env.DEPLOYMENT_ENV !== "staging";
    const allowedGatewayHosts: Record<string, string[]> = {
      zarinpal: ["www.zarinpal.com", "payment.zarinpal.com"],
      idpay: ["idpay.ir", "www.idpay.ir"],
    };
    const allowedHosts = allowedGatewayHosts[provider.provider] || [];
    if (
      !["https:", "http:"].includes(paymentUrl.protocol) ||
      (isProductionGateway &&
        (paymentUrl.protocol !== "https:" ||
          !allowedHosts.includes(paymentUrl.hostname.toLowerCase()) ||
          Boolean(paymentUrl.username) ||
          Boolean(paymentUrl.password)))
    ) {
      await db.paymentGatewayLog.update({ where: { id: log.id }, data: { status: "FAILED" } });
      await db.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
      if (pendingSubscriptionId) {
        await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } });
      }
      return NextResponse.json({ error: "درگاه نشانی پرداخت امنی برنگرداند" }, { status: 502 });
    }

    const redirected = await db.paymentGatewayLog.updateMany({
      where: { id: log.id, status: "INITIATED" },
      data: { status: "REDIRECTED", referenceId: result.authority, paymentUrl: paymentUrl.toString() },
    });
    if (redirected.count === 0) {
      await db.payment.updateMany({ where: { id: pendingPayment.id, status: "PENDING" }, data: { status: "FAILED" } });
      if (pendingSubscriptionId) {
        await db.userVipSubscription.updateMany({
          where: { id: pendingSubscriptionId, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
      }
      return NextResponse.json({ error: "درخواست پرداخت منقضی شده است؛ دوباره تلاش کنید" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, code, paymentUrl: paymentUrl.toString(), amount, currency: "IRR" });
  } catch (error) {
    await db.paymentGatewayLog.update({ where: { id: log.id }, data: { status: "FAILED" } }).catch(() => undefined);
    await db.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } }).catch(() => undefined);
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    console.error("[payment] Failed to initiate gateway payment:", error);
    return NextResponse.json({ error: "در ایجاد تراکنش خطایی رخ داد" }, { status: 502 });
  }
}
