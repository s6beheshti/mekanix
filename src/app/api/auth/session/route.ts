import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Resolve a user by phone (for re-establishing a session).
export async function POST(req: Request) {
  const { phone, userId } = await req.json();
  let user = null;
  if (userId) {
    user = await db.user.findUnique({ where: { id: userId }, include: { customer: true, technician: true } });
  } else if (phone) {
    user = await db.user.findUnique({ where: { phone }, include: { customer: true, technician: true } });
  }
  if (!user) return NextResponse.json({ error: "No session" }, { status: 404 });
  return NextResponse.json({ user });
}
