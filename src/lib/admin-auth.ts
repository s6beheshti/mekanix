import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "mekanix-admin-secret";
const encoder = new TextEncoder();

export type AdminSession = {
  adminId: string;
  username: string;
  role: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAdminToken(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encoder.encode(JWT_SECRET));
}

export async function verifyAdminToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(JWT_SECRET));
    return {
      adminId: payload.adminId as string,
      username: payload.username as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function getAdminFromRequest(req: Request): Promise<AdminSession | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyAdminToken(auth.slice(7));
}

export async function ensureDefaultAdmin() {
  const count = await db.adminUser.count();
  if (count === 0) {
    const passwordHash = await hashPassword("admin12345");
    await db.adminUser.create({
      data: {
        username: "admin",
        email: "admin@mekanix.ir",
        passwordHash,
        name: "Super Admin",
        role: "SUPER_ADMIN",
      },
    });
    console.log("✓ Default admin created: admin / admin12345");
  }
}
