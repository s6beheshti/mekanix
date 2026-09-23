import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const body = await req.json();
  const { approvalId } = body;

  if (!approvalId) {
    return NextResponse.json({ error: "approvalId الزامی است" }, { status: 400 });
  }

  // Verify booking ownership
  const booking = await db.serviceBooking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  if (booking.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  // Update approval status
  const approval = await db.customerApproval.update({
    where: { id: approvalId },
    data: {
      status: "CUSTOMER_APPROVED",
      approvedAt: new Date(),
    },
  });

  // Update finding status
  if (approval.findingId) {
    await db.finding.update({
      where: { id: approval.findingId },
      data: { status: "APPROVED" },
    });
  }

  // Create timeline event
  await db.serviceTimelineEvent.create({
    data: {
      bookingId: id,
      eventType: "customer_approved",
      actor: session.userId,
      metadata: JSON.stringify({ approvalId }),
    },
  });

  return NextResponse.json({ ok: true, approval });
}
