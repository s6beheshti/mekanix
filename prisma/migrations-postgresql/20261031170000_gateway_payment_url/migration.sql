-- Persist the validated hosted bank URL so customers can resume
-- an existing pending intent instead of creating a second charge.
ALTER TABLE "PaymentGatewayLog" ADD COLUMN "paymentUrl" TEXT;
