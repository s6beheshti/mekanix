import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const { planId, paymentId } = await req.json();
  if (!planId || !paymentId) {
    return NextResponse.json({ error: "planId and paymentId are required" }, { status: 400 });
  }

  const plan = await db.vipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
  }

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== session.userId) {
    return NextResponse.json({ error: "پرداخت یافت نشد یا متعلق به این کاربر نیست" }, { status: 403 });
  }
  if (payment.status !== "SUCCEEDED") {
    return NextResponse.json({ error: "پرداخت تایید نشده است" }, { status: 409 });
  }

  const existingPaymentSub = await db.userVipSubscription.findFirst({
    where: { userId: session.userId, paymentId },
  });
  if (existingPaymentSub) {
    return NextResponse.json({ ok: true, subscription: existingPaymentSub });
  }

  await db.userVipSubscription.updateMany({
    where: { userId: session.userId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  const sub = await db.userVipSubscription.create({
    data: {
      userId: session.userId,
      planId,
      status: "ACTIVE",
      startedAt,
      expiresAt,
      paymentId,
    },
    include: { plan: true },
  });

  await db.notification.create({
    data: {
      userId: session.userId,
      type: "vip_activated",
      title: "VIP activated",
      body: `Your ${plan.name} plan is active until ${expiresAt.toLocaleDateString()}`,
      category: "system",
      link: "customer/settings",
    },
  });

  return NextResponse.json({ ok: true, subscription: sub });
}
