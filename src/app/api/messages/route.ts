import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const list = await db.message.findMany({
    where: jobId ? { jobId } : {},
    include: { fromUser: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { jobId, body: text, kind, fromUserId } = body;
  const msg = await db.message.create({
    data: { jobId, fromUserId, kind: kind ?? "text", body: text },
    include: { fromUser: true },
  });
  // notify the other party
  if (jobId) {
    const job = await db.job.findUnique({ where: { id: jobId }, include: { technician: { include: { user: true } }, request: { include: { customer: { include: { user: true } } } } } });
    if (job) {
      const isFromTech = fromUserId === job.technician.userId;
      const target = isFromTech ? job.request.customer.user : job.technician.user;
      await db.notification.create({
        data: {
          userId: target.id,
          type: "new_message",
          title: "New message",
          body: text.slice(0, 80),
          category: "message",
          link: isFromTech ? "customer/chat" : "technician/job-detail",
        },
      });
    }
  }
  return NextResponse.json(msg);
}
