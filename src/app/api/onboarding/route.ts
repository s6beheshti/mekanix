import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const slides = await db.onboardingSlide.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(slides);
  } catch {
    return NextResponse.json([]);
  }
}
