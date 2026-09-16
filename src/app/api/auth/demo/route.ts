import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Full technician include — used everywhere a Technician is resolved for the UI
// so serviceAreas/specialties/certifications are never undefined.
const TECHNICIAN_INCLUDE = {
  specialties: true,
  certifications: true,
  serviceAreas: true,
} as const;

export async function GET() {
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
