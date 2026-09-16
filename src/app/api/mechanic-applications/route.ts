import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const list = await db.mechanicApplication.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: "desc" },
    include: { user: { include: { technician: true } } },
  });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { fullName, phone, email, city, experienceYears, specialties, certifications, bio, vehicleOwned } = body;
  if (!fullName?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "Full name and phone are required" }, { status: 400 });
  }
  const code = `APP-${Math.floor(1000 + Math.random() * 9000)}`;

  // Check if user with this phone already exists
  let user = await db.user.findUnique({ where: { phone: phone.trim() } });

  // Create or update user as TECHNICIAN
  if (!user) {
    user = await db.user.create({
      data: {
        name: fullName.trim(),
        phone: phone.trim(),
        email: email?.trim() || `mechanic+${phone.trim()}@mekanix.io`,
        role: "TECHNICIAN",
        phoneVerified: true,
        avatar: `https://i.pravatar.cc/150?u=${phone.trim()}`,
      },
    });
  } else {
    user = await db.user.update({
      where: { id: user.id },
      data: { role: "TECHNICIAN", phoneVerified: true },
    });
  }

  // Create technician profile if not exists
  let tech = await db.technician.findUnique({ where: { userId: user.id } });
  if (!tech) {
    const specList = JSON.parse(JSON.stringify(specialties ?? [])) as string[];
    tech = await db.technician.create({
      data: {
        userId: user.id,
        bio: bio?.trim() || "MEKANIX-verified mobile technician.",
        experienceYears: Number(experienceYears) || 0,
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
        specialties: { create: specList.map((cat: string) => ({ category: cat, label: cat.replace("-", " ") })) },
        serviceAreas: {
          create: city ? [{ name: city, lat: 37.7749, lng: -122.4194, radiusKm: 25 }] : [{ name: "San Francisco", lat: 37.7749, lng: -122.4194, radiusKm: 25 }],
        },
      },
    });
  }

  // Auto-approve the application (upsert — if user already has one, update it)
  const app = await db.mechanicApplication.upsert({
    where: { userId: user.id },
    create: {
      code,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      city: city?.trim() || null,
      experienceYears: Number(experienceYears) || 0,
      specialties: JSON.stringify(specialties ?? []),
      certifications: certifications ? JSON.stringify(certifications) : null,
      bio: bio?.trim() || null,
      vehicleOwned: Boolean(vehicleOwned),
      status: "APPROVED",
      userId: user.id,
      reviewedAt: new Date(),
    },
    update: {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      city: city?.trim() || null,
      experienceYears: Number(experienceYears) || 0,
      specialties: JSON.stringify(specialties ?? []),
      bio: bio?.trim() || null,
      vehicleOwned: Boolean(vehicleOwned),
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ...app, autoApproved: true, userId: user.id });
}
