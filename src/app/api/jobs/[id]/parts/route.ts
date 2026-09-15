import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const body = await req.json();
  const part = await db.part.create({
    data: {
      jobId,
      name: body.name,
      sku: body.sku ?? null,
      quantity: body.quantity ?? 1,
      unitPrice: body.unitPrice ?? 0,
    },
  });
  return NextResponse.json(part);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const body = await req.json();
  await db.part.delete({ where: { id: body.partId } });
  return NextResponse.json({ ok: true });
}
