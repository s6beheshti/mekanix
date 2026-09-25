import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { rateLimitAsync, getClientId, RATE_LIMITS } from "@/lib/rate-limit";

// POST /api/payments
// Records a payment against an invoice.
// - userId is derived from the session — NEVER from the request body (BOLA).
// - Only the customer who owns the job can pay their own invoice.
// - Status transitions to PAID happen ONLY here (after simulated gateway verify).
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  // Tighter rate limit on payments — uses Redis-backed `rateLimitAsync()`
  // so the budget is shared across instances when REDIS_URL is set.
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invoiceId, method } = body;
  if (typeof invoiceId !== "string" || !invoiceId) {
    return NextResponse.json({ error: "invoiceId الزامی است" }, { status: 400 });
  }

  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { job: { include: { request: { include: { customer: true } }, technician: true } } },
  });
  if (!inv) return NextResponse.json({ error: "فاکتور یافت نشد" }, { status: 404 });

  // Resolve payer from SESSION — server-authoritative
  if (session.role === "ADMIN") {
    // Admins can pay on behalf (rare); fall through with admin's userId
  } else if (session.role === "CUSTOMER") {
    // The customer paying must own this invoice's job's request
    const job = inv.job;
    if (!job || !job.request || !job.request.customer) {
      return NextResponse.json({ error: "نمی‌توان پرداخت‌کننده را تشخیص داد" }, { status: 400 });
    }
    if (job.request.customer.userId !== session.userId) {
      return NextResponse.json(
        { error: "شما مالک این فاکتور نیستید" },
        { status: 403 }
      );
    }
  } else {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  const userId = session.userId;
  if (!userId) return NextResponse.json({ error: "Unable to resolve payer" }, { status: 400 });

  // simulate processing — 95% success
  const ok = Math.random() > 0.05;
  const status = ok ? "SUCCEEDED" : "FAILED";
  const safeMethod = ["card", "wallet", "bank", "cash"].includes(method) ? method : "card";

  const existing = await db.payment.findUnique({ where: { invoiceId } });
  if (existing) {
    const updated = await db.payment.update({
      where: { id: existing.id },
      data: { status, method: safeMethod },
    });
    if (ok) {
      await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      await db.job.update({ where: { id: inv.jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
      await db.warranty.create({ data: { jobId: inv.jobId, months: 6, active: true } }).catch(() => {});
      if (inv.job?.technician?.userId) {
        await db.notification.create({
          data: {
            userId: inv.job.technician.userId,
            type: "job_completed",
            title: "Payment received",
            body: `Invoice ${inv.code} paid — $${inv.total}`,
            category: "payment",
            link: "technician/earnings",
          },
        });
      }
    }
    return NextResponse.json(updated);
  }

  const pay = await db.payment.create({
    data: {
      code: `PAY-${Math.floor(5000 + Math.random() * 4000)}`,
      invoiceId,
      userId,
      amount: inv.total,
      currency: inv.currency,
      method: safeMethod,
      status,
    },
  });

  if (ok) {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    await db.job.update({ where: { id: inv.jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await db.warranty.create({ data: { jobId: inv.jobId, months: 6, active: true } }).catch(() => {});
    if (inv.job?.technician?.userId) {
      await db.notification.create({
        data: {
          userId: inv.job.technician.userId,
          type: "job_completed",
          title: "Payment received",
          body: `Invoice ${inv.code} paid — $${inv.total}`,
          category: "payment",
          link: "technician/earnings",
        },
      });
    }
  }
  return NextResponse.json(pay);
}
