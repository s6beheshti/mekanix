import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const customer = await db.user.findFirst({
    where: { role: "CUSTOMER" },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });
  const technician = await db.user.findFirst({
    where: { role: "TECHNICIAN" },
    include: { technician: true },
    orderBy: { createdAt: "asc" },
  });
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  return NextResponse.json({ CUSTOMER: customer, TECHNICIAN: technician, ADMIN: admin });
}
