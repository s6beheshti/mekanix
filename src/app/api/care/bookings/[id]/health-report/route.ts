import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const report = await db.vehicleHealthReport.findFirst({ where: { bookingId: id } });
  return NextResponse.json(report);
}

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

  const report = await db.vehicleHealthReport.upsert({
    where: { bookingId: id },
    create: {
      vehicleId: booking.vehicleId, bookingId: id,
      overallScore: body.overallScore || 90,
      engineScore: body.engineScore, oilScore: body.oilScore, brakeScore: body.brakeScore,
      batteryScore: body.batteryScore, tireScore: body.tireScore, filterScore: body.filterScore,
      fluidScore: body.fluidScore, coolingScore: body.coolingScore, beltScore: body.beltScore,
      leakScore: body.leakScore, diagnosticScore: body.diagnosticScore,
      categories: JSON.stringify(body.categories || {}), evidence: JSON.stringify(body.evidence || {}),
      technicianId: session.userId,
    },
    update: {
      overallScore: body.overallScore || 90,
      engineScore: body.engineScore, oilScore: body.oilScore, brakeScore: body.brakeScore,
      batteryScore: body.batteryScore, tireScore: body.tireScore, filterScore: body.filterScore,
      fluidScore: body.fluidScore, coolingScore: body.coolingScore, beltScore: body.beltScore,
      leakScore: body.leakScore, diagnosticScore: body.diagnosticScore,
      categories: JSON.stringify(body.categories || {}), evidence: JSON.stringify(body.evidence || {}),
    },
  });

  // Update vehicle care profile health score
  await db.vehicleCareProfile.updateMany({ where: { vehicleId: booking.vehicleId }, data: { healthScore: body.overallScore || 90 } });
  await db.serviceTimelineEvent.create({ data: { bookingId: id, eventType: "health_report_created", actor: session.userId } });

  return NextResponse.json(report);
}
