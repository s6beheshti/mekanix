import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const techInclude = {
  user: true,
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const category = url.searchParams.get("category");

  const where: any = { availableNow: true, verified: true };
  if (category) {
    where.specialties = { some: { category } };
  }

  let techs = await db.technician.findMany({ where, include: techInclude });

  // distance sort + arrival estimate
  if (lat && lng) {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    const R = 6371;
    const dist = (t: { lat: number | null; lng: number | null }) => {
      if (t.lat == null || t.lng == null) return 9999;
      const dLat = ((la - t.lat) * Math.PI) / 180;
      const dLng = ((ln - t.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((la * Math.PI) / 180) *
          Math.cos((t.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };
    techs = techs
      .map((t) => ({ ...t, _dist: dist(t) }))
      .sort((a, b) => (a._dist as number) - (b._dist as number));
  }

  return NextResponse.json(techs);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, specialties = [], certifications = [], serviceAreas = [], ...rest } = body;
  const tech = await db.technician.create({
    data: {
      userId,
      ...rest,
      specialties: { create: specialties },
      certifications: { create: certifications },
      serviceAreas: { create: serviceAreas },
    },
    include: techInclude,
  });
  return NextResponse.json(tech);
}
