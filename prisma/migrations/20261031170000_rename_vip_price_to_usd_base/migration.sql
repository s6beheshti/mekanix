-- VIP plan prices are stored in USD base units, not IRR.
ALTER TABLE "VipPlan" RENAME COLUMN "priceIrr" TO "priceUsd";
