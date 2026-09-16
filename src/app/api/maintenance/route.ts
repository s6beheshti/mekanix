import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list maintenance schedules for a vehicle (or all for a user)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId");
  const customerId = url.searchParams.get("customerId");
  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (customerId) where.vehicle = { customerId };
  const schedules = await db.maintenanceSchedule.findMany({
    where,
    orderBy: { nextDueDate: "asc" },
    include: { vehicle: true },
  });
  return NextResponse.json(schedules);
}

// POST: create a new maintenance schedule
export async function POST(req: Request) {
  const body = await req.json();
  const { vehicleId, category, title, intervalKm, intervalHours, intervalDays, notes } = body;
  if (!vehicleId || !category || !title) {
    return NextResponse.json({ error: "vehicleId, category, and title are required" }, { status: 400 });
  }
  // Compute nextDueDate based on intervalDays from now
  let nextDueDate: Date | null = null;
  if (intervalDays) {
    nextDueDate = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  }
  const schedule = await db.maintenanceSchedule.create({
    data: {
      vehicleId,
      category,
      title: title.trim(),
      intervalKm: intervalKm ?? null,
      intervalHours: intervalHours ?? null,
      intervalDays: intervalDays ?? null,
      nextDueDate,
      notes: notes ?? null,
    },
    include: { vehicle: true },
  });
  return NextResponse.json(schedule);
}

// PATCH: mark a schedule as done (resets lastDone, computes nextDue)
export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, action } = body;
  if (!id || action !== "markDone") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const existing = await db.maintenanceSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  const now = new Date();
  let nextDueDate: Date | null = null;
  if (existing.intervalDays) {
    nextDueDate = new Date(now.getTime() + existing.intervalDays * 24 * 60 * 60 * 1000);
  }
  const updated = await db.maintenanceSchedule.update({
    where: { id },
    data: {
      lastDoneDate: now,
      nextDueDate,
    },
    include: { vehicle: true },
  });
  return NextResponse.json(updated);
}
