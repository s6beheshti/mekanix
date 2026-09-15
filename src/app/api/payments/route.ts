import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const { invoiceId, method } = body;
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { job: { include: { request: { include: { customer: true } }, technician: true } } },
  });
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Resolve payer: prefer body.userId, else the invoice's job's customer's user.
  const userId = body.userId ?? inv.job?.request?.customer?.userId;
  if (!userId) return NextResponse.json({ error: "Unable to resolve payer" }, { status: 400 });

  // simulate processing — 95% success
  const ok = Math.random() > 0.05;
  const status = ok ? "SUCCEEDED" : "FAILED";

  const existing = await db.payment.findUnique({ where: { invoiceId } });
  if (existing) {
    const updated = await db.payment.update({
      where: { id: existing.id },
      data: { status, method: method ?? existing.method },
    });
    if (ok) {
      await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
      // Mark job complete
      await db.job.update({ where: { id: inv.jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
      await db.warranty.create({ data: { jobId: inv.jobId, months: 6, active: true } }).catch(() => {});
      await db.notification.create({
        data: {
          userId: inv.job.technician?.userId,
          type: "job_completed",
          title: "Payment received",
          body: `Invoice ${inv.code} paid — $${inv.total}`,
          category: "payment",
          link: "technician/earnings",
        },
      });
    }
    return NextResponse.json(updated);
  }

  const pay = await db.payment.create({
    data: {
      code: `PAY-${Math.floor(5000 + Math.random() * 4000)}`,
      invoiceId,
      userId,
      amount: inv.total,
      currency: inv.currency,
      method: method ?? "card",
      status,
    },
  });

  if (ok) {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    await db.job.update({ where: { id: inv.jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await db.warranty.create({ data: { jobId: inv.jobId, months: 6, active: true } }).catch(() => {});
    await db.notification.create({
      data: {
        userId: inv.job.technician?.userId,
        type: "job_completed",
        title: "Payment received",
        body: `Invoice ${inv.code} paid — $${inv.total}`,
        category: "payment",
        link: "technician/earnings",
      },
    });
  }
  return NextResponse.json(pay);
}
