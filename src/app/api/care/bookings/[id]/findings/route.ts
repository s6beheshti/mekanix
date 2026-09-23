import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const findings = await db.finding.findMany({ where: { bookingId: id }, include: { approvals: true } });
  return NextResponse.json(findings);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (session.role !== "TECHNICIAN" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Technician only" }, { status: 403 });
  }
  const body = await req.json();
  const finding = await db.finding.create({
    data: { bookingId: id, category: body.category, title: body.title, description: body.description, severity: body.severity || "MEDIUM", evidence: JSON.stringify(body.evidence || {}), recommendedAction: body.recommendedAction || null },
  });
  await db.serviceTimelineEvent.create({ data: { bookingId: id, eventType: "extra_proposal", actor: session.userId, metadata: JSON.stringify({ findingId: finding.id }) } });
  return NextResponse.json(finding);
}
