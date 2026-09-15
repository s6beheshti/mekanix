import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
const sh = promisify(exec);

export async function POST() {
  try {
    await sh("bun run prisma/seed.ts", { cwd: process.cwd() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
