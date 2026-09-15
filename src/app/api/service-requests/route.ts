import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const include = {
  customer: { include: { user: true } },
  vehicle: true,
  matchedTech: { include: { user: true } },
  job: {
    include: {
      technician: { include: { user: true } },
      invoice: true,
      reviews: true,
    },
  },
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  const technicianId = url.searchParams.get("technicianId");
  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (technicianId) where.matchedTechId = technicianId;
  const list = await db.serviceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include,
  });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  // generate a human-friendly code
  const code = `SR-${Math.floor(2000 + Math.random() * 8000)}`;
  const sr = await db.serviceRequest.create({
    data: {
      code,
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      category: body.category,
      urgency: body.urgency ?? "NORMAL",
      title: body.title,
      description: body.description ?? "",
      mediaUrls: JSON.stringify(body.mediaUrls ?? []),
      voiceNote: body.voiceNote ?? null,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      status: "OPEN",
    },
    include,
  });

  // Notify admin + matching technicians (demo: notify first 3 online techs in category)
  const techs = await db.technician.findMany({
    where: { availableNow: true, verified: true, ...(body.category ? { specialties: { some: { category: body.category } } } : {}) },
    take: 3,
  });
  for (const t of techs) {
    await db.notification.create({
      data: {
        userId: t.userId,
        type: "new_request",
        title: "New job match nearby",
        body: `${sr.code} — ${sr.title}`,
        category: "job",
        link: "technician/requests",
      },
    });
  }
  // Admin notification
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    await db.notification.create({
      data: {
        userId: admin.id,
        type: "new_request",
        title: "New service request",
        body: `${sr.code} — ${sr.title}`,
        category: "job",
        link: "admin/jobs",
      },
    });
  }

  return NextResponse.json(sr);
}
