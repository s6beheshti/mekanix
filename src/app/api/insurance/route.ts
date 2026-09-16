import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list insurance policies for a user (+ claims)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  // Expire policies past their endDate
  const now = new Date();
  await db.insurancePolicy.updateMany({
    where: { userId, status: "active", endDate: { lt: now } },
    data: { status: "expired" },
  });
  const policies = await db.insurancePolicy.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { vehicle: true, claims: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json(policies);
}

// POST: add a new insurance policy
export async function POST(req: Request) {
  const body = await req.json();
  const { userId, vehicleId, provider, policyNumber, type, startDate, endDate, premiumAmount, coverageAmount, notes } = body;
  if (!userId || !provider || !policyNumber || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const code = `POL-${Math.floor(6000 + Math.random() * 3000)}`;
  const policy = await db.insurancePolicy.create({
    data: {
      code,
      userId,
      vehicleId: vehicleId ?? null,
      provider,
      policyNumber,
      type: type ?? "third-party",
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      premiumAmount: parseFloat(premiumAmount) || 0,
      coverageAmount: parseFloat(coverageAmount) || 0,
      notes: notes ?? null,
      status: new Date(endDate) > new Date() ? "active" : "expired",
    },
    include: { vehicle: true },
  });
  return NextResponse.json(policy);
}
