import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list tickets for a user (or all for admin)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const status = url.searchParams.get("status");
  const where: any = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;
  const tickets = await db.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });
  return NextResponse.json(tickets);
}

// POST: create a new support ticket
export async function POST(req: Request) {
  const { userId, subject, category, priority, message } = await req.json();
  if (!userId || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "userId, subject, and message are required" }, { status: 400 });
  }
  const code = `TKT-${Math.floor(5000 + Math.random() * 4000)}`;
  const ticket = await db.supportTicket.create({
    data: {
      code,
      userId,
      subject: subject.trim(),
      category: category ?? "other",
      priority: priority ?? "normal",
      message: message.trim(),
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
        body: `${ticket.user?.name ?? "User"}: ${subject}`,
        category: "system",
        link: "admin/support",
      },
    });
  }

  // Notify the user that their ticket was received
  await db.notification.create({
    data: {
      userId,
      type: "support_update",
      title: `Ticket ${code} received`,
      body: "We'll respond within 2 hours during business hours.",
      category: "system",
      link: "customer/support",
    },
  });

  return NextResponse.json(ticket);
}
