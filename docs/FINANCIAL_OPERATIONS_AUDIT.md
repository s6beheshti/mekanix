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


## 7. Concurrency detail confirmed from the current implementation

### 7.1 Wallet release: duplicate credit is possible

The wallet GET handler first loads pending transactions into memory. For each expired row it performs two independent database calls:

1. `walletTransaction.update({ where: { id }, data: { status: "AVAILABLE" } })`
2. `wallet.update({ data: { pendingBalance: decrement(netAmount), balance: increment(netAmount) } })`

There is no conditional `status: PENDING` predicate in the update and no single database transaction combining the status transition with the wallet balance movement. Two concurrent GET requests can both have loaded the same PENDING row and both increment the wallet, even though the row ends AVAILABLE only once. A process failure between the two writes can also leave status and balances inconsistent.

### 7.2 Withdrawal: transaction wrapper does not prevent stale-balance lost updates

The withdrawal handler does use a database transaction, but its concurrency control is not sufficient by itself. Each transaction reads the wallet balance, calculates `balanceAfter = balanceBefore - amount` in application code, creates a withdrawal request and ledger entry, then writes the precomputed balance with a normal `update`.

Under PostgreSQL's common READ COMMITTED isolation, two concurrent transactions can both read the same starting balance before either commits. Their wallet updates serialize at the row, but the later update can write its stale precomputed balance rather than subtracting from the newly committed balance. Both withdrawal requests and both ledger entries may therefore commit while the wallet balance reflects only one debit. This is a lost-update / ledger-to-balance inconsistency risk, not a demonstrated production incident.

A robust fix should use one of:
- a conditional atomic debit (update only where balance is still at least the requested amount, with an atomic decrement), and verify exactly one row was updated; or
- explicit row locking / serializable isolation with retry handling.

The chosen approach must be tested against both supported database engines. It should also use an idempotency key so client retries cannot create duplicate withdrawal requests.

### 7.3 The withdrawal schema exists but is not wired into the route

`src/lib/schemas/wallet.ts` documents `withdrawRequestSchema` as used by the withdrawal route and sets a 10,000 maximum, but the current route imports no schema and reads `req.json()` directly. Consequently, the route does not enforce the schema's numeric type, upper bound or method enum. The schema itself currently does not require integer amounts or bank/card destination details; those requirements need a deliberate product decision before enforcing them.

### 7.4 Schema comments do not settle the deployed currency contract

The current Prisma schema labels Wallet balances and WalletTransaction amounts as IRR. Technician fee defaults are 15, 3, 7 and 20 with IRR comments, while the checked-in seed has USD-described fee assumptions and converts none of those values before creating IRR-labelled invoice/payment rows. These are conflicting source-level conventions. Neither comments nor demo fixtures establish the unit of deployed historical rows.


## 8. Admin UI versus admin API: important distinction

The current `src/components/mek/admin/payments.tsx` is read-only: it fetches and displays payment rows and aggregate statistics, and contains no action that calls the generic admin PATCH endpoint. The status-only mutation is nevertheless exposed by the backend route `PATCH /api/admin/payments/:id` through the generic `[resource]/[id]` handler.

Therefore, the source confirms an API capability, not a currently visible button in the shipped admin payments screen. Restricting the UI alone would not remove the backend risk; the API transition rules must be corrected independently.


## 9. Prepay hold scheduling depends on the job-completion path

The current `src/lib/prepay-settlement.ts` creates the PREPAY `WalletTransaction` with `status: "PENDING"` and `holdUntil: null`, while incrementing `Wallet.pendingBalance`. The wallet GET release loop requires a non-null `holdUntil` earlier than now.

There is an important second writer: `src/app/api/jobs/[id]/status/route.ts` sets `holdUntil` to completion time + 12 hours for all PENDING wallet transactions when a job transitions to COMPLETED through that route. Thus the original null does **not** by itself prove that every prepay transaction is permanently stuck.

However, the verified invoice callback in `src/app/api/gateway/callback/route.ts` independently sets the job to COMPLETED inside its own transaction and does not run that 12-hour WalletTransaction update. The local simulator invoice-success path in `src/app/api/payments/route.ts` also marks the job COMPLETED directly without setting the prepay hold. Those completion paths can leave a previously created PREPAY transaction with `holdUntil: null`, making it ineligible for the GET release loop. Conversely, completion through the job-status route schedules the 12-hour hold.

**Implication:** the intended hold policy is implemented inconsistently across completion paths. A prepay balance may remain pending after invoice/simulator completion, depending on which path completed the job. Centralize completion settlement so every path atomically applies the same hold policy, and test all completion entry points plus release idempotency. This is a code-path finding, not proof that any deployed technician balance is affected.

## 10. Invoice callback does not post technician earnings

The invoice branch in `src/app/api/gateway/callback/route.ts` marks the invoice PAID, marks the job COMPLETED, activates the warranty, and sends notifications. It does not create a `WalletTransaction`, increment the technician wallet, or create a `WalletLedger` entry in that transaction. The technician is notified that payment was received, but the inspected callback does not record an earning for that completed invoice.

This is separate from the PREPAY path, which does create pending wallet transactions. Do not assume the invoice amount automatically becomes technician income. Before implementing invoice earnings, define labor/parts/travel split, platform commission, refund/chargeback handling, hold period, and the exact wallet/ledger unit. Add a test that reconciles a verified invoice payment to the expected technician earning and commission.

## 11. Referral claim is not proof of a separate payout

The inspected `PATCH /api/referral` route only changes the Referral claim state and creates a notification; it does not itself create a monetary credit. The route tree contains no separately named referral payout endpoint or worker. Repository-wide code search was not conclusive, so this audit does **not** claim that no other writer exists anywhere in the codebase. A full writer trace is still required before calling referral rewards payable. Until that trace and a corresponding wallet/ledger entry are verified, the UI's claimed state must not be treated as evidence of a credited balance.


## 12. Cancellation does not reconcile collected prepay or invoice payments

The customer cancellation transition in `src/app/api/jobs/[id]/status/route.ts` allows CANCELLED from REQUESTED, ACCEPTED and EN_ROUTE. The route updates the job/request state and emits ordinary notifications/messages, but the cancellation branch does not inspect or update related `Payment`, `PaymentGatewayLog`, `WalletTransaction`, `Wallet` or `WalletLedger` records. Since prepay checkout is allowed for any job not CANCELLED, REJECTED or COMPLETED, a customer can have a successful prepay and subsequently cancel while the job is still in an allowed cancellation state. No refund or pending-earning reversal is performed by this cancellation path.

Separately, `PATCH /api/invoices/[id]` permits a technician or admin to set invoice status to CANCELLED without checking the current invoice status. It does not reconcile a linked Payment. Therefore the route can mark an already-PAID invoice CANCELLED while its Payment remains SUCCEEDED; this is a status inconsistency, not a refund. The generic admin payment PATCH also permits status-only REFUNDED and does not invoke a provider refund or ledger reversal (see the earlier admin payment section).

The inspected `src/lib/payment-provider.ts` abstraction exposes create and verify operations only; no refund operation is defined for the supported providers. The gateway callback's failed/cancelled branch applies to an unverified checkout and is not a post-settlement refund.

**Required controls before production:** define cancellation eligibility and fee/refund policy for each stage; prevent invoice cancellation after successful payment unless a dedicated audited refund workflow is used; implement provider-specific refund request + verification/reconciliation, idempotency, and compensating wallet/ledger entries; and test prepay-paid-then-cancel, invoice-paid-then-cancel, duplicate refund callback, provider timeout, and partial failure scenarios. Do not use a status field alone as proof that money was returned.
