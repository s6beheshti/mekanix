import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const { jobId, technicianId, rating, comment, fromUserId, tags } = body;
  const review = await db.review.create({
    data: {
      jobId,
      technicianId,
      fromUserId,
      rating,
      comment: comment ?? null,
      tags: tags ? JSON.stringify(tags) : null,
    },
    include: { fromUser: true },
  });
  // Recompute technician rating + count
  const reviews = await db.review.findMany({ where: { technicianId }, select: { rating: true } });
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  await db.technician.update({
    where: { id: technicianId },
    data: { rating: Math.round(avg * 100) / 100, reviewCount: reviews.length, completedJobs: { increment: 1 } },
  });
  return NextResponse.json(review);
}
