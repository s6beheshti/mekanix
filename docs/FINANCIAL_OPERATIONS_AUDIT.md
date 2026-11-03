# Financial Operations Audit — Additional Findings

**Parent audit:** [FINANCIAL_CURRENCY_MIGRATION.md](./FINANCIAL_CURRENCY_MIGRATION.md)  
**Audit basis:** current `main` source inspected on 2026-11-03.  
**Status:** source-level findings only. No production database, provider account, or deployed financial rows were inspected. No financial changes are authorized by this document.

## 1. Admin payment status mutation is not a refund workflow

The generic admin PATCH handler at `src/app/api/admin/[resource]/[id]/route.ts` exposes `payments` with only the `status` field whitelisted. It applies the supplied status through `db.payment.update` without a transition table, provider refund call, refund amount/currency validation, refund record, wallet reversal, or ledger posting.

The admin payment list at `src/components/mek/admin/payments.tsx` is read-only and displays payment records; it does not implement a refund/payout workflow.

**Implication:** the route comment mentions marking a payment `REFUNDED`, but changing a Payment status alone is not evidence that money was returned. The generic endpoint also needs to prevent an administrator from changing a pending payment to `SUCCEEDED` without the verified gateway settlement path. Replace unrestricted status assignment with explicit, audited commands and state transitions. A refund must be a separate idempotent operation with provider confirmation and matching reversal entries across invoice/payment/wallet/ledger.

## 2. Seed data is demonstration data and contains mixed monetary conventions

The checked-in `prisma/seed.ts` contains explicit comments that technician travel/inspection fees are USD and approximately equivalent to IRR, and creates technician rates such as 78, 72 and 84. The same seed constructs invoices from those rate values and writes the resulting invoices and completed-job Payment records with `currency: "IRR"`. It also seeds wallet balances and lifetime totals as small bare numbers without an explicit currency field, and VIP plan values 9/19/39 into `priceIrr`.

The seed is therefore not a valid source for inferring production units or for constructing a conversion factor. It demonstrates that the repository's demo fixtures themselves combine USD-described fee inputs with IRR-labelled invoice/payment rows.

The seed script also begins by deleting multiple tables before recreating demo entities. The HTTP `POST /api/seed` route is guarded to return 404 when `NODE_ENV === "production"`, but that guard does not make manually running the seed script against a real database safe.

**Required control:** seed only disposable local/test databases, add an explicit environment/database safety assertion inside the seed script itself, and never use seed values as a historical production-data migration map.

## 3. Withdrawal validation and concurrency: refined finding

The withdrawal route imports no `withdrawRequestSchema` and does not parse the request body through it. The schema defines a maximum of 10,000 and a payment-method enum, but those constraints are not enforced by this route. The route accepts the body fields directly and only checks `!amount || amount <= 0`; it does not explicitly reject non-finite values or fractional amounts.

Inside the database transaction the route re-reads the wallet, computes a new balance in application code, and writes the resulting balance with a normal update. It does not use a conditional debit predicate or an explicit row-locking strategy. A transaction alone does not prove that concurrent requests cannot both pass the balance check under the database's configured isolation level.

**Required tests:** concurrent withdrawals whose sum exceeds the starting balance; invalid NaN/infinity/fractional/over-limit inputs; duplicate idempotency keys; and wallet balance versus ledger reconciliation after success and rollback.

## 4. Referral reward claim is a state change, not a recorded credit

The inspected `PATCH /api/referral` handler changes `rewardClaimed` and referral status, then sends a notification. That handler itself creates no wallet transaction, wallet-ledger entry, or payment. The source-level behavior therefore proves only that the reward is marked claimed in this route, not that funds were credited. Before treating referral rewards as payable, locate and verify any separate credit writer; if none exists, implement one idempotent transactional credit path.

## 5. Prioritized operational remediation

1. Remove financial side effects from wallet GET; move releases to an idempotent worker/command with conditional status transition and atomic wallet + ledger writes.
2. Use the withdrawal Zod schema at the route boundary, define integer minor-unit/currency semantics, and perform a concurrency-safe conditional debit.
3. Replace admin Payment status assignment with explicit transition operations; never represent a refund by status-only mutation.
4. Define invoice-to-technician earning, commission, hold, refund and payout rules before adding invoice wallet credits.
5. Verify whether a separate referral-credit writer exists; make claim and credit exactly-once if reward payout is intended.
6. Add database-level integration tests for concurrency, rollback, duplicate requests and ledger reconciliation on both SQLite and PostgreSQL.
7. Protect the seed script itself from running against any non-disposable database.

## 6. Scope and limitations

This is not a full production readiness approval. The findings are based on repository source and do not establish actual deployed data semantics, historical balances, external provider refunds, bank payout execution, or the existence/non-existence of out-of-repository operational procedures. Keep PR #3 blocked until the currency contract and settlement paths are resolved. Keep this audit documentation-only until the owner approves a concrete implementation scope.
