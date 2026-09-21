// MEKANIX — Centralized Authentication & Authorization System
// Based on OWASP API Security Top 10 — implements:
// - API1: Broken Object Level Authorization (BOLA)
// - API2: Broken Authentication
// - API3: Broken Object Property Level Authorization (Mass Assignment)
// - API5: Broken Function Level Authorization

import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { db } from "./db";

// ──────────── JWT ────────────

const JWT_SECRET = process.env.JWT_SECRET;
const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  if (!JWT_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required in production");
    }
    // Dev-only fallback — NEVER in production
    return encoder.encode("mekanix-dev-secret-change-in-production");
  }
  return encoder.encode(JWT_SECRET);
}

export type Session = {
  userId: string;
  role: "CUSTOMER" | "TECHNICIAN" | "ADMIN";
  phone: string | null;
  isGuest: boolean;
};

export async function createSession(payload: Session): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      role: payload.role as Session["role"],
      phone: payload.phone as string | null,
      isGuest: payload.isGuest as boolean,
    };
  } catch {
    return null;
  }
}

// ──────────── Session Extraction ────────────

export async function getSessionFromRequest(req: Request): Promise<Session | null> {
  // 1. Try Authorization header (Bearer token)
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    return verifySession(token);
  }
  // 2. Try cookie (for SSR)
  const cookie = req.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/mekanix-token=([^;]+)/);
    if (match) return verifySession(match[1]);
  }
  return null;
}

// ──────────── requireAuth ────────────
// Returns Session if authenticated, or NextResponse(401) if not.

export async function requireAuth(req: Request): Promise<Session | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "احراز هویت نشده — لطفاً وارد شوید" }, { status: 401 });
  }
  return session;
}

// ──────────── requireRole ────────────
// Check if session has one of the required roles.
// Returns null if OK, or NextResponse(403) if forbidden.

export function requireRole(
  session: Session,
  roles: Session["role"] | Session["role"][]
): NextResponse | null {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.role)) {
    return NextResponse.json(
      { error: "دسترسی غیرمجاز — شما اجازه این عملیات را ندارید" },
      { status: 403 }
    );
  }
  return null;
}

// ──────────── requireOwnership ────────────
// Object-level authorization (BOLA protection).
// Resolves the authenticated user to their Customer or Technician profile.

export async function getCustomerFromSession(session: Session) {
  if (session.role !== "CUSTOMER") return null;
  return db.customer.findUnique({ where: { userId: session.userId } });
}

export async function getTechnicianFromSession(session: Session) {
  if (session.role !== "TECHNICIAN") return null;
  return db.technician.findUnique({ where: { userId: session.userId } });
}

// Check if user owns a vehicle
export async function requireVehicleOwner(session: Session, vehicleId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null; // Admin can access all
  const customer = await getCustomerFromSession(session);
  if (!customer) return NextResponse.json({ error: "پروفایل مشتری یافت نشد" }, { status: 403 });
  const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { customerId: true } });
  if (!vehicle) return NextResponse.json({ error: "خودرو یافت نشد" }, { status: 404 });
  if (vehicle.customerId !== customer.id) {
    return NextResponse.json({ error: "دسترسی به این خودرو مجاز نیست" }, { status: 403 });
  }
  return null;
}

// Check if user is participant in a job (customer or assigned technician)
export async function requireJobParticipant(session: Session, jobId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null;
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, request: { select: { customerId: true } }, technicianId: true },
  });
  if (!job) return NextResponse.json({ error: "کار یافت نشد" }, { status: 404 });

  if (session.role === "CUSTOMER") {
    const customer = await getCustomerFromSession(session);
    if (!customer || job.request.customerId !== customer.id) {
      return NextResponse.json({ error: "دسترسی به این کار مجاز نیست" }, { status: 403 });
    }
  } else if (session.role === "TECHNICIAN") {
    const technician = await getTechnicianFromSession(session);
    if (!technician || job.technicianId !== technician.id) {
      return NextResponse.json({ error: "دسترسی به این کار مجاز نیست" }, { status: 403 });
    }
  }
  return null;
}

// Check if user owns a notification
export async function requireNotificationOwner(session: Session, notificationId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null;
  const notif = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif) return NextResponse.json({ error: "اعلان یافت نشد" }, { status: 404 });
  if (notif.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }
  return null;
}

// Check if user owns a wallet (technician only)
export async function requireWalletOwner(session: Session, walletId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null;
  const technician = await getTechnicianFromSession(session);
  if (!technician) return NextResponse.json({ error: "پروفایل مکانیک یافت نشد" }, { status: 403 });
  const wallet = await db.wallet.findUnique({ where: { id: walletId }, select: { technicianId: true } });
  if (!wallet) return NextResponse.json({ error: "کیف پول یافت نشد" }, { status: 404 });
  if (wallet.technicianId !== technician.id) {
    return NextResponse.json({ error: "دسترسی به این کیف پول مجاز نیست" }, { status: 403 });
  }
  return null;
}

// Check if user owns a support ticket
export async function requireTicketOwner(session: Session, ticketId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null;
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true } });
  if (!ticket) return NextResponse.json({ error: "تیکت یافت نشد" }, { status: 404 });
  if (ticket.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی به این تیکت مجاز نیست" }, { status: 403 });
  }
  return null;
}

// Check if user owns an insurance policy
export async function requirePolicyOwner(session: Session, policyId: string): Promise<NextResponse | null> {
  if (session.role === "ADMIN") return null;
  const policy = await db.insurancePolicy.findUnique({ where: { id: policyId }, select: { userId: true } });
  if (!policy) return NextResponse.json({ error: "بیمه یافت نشد" }, { status: 404 });
  if (policy.userId !== session.userId) {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }
  return null;
}

// ──────────── Mass Assignment Protection ────────────
// Whitelist allowed fields for each entity type.

export const ALLOWED_FIELDS = {
  vehicle: ["type", "make", "model", "year", "plate", "engineHours", "location", "lat", "lng", "image", "notes"],
  profile: ["name", "email", "nationalId", "address", "postalCode", "city", "province"],
  technician: ["bio", "experienceYears", "hourlyRate", "travelFeeBase", "inspectionFee", "inspectionFeeHeavy", "availableNow", "responseMins", "lat", "lng", "heading"],
  message: ["body", "kind"],
  review: ["rating", "comment", "tags"],
  ticket: ["subject", "category", "priority", "message"],
  insurance: ["provider", "policyNumber", "type", "startDate", "endDate", "premiumAmount", "coverageAmount", "vehicleId", "notes"],
  maintenance: ["category", "title", "intervalKm", "intervalHours", "intervalDays", "lastDoneKm", "lastDoneHours", "lastDoneDate", "nextDueKm", "nextDueDate", "notes", "active", "vehicleId"],
} as const;

// Fields that should NEVER be settable by client (server-authoritative only)
export const FORBIDDEN_FIELDS = new Set([
  "role", "status", "verified", "rating", "reviewCount", "balance",
  "completedJobs", "phoneVerified", "profileCompleted", "password",
  "passwordHash", "totalEarned", "totalCommission", "totalWithdrawn",
  "pendingBalance", "platformCommission", "netEarnings", "holdUntil",
  "reviewerId", "adminNotes", "createdAt", "updatedAt", "id",
]);

// Filter an object to only allow whitelisted fields
export function sanitizeInput<T extends Record<string, any>>(input: T, allowed: readonly string[]): Partial<T> {
  const result: Record<string, any> = {};
  for (const key of allowed) {
    if (key in input) {
      result[key] = input[key];
    }
  }
  return result as Partial<T>;
}

// ──────────── Request ID ────────────

export function generateRequestId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MEK-${ts}-${rand}`;
}

// ──────────── Error Handler ────────────

export function apiError(message: string, status: number = 400, requestId?: string) {
  return NextResponse.json(
    {
      error: process.env.NODE_ENV === "production" ? "خطایی در پردازش درخواست رخ داد" : message,
      requestId: requestId || generateRequestId(),
    },
    { status }
  );
}
