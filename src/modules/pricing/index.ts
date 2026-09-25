// MEKANIX — Pricing module barrel.
//
// Pricing covers the money model (ARCHITECTURE.md §12):
//
//   FinalPrice = Labor + Parts + Travel + Emergency - Discount
//
// The pricing engine returns a structured breakdown + persists a frozen
// snapshot at booking time so historical prices are immutable.
//
// VIP discounts are wired via `@/lib/vip` — callers pass
// `vipDiscountPercent` into `calculatePrice()` to apply the discount
// server-side.

export {
  calculatePrice,
  createPricingSnapshot,
  type PricingInput,
  type PricingBreakdown,
} from "@/lib/pricing";

// VIP discount helpers live in `@/lib/vip` — re-exported here so the
// pricing module is a one-stop import site for callers that want to
// compute a price including VIP treatment.
export {
  checkVipStatus,
  getVipDiscount,
  subscribeToVip,
  type VipSubscriptionResult,
} from "@/lib/vip";

// Re-export the legacy money types from Phase 3 so existing callers that
// imported them from this barrel continue to resolve.
export {
  type Invoice,
  type Payment,
} from "@/lib/api";

export {
  paymentCreateSchema,
  withdrawRequestSchema,
  walletLedgerQuerySchema,
  PAYMENT_METHODS,
  type PaymentCreateInput,
  type WithdrawRequestInput,
  type WalletLedgerQueryInput,
} from "@/lib/schemas/wallet";
