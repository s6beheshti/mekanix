import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-api";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slides = await db.onboardingSlide.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(slides);
}

export async function POST(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { image, imageBase64, titleFa, subtitleFa, tagFa, bulletsFa, titleEn, subtitleEn, tagEn, bulletsEn, accent, order } = body;

  if (!titleFa || !subtitleFa) return NextResponse.json({ error: "titleFa and subtitleFa required" }, { status: 400 });

  let imagePath = image || "";
  if (imageBase64?.startsWith("data:")) {
    const m = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) {
      const ext = m[1].split("/")[1] === "jpeg" ? "jpg" : m[1].split("/")[1];
      const buf = Buffer.from(m[2], "base64");
      const filename = `onboarding-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(process.cwd(), "public", "onboarding", filename), buf);
      imagePath = `/onboarding/${filename}`;
    }
  }

  const lastSlide = await db.onboardingSlide.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const newOrder = order ?? (lastSlide?.order ?? 0) + 1;

  const slide = await db.onboardingSlide.create({
    data: {
      order: newOrder, image: imagePath,
      titleFa, subtitleFa, tagFa: tagFa || "", bulletsFa: bulletsFa || "[]",
      titleEn: titleEn || titleFa, subtitleEn: subtitleEn || subtitleFa, tagEn: tagEn || tagFa || "", bulletsEn: bulletsEn || "[]",
      accent: accent || "amber",
    },
  });

  await writeAuditLog({ session, action: "CREATE_ONBOARDING_SLIDE", entity: "OnboardingSlide", entityId: slide.id, after: slide, req });
  return NextResponse.json(slide);
}
