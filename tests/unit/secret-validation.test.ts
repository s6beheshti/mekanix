import { describe, expect, it } from "vitest";
import { isStrongSecret } from "@/lib/secret-validation";

describe("isStrongSecret", () => {
  it("accepts sufficiently long non-placeholder secrets", () => {
    expect(isStrongSecret("ci-jwt-9f2b8c4d7e1a6b3c5d0f8a2e4c6b1d9f", 32)).toBe(true);
  });

  it("rejects secrets shorter than the required minimum", () => {
    expect(isStrongSecret("short", 32)).toBe(false);
  });

  it("rejects the JWT example placeholder", () => {
    expect(isStrongSecret("development-only-not-for-production-change-me", 32)).toBe(false);
  });

  it("rejects common password placeholders", () => {
    expect(isStrongSecret("replace-with-a-long-random-password", 24)).toBe(false);
    expect(isStrongSecret("your-secret-value-that-is-long-enough", 24)).toBe(false);
  });

  it("rejects trivially repeated characters", () => {
    expect(isStrongSecret("a".repeat(40), 32)).toBe(false);
  });

  it("rejects surrounding whitespace", () => {
    expect(isStrongSecret(" ci-jwt-9f2b8c4d7e1a6b3c5d0f8a2e4c6b1d9f ", 32)).toBe(false);
  });
});
