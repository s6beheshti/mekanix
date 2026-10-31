import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAndFulfillGatewayCallback } from "@/lib/payment-fulfillment";

function resultRedirect(req: NextRequest, status: "success" | "failed" | "pending", code?: string) {
  const base = process.env.APP_URL?.trim() || req.nextUrl.origin;
  const target = new URL("/", base);
  target.searchParams.set("payment", status);
  if (code) target.searchParams.set("payment_code", code);
  return NextResponse.redirect(target);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code || code.length > 100) return resultRedirect(req, "failed");

  const log = await db.paymentGatewayLog.findUnique({ where: { code } });
  if (!log) return resultRedirect(req, "failed", code);

  if (log.status === "VERIFIED" && log.paymentId) {
    return resultRedirect(req, "success", code);
  }

  const params = req.nextUrl.searchParams;
  const authority = params.get("Authority") || params.get("id") || "";
  const callbackStatus = params.get("Status") || params.get("status") || "";
  const payload: Record<string, string> = {};
  for (const key of ["Authority", "Status", "id", "order_id", "status", "track_id", "amount", "date", "payment_type", "simulator"]) {
    const value = params.get(key);
    if (value !== null) payload[key] = value;
  }

  const isCancelled =
    (log.gateway === "ZARINPAL" && callbackStatus !== "OK") ||
    (log.gateway === "IDPAY" && callbackStatus !== "1") ||
    (log.gateway === "SHAPARAK_SIM" && callbackStatus !== "OK");

  if (isCancelled) {
    const cancelled = await db.paymentGatewayLog.updateMany({
      where: { id: log.id, status: "REDIRECTED" },
      data: { status: "CANCELLED", callbackPayload: JSON.stringify(payload) },
    });
    if (cancelled.count === 1 && log.paymentId) {
      await db.payment.updateMany({
        where: { id: log.paymentId, status: "PENDING" },
        data: { status: "FAILED" },
      });
    }
    return resultRedirect(req, "failed", code);
  }

  try {
    await verifyAndFulfillGatewayCallback(code, authority, callbackStatus, payload);
    return resultRedirect(req, "success", code);
  } catch (error) {
    console.error("[payment] Callback verification failed:", error);
    // Keep the attempt pending on transient provider/DB errors so the callback
    // can be retried; never grant an entitlement based on the browser redirect.
    return resultRedirect(req, "pending", code);
  }
}
