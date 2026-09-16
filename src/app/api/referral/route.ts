import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list user's referrals + stats
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const referrals = await db.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
    include: { referredUser: true },
  });
  const stats = {
    total: referrals.length,
    signedUp: referrals.filter((r) => r.status === "signed_up" || r.status === "first_job" || r.status === "rewarded").length,
    firstJob: referrals.filter((r) => r.status === "first_job" || r.status === "rewarded").length,
    earned: referrals.filter((r) => r.rewardClaimed).reduce((s, r) => s + r.rewardAmount, 0),
    available: referrals.filter((r) => r.status === "first_job" && !r.rewardClaimed).reduce((s, r) => s + r.rewardAmount, 0),
  };
  return NextResponse.json({ referrals, stats });
}

// POST: get-or-create a referral code for a user
export async function POST(req: Request) {
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  // Check if user already has a referral code
  const existing = await db.referral.findFirst({ where: { referrerId: userId } });
  if (existing) return NextResponse.json({ code: existing.code });
  // Generate a unique code based on user's phone/name
  const user = await db.user.findUnique({ where: { id: userId } });
  const prefix = user?.name?.slice(0, 3).toUpperCase() ?? "MEK";
  const code = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  const referral = await db.referral.create({
    data: { code, referrerId: userId, status: "pending" },
  });
  return NextResponse.json({ code: referral.code });
}

// PATCH: claim a reward
export async function PATCH(req: Request) {
  const body = await req.json();
  const { referralId, action } = body;
  if (action !== "claim" || !referralId) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const updated = await db.referral.update({
    where: { id: referralId },
    data: { rewardClaimed: true, status: "rewarded", completedAt: new Date() },
  });
  // Notify referrer
  await db.notification.create({
    data: {
      userId: updated.referrerId,
      type: "referral_rewarded",
      title: "Referral reward claimed!",
      body: `You earned $${updated.rewardAmount} from your referral.`,
      category: "system",
      link: "customer/referral",
    },
  });
  return NextResponse.json({ ok: true, referral: updated });
}
