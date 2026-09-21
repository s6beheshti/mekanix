import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {
    app: "ok",
  };

  // Check database
  try {
    await db.user.count();
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
