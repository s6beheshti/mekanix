import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { requireRole } from "@/lib/auth";

const HANDLERS: Record<string, () => Promise<any[]>> = {
  customers: async () => {
    const list = await db.customer.findMany({
      include: { user: true, _count: { select: { vehicles: true, serviceRequests: true } } },
      orderBy: { createdAt: "desc" },
    });
    return list;
  },
  technicians: async () => {
    const list = await db.technician.findMany({
      include: { user: true, specialties: true, certifications: true },
      orderBy: { rating: "desc" },
    });
    return list;
  },
  jobs: async () => {
    const list = await db.job.findMany({
      include: {
        request: { include: { customer: { include: { user: true } }, vehicle: true } },
        technician: { include: { user: true } },
        invoice: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return list;
  },
  payments: async () => {
    const list = await db.payment.findMany({
      include: { invoice: { include: { job: true } }, user: true },
      orderBy: { createdAt: "desc" },
    });
    return list;
  },
  reviews: async () => {
    const list = await db.review.findMany({
      include: { fromUser: true, technician: { include: { user: true } }, job: true },
      orderBy: { createdAt: "desc" },
    });
    return list;
  },
  vehicles: async () => {
    const list = await db.vehicle.findMany({
      include: { customer: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });
    return list;
  },
  categories: async () => {
    return db.serviceCategory.findMany({ orderBy: { order: "asc" } });
  },
  applications: async () => {
    const list = await db.mechanicApplication.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { include: { technician: true } } },
    });
    return list;
  },
};

export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  // Function-level authorization: only ADMIN role can access admin resources
  const forbidden = requireRole(session, "ADMIN");
  if (forbidden) return forbidden;

  const { resource } = await params;
  const handler = HANDLERS[resource];
  if (!handler) return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  const data = await handler();
  return NextResponse.json(data);
}
