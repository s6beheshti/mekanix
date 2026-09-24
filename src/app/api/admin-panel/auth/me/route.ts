import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await db.adminUser.findUnique({ where: { id: session.adminId }, select: { id: true, username: true, name: true, email: true, role: true } });
  return NextResponse.json({ admin });
}
