import { describe, expect, it } from "vitest";
import { isPublicHttpsOrigin } from "@/lib/url-validation";

describe("isPublicHttpsOrigin", () => {
  it("accepts a canonical public HTTPS origin", () => {
    expect(isPublicHttpsOrigin("https://mekanix.ir")).toBe(true);
    expect(isPublicHttpsOrigin("https://staging.mekanix.ir")).toBe(true);
  });

  it.each([
    "http://mekanix.ir",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://10.0.0.8",
    "https://172.16.0.1",
    "https://192.168.1.10",
    "https://169.254.1.1",
    "https://100.64.0.1",
    "https://[::1]",
    "https://[fd00::1]",
    "https://app.internal",
    "https://mekanix.test",
    "https://example.invalid",
    "https://user:pass@mekanix.ir",
    "https://mekanix.ir/callback",
    "https://mekanix.ir?next=/",
    "https://mekanix.ir#callback",
    "not-a-url",
    "",
  ])("rejects non-public or non-origin URL: %s", (value) => {
    expect(isPublicHttpsOrigin(value)).toBe(false);
  });
});
