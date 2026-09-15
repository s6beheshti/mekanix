import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const job = await db.job.update({
    where: { id },
    data: {
      diagnosis: body.diagnosis,
      technicianNotes: body.technicianNotes ?? undefined,
    },
  });
  if (body.severity || body.faultCode) {
    await db.diagnosis.create({
      data: {
        jobId: id,
        summary: body.diagnosis,
        severity: body.severity ?? "medium",
        faultCode: body.faultCode ?? null,
      },
    });
  }
  const fresh = await db.job.findUnique({
    where: { id },
    include: {
      request: { include: { customer: { include: { user: true } }, vehicle: true } },
      technician: { include: { user: true } },
      parts: true,
      diagnosisRecords: true,
      invoice: true,
      reviews: true,
      messages: { include: { fromUser: true } },
      tracking: true,
    },
  });
  return NextResponse.json(fresh);
}
