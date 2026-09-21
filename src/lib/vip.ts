import { db } from "./db";

// Check if user has active VIP subscription
export async function checkVipStatus(userId: string): Promise<{ active: boolean; plan?: string; expiresAt?: Date }> {
  const sub = await db.userVipSubscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      OR: [
        { expiresAt: null }, // lifetime
        { expiresAt: { gt: new Date() } }, // not expired
      ],
    },
    include: { plan: true },
  });

  if (!sub) return { active: false };
  return {
    active: true,
    plan: sub.plan.slug,
    expiresAt: sub.expiresAt ?? undefined,
  };
}

// Get VIP discount for user (0 if no active subscription)
export async function getVipDiscount(userId: string): Promise<number> {
  const { active, plan } = await checkVipStatus(userId);
  if (!active || !plan) return 0;

  const planData = await db.vipPlan.findUnique({ where: { slug: plan } });
  return planData?.discountPct || 0;
}

// Calculate server-authoritative price for a service
export async function calculateServicePrice(opts: {
  technicianId: string;
  serviceCategory: string;
  laborHours: number;
  partsTotal: number;
  travelFee?: number;
  customerId?: string;
}): Promise<{
  laborTotal: number;
  partsTotal: number;
  travelFee: number;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxTotal: number;
  total: number;
}> {
  const technician = await db.technician.findUnique({
    where: { id: opts.technicianId },
    select: { hourlyRate: true, travelFeeBase: true, inspectionFee: true },
  });

  if (!technician) throw new Error("Technician not found");

  const laborRate = technician.hourlyRate;
  const laborTotal = opts.laborHours * laborRate;
  const travelFee = opts.travelFee ?? technician.travelFeeBase;
  const partsTotal = opts.partsTotal;

  let subtotal = laborTotal + partsTotal + travelFee;

  // Apply VIP discount
  let discount = 0;
  if (opts.customerId) {
    const customer = await db.customer.findUnique({
      where: { id: opts.customerId },
      include: { user: { include: { vipSubscriptions: { where: { status: "ACTIVE" }, include: { plan: true } } } } },
    });
    
    const activeVip = customer?.user.vipSubscriptions.find(
      (s) => s.status === "ACTIVE" && (!s.expiresAt || s.expiresAt > new Date())
    );
    
    if (activeVip?.plan) {
      discount = subtotal * (activeVip.plan.discountPct / 100);
      subtotal -= discount;
    }
  }

  const taxRate = 0.09; // 9% tax
  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;

  return { laborTotal, partsTotal, travelFee, subtotal, discount, taxRate, taxTotal, total };
}
