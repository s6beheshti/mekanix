import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const updated = await db.mechanicApplication.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), adminNotes: body.notes || null },
  });
  return NextResponse.json(updated);
}
