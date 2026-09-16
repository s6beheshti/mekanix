import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Mechanic requests a withdrawal from their wallet balance.
// Validates available balance, creates WithdrawalRequest (status=REQUESTED),
// creates a PAYOUT WalletTransaction (status=PROCESSING), decrements wallet.balance.
// Admin reviews → approves (PAID) or rejects (REFUND the balance back).
const MIN_WITHDRAWAL = 5; // USD minimum

export async function POST(req: Request) {
  const { technicianId, amount, method, cardNumber, shebaNumber, bankName } = await req.json();
  if (!technicianId) return NextResponse.json({ error: "technicianId is required" }, { status: 400 });
  if (!amount || amount < MIN_WITHDRAWAL) {
    return NextResponse.json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL}` }, { status: 400 });
  }

  const wallet = await db.wallet.findUnique({ where: { technicianId } });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  if (wallet.balance < amount) {
    return NextResponse.json({ error: "Insufficient available balance" }, { status: 400 });
  }

  const code = `WD-${Math.floor(4000 + Math.random() * 5000)}`;
  const maskedCard = cardNumber ? maskCard(cardNumber) : null;

  // 1. Create withdrawal request
  const withdrawal = await db.withdrawalRequest.create({
    data: {
      code,
      walletId: wallet.id,
      amount,
      method: method || "card",
      cardNumber: maskedCard,
      shebaNumber: shebaNumber ?? null,
      bankName: bankName ?? null,
      status: "REQUESTED",
    },
  });

  // 2. Create PAYOUT txn (PROCESSING — not yet COMPLETED, admin must approve)
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

function maskCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `**** **** **** ${digits.slice(-4)}`;
}
