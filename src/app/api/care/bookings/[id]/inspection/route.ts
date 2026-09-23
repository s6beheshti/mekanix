import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const inspection = await db.inspection.findUnique({ where: { bookingId: id } });
  return NextResponse.json(inspection);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const body = await req.json();
  const booking = await db.serviceBooking.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (session.role === "TECHNICIAN" && booking.technicianId !== session.userId) {
    return NextResponse.json({ error: "Not assigned" }, { status: 403 });
  }
  const inspection = await db.inspection.upsert({
    where: { bookingId: id },
    create: { bookingId: id, results: JSON.stringify(body.results || {}), measurements: JSON.stringify(body.measurements || {}), images: JSON.stringify(body.images || []), technicianNotes: body.notes || null },
    update: { results: JSON.stringify(body.results || {}), measurements: JSON.stringify(body.measurements || {}), images: JSON.stringify(body.images || []), technicianNotes: body.notes || null },
  });
  await db.serviceTimelineEvent.create({ data: { bookingId: id, eventType: "inspection_started", actor: session.userId } });
  return NextResponse.json(inspection);
}
