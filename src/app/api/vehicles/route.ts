import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  const where: any = customerId ? { customerId } : {};
  const vehicles = await db.vehicle.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(vehicles);
}

export async function POST(req: Request) {
  const body = await req.json();
  const vehicle = await db.vehicle.create({ data: body });
  return NextResponse.json(vehicle);
}
