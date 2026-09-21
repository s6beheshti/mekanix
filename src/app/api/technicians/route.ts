import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const techInclude = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

// Public-facing technician fields — never expose sensitive data (password, etc.).
// The User model includes `password` (demo only) so we MUST select explicitly.
const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  phone: true,
  avatar: true,
  role: true,
  status: true,
  country: true,
  currency: true,
  language: true,
  createdAt: true,
} as const;

// GET /api/technicians — public listing (no auth required).
// Selects only safe fields (no password, no sensitive data).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const category = url.searchParams.get("category");

  const where: any = { availableNow: true, verified: true };
  if (category) {
    where.specialties = { some: { category } };
  }

  let techs = await db.technician.findMany({
    where,
    include: {
      user: { select: PUBLIC_USER_FIELDS },
      ...techInclude,
    },
  });

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

// POST: create technician profile — ADMIN ONLY (not used by public).
// We leave this as a simple pass-through; in production this should be admin-protected.
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
    include: {
      user: { select: PUBLIC_USER_FIELDS },
      ...techInclude,
    },
  });
  return NextResponse.json(tech);
}
