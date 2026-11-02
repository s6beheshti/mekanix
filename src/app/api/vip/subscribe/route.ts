import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

// VIP activation is permitted only against a server-verified payment.
// userId is always taken from the authenticated session, never the request body.
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "CUSTOMER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  let body: { planId?: unknown; paymentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const planId = body.planId;
  const paymentId = body.paymentId;
  if (typeof planId !== "string" || !planId || typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json({ error: "planId and verified paymentId are required" }, { status: 400 });
  }

  const userId = session.userId;
  const [plan, payment, verifiedLog] = await Promise.all([
    db.vipPlan.findUnique({ where: { id: planId } }),
    db.payment.findUnique({ where: { id: paymentId } }),
    db.paymentGatewayLog.findFirst({
      where: { paymentId, purpose: "vip", status: "VERIFIED" },
    }),
  ]);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
  }
  if (!payment || payment.userId !== userId || payment.status !== "SUCCEEDED" || !verifiedLog) {
    return NextResponse.json({ error: "پرداخت معتبر و تأییدشده برای این طرح پیدا نشد" }, { status: 403 });
  }
  if (Math.round(Number(payment.amount)) !== Math.round(Number(plan.priceIrr))) {
    return NextResponse.json({ error: "مبلغ پرداخت با مبلغ طرح VIP مطابقت ندارد" }, { status: 409 });
  }
  if (verifiedLog.description !== "VIP_PLAN:" + plan.id) {
    return NextResponse.json({ error: "پرداخت برای این طرح ثبت نشده است" }, { status: 409 });
  }

  const existing = await db.userVipSubscription.findFirst({
    where: { paymentId, userId },
    include: { plan: true },
  });
  if (existing) return NextResponse.json({ ok: true, subscription: existing });

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
  const subscription = await db.$transaction(async (tx) => {
    await tx.userVipSubscription.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    const created = await tx.userVipSubscription.create({
      data: {
        userId,
        planId,
        status: "ACTIVE",
        startedAt,
        expiresAt,
        paymentId,
      },
      include: { plan: true },
    });
    await tx.notification.create({
      data: {
        userId,
        type: "vip_activated",
        title: "VIP activated",
        body: "Your " + plan.name + " plan is active until " + expiresAt.toLocaleDateString(),
        category: "system",
        link: "customer/settings",
      },
    });
    return created;
  });

  return NextResponse.json({ ok: true, subscription });
}
