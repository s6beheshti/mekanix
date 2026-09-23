import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/care/packages — list available service packages
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId");

  const packages = await db.servicePackage.findMany({
    where: { active: true },
    include: { items: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(packages);
}
