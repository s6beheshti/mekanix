import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, checkRateLimit } from "@/lib/api-helpers";
import { getTechnicianFromSession } from "@/lib/auth";
import { RATE_LIMITS } from "@/lib/rate-limit";

// Mechanic requests a withdrawal from their wallet balance.
// technicianId is derived from the session — NEVER from request body (BOLA protection).
const MIN_WITHDRAWAL = 5; // USD minimum

function maskCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `**** **** **** ${digits.slice(-4)}`;
}

export async function POST(req: Request) {
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;

  // Tight rate limit on withdrawals
  const limited = checkRateLimit(req, "withdraw", RATE_LIMITS.WITHDRAW.max, RATE_LIMITS.WITHDRAW.windowMs);
  if (limited) return limited;

  if (session.role !== "TECHNICIAN" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Server-authoritative: resolve technician from session — IGNORE body.technicianId
  let technicianId: string;
  if (session.role === "ADMIN") {
    // Admin can specify technicianId (e.g. for manual admin operations)
    if (typeof body.technicianId !== "string" || !body.technicianId) {
      return NextResponse.json({ error: "technicianId is required" }, { status: 400 });
    }
    technicianId = body.technicianId;
  } else {
    const tech = await getTechnicianFromSession(session);
    if (!tech) return NextResponse.json({ error: "پروفایل مکانیک یافت نشد" }, { status: 403 });
    technicianId = tech.id;
  }

  const { amount, method, cardNumber, shebaNumber, bankName } = body;
  if (typeof amount !== "number" || amount < MIN_WITHDRAWAL) {
    return NextResponse.json({ error: `حداقل مبلغ برداشت $${MIN_WITHDRAWAL} است` }, { status: 400 });
  }

  const wallet = await db.wallet.findUnique({ where: { technicianId } });
  if (!wallet) return NextResponse.json({ error: "کیف پول یافت نشد" }, { status: 404 });
  if (wallet.balance < amount) {
    return NextResponse.json({ error: "موجودی قابل برداشت کافی نیست" }, { status: 400 });
  }

  const code = `WD-${Math.floor(4000 + Math.random() * 5000)}`;
  const maskedCard = cardNumber ? maskCard(String(cardNumber)) : null;

  // 1. Create withdrawal request
  const withdrawal = await db.withdrawalRequest.create({
    data: {
      code,
      walletId: wallet.id,
      amount,
      method: ["card", "bank"].includes(method) ? method : "card",
      cardNumber: maskedCard,
      shebaNumber: typeof shebaNumber === "string" ? shebaNumber.slice(0, 30) : null,
      bankName: typeof bankName === "string" ? bankName.slice(0, 100) : null,
      status: "REQUESTED",
    },
  });

  // 2. Create PAYOUT txn (PROCESSING — admin must approve)
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      kind: "PAYOUT",
      status: "PROCESSING",
      grossAmount: amount,
      commissionAmount: 0,
      netAmount: -amount,
      description: `Withdrawal request ${code}`,
    },
  });

  // 3. Decrement balance (held until admin pays)
  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      balance: { decrement: amount },
    },
  });

  return NextResponse.json({ ok: true, withdrawal });
}
