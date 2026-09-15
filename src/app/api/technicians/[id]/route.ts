import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tech = await db.technician.findUnique({
    where: { id },
    include: {
      user: true,
      specialties: true,
      certifications: true,
      serviceAreas: true,
      reviews: { include: { fromUser: true }, orderBy: { createdAt: "desc" }, take: 20 },
      jobsAssigned: {
        where: { status: "COMPLETED" },
        take: 8,
        orderBy: { completedAt: "desc" },
        include: { request: { include: { vehicle: true } } },
      },
    },
  });
  if (!tech) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tech);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const tech = await db.technician.update({ where: { id }, data: body, include: { user: true } });
  return NextResponse.json(tech);
}
