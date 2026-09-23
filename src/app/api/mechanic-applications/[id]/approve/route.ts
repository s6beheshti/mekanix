import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySession, requireRole } from "@/lib/auth";

// POST /api/mechanic-applications/[id]/approve — ADMIN ONLY.
// Approves a mechanic application → creates a User (TECHNICIAN) + Technician profile.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await verifySession(auth.slice(7));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forbidden = requireRole(session, "ADMIN");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const app = await db.mechanicApplication.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (app.status === "APPROVED") return NextResponse.json({ error: "Already approved" }, { status: 400 });

  // Create or link the user
  let user = await db.user.findUnique({ where: { phone: app.phone } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: app.fullName,
        phone: app.phone,
        email: app.email || `mechanic+${app.phone}@mekanix.io`,
        role: "TECHNICIAN",
        phoneVerified: true,
        avatar: `https://i.pravatar.cc/150?u=${app.phone}`,
      },
    });
  } else {
    user = await db.user.update({ where: { id: user.id }, data: { role: "TECHNICIAN", phoneVerified: true } });
  }

  let tech = await db.technician.findUnique({ where: { userId: user.id } });
  if (!tech) {
    const specialties = JSON.parse(app.specialties || "[]") as string[];
    const certs = (JSON.parse(app.certifications || "[]") as any[]) ?? [];
    tech = await db.technician.create({
      data: {
        userId: user.id,
        bio: app.bio || "MEKANIX-verified mobile technician.",
        experienceYears: app.experienceYears,
        hourlyRate: 60,
        travelFeeBase: 18,
        status: "ONLINE",
        availableNow: true,
        verified: true,
        level: "SILVER",
        rating: 5,
        reviewCount: 0,
        completedJobs: 0,
        responseMins: 15,
        lat: 35.6892,
        lng: 51.3890,
        specialties: { create: specialties.map((cat: string) => ({ category: cat, label: cat.replace("-", " ") })) },
        certifications: {
          create: certs.map((c: any) => ({ name: c.name || c, issuer: c.issuer || "Self-reported", year: c.year || new Date().getFullYear(), verified: false })),
        },
        serviceAreas: {
          create: app.city ? [{ name: app.city, lat: 35.6892, lng: 51.3890, radiusKm: 25 }] : [{ name: "Tehran", lat: 35.6892, lng: 51.3890, radiusKm: 25 }],
        },
      },
      include: { user: true, specialties: true },
    });
  }

  const updated = await db.mechanicApplication.update({
    where: { id },
    data: { status: "APPROVED", userId: user.id, reviewerId: body.reviewerId || null, reviewedAt: new Date(), adminNotes: body.notes || null },
    include: { user: { include: { technician: true } } },
  });

  await db.notification.create({
    data: {
      userId: user.id,
      type: "review_request",
      title: "Welcome to MEKANIX!",
      body: "Your application was approved. You can now receive service requests.",
      category: "system",
      link: "technician/requests",
    },
  });

  return NextResponse.json({ application: updated, user, technician: tech });
}
