import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Subscribe user to a VIP plan.
// In production: this would go through the payment gateway first.
// Here: we simulate success (the gateway is separate). Once payment verified,
// we activate the subscription with startedAt=now and expiresAt=now+durationDays.
export async function POST(req: Request) {
  const { userId, planId, paymentId } = await req.json();
  if (!userId || !planId) {
    return NextResponse.json({ error: "userId and planId are required" }, { status: 400 });
  }

  const plan = await db.vipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
  }

  // Cancel any existing ACTIVE subscription for this user
  await db.userVipSubscription.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  const sub = await db.userVipSubscription.create({
    data: {
      userId,
      planId,
      status: "ACTIVE",
      startedAt,
      expiresAt,
      paymentId: paymentId ?? null,
    },
    include: { plan: true },
  });

  // Notify user
  await db.notification.create({
    data: {
      userId,
      type: "vip_activated",
      title: "VIP activated",
      body: `Your ${plan.name} plan is active until ${expiresAt.toLocaleDateString()}`,
      category: "system",
      link: "customer/settings",
    },
  });

  return NextResponse.json({ ok: true, subscription: sub });
}
