import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { settlePrepay } from "@/lib/prepay-settlement";

// Development-only settlement after the local gateway simulator has verified the payment.
// Live staging/production settlement is performed only by /api/gateway/callback.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Pre-service payment must be settled by the verified gateway callback" }, { status: 503 });
  }

  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "فقط مشتری می‌تواند هزینه پیش‌خدمت را پرداخت کند" }, { status: 403 });
  }

  let body: { jobId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.jobId !== "string" || !body.jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const log = await db.paymentGatewayLog.findFirst({
    where: {
      userId: session.userId,
      purpose: "prepay",
      description: "PREPAY_JOB:" + body.jobId,
      status: "VERIFIED",
      currency: "IRR",
    },
    orderBy: { verifiedAt: "desc" },
  });
  if (!log?.paymentId) {
    return NextResponse.json({ error: "پرداخت تأییدشده‌ای برای این درخواست پیدا نشد" }, { status: 403 });
  }

  const payment = await db.payment.findUnique({ where: { id: log.paymentId } });
  if (!payment || payment.userId !== session.userId || payment.status !== "SUCCEEDED" ||
      Math.round(Number(payment.amount)) !== Math.round(Number(log.amount))) {
    return NextResponse.json({ error: "رکورد پرداخت معتبر نیست" }, { status: 403 });
  }

  try {
    const result = await db.$transaction((tx) =>
      settlePrepay(tx, body.jobId as string, session.userId, Math.round(Number(log.amount)))
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "خطا در ثبت پرداخت پیش‌خدمت" },
      { status: 409 }
    );
  }
}
