export type PaymentGatewayName = "ZARINPAL" | "IDPAY" | "SHAPARAK_SIM";

export function gatewayTypeForProvider(provider: string): PaymentGatewayName {
  if (provider === "zarinpal") return "ZARINPAL";
  if (provider === "idpay") return "IDPAY";
  return "SHAPARAK_SIM";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Only return a customer to a known provider checkout origin. Simulator
 * redirects are accepted only in non-production and only back to this app's
 * own gateway callback endpoint.
 */
export function isTrustedGatewayRedirect(
  gateway: string,
  value: string,
  callbackOrigin: string,
  isProduction: boolean,
): boolean {
  try {
    const target = new URL(value);
    if (target.username || target.password || target.hash) return false;

    if (gateway === "SHAPARAK_SIM") {
      const callback = new URL(callbackOrigin);
      return (
        !isProduction &&
        target.origin === callback.origin &&
        target.pathname === "/api/gateway/callback"
      );
    }

    if (target.protocol !== "https:" || (target.port && target.port !== "443")) return false;
    const allowedHosts: Record<string, string[]> = {
      ZARINPAL: ["www.zarinpal.com", "sandbox.zarinpal.com"],
      IDPAY: ["idpay.ir", "www.idpay.ir"],
    };
    return (allowedHosts[gateway] ?? []).includes(target.hostname.toLowerCase());
  } catch {
    return false;
  }
}
