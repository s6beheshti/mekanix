import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "TECHNICIAN" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Technician only" }, { status: 403 });
  }
  const missions = await db.serviceBooking.findMany({
    where: session.role === "ADMIN" ? {} : { technicianId: session.userId, status: { in: ["ASSIGNED", "EN_ROUTE", "ARRIVED", "INSPECTING", "WAITING_CUSTOMER_APPROVAL", "APPROVED", "IN_SERVICE", "FINAL_CHECK"] } },
    include: { package: { include: { items: true } }, timeline: { orderBy: { timestamp: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(missions);
}
