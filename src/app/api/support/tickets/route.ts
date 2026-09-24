import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { sanitizeInput, ALLOWED_FIELDS } from "@/lib/auth";

// GET: list tickets for the authenticated user (or all for admin).
// userId is derived from session — the `userId` query param is IGNORED (BOLA protection).
export async function GET(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: any = {};
  if (session.role !== "ADMIN") {
    where.userId = session.userId; // BOLA: only own tickets for non-admins
  }
  if (status) where.status = status;

  const tickets = await db.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: session.role === "ADMIN" ? { user: true } : undefined,
  });
  return NextResponse.json(tickets);
}

// POST: create a new support ticket.
// userId is derived from the session — NEVER from the request body.
// Body is sanitized to only allow whitelisted ticket fields (mass-assignment protection).
export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const safe = sanitizeInput(body, ALLOWED_FIELDS.ticket);
  if (!safe.subject || !String(safe.subject).trim()) {
    return NextResponse.json({ error: "subject الزامی است" }, { status: 400 });
  }
  if (!safe.message || !String(safe.message).trim()) {
    return NextResponse.json({ error: "message الزامی است" }, { status: 400 });
  }
  const validCategories = ["billing", "jobs", "account", "technical", "other"];
  if (safe.category && !validCategories.includes(safe.category)) {
    safe.category = "other";
  }
  const validPriorities = ["low", "normal", "high", "urgent"];
  if (safe.priority && !validPriorities.includes(safe.priority)) {
    safe.priority = "normal";
  }

  const code = `TKT-${Math.floor(5000 + Math.random() * 4000)}`;
  const ticket = await db.supportTicket.create({
    data: {
      code,
      userId: session.userId, // server-authoritative
      subject: String(safe.subject).slice(0, 200).trim(),
      category: safe.category ?? "other",
      priority: safe.priority ?? "normal",
      message: String(safe.message).slice(0, 5000).trim(),
      status: "open",
    },
    include: { user: true },
  });

  // Notify admins
  const admins = await db.user.findMany({ where: { role: "ADMIN" } });
  for (const admin of admins) {
    await db.notification.create({
      data: {
        userId: admin.id,
        type: "new_support_ticket",
        title: `Ticket ${code}`,
        body: `${ticket.user?.name ?? "User"}: ${safe.subject}`,
        category: "system",
        link: "admin/support",
      },
    });
  }

  // Notify the user that their ticket was received
  await db.notification.create({
    data: {
      userId: session.userId,
      type: "support_update",
      title: `Ticket ${code} received`,
      body: "We'll respond within 2 hours during business hours.",
      category: "system",
      link: "customer/support",
    },
  });

  return NextResponse.json(ticket);
}
