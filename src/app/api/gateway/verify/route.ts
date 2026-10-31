import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verifyAndFulfillGatewayCallback } from "@/lib/payment-fulfillment";

/**
 * Compatibility endpoint for clients that complete the return flow themselves.
 * A bank-card OTP is never accepted here: only a provider callback reference
 * followed by server-to-server verification can confirm a payment.
 */
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const authority = typeof body?.authority === "string" ? body.authority.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim() : "";

  if (!code || !authority || !status) {
    return NextResponse.json(
      { error: "برای تأیید پرداخت، شناسه درگاه و وضعیت بازگشت معتبر لازم است؛ رمز یک‌بارمصرف بانکی قابل قبول نیست." },
      { status: 400 }
    );
  }

  const log = await db.paymentGatewayLog.findUnique({ where: { code } });
  if (!log) return NextResponse.json({ error: "تراکنش یافت نشد" }, { status: 404 });
  if (log.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی به این تراکنش مجاز نیست" }, { status: 403 });
  }

  try {
    const result = await verifyAndFulfillGatewayCallback(code, authority, status, {
      status,
      order_id: code,
      ...(log.gateway === "SHAPARAK_SIM" ? { simulator: "true" } : {}),
    });
    return NextResponse.json({ ok: true, paymentId: result.paymentId, alreadyProcessed: result.alreadyProcessed });
  } catch (error) {
    console.error("[payment] Authenticated verification failed:", error);
    return NextResponse.json({ error: "تأیید تراکنش از سوی درگاه انجام نشد" }, { status: 409 });
  }
}
