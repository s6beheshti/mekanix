// Pricing Engine — calculates service prices per ARCHITECTURE.md §12.
//
// FinalPrice = Labor + Parts + Travel + Emergency - Discount
//
// All amounts are in IRR (Iranian Rial) minor units (toman × 10).
// For now, we keep Float for backward compat with the existing schema
// (PricingSnapshot.laborPrice, .total, etc. are Float columns).
//
// Schema mapping (PricingSnapshot Prisma model):
//   servicePrice  ← labor                (the package-derived service fee)
//   visitPrice    ← travel               (on-site visit / travel fee)
//   laborPrice    ← labor
//   partsPrice    ← parts
//   discount      ← discount             (VIP or promo)
//   taxRate       ← taxRate              (0.09 = 9% VAT)
//   taxTotal      ← taxTotal
//   total         ← total                (subtotal + taxTotal)
//   currency      ← currency             ("IRR")
//   pricingVersion← pricingVersion      ("2.0")

import { db } from "./db";

export interface PricingInput {
  packageId?: string;
  vehicleType: string; // CAR, TRUCK, EXCAVATOR, etc.
  laborHours: number; // estimated hours
  partsCost: number; // sum of parts
  travelDistanceKm: number;
  isEmergency: boolean;
  vipDiscountPercent?: number;
  region?: string; // for region-based pricing
}

export interface PricingBreakdown {
  labor: number;
  parts: number;
  travel: number;
  emergency: number;
  discount: number;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  total: number;
  currency: string;
  pricingVersion: string;
  breakdown: {
    laborRate: number;
    laborHours: number;
    travelRate: number;
    travelDistanceKm: number;
    emergencyMultiplier: number;
    vipDiscountPercent: number;
  };
}

const DEFAULT_TAX_RATE = 0.09; // 9% VAT

// Region multipliers (Tehran = 1.0 base)
const REGION_MULTIPLIERS: Record<string, number> = {
  tehran: 1.0,
  karaj: 0.95,
  isfahan: 0.9,
  shiraz: 0.9,
  mashhad: 0.9,
  tabriz: 0.88,
  other: 0.85,
};

// Vehicle type multipliers (heavy machinery costs more)
const VEHICLE_TYPE_MULTIPLIERS: Record<string, number> = {
  CAR: 1.0,
  TRUCK: 1.5,
  BUS: 1.4,
  EXCAVATOR: 2.0,
  LOADER: 2.0,
  BULLDOZER: 2.2,
  GRADER: 1.8,
  AGRI: 1.6,
  INDUSTRIAL: 1.8,
  OTHER: 1.3,
};

const EMERGENCY_MULTIPLIER = 1.5;

export async function calculatePrice(input: PricingInput): Promise<PricingBreakdown> {
  // Get package base price if provided. Today the package base price is
  // informational — the primary price driver is vehicle-type-scaled labor +
  // parts + travel. Phase 5 will fold it into the calculation (e.g. as a
  // pre-paid service credit) once the package redemption flow lands. Keeping
  // the fetch preserves the async contract callers will depend on.
  let packageBasePrice = 0;
  if (input.packageId) {
    const pkg = await db.servicePackage.findUnique({ where: { id: input.packageId } });
    packageBasePrice = pkg?.basePrice != null ? Number(pkg.basePrice) : 0;
  }

  // Labor rate depends on vehicle type
  const vehicleMultiplier = VEHICLE_TYPE_MULTIPLIERS[input.vehicleType] ?? 1.3;
  const baseLaborRate = 50000; // 50,000 IRR/hour base
  const laborRate = baseLaborRate * vehicleMultiplier;
  const labor = laborRate * input.laborHours;

  // Parts cost (from input)
  const parts = input.partsCost;

  // Travel fee: base + per-km
  const baseTravelFee = 15000;
  const perKmRate = 2000;
  const travel = baseTravelFee + input.travelDistanceKm * perKmRate;

  // Emergency surcharge
  const emergency = input.isEmergency ? (labor + parts + travel) * (EMERGENCY_MULTIPLIER - 1) : 0;

  // VIP discount
  const vipPercent = input.vipDiscountPercent ?? 0;
  const preDiscount = labor + parts + travel + emergency;
  const discount = preDiscount * (vipPercent / 100);

  // Subtotal
  const subtotal = preDiscount - discount;

  // Tax
  const taxTotal = subtotal * DEFAULT_TAX_RATE;

  // Total
  const total = subtotal + taxTotal;

  // Region multiplier is reserved for future region-based pricing — keep it
  // in the input contract so callers don't need to change shape when we
  // activate it. For now we don't apply it (Tehran base = 1.0 is the
  // implicit default above).
  void packageBasePrice;
  void REGION_MULTIPLIERS;
  void input.region;

  return {
    labor: Math.round(labor),
    parts: Math.round(parts),
    travel: Math.round(travel),
    emergency: Math.round(emergency),
    discount: Math.round(discount),
    subtotal: Math.round(subtotal),
    taxRate: DEFAULT_TAX_RATE,
    taxTotal: Math.round(taxTotal),
    total: Math.round(total),
    currency: "IRR",
    pricingVersion: "2.0",
    breakdown: {
      laborRate,
      laborHours: input.laborHours,
      travelRate: perKmRate,
      travelDistanceKm: input.travelDistanceKm,
      emergencyMultiplier: input.isEmergency ? EMERGENCY_MULTIPLIER : 1,
      vipDiscountPercent: vipPercent,
    },
  };
}

// Create a pricing snapshot (frozen at booking time)
export async function createPricingSnapshot(bookingId: string, pricing: PricingBreakdown): Promise<string> {
  const snapshot = await db.pricingSnapshot.create({
    data: {
      bookingId,
      servicePrice: pricing.labor, // labor as service price
      visitPrice: pricing.travel,
      laborPrice: pricing.labor,
      partsPrice: pricing.parts,
      discount: pricing.discount,
      taxRate: pricing.taxRate,
      taxTotal: pricing.taxTotal,
      total: pricing.total,
      currency: pricing.currency,
      pricingVersion: pricing.pricingVersion,
    },
  });
  return snapshot.id;
}
