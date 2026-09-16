import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Full technician include — used everywhere a Technician is resolved for the UI
// so serviceAreas/specialties/certifications are never undefined.
const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

// Verify an OTP code. If valid, find-or-create a User with the given phone
// and return a session (the user record). Guest sign-in is handled client-side.
export async function POST(req: Request) {
  const { phone, code, name } = await req.json();
  if (!phone || !code) {
    return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
  }

  const otp = await db.otpCode.findFirst({
    where: { phone, code, consumed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  if (otp.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 400 });
  }

  await db.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

  // Find or create user by phone
  let user = await db.user.findUnique({
    where: { phone },
    include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
  });
  let created = false;
  if (!user) {
    const derivedName = name?.trim() || `MEKANIX User ${phone.slice(-4)}`;
    user = await db.user.create({
      data: {
        phone,
        phoneVerified: true,
        email: `+${phone.replace(/\D/g, "")}@mekanix.guest`,
        name: derivedName,
        role: "CUSTOMER",
        avatar: `https://i.pravatar.cc/150?u=${phone}`,
      },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
    created = true;
    // Create the customer record, then re-fetch so user.customer is populated.
    await db.customer.create({ data: { userId: user.id } });
    user = await db.user.findUnique({
      where: { id: user.id },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  } else if (!user.phoneVerified) {
    user = await db.user.update({
      where: { id: user.id },
      data: { phoneVerified: true },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }

  // Ensure every logged-in user has a Customer record — allows mechanics
  // (who registered via the application form) and admins to also act as customers
  // and submit service requests. Critical for the request submission flow.
  if (!user!.customer) {
    try {
      await db.customer.create({ data: { userId: user!.id } });
      user = await db.user.findUnique({
        where: { id: user!.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    } catch {
      // P2002 (duplicate) is safe — another concurrent request created it; re-fetch.
      user = await db.user.findUnique({
        where: { id: user!.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    }
  }

  return NextResponse.json({ user, created });
}
