import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list mechanic applications. ADMIN-only.
// (Public cannot list — exposes applicant PII.)
export async function GET(req: Request) {
  // Check for admin session
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { verifySession } = await import("@/lib/auth");
  const session = await verifySession(auth.slice(7));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const list = await db.mechanicApplication.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: "desc" },
    include: { user: { include: { technician: true } } },
  });
  return NextResponse.json(list);
}

// POST: public — anyone can apply to become a mechanic.
// Body is sanitized: only allowed application fields are accepted.
const ALLOWED_APPLICATION_FIELDS = [
  "fullName", "phone", "email", "city", "experienceYears",
  "specialties", "certifications", "bio", "vehicleOwned",
] as const;

export async function POST(req: Request) {
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Mass-assignment protection: filter to allowed fields only
  const safe: Record<string, any> = {};
  for (const k of ALLOWED_APPLICATION_FIELDS) {
    if (k in body) safe[k] = body[k];
  }

  const { fullName, phone, email, city, experienceYears, specialties, certifications, bio, vehicleOwned } = safe;
  if (typeof fullName !== "string" || !fullName.trim() || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "Full name and phone are required" }, { status: 400 });
  }

  // Normalize phone format
  const normalizedPhone = phone.trim();
  const code = `APP-${Math.floor(1000 + Math.random() * 9000)}`;

  // Check if user with this phone already exists
  let user = await db.user.findUnique({ where: { phone: normalizedPhone } });

  if (!user) {
    user = await db.user.create({
      data: {
        name: fullName.slice(0, 100).trim(),
        phone: normalizedPhone,
        email: typeof email === "string" && email.trim()
          ? email.slice(0, 200).trim()
          : `mechanic+${normalizedPhone}@mekanix.io`,
        role: "TECHNICIAN",
        phoneVerified: true,
        avatar: `https://i.pravatar.cc/150?u=${normalizedPhone}`,
      },
    });
  } else {
    user = await db.user.update({
      where: { id: user.id },
      data: { role: "TECHNICIAN", phoneVerified: true },
    });
  }

  let tech = await db.technician.findUnique({ where: { userId: user.id } });
  if (!tech) {
    const specList = Array.isArray(specialties) ? specialties.slice(0, 20) : [];
    tech = await db.technician.create({
      data: {
        userId: user.id,
        bio: typeof bio === "string" ? bio.slice(0, 1000).trim() : "MEKANIX-verified mobile technician.",
        experienceYears: typeof experienceYears === "number" ? Math.max(0, Math.floor(experienceYears)) : 0,
        hourlyRate: 60,
        travelFeeBase: 15000,
        inspectionFee: 200000,
        status: "ONLINE",
        availableNow: true,
        verified: true,
        level: "SILVER",
        rating: 5,
        reviewCount: 0,
        completedJobs: 0,
        responseMins: 15,
        lat: 37.7749,
        lng: -122.4194,
        specialties: { create: specList.map((cat: string) => ({ category: String(cat).slice(0, 50), label: String(cat).replace("-", " ").slice(0, 50) })) },
        serviceAreas: {
          create: city
            ? [{ name: String(city).slice(0, 100), lat: 37.7749, lng: -122.4194, radiusKm: 25 }]
            : [{ name: "San Francisco", lat: 37.7749, lng: -122.4194, radiusKm: 25 }],
        },
      },
    });
  }

  const app = await db.mechanicApplication.upsert({
    where: { userId: user.id },
    create: {
      code,
      fullName: fullName.slice(0, 200).trim(),
      phone: normalizedPhone,
      email: typeof email === "string" ? email.slice(0, 200).trim() : null,
      city: typeof city === "string" ? city.slice(0, 100).trim() : null,
      experienceYears: typeof experienceYears === "number" ? Math.max(0, Math.floor(experienceYears)) : 0,
      specialties: JSON.stringify(Array.isArray(specialties) ? specialties.slice(0, 20) : []),
      certifications: certifications ? JSON.stringify(certifications).slice(0, 5000) : null,
      bio: typeof bio === "string" ? bio.slice(0, 1000).trim() : null,
      vehicleOwned: Boolean(vehicleOwned),
      status: "APPROVED",
      userId: user.id,
      reviewedAt: new Date(),
    },
    update: {
      fullName: fullName.slice(0, 200).trim(),
      phone: normalizedPhone,
      email: typeof email === "string" ? email.slice(0, 200).trim() : null,
      city: typeof city === "string" ? city.slice(0, 100).trim() : null,
      experienceYears: typeof experienceYears === "number" ? Math.max(0, Math.floor(experienceYears)) : 0,
      specialties: JSON.stringify(Array.isArray(specialties) ? specialties.slice(0, 20) : []),
      bio: typeof bio === "string" ? bio.slice(0, 1000).trim() : null,
      vehicleOwned: Boolean(vehicleOwned),
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ...app, autoApproved: true, userId: user.id });
}
