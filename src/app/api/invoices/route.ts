import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return NextResponse.json(null);
  const inv = await db.invoice.findUnique({
    where: { jobId },
    include: { job: true, payment: true },
  });
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
      const laborRate = job.technician.hourlyRate;
      const laborTotal = laborHours * laborRate;
      const partsTotal = job.parts.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
      const travelFee = job.technician.travelFeeBase;
      const subtotal = laborTotal + partsTotal + travelFee;
      const taxRate = 0.09;
      const taxTotal = subtotal * taxRate;
      const total = subtotal + taxTotal;
      data = {
        code: `INV-${Math.floor(3000 + Math.random() * 6000)}`,
        laborHours,
        laborRate,
        laborTotal,
        partsTotal,
        travelFee,
        subtotal,
        taxRate,
        taxTotal,
        discount: 0,
        total,
        currency: "USD",
        status: "SENT",
        notes: "Parts covered by 6-month warranty.",
      };
    }
  }
  const inv = await db.invoice.create({ data: { jobId, ...data }, include: { job: true, payment: true } });
  return NextResponse.json(inv);
}
