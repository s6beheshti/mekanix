import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Get the current active VIP subscription for a user
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Expire any active subscriptions past their expiry
  const now = new Date();
  await db.userVipSubscription.updateMany({
    where: { userId, status: "ACTIVE", expiresAt: { not: null, lt: now } },
    data: { status: "EXPIRED" },
  });

  const subscription = await db.userVipSubscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ subscription });
}
