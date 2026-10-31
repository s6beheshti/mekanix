// MEKANIX — Server initialization
// Initialize runtime providers once for every server process.

import { initEtaProvider } from "./eta-provider";
import { initSmsProvider } from "./sms-provider";
import { initPaymentProvider } from "./payment-provider";

let initialized = false;

export function initServer(): void {
  if (initialized) return;
  initialized = true;

  initEtaProvider();
  initSmsProvider();
  initPaymentProvider();

  // Redis is lazy-loaded in src/lib/redis.ts.
  console.log("🚀 MEKANIX server initialized");
}

initServer();
