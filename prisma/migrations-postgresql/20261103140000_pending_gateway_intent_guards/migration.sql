-- Prevent duplicate concurrent VIP/prepay intents for one user.
-- A pending intent is released when it becomes VERIFIED, FAILED, or CANCELLED.
CREATE UNIQUE INDEX "PaymentGatewayLog_pending_user_purpose_key"
ON "PaymentGatewayLog"("userId", "purpose")
WHERE "userId" IS NOT NULL
  AND "purpose" IN ('vip', 'prepay')
  AND "status" IN ('INITIATED', 'REDIRECTED');

-- An invoice has one Payment row; it may have only one active gateway attempt.
CREATE UNIQUE INDEX "PaymentGatewayLog_pending_invoice_payment_key"
ON "PaymentGatewayLog"("paymentId")
WHERE "paymentId" IS NOT NULL
  AND "purpose" = 'invoice'
  AND "status" IN ('INITIATED', 'REDIRECTED');
