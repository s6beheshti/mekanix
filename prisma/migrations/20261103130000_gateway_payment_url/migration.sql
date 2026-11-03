-- Persist the validated hosted gateway URL so a customer can resume
-- the same pending payment intent without creating a second charge.
ALTER TABLE "PaymentGatewayLog" ADD COLUMN "paymentUrl" TEXT;
