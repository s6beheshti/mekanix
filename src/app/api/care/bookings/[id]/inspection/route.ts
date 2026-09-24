import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { requireBookingParticipant, requireAssignedTechnician } from "@/lib/care-auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  // BOLA: verify caller is a participant of this booking (customer-owner, assigned technician, or admin)
  const authErr = await requireBookingParticipant(session, id);
  if (authErr) return authErr;

  const inspection = await db.inspection.findUnique({ where: { bookingId: id } });
  return NextResponse.json(inspection);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  // BOLA: only the ASSIGNED technician (or admin) may create/update inspection.
  // NOTE: previously the code did `booking.technicianId !== session.userId`, but
  // `booking.technicianId` references `Technician.id`, NOT `User.id`, so that check
  // always failed for legitimate technicians. Use the proper helper instead.
  const authErr = await requireAssignedTechnician(session, id);
  if (authErr) return authErr;

  const body = await req.json();

  // Atomic: upsert inspection + create timeline event together
  const inspection = await db.$transaction(async (tx) => {
    const upserted = await tx.inspection.upsert({
      where: { bookingId: id },
      create: {
        bookingId: id,
        results: JSON.stringify(body.results || {}),
        measurements: JSON.stringify(body.measurements || {}),
        images: JSON.stringify(body.images || []),
        technicianNotes: body.notes || null,
      },
      update: {
        results: JSON.stringify(body.results || {}),
        measurements: JSON.stringify(body.measurements || {}),
        images: JSON.stringify(body.images || []),
        technicianNotes: body.notes || null,
      },
    });

    await tx.serviceTimelineEvent.create({
      data: {
        bookingId: id,
        eventType: "inspection_started",
        actor: session.userId,
      },
    });

    return upserted;
  });

  return NextResponse.json(inspection);
}
