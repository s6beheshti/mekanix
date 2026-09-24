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

  const findings = await db.finding.findMany({ where: { bookingId: id }, include: { approvals: true } });
  return NextResponse.json(findings);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  // BOLA: only the ASSIGNED technician (or admin) may create findings for this booking
  const authErr = await requireAssignedTechnician(session, id);
  if (authErr) return authErr;

  const body = await req.json();

  // Atomic: create finding + timeline event together
  const finding = await db.$transaction(async (tx) => {
    const created = await tx.finding.create({
      data: {
        bookingId: id,
        category: body.category,
        title: body.title,
        description: body.description,
        severity: body.severity || "MEDIUM",
        evidence: JSON.stringify(body.evidence || {}),
        recommendedAction: body.recommendedAction || null,
      },
    });
    await tx.serviceTimelineEvent.create({
      data: {
        bookingId: id,
        eventType: "extra_proposal",
        actor: session.userId,
        metadata: JSON.stringify({ findingId: created.id }),
      },
    });
    return created;
  });

  return NextResponse.json(finding);
}
