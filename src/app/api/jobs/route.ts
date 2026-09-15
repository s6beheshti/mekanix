import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const include = {
  request: { include: { customer: { include: { user: true } }, vehicle: true } },
  technician: { include: { user: true, specialties: true } },
  parts: true,
  diagnosisRecords: true,
  invoice: true,
  reviews: true,
  messages: { include: { fromUser: true }, orderBy: { createdAt: "asc" } },
  tracking: { orderBy: { ts: "asc" } },
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const technicianId = url.searchParams.get("technicianId");
  const customerId = url.searchParams.get("customerId");
  const status = url.searchParams.get("status");
  const where: any = {};
  if (technicianId) where.technicianId = technicianId;
  if (status) where.status = status;
  if (customerId) where.request = { customerId };
  const list = await db.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include,
  });
  return NextResponse.json(list);
}
