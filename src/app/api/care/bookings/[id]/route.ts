import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/care/bookings/[id] — booking details
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const booking = await db.serviceBooking.findUnique({
    where: { id },
    include: {
      package: { include: { items: true } },
      timeline: { orderBy: { timestamp: "asc" } },
      findings: true,
      approvals: true,
      partUsages: true,
      healthReport: true,
      inspection: true,
    },
  });

  if (!booking) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  if (booking.userId !== session.userId && session.role !== "ADMIN") {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  // Get pricing snapshot if exists
  let pricing = null;
  if (booking.pricingSnapshotId) {
    pricing = await db.pricingSnapshot.findUnique({ where: { id: booking.pricingSnapshotId } });
  }

  return NextResponse.json({ ...booking, pricing });
}
