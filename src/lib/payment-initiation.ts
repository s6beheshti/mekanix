import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { createPayment, getPaymentProviderStatus } from "@/lib/payment-provider";
import { rateLimitAsync, getClientId } from "@/lib/rate-limit";

type PaymentMetadata =
  | { kind: "vip"; subscriptionId: string; planId: string; durationDays: number; planName: string }
  | { kind: "invoice"; invoiceId: string }
  | { kind: "prepay"; jobId: string; inspectionFee: number; travelFee: number; heavy: boolean };

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

  let amount = 0;
  let title = "";
  let metadata: PaymentMetadata;
  let pendingSubscriptionId: string | null = null;

  if (body.purpose === "vip" && typeof body.planId === "string" && body.planId.trim()) {
    const plan = await db.vipPlan.findFirst({ where: { id: body.planId, active: true } });
    if (!plan) return NextResponse.json({ error: "طرح اشتراک معتبر نیست" }, { status: 404 });
    amount = Math.round(Number(plan.priceIrr));
    title = `اشتراک MEKANIX ${plan.name}`;
    const subscription = await db.userVipSubscription.create({
      data: { userId: user.id, planId: plan.id, status: "PENDING_PAYMENT" },
    });
    pendingSubscriptionId = subscription.id;
    metadata = { kind: "vip", subscriptionId: subscription.id, planId: plan.id, durationDays: plan.durationDays, planName: plan.name };
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
    amount = Math.round(Number(invoice.total));
    title = `پرداخت صورتحساب ${invoice.code}`;
    metadata = { kind: "invoice", invoiceId: invoice.id };
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
    const heavy = job.request.vehicle.type !== "CAR";
    const inspectionFee = Number((heavy ? job.technician.inspectionFeeHeavy : job.technician.inspectionFee) ?? (heavy ? 20 : 7));
    const travelFee = Number(job.technician.travelFeeBase ?? 3);
    amount = Math.round(inspectionFee + travelFee);
    title = `پیش‌پرداخت سفارش ${job.code}`;
    metadata = { kind: "prepay", jobId: job.id, inspectionFee, travelFee, heavy };
  } else {
    return NextResponse.json({ error: "نوع پرداخت یا شناسه مرجع معتبر نیست" }, { status: 400 });
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json({ error: "مبلغ سفارش معتبر نیست" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL?.trim() || (process.env.NODE_ENV === "production" ? "" : new URL(req.url).origin);
  if (!appUrl) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    return NextResponse.json({ error: "APP_URL برای محیط عملیاتی تنظیم نشده است" }, { status: 503 });
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL("/api/gateway/callback", appUrl);
    if (process.env.NODE_ENV === "production" && callbackUrl.protocol !== "https:") {
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
        }
        if (!canRetry) {
          if (pendingSubscriptionId) await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } });
          return NextResponse.json({ error: "برای این صورتحساب یک پرداخت موفق یا در حال انجام وجود دارد" }, { status: 409 });
        }
        pendingPayment = await db.payment.update({
          where: { id: existingPayment.id },
          data: { code: `PAY-${randomUUID()}`, userId: user.id, amount, currency: "IRR", method: "gateway_pending", status: "PENDING" },
        });
      } else {
        pendingPayment = await db.payment.create({
          data: { code: `PAY-${randomUUID()}`, invoiceId: metadata.invoiceId, userId: user.id, amount, currency: "IRR", method: "gateway_pending", status: "PENDING" },
        });
      }
    } else {
      pendingPayment = await db.payment.create({
        data: { code: `PAY-${randomUUID()}`, invoiceId: null, userId: user.id, amount, currency: "IRR", method: "gateway_pending", status: "PENDING" },
      });
    }
  } catch (error) {
    if (pendingSubscriptionId) {
      await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } }).catch(() => undefined);
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
    if (
      !["https:", "http:"].includes(paymentUrl.protocol) ||
      (process.env.NODE_ENV === "production" && paymentUrl.protocol !== "https:")
    ) {
      await db.paymentGatewayLog.update({ where: { id: log.id }, data: { status: "FAILED" } });
      await db.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
      if (pendingSubscriptionId) {
        await db.userVipSubscription.update({ where: { id: pendingSubscriptionId }, data: { status: "CANCELLED" } });
      }
      return NextResponse.json({ error: "درگاه نشانی پرداخت امنی برنگرداند" }, { status: 502 });
    }

    await db.paymentGatewayLog.update({
      where: { id: log.id },
      data: { status: "REDIRECTED", referenceId: result.authority },
    });

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
