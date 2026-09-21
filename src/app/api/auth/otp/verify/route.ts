import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-helpers";
import { RATE_LIMITS } from "@/lib/rate-limit";

const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

// Verify an OTP code. If valid, find-or-create a User with the given phone
// and return a session (the user record) + a signed JWT token.
export async function POST(req: Request) {
  // Rate limit: 5 verify attempts per minute per IP
  const limited = checkRateLimit(req, "otp-verify", RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs);
  if (limited) return limited;

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
      },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
    created = true;
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

  // Ensure every logged-in user has a Customer record
  if (!user!.customer) {
    try {
      await db.customer.create({ data: { userId: user!.id } });
      user = await db.user.findUnique({
        where: { id: user!.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    } catch {
      user = await db.user.findUnique({
        where: { id: user!.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    }
  }

  // Issue JWT token — server-authoritative session
  const token = await createSession({
    userId: user!.id,
    role: user!.role,
    phone: user!.phone,
    isGuest: false,
  });

  return NextResponse.json({ user, created, token });
}
