# MEKANIX production-readiness changes

This branch contains the safe, source-level hardening changes that can be applied without production credentials or destructive database migrations.

## Applied

- Removed the tracked root `.env` file from the repository.
- Added `.env.example` with placeholder-only values.
- Added repository hygiene rules for local databases, backups and generated artifacts.
- Added a CI workflow for repository hygiene, lint, Prisma generation and production build.
- Added `scripts/check-repository-hygiene.mjs`.
- Changed request-id generation to use cryptographic randomness.
- Added a money helper for integer monetary amounts.
- Hardened payment initiation and verification:
  - authenticated session is authoritative for payer identity;
  - client-supplied `userId` is ignored;
  - payment verification requires the authenticated owner;
  - mock gateway is explicit and disabled unless `PAYMENT_GATEWAY=mock`;
  - payment currency is no longer silently written as USD.
- Hardened VIP activation:
  - authenticated session is authoritative;
  - a payment is mandatory;
  - payment ownership and successful status are verified before activation;
  - duplicate activation with the same payment is idempotent.

## Intentionally not auto-migrated

These require a deployment decision or a database migration and therefore should not be changed blindly:

1. Replace Prisma `Float` money fields with `Decimal` or integer minor units and create a data migration.
2. Replace the mock gateway with Zarinpal/IDPay using real merchant credentials and callback verification.
3. Move rate limiting and idempotency storage from process memory to Redis/Upstash.
4. Normalize and index phone numbers and finish OTP brute-force protection.
5. Normalize the vehicle catalog into Brand → Model → Generation → Trim → Engine/Transmission and migrate existing records.
6. Replace hard-coded CARE prices with versioned pricing rules and frozen snapshots.
7. Generate and review Prisma migrations against a real production database backup.

## Verification

CI now runs hygiene checks, ESLint, Prisma client generation and the production build on pushes/PRs.
