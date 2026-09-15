import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const include = {
  request: { include: { customer: { include: { user: true } }, vehicle: true } },
  technician: { include: { user: true, specialties: true } },
  parts: true,
  diagnosisRecords: true,
  invoice: true,
  reviews: true,
  messages: { include: { fromUser: true }, orderBy: { createdAt: "asc" } },
  tracking: { orderBy: { ts: "asc" } },
} as const;

// Assign a technician to a service request and create a Job in REQUESTED state.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { technicianId } = body;

  const sr = await db.serviceRequest.findUnique({ where: { id }, include: { vehicle: true } });
  if (!sr) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const tech = await db.technician.findUnique({ where: { id: technicianId } });
  if (!tech) return NextResponse.json({ error: "Technician not found" }, { status: 404 });

  // compute ETA from distance
  const km = tech.lat && tech.lng && sr.lat
    ? (() => {
        const R = 6371;
        const dLat = ((sr.lat - tech.lat) * Math.PI) / 180;
        const dLng = ((sr.lng - tech.lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((tech.lat * Math.PI) / 180) * Math.cos((sr.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
      })()
    : 10;
  const etaMins = Math.max(5, Math.round((km / 35) * 60) + tech.responseMins);

  await db.serviceRequest.update({ where: { id }, data: { status: "ASSIGNED", matchedTechId: technicianId } });

  const job = await db.job.create({
    data: {
      code: `JOB-${Math.floor(4000 + Math.random() * 5000)}`,
      requestId: id,
      technicianId,
      status: "REQUESTED",
      etaMins,
    },
    include,
  });

  // Notify the technician
  await db.notification.create({
    data: {
      userId: tech.userId,
      type: "new_request",
      title: "New job assigned",
      body: `${job.code} — ${sr.title}. ETA to customer ${etaMins} min.`,
      category: "job",
      link: "technician/requests",
    },
  });

  return NextResponse.json(job);
}
