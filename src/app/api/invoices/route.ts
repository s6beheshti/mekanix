import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const FULL_INCLUDE = {
  job: {
    include: {
      request: { include: { customer: { include: { user: true } }, vehicle: true } },
      technician: { include: { user: true } },
      parts: true,
      diagnosisRecords: true,
    },
  },
  payment: true,
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return NextResponse.json(null);
  const inv = await db.invoice.findUnique({ where: { jobId }, include: FULL_INCLUDE });
  return NextResponse.json(inv);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { jobId, ...rest } = body;
  // Recompute totals from job parts + labor if not supplied
  let data: any = rest;
  if (rest.auto !== false) {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: { parts: true, technician: true },
    });
    if (job) {
      const laborHours = rest.laborHours ?? 1.5;
      const laborRate = rest.laborRate ?? job.technician.hourlyRate;
      const laborTotal = laborHours * laborRate;
      const partsTotal = job.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
      const travelFee = rest.travelFee ?? job.technician.travelFeeBase;
      const discount = rest.discount ?? 0;
      const subtotal = laborTotal + partsTotal + travelFee - discount;
      const taxRate = rest.taxRate ?? 0.09;
      const taxTotal = subtotal * taxRate;
      const total = subtotal + taxTotal;
      data = {
        code: rest.code ?? `INV-${Math.floor(3000 + Math.random() * 6000)}`,
        laborHours,
        laborRate,
        laborTotal,
        partsTotal,
        travelFee,
        discount,
        subtotal,
        taxRate,
        taxTotal,
        total,
        currency: "USD",
        status: rest.status ?? "SENT",
        notes: rest.notes ?? "Parts & labor covered by 6-month MEKANIX warranty.",
      };
    }
  }
  const inv = await db.invoice.create({ data: { jobId, ...data }, include: FULL_INCLUDE });
  // Notify customer
  const job = await db.job.findUnique({ where: { id: jobId }, include: { request: { include: { customer: true } } } });
  if (job) {
    await db.notification.create({
      data: {
        userId: job.request.customer.userId,
        type: "estimate_ready",
        title: "Invoice issued",
        body: `${inv.code} — review and pay ${inv.total}`,
        category: "payment",
        link: "customer/invoice",
      },
    });
  }
  return NextResponse.json(inv);
}
