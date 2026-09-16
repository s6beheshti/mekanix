import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Full technician include — used everywhere a Technician is resolved for the UI
// so serviceAreas/specialties/certifications are never undefined.
const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

// Resolve a user by phone or userId (for re-establishing a session).
export async function POST(req: Request) {
  const { phone, userId } = await req.json();
  let user = null;
  if (userId) {
    user = await db.user.findUnique({
      where: { id: userId },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  } else if (phone) {
    user = await db.user.findUnique({
      where: { phone },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }
  if (!user) return NextResponse.json({ error: "No session" }, { status: 404 });

  // Ensure every logged-in user has a Customer record — allows mechanics/admins
  // to also act as customers and submit service requests.
  if (!user.customer) {
    await db.customer.create({ data: { userId: user.id } });
    user = await db.user.findUnique({
      where: { id: user.id },
      include: { customer: true, technician: { include: TECHNICIAN_INCLUDE } },
    });
  }

  return NextResponse.json({ user });
}
