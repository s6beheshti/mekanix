import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { requireVehicleOwner } from "@/lib/auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const { id: vehicleId } = await ctx.params;
  const access = await requireVehicleOwner(session, vehicleId);
  if (access) return access;

  const reports = await db.vehicleHealthReport.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const careProfile = await db.vehicleCareProfile.findUnique({ where: { vehicleId } });

  return NextResponse.json({
    currentScore: careProfile?.healthScore ?? 100,
    reports,
  });
}
