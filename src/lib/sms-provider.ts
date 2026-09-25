// MEKANIX — SMS Provider Abstraction
//
// Pluggable SMS provider for OTP delivery.
// Set SMS_PROVIDER env var to choose:
//   - "kavenegar" — set KAVENEGAR_API_KEY
//   - "melipayamak" — set MELIPAYAMAK_USERNAME + MELIPAYAMAK_PASSWORD
//   - "farapayamak" — set FARAPAYAMAK_USERNAME + FARAPAYAMAK_PASSWORD
//   - "console" (default) — logs to console (dev mode)
//
// Auto-initialized on first `sendOtp()` call, OR explicitly via
// `initSmsProvider()` (called by `src/lib/init.ts` at server boot).
// The selected provider is captured once and reused for the process lifetime.
//
// Failures are non-fatal: an OTP send failure is logged + surfaced via the
// returned `SmsResult.error`, but the caller (`/api/auth/otp/send`) does NOT
// abort the request — the hashed code is already persisted in the DB so the
// user can still verify (e.g. via a retry / fallback channel).

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type SendOtpFn = (phone: string, code: string) => Promise<SmsResult>;

// ──────────── Console provider (dev mode — just logs) ────────────

const consoleProvider: SendOtpFn = async (phone, code) => {
  console.log(`📱 [DEV SMS] To: ${phone}, Code: ${code}`);
  return { success: true, messageId: `console_${Date.now()}` };
};

// ──────────── Kavenegar provider ────────────
// Iranian SMS gateway: https://kavenegar.com/
// Uses the "verify/lookup" template endpoint so OTP messages don't require
// pre-registered sender-line approval. Template `mekanix-otp` must exist in
// the Kavenegar panel.
function createKavenegarProvider(apiKey: string): SendOtpFn {
  return async (phone, code) => {
    try {
      const res = await fetch(
        `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(
          phone
        )}&token=${encodeURIComponent(code)}&template=mekanix-otp`
      );
      const data = await res.json();
      if (data.return?.status === 200) {
        return { success: true, messageId: data.entries?.messageid };
      }
      return { success: false, error: data.return?.message || "Kavenegar error" };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  };
}

// ──────────── MeliPayamak provider ────────────
// Iranian SMS gateway: https://melipayamak.com/
// Uses the plain-text SendSMS endpoint. The `from` number is the dedicated
// sender line issued with the account (replace the placeholder below with the
// real 10-digit line before production use).
function createMeliPayamakProvider(username: string, password: string): SendOtpFn {
  return async (phone, code) => {
    try {
      const res = await fetch("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          to: phone,
          from: "5000...",
          text: `کد تأیید MEKANIX: ${code}`,
        }),
      });
      const data = await res.json();
      return data.retStatus
        ? { success: true, messageId: String(data.smsId ?? "") }
        : { success: false, error: "MeliPayamak error" };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  };
}

// ──────────── Farapayamak provider ────────────
// Iranian SMS gateway: https://farapayamak.com/
// Uses the REST SendSimpleSMS endpoint.
function createFarapayamakProvider(username: string, password: string): SendOtpFn {
  return async (phone, code) => {
    try {
      const res = await fetch("https://rest.farapayamak.com/api/SendSMS/SimpleSMS", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          to: phone,
          from: "5000...",
          text: `کد تأیید MEKANIX: ${code}`,
        }),
      });
      const data = await res.json();
      return data.retStatus
        ? { success: true, messageId: String(data.smsId ?? "") }
        : { success: false, error: "Farapayamak error" };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  };
}

// ──────────── Provider selection (env-driven, idempotent) ────────────

let currentProvider: SendOtpFn = consoleProvider;
let initialized = false;

export function initSmsProvider(): void {
  if (initialized) return;
  initialized = true;

  const provider = process.env.SMS_PROVIDER?.toLowerCase();

  if (provider === "kavenegar" && process.env.KAVENEGAR_API_KEY) {
    console.log("📱 SMS provider: Kavenegar");
    currentProvider = createKavenegarProvider(process.env.KAVENEGAR_API_KEY);
  } else if (
    provider === "melipayamak" &&
    process.env.MELIPAYAMAK_USERNAME &&
    process.env.MELIPAYAMAK_PASSWORD
  ) {
    console.log("📱 SMS provider: MeliPayamak");
    currentProvider = createMeliPayamakProvider(
      process.env.MELIPAYAMAK_USERNAME,
      process.env.MELIPAYAMAK_PASSWORD
    );
  } else if (
    provider === "farapayamak" &&
    process.env.FARAPAYAMAK_USERNAME &&
    process.env.FARAPAYAMAK_PASSWORD
  ) {
    console.log("📱 SMS provider: Farapayamak");
    currentProvider = createFarapayamakProvider(
      process.env.FARAPAYAMAK_USERNAME,
      process.env.FARAPAYAMAK_PASSWORD
    );
  } else {
    console.log("📱 SMS provider: console (dev mode)");
    // currentProvider stays as consoleProvider
  }
}

export async function sendOtp(phone: string, code: string): Promise<SmsResult> {
  initSmsProvider();
  return currentProvider(phone, code);
}

// ──────────── Test-only helpers ────────────
// Allows tests to inject a mock provider and reset the singleton state
// between cases. Not exported from the package public surface — only used by
// the test suite (`tests/unit/...`).
export function __setSmsProviderForTest(provider: SendOtpFn): void {
  currentProvider = provider;
  initialized = true;
}

export function __resetSmsProviderForTest(): void {
  currentProvider = consoleProvider;
  initialized = false;
}
