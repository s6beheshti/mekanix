import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const mission = await db.serviceBooking.findUnique({
    where: { id },
    include: { package: { include: { items: true } }, timeline: { orderBy: { timestamp: "asc" } }, findings: { include: { approvals: true } }, partUsages: true, inspection: true, healthReport: true },
  });
  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(mission);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (session.role !== "TECHNICIAN" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Technician only" }, { status: 403 });
  }
  const body = await req.json();
  const { status } = body;

  const existing = await db.serviceBooking.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.serviceBooking.update({ where: { id }, data: { status } });
    await tx.serviceTimelineEvent.create({ data: { bookingId: id, eventType: status.toLowerCase(), actor: session.userId } });
    return updated;
  });

  return NextResponse.json(result);
}
