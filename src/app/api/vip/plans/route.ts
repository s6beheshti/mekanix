import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// List all active VIP plans (sorted by order)
export async function GET() {
  const plans = await db.vipPlan.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    include: { subscriptions: false },
  });
  return NextResponse.json(plans);
}
