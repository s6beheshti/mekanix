import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { getCustomerFromSession, sanitizeInput, ALLOWED_FIELDS } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  // Derive customer from session — ignore any client-supplied customerId
  if (session.role === "ADMIN") {
    // Admins can list all vehicles (used by admin portal)
    const vehicles = await db.vehicle.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: { include: { user: true } } },
    });
    return NextResponse.json(vehicles);
  }

  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  const customer = await getCustomerFromSession(session);
  if (!customer) return NextResponse.json({ error: "پروفایل مشتری یافت نشد" }, { status: 403 });

  const vehicles = await db.vehicle.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(vehicles);
}

export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "فقط مشتریان می‌توانند خودرو ثبت کنند" }, { status: 403 });
  }

  const customer = await getCustomerFromSession(session);
  if (!customer) return NextResponse.json({ error: "پروفایل مشتری یافت نشد" }, { status: 403 });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Mass-assignment protection: only allow whitelisted vehicle fields
  const safe = sanitizeInput(body, ALLOWED_FIELDS.vehicle);
  if (!safe.type || !safe.make || !safe.model || !safe.year) {
    return NextResponse.json({ error: "نوع، برند، مدل و سال الزامی است" }, { status: 400 });
  }

  // customerId is server-authoritative — NEVER trust client
  const vehicle = await db.vehicle.create({
    data: { ...(safe as any), customerId: customer.id },
  });
  return NextResponse.json(vehicle);
}
