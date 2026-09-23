import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (session.role !== "TECHNICIAN" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Technician only" }, { status: 403 });
  }
  const body = await req.json();
  const booking = await db.serviceBooking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  
  // Create finding first (if not linked to existing one)
  let findingId = body.findingId;
  if (!findingId && body.finding) {
    const f = await db.finding.create({ data: { bookingId: id, category: body.finding.category || "general", title: body.finding.title, description: body.finding.description, severity: body.finding.severity || "MEDIUM" } });
    findingId = f.id;
  }

  const approval = await db.customerApproval.create({
    data: {
      bookingId: id, findingId: findingId || null,
      proposedItem: body.proposedItem, description: body.description || null,
      partName: body.partName || null, partBrand: body.partBrand || null, partNumber: body.partNumber || null,
      partType: body.partType || "OEM", quantity: body.quantity || 1,
      partPrice: body.partPrice || 0, laborPrice: body.laborPrice || 0,
      totalPrice: (body.partPrice || 0) * (body.quantity || 1) + (body.laborPrice || 0),
      imageUrl: body.imageUrl || null, technicianNote: body.technicianNote || null,
      status: "PROPOSED",
    },
  });

  // Update booking status
  await db.serviceBooking.update({ where: { id }, data: { status: "WAITING_CUSTOMER_APPROVAL" } });
  await db.serviceTimelineEvent.create({ data: { bookingId: id, eventType: "extra_proposal", actor: session.userId, metadata: JSON.stringify({ approvalId: approval.id }) } });
  
  // Notify customer
  await db.notification.create({ data: { userId: booking.userId, type: "extra_proposal", title: "پیشنهاد هزینه اضافه", body: `${body.proposedItem} — ${(body.partPrice || 0) * (body.quantity || 1) + (body.laborPrice || 0)} تومان`, category: "job", link: "care-detail" } });

  return NextResponse.json(approval);
}
