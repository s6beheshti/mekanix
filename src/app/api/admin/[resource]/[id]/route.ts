import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { requireRole, sanitizeInput, ALLOWED_FIELDS, FORBIDDEN_FIELDS } from "@/lib/auth";

// Mass-assignment protection: define per-resource whitelists.
const RESOURCE_ALLOWED_FIELDS: Record<string, readonly string[]> = {
  // Technicians: admin can edit profile fields, but NOT server-authoritative metrics.
  technicians: ["bio", "experienceYears", "hourlyRate", "travelFeeBase", "inspectionFee", "inspectionFeeHeavy", "availableNow", "responseMins", "lat", "lng", "heading", "status", "verified", "level"],
  // Customers: editable profile fields
  customers: ["company", "taxId"],
  // Service categories: full edit
  categories: ["slug", "name", "nameFa", "icon", "basePrice", "order", "active"],
  // Reviews: status only (publish / unpublish / flag)
  reviews: ["status"],
  // Payments: status only (mark as REFUNDED, etc.)
  payments: ["status"],
};

export async function PATCH(req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  // Function-level authorization
  const forbidden = requireRole(session, "ADMIN");
  if (forbidden) return forbidden;

  const { resource, id } = await params;

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Mass-assignment: strip forbidden fields (defense in depth)
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      delete body[key];
    }
  }

  // Customers resource is special: it includes user status updates via the User table
  // We'll allow `status` to flow through to the User record.
  let result: any = null;

  if (resource === "technicians") {
    const allowed = RESOURCE_ALLOWED_FIELDS.technicians ?? ALLOWED_FIELDS.technician;
    const safe = sanitizeInput(body, allowed);
    result = await db.technician.update({ where: { id }, data: safe as any, include: { user: true } });
  } else if (resource === "customers") {
    // Allow direct updates to customer record (company, taxId) — but block userId
    const allowed = RESOURCE_ALLOWED_FIELDS.customers ?? ALLOWED_FIELDS.profile;
    const safe = sanitizeInput(body, allowed);
    if (typeof body.status === "string") {
      // Update user status (ban/activate)
      const customer = await db.customer.findUnique({ where: { id }, select: { userId: true } });
      if (customer) {
        await db.user.update({ where: { id: customer.userId }, data: { status: body.status as any } });
      }
    }
    result = await db.customer.update({ where: { id }, data: safe as any, include: { user: true } });
  } else if (resource === "categories") {
    const allowed = RESOURCE_ALLOWED_FIELDS.categories ?? ALLOWED_FIELDS.profile;
    const safe = sanitizeInput(body, allowed);
    result = await db.serviceCategory.update({ where: { id }, data: safe as any });
  } else if (resource === "reviews") {
    const allowed = RESOURCE_ALLOWED_FIELDS.reviews ?? ALLOWED_FIELDS.review;
    const safe = sanitizeInput(body, allowed);
    result = await db.review.update({ where: { id }, data: safe as any });
  } else if (resource === "payments") {
    const allowed = RESOURCE_ALLOWED_FIELDS.payments ?? ALLOWED_FIELDS.review;
    const safe = sanitizeInput(body, allowed);
    result = await db.payment.update({ where: { id }, data: safe as any });
  } else {
    return NextResponse.json({ error: "Unsupported resource" }, { status: 400 });
  }
  return NextResponse.json(result);
}
