import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

// Resolve a user by JWT token (authenticated) or userId (admin fallback)
export async function POST(req: Request) {
  // Try JWT auth first
  const session = await getSessionFromRequest(req);
  if (session) {
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
    if (!user) return NextResponse.json({ error: "No session" }, { status: 404 });
    
    // Ensure customer record exists
    if (!user.customer) {
      try {
        await db.customer.create({ data: { userId: user.id } });
      } catch {}
    }
    
    return NextResponse.json({ user });
  }

  // Fallback: accept userId in body (for backwards compatibility with old clients)
  const body = await req.json().catch(() => ({}));
  const parsed = body.userId ? { userId: body.userId } : body.phone ? { phone: body.phone } : null;
  if (!parsed?.userId) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  let user = null;
  if (parsed.userId) {
    user = await db.user.findUnique({
      where: { id: parsed.userId },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }

  if (!user) return NextResponse.json({ error: "No session" }, { status: 404 });
  if (!user.customer) {
    try {
      await db.customer.create({ data: { userId: user.id } });
      user = await db.user.findUnique({
        where: { id: user.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    } catch {
      user = await db.user.findUnique({
        where: { id: user.id },
        include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
      });
    }
  }

  return NextResponse.json({ user });
}
