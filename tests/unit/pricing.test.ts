// MEKANIX Phase 6 — Unit tests for the pricing engine (@/lib/pricing)
//
// FinalPrice = Labor + Parts + Travel + Emergency - Discount
//   tax = subtotal * 0.09
//   total = subtotal + tax
//
// Covers:
//   - calculatePrice returns correct breakdown for CAR with no emergency
//   - Emergency adds 50% surcharge (multiplier 1.5)
//   - VIP discount reduces the total
//   - Heavy machinery (TRUCK) has a higher labor rate (1.5x)
//   - Tax is 9% of subtotal
//   - All amounts are rounded to integers (Math.round)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculatePrice, type PricingInput } from "@/lib/pricing";

// Mock the db module — calculatePrice only calls db.servicePackage.findUnique
// when packageId is provided. The pricing math itself is pure.
vi.mock("@/lib/db", () => ({
  db: {
    servicePackage: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    pricingSnapshot: {
      create: vi.fn(),
    },
  },
}));

// Base input that produces a known-good calculation for a CAR.
// We'll spread + override fields per-test.
const baseInput: PricingInput = {
  vehicleType: "CAR",
  laborHours: 2,
  partsCost: 100_000,
  travelDistanceKm: 10,
  isEmergency: false,
};

// Expected breakdown for baseInput (CAR, no emergency, no VIP):
//   laborRate = 50000 * 1.0 = 50000
//   labor     = 50000 * 2   = 100000
//   parts     = 100000
//   travel    = 15000 + 10 * 2000 = 35000
//   emergency = 0
//   preDiscount = 100000 + 100000 + 35000 = 235000
//   discount  = 0
//   subtotal  = 235000
//   taxTotal  = 235000 * 0.09 = 21150
//   total     = 235000 + 21150 = 256150
const BASE_LABOR = 100_000;
const BASE_PARTS = 100_000;
const BASE_TRAVEL = 35_000;
const BASE_PRE_DISCOUNT = BASE_LABOR + BASE_PARTS + BASE_TRAVEL; // 235_000
const BASE_SUBTOTAL = BASE_PRE_DISCOUNT; // no VIP
const BASE_TAX = Math.round(BASE_SUBTOTAL * 0.09); // 21150
const BASE_TOTAL = Math.round(BASE_SUBTOTAL + BASE_TAX); // 256150

describe("pricing — calculatePrice base breakdown (CAR, no emergency)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the expected labor / parts / travel / subtotal / tax / total", async () => {
    const result = await calculatePrice(baseInput);

    expect(result.labor).toBe(BASE_LABOR);
    expect(result.parts).toBe(BASE_PARTS);
    expect(result.travel).toBe(BASE_TRAVEL);
    expect(result.emergency).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.subtotal).toBe(BASE_SUBTOTAL);
    expect(result.taxRate).toBe(0.09);
    expect(result.taxTotal).toBe(BASE_TAX);
    expect(result.total).toBe(BASE_TOTAL);
    expect(result.currency).toBe("IRR");
    expect(result.pricingVersion).toBe("2.0");
  });

  it("breakdown includes the laborRate / multipliers / hours", async () => {
    const result = await calculatePrice(baseInput);

    expect(result.breakdown.laborRate).toBe(50_000); // base * CAR(1.0)
    expect(result.breakdown.laborHours).toBe(2);
    expect(result.breakdown.travelRate).toBe(2_000);
    expect(result.breakdown.travelDistanceKm).toBe(10);
    expect(result.breakdown.emergencyMultiplier).toBe(1);
    expect(result.breakdown.vipDiscountPercent).toBe(0);
  });
});

describe("pricing — emergency surcharge", () => {
  it("Emergency adds 50% surcharge on (labor + parts + travel)", async () => {
    const result = await calculatePrice({ ...baseInput, isEmergency: true });

    // emergency = (labor + parts + travel) * (1.5 - 1) = 235000 * 0.5 = 117500
    const expectedEmergency = Math.round(BASE_PRE_DISCOUNT * 0.5);
    expect(result.emergency).toBe(expectedEmergency);

    // preDiscount with emergency = 235000 + 117500 = 352500
    const expectedPreDiscount = BASE_PRE_DISCOUNT + expectedEmergency;
    const expectedSubtotal = expectedPreDiscount; // no VIP
    const expectedTax = Math.round(expectedSubtotal * 0.09);
    const expectedTotal = Math.round(expectedSubtotal + expectedTax);

    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.taxTotal).toBe(expectedTax);
    expect(result.total).toBe(expectedTotal);
    expect(result.breakdown.emergencyMultiplier).toBe(1.5);
  });
});

describe("pricing — VIP discount reduces the total", () => {
  it("10% VIP discount reduces subtotal by 10%", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vipDiscountPercent: 10,
    });

    // discount = preDiscount * 10% = 23500
    const expectedDiscount = Math.round(BASE_PRE_DISCOUNT * 0.10);
    expect(result.discount).toBe(expectedDiscount);

    const expectedSubtotal = BASE_PRE_DISCOUNT - expectedDiscount;
    const expectedTax = Math.round(expectedSubtotal * 0.09);
    const expectedTotal = Math.round(expectedSubtotal + expectedTax);

    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.taxTotal).toBe(expectedTax);
    expect(result.total).toBe(expectedTotal);
    expect(result.breakdown.vipDiscountPercent).toBe(10);

    // Total is strictly less than the non-discounted total
    expect(result.total).toBeLessThan(BASE_TOTAL);
  });

  it("50% VIP discount halves the preDiscount", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vipDiscountPercent: 50,
    });

    const expectedDiscount = Math.round(BASE_PRE_DISCOUNT * 0.50);
    expect(result.discount).toBe(expectedDiscount);

    const expectedSubtotal = BASE_PRE_DISCOUNT - expectedDiscount;
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.total).toBeLessThan(BASE_TOTAL);
  });

  it("100% VIP discount zeroes out the subtotal + total (minus rounding)", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vipDiscountPercent: 100,
    });

    expect(result.discount).toBe(BASE_PRE_DISCOUNT);
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("pricing — heavy machinery (TRUCK) has higher labor rate", () => {
  it("TRUCK labor rate = base * 1.5 = 75000/hour", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vehicleType: "TRUCK",
    });

    // laborRate = 50000 * 1.5 = 75000
    expect(result.breakdown.laborRate).toBe(75_000);
    // labor = 75000 * 2 = 150000 (vs 100000 for CAR)
    expect(result.labor).toBe(150_000);
    // TRUCK total should exceed CAR total
    const carResult = await calculatePrice(baseInput);
    expect(result.total).toBeGreaterThan(carResult.total);
  });

  it("EXCAVATOR labor rate = base * 2.0 = 100000/hour (heavy machinery)", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vehicleType: "EXCAVATOR",
    });

    expect(result.breakdown.laborRate).toBe(100_000);
    expect(result.labor).toBe(200_000);
  });

  it("Unknown vehicle type falls back to default 1.3x multiplier", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vehicleType: "ALIEN_CRAFT",
    });

    // 50000 * 1.3 = 65000
    expect(result.breakdown.laborRate).toBe(65_000);
  });
});

describe("pricing — tax is 9% of subtotal", () => {
  it("taxRate is 0.09", async () => {
    const result = await calculatePrice(baseInput);
    expect(result.taxRate).toBe(0.09);
  });

  it("taxTotal = round(subtotal * 0.09)", async () => {
    const result = await calculatePrice(baseInput);
    expect(result.taxTotal).toBe(Math.round(result.subtotal * 0.09));
  });

  it("tax scales correctly with emergency surcharge", async () => {
    const result = await calculatePrice({ ...baseInput, isEmergency: true });
    expect(result.taxTotal).toBe(Math.round(result.subtotal * 0.09));
  });

  it("tax scales correctly with VIP discount", async () => {
    const result = await calculatePrice({
      ...baseInput,
      vipDiscountPercent: 15,
    });
    expect(result.taxTotal).toBe(Math.round(result.subtotal * 0.09));
  });
});

describe("pricing — all amounts are rounded to integers", () => {
  it("every numeric output field is an integer", async () => {
    const result = await calculatePrice({
      ...baseInput,
      isEmergency: true,
      vipDiscountPercent: 17,
    });

    const numericFields = [
      result.labor,
      result.parts,
      result.travel,
      result.emergency,
      result.discount,
      result.subtotal,
      result.taxTotal,
      result.total,
    ];

    for (const n of numericFields) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
