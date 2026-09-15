import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const inv = await db.invoice.update({ where: { id }, data: body, include: { job: true, payment: true } });
  return NextResponse.json(inv);
}
