-- Prevent concurrent duplicate VIP/prepayment intents for one customer.
-- The partial index is released automatically when the gateway log leaves
-- INITIATED/REDIRECTED (FAILED, CANCELLED, or VERIFIED).
CREATE UNIQUE INDEX "PaymentGatewayLog_pending_user_purpose_key"
ON "PaymentGatewayLog"("userId", "purpose")
WHERE "purpose" IN ('vip', 'prepay')
  AND "status" IN ('INITIATED', 'REDIRECTED');
