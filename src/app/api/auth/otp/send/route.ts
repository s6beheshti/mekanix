import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, validateBody } from "@/lib/api-helpers";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { otpSendSchema } from "@/lib/schemas";

// Send an OTP code to a phone number.
// - Rate-limited per-phone (5 / 10min) AND per-IP (20 / hour).
// - In development, the code is returned so the UI can display it for testing.
// - In production, the code is NEVER returned in the response body — it must be
//   delivered out-of-band (SMS / push) so a malicious response interceptor or
//   XSS cannot read it.
export async function POST(req: Request) {
  // Validate request body with Zod before touching any rate-limit / DB state.
  // The schema enforces phone length + character-class, so a junk payload
  // fails fast with a 400 (and Persian error) instead of consuming rate-limit
  // budget or hitting Prisma with malformed input.
  const body = await validateBody(req, otpSendSchema);
  if (!body.ok) return body.response;

  // Normalize phone: strip spaces, dashes, parentheses before storing/lookup.
  // The schema already proved the input is well-formed, so this only sanitizes
  // formatting — it can no longer reject a previously-accepted payload.
  const phone = body.data.phone.replace(/[\s\-()]/g, "");

  if (!phone || phone.length < 8) {
    // Defensive: schema should already prevent this, but keep the guard in case
    // the normalization above unexpectedly strips too much (e.g. an all-dashes input).
    return NextResponse.json({ error: "شماره موبایل معتبر وارد کنید" }, { status: 400 });
  }

  // Rate limit by phone (5 per 10 min) — protects a single user from OTP spam.
  const phoneLimited = rateLimit(`otp-send:phone:${phone}`, 5, 10 * 60 * 1000);
  if (!phoneLimited.success) {
    return NextResponse.json(
      { error: "تعداد درخواست‌های کد تأیید برای این شماره بیش از حد است" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(phoneLimited.resetMs / 1000)) } }
    );
  }

  // Rate limit by client IP (20 per hour) — protects against enumeration / abuse
  // across many phone numbers from a single attacker.
  const clientId = getClientId(req);
  const ipLimited = rateLimit(`otp-send:ip:${clientId}`, 20, 60 * 60 * 1000);
  if (!ipLimited.success) {
    return NextResponse.json(
      { error: "تعداد درخواست‌ها از این آدرس بیش از حد است" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(ipLimited.resetMs / 1000)) } }
    );
  }

  // 6-digit numeric code, valid for 5 minutes.
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Invalidate any previous unconsumed codes for this phone (only the newest one is valid).
  await db.otpCode.updateMany({ where: { phone, consumed: false }, data: { consumed: true } });
  await db.otpCode.create({ data: { phone, code, expiresAt } });

  // TODO(production): Integrate an SMS provider here (e.g. Kavenegar, MeliPayamak, Farapayamak)
  // and send the code to `phone`. Until that is wired up, the code is only visible
  // in development responses for testing. Example:
  //   if (process.env.NODE_ENV === "production") {
  //     await smsProvider.send(phone, `کد تأیید MEKANIX: ${code}`);
  //   }

  const isProduction = process.env.NODE_ENV === "production";
  const response: { ok: true; expiresAt: Date; code?: string } = { ok: true, expiresAt };
  if (!isProduction) {
    // Dev only — the splash UI displays this so a human tester can read the code.
    response.code = code;
  }
  return NextResponse.json(response);
}
