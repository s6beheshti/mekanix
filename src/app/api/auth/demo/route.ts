import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/auth/demo
// Returns demo users (CUSTOMER/TECHNICIAN/ADMIN) so the dev-mode UI can offer
// one-click sign-in. In production this endpoint MUST NOT exist — return 404.
const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const customer = await db.user.findFirst({
    where: { role: "CUSTOMER" },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });
  const technician = await db.user.findFirst({
    where: { role: "TECHNICIAN" },
    include: { technician: { include: TECHNICIAN_INCLUDE } },
    orderBy: { createdAt: "asc" },
  });
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  return NextResponse.json({ CUSTOMER: customer, TECHNICIAN: technician, ADMIN: admin });
}
