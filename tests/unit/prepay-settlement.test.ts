import { describe, expect, it } from "vitest";
import { calculatePrepayFees } from "@/lib/prepay-settlement";

describe("pre-service fee calculation", () => {
  const technician = { inspectionFee: 7, inspectionFeeHeavy: 20, travelFeeBase: 3 };

  it("uses passenger inspection fee and rounds the platform commission", () => {
    expect(calculatePrepayFees({
      request: { vehicle: { type: "CAR" } },
      technician,
    })).toEqual({
      inspectionFee: 7,
      travelFee: 3,
      gross: 10,
      commission: 1,
      net: 9,
    });
  });

  it("uses heavy machinery inspection fee", () => {
    expect(calculatePrepayFees({
      request: { vehicle: { type: "EXCAVATOR" } },
      technician,
    })).toEqual({
      inspectionFee: 20,
      travelFee: 3,
      gross: 23,
      commission: 2,
      net: 21,
    });
  });

  it("rejects invalid fee configuration", () => {
    expect(() => calculatePrepayFees({
      request: { vehicle: { type: "CAR" } },
      technician: { inspectionFee: 0, inspectionFeeHeavy: 0, travelFeeBase: 0 },
    })).toThrow("Invalid pre-service fee configuration");
  });
});
