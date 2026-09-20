import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-auth";
import { writeAuditLog } from "@/lib/admin-api";
import fs from "fs";
import path from "path";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slide = await db.onboardingSlide.findUnique({ where: { id } });
  if (!slide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(slide);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const before = await db.onboardingSlide.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { imageBase64, ...rest } = body;

  if (imageBase64?.startsWith("data:")) {
    const m = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) {
      const ext = m[1].split("/")[1] === "jpeg" ? "jpg" : m[1].split("/")[1];
      const buf = Buffer.from(m[2], "base64");
      const filename = `onboarding-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(process.cwd(), "public", "onboarding", filename), buf);
      rest.image = `/onboarding/${filename}`;
    }
  }

  const updated = await db.onboardingSlide.update({ where: { id }, data: rest });
  await writeAuditLog({ session, action: "UPDATE_ONBOARDING_SLIDE", entity: "OnboardingSlide", entityId: id, before, after: updated, req });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const before = await db.onboardingSlide.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.onboardingSlide.delete({ where: { id } });
  await writeAuditLog({ session, action: "DELETE_ONBOARDING_SLIDE", entity: "OnboardingSlide", entityId: id, before, req });
  return NextResponse.json({ ok: true });
}
