// MEKANIX — OTP cryptographic helpers.
//
// Centralizes the two security-sensitive OTP operations so that the send and
// verify routes cannot drift apart:
//
//   1. `generateOtpCode()` — produces a 6-digit numeric code using Node's
//      CSPRNG (`crypto.randomInt`). This replaces the old `Math.random()`
//      generator, which was NOT cryptographically secure and could be
//      predicted by an attacker who observed enough outputs.
//
//      Per OWASP Authentication Cheat Sheet §"Out-of-Band Verifiers":
//      "The verifier SHALL use a cryptographically secure random number
//      generator to choose the verification secret." `Math.random()` does
//      not meet that bar; `crypto.randomInt()` does.
//
//   2. `hashOtpCode(code)` — keyed HMAC-SHA256 of the code using the
//      server-side JWT secret as a pepper. The digest is persisted to
//      `OtpCode.code`; a database-only leak cannot brute-force the six-digit
//      space without also compromising the application secret. Verification
//      computes the same HMAC and compares the digest.
//
// Both helpers use `node:crypto` (built-in) — no new dependencies.

import { randomInt, createHmac } from "node:crypto";

// Generate a 6-digit numeric OTP code using a CSPRNG.
// Returns a string of exactly 6 digits ("100000".."999999").
//
// `randomInt(min, max)` returns an integer n such that min <= n < max,
// so `randomInt(100000, 1000000)` covers [100000, 999999] inclusive —
// always 6 digits, no leading-zero padding concerns.
export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

// Hash an OTP code with a server-side HMAC pepper.
// The 6-digit code has a small search space; an unkeyed SHA-256 digest can
// be brute-forced offline after a database leak. HMAC keyed by JWT_SECRET
// prevents that attack unless the application secret is also compromised.
function getOtpPepper(): string {
  const pepper = process.env.JWT_SECRET;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required to protect OTP hashes in production");
  }
  return pepper || "mekanix-dev-otp-pepper-change-in-production";
}

export function hashOtpCode(code: string): string {
  return createHmac("sha256", getOtpPepper())
    .update(`mekanix:otp:${code}`)
    .digest("hex");
}
