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
  const app = await db.mechanicApplication.create({
    data: {
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
      status: "PENDING",
    },
  });

  // Notify admin
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    await db.notification.create({
      data: {
        userId: admin.id,
        type: "new_request",
        title: "New mechanic application",
        body: `${fullName} applied (${code}) — review & verify`,
        category: "system",
        link: "admin/applications",
      },
    });
  }

  return NextResponse.json(app);
}
