import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json([]);
  const list = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json(list);
}

export async function PATCH(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const body = await req.json();
  if (userId) {
    await db.notification.updateMany({ where: { userId }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false });
}
