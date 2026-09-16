import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Release any PENDING wallet transactions whose holdUntil has passed,
// moving them to AVAILABLE status and transferring balance from pending to available.
// Also returns the wallet + recent transactions for the requested technician.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const technicianId = url.searchParams.get("technicianId");

  if (!technicianId) {
    return NextResponse.json({ error: "technicianId is required" }, { status: 400 });
  }

  // Find or create wallet
  let wallet = await db.wallet.findUnique({
    where: { technicianId },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
      withdrawals: { orderBy: { requestedAt: "desc" }, take: 20 },
    },
  });
  if (!wallet) {
    wallet = await db.wallet.create({
      data: { technicianId },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 50 },
        withdrawals: { orderBy: { requestedAt: "desc" }, take: 20 },
      },
    });
  }

  // Auto-release: any PENDING txns with holdUntil < now → AVAILABLE
  const now = new Date();
  const releasable = wallet.transactions.filter(
    (t) => t.status === "PENDING" && t.holdUntil && t.holdUntil.getTime() < now.getTime()
  );
  for (const t of releasable) {
    await db.walletTransaction.update({
      where: { id: t.id },
      data: { status: "AVAILABLE", releasedAt: now },
    });
    await db.wallet.update({
      where: { id: wallet.id },
      data: {
        pendingBalance: { decrement: t.netAmount },
        balance: { increment: t.netAmount },
      },
    });
  }

  // Re-fetch updated wallet
  const fresh = await db.wallet.findUnique({
    where: { technicianId },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
      withdrawals: { orderBy: { requestedAt: "desc" }, take: 20 },
    },
  });

  return NextResponse.json(fresh);
}
