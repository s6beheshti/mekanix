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

export async function POST(req: Request) {
  const limited = checkRateLimit(req, "otp-verify", RATE_LIMITS.OTP_VERIFY.max, RATE_LIMITS.OTP_VERIFY.windowMs);
  if (limited) return limited;

  const { phone: rawPhone, code, name } = await req.json();
  // Normalize phone the same way /otp/send does — strip spaces, dashes, parentheses.
  const phone = String(rawPhone || "").replace(/[\s\-()]/g, "");
  if (!phone || !code) {
    return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
  }

  const otp = await db.otpCode.findFirst({
    where: { phone, code, consumed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  if (otp.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Code expired" }, { status: 400 });
  }

  await db.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

  let user = await db.user.findUnique({
    where: { phone },
    include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
  });
  let created = false;
  if (!user) {
    const derivedName = name?.trim() || `MEKANIX User ${phone.slice(-4)}`;
    user = await db.user.create({
      data: {
        phone, phoneVerified: true,
        email: `+${phone.replace(/\D/g, "")}@mekanix.guest`,
        name: derivedName, role: "CUSTOMER",
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
      where: { id: user.id }, data: { phoneVerified: true },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }

  if (!user!.customer) {
    try {
      await db.customer.create({ data: { userId: user!.id } });
    } catch {}
    user = await db.user.findUnique({
      where: { id: user!.id },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }

  const token = await createSession({
    userId: user!.id, role: user!.role, phone: user!.phone, isGuest: false,
  });

  // Set HttpOnly cookie — JavaScript cannot access it (XSS protection).
  // The session JWT is NEVER exposed to client-side JS: it lives only in the
  // HttpOnly cookie, which `fetch(..., { credentials: "include" })` sends
  // automatically on every same-origin API call.
  const response = NextResponse.json({ user, created });
  response.cookies.set("mekanix-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });
  // NOTE: We intentionally do NOT return the JWT in the body or any header.
  // For WebSocket auth, frontend should call /api/auth/ws-token to get a
  // short-lived (5min) token. The main session JWT stays in HttpOnly cookie
  // and is never exposed to JS.
  // TODO(security): Implement /api/auth/ws-token endpoint that:
  //   1. Reads the HttpOnly session cookie via requireAuth(req).
  //   2. Mints a separate short-lived WS token (5min TTL, scoped to userId+role).
  //   3. Returns it in the JSON body (safe — it expires fast and is WS-only).
  // The WS gateway then verifies the WS token on connection.
  return response;
}
