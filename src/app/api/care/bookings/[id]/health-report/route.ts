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

  const report = await db.vehicleHealthReport.findFirst({ where: { bookingId: id } });
  return NextResponse.json(report);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  // BOLA: only the ASSIGNED technician (or admin) may create/update health report
  const authErr = await requireAssignedTechnician(session, id);
  if (authErr) return authErr;

  const body = await req.json();

  // We need the booking's vehicleId for the health report create + care profile update.
  const booking = await db.serviceBooking.findUnique({
    where: { id },
    select: { id: true, vehicleId: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  }

  // Atomic: upsert health report + update care profile + create timeline event
  const report = await db.$transaction(async (tx) => {
    const upserted = await tx.vehicleHealthReport.upsert({
      where: { bookingId: id },
      create: {
        vehicleId: booking.vehicleId,
        bookingId: id,
        overallScore: body.overallScore || 90,
        engineScore: body.engineScore,
        oilScore: body.oilScore,
        brakeScore: body.brakeScore,
        batteryScore: body.batteryScore,
        tireScore: body.tireScore,
        filterScore: body.filterScore,
        fluidScore: body.fluidScore,
        coolingScore: body.coolingScore,
        beltScore: body.beltScore,
        leakScore: body.leakScore,
        diagnosticScore: body.diagnosticScore,
        categories: JSON.stringify(body.categories || {}),
        evidence: JSON.stringify(body.evidence || {}),
        technicianId: session.userId,
      },
      update: {
        overallScore: body.overallScore || 90,
        engineScore: body.engineScore,
        oilScore: body.oilScore,
        brakeScore: body.brakeScore,
        batteryScore: body.batteryScore,
        tireScore: body.tireScore,
        filterScore: body.filterScore,
        fluidScore: body.fluidScore,
        coolingScore: body.coolingScore,
        beltScore: body.beltScore,
        leakScore: body.leakScore,
        diagnosticScore: body.diagnosticScore,
        categories: JSON.stringify(body.categories || {}),
        evidence: JSON.stringify(body.evidence || {}),
      },
    });

    // Update vehicle care profile health score
    await tx.vehicleCareProfile.updateMany({
      where: { vehicleId: booking.vehicleId },
      data: { healthScore: body.overallScore || 90 },
    });

    await tx.serviceTimelineEvent.create({
      data: {
        bookingId: id,
        eventType: "health_report_created",
        actor: session.userId,
      },
    });

    return upserted;
  });

  return NextResponse.json(report);
}
