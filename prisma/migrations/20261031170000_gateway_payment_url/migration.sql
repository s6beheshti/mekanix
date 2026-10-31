-- Persist the already-validated hosted bank URL so a customer can resume
-- the same pending intent instead of creating a second charge.
ALTER TABLE "PaymentGatewayLog" ADD COLUMN "paymentUrl" TEXT;
