import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  const body = await req.json();
  let result: any = null;

  if (resource === "technicians") {
    result = await db.technician.update({ where: { id }, data: body, include: { user: true } });
  } else if (resource === "customers") {
    const { status, ...rest } = body;
    if (status) {
      result = await db.user.update({ where: { id }, data: { status } });
    } else {
      result = await db.customer.update({ where: { id }, data: rest, include: { user: true } });
    }
  } else if (resource === "categories") {
    result = await db.serviceCategory.update({ where: { id }, data: body });
  } else if (resource === "reviews") {
    result = await db.review.update({ where: { id }, data: body });
  } else if (resource === "payments") {
    result = await db.payment.update({ where: { id }, data: body });
  } else {
    return NextResponse.json({ error: "Unsupported resource" }, { status: 400 });
  }
  return NextResponse.json(result);
}
