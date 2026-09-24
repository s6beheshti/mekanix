import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAuth } from "@/lib/api-helpers";
import { requireRole } from "@/lib/auth";

const sh = promisify(exec);

// POST /api/seed
// Production: always 404 (Never expose seed endpoint in prod).
// Dev/test: requires ADMIN role.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  const forbidden = requireRole(session, "ADMIN");
  if (forbidden) return forbidden;

  try {
    await sh("bun run prisma/seed.ts", { cwd: process.cwd() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
