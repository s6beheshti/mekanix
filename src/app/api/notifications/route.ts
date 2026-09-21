import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

// GET: list the authenticated user's notifications.
// userId is derived from the session — the `userId` query param is IGNORED (BOLA protection).
export async function GET(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const list = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json(list);
}

// PATCH: mark all of the authenticated user's notifications as read.
export async function PATCH(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  await db.notification.updateMany({
    where: { userId: session.userId },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
