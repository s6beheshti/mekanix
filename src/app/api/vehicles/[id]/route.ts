import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import {
  requireVehicleOwner,
  sanitizeInput,
  ALLOWED_FIELDS,
} from "@/lib/auth";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ownership = await requireVehicleOwner(session, id);
  if (ownership) return ownership;

  await db.vehicle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ownership = await requireVehicleOwner(session, id);
  if (ownership) return ownership;

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Mass-assignment protection — only allow whitelisted vehicle fields.
  // customerId is server-authoritative and is never overridden.
  const safe = sanitizeInput(body, ALLOWED_FIELDS.vehicle);

  // For ADMIN/CUSTOMER without a customer profile we already errored via requireVehicleOwner.
  // (requireVehicleOwner returns null only when the user is ADMIN or owns the vehicle.)
  const vehicle = await db.vehicle.update({ where: { id }, data: safe as any });
  return NextResponse.json(vehicle);
}
