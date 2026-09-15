import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Send an OTP code to a phone number. In demo mode the code is returned
// so the UI can display it (in production this would be sent via SMS).
export async function POST(req: Request) {
  const { phone } = await req.json();
  if (!phone || String(phone).length < 8) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }
  // 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  // invalidate previous unused codes for this phone
  await db.otpCode.updateMany({ where: { phone, consumed: false }, data: { consumed: true } });
  await db.otpCode.create({ data: { phone, code, expiresAt } });

  return NextResponse.json({ ok: true, code, expiresAt }); // code exposed for demo only
}
