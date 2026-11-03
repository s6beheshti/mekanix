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


## 13. Wallet ledger does not mirror all balance movements; payout lifecycle is incomplete

The schema defines `WalletLedger` with types including RELEASE, REFUND, COMMISSION and WITHDRAWAL, but the inspected writers do not consistently create ledger rows for these events:

- PREPAY settlement in `src/lib/prepay-settlement.ts` creates PREPAY and COMMISSION `WalletTransaction` rows and increments `pendingBalance`, `totalEarned` and `totalCommission`; it does not create corresponding `WalletLedger` entries.
- The wallet GET auto-release loop changes a PENDING `WalletTransaction` to AVAILABLE and moves netAmount from pendingBalance to balance using two separate writes; it creates no RELEASE ledger row and is not atomic/idempotent under concurrent GET requests.
- Withdrawal creation is the inspected path that does create a WITHDRAWAL ledger row, but the wallet balance is written from a precomputed `balanceAfter` after a read inside a transaction, without a conditional debit/row lock. This retains the previously documented stale-read concurrency risk.
- The inspected API route tree exposes `POST /api/wallets/withdraw` to create a REQUESTED withdrawal, but no dedicated approval/rejection/payout execution route was found. `WithdrawalRequest.txnId` is available in the schema, but no writer was found in the inspected routes to attach a PAYOUT `WalletTransaction` when funds are actually sent.
- No inspected route performs a complete reconciliation between Wallet balance columns, WalletTransaction state, WalletLedger entries, WithdrawalRequest state and external bank/provider payout confirmation.

**Implication:** WalletLedger cannot currently be treated as a complete audit trail for all wallet movements, and a REQUESTED withdrawal is not evidence that a bank payout was executed. Before production payouts, define one authoritative posting service that atomically writes the transaction, ledger, wallet totals and withdrawal state, with a durable external-payout reference and idempotent reconciliation. Add invariant tests that recompute balances from ledger entries and cover PREPAY, RELEASE, COMMISSION, WITHDRAWAL, REFUND and manual adjustment flows.


## 14. Withdrawal request validation schema is documented but not enforced

`src/lib/schemas/wallet.ts` exports `withdrawRequestSchema` with numeric/positive/max-10,000 amount checks, an allowed payment-method enum and bounded destination strings. Its file header says it is used by the withdrawal POST route, but the inspected `src/app/api/wallets/withdraw/route.ts` does not import or call it.

The route parses JSON directly, checks only `!amount || amount <= 0`, and then passes amount/method/destination fields into the database. It does not enforce the schema's 10,000 cap, number type, integer/safe-integer constraints, allowed method enum, or string length limits. It also does not require a card/IBAN destination based on the selected method. Invalid JSON is not caught locally in this route.

**Implication:** the schema's constraints are not an effective API contract until the route actually parses with it. Wire the schema into the handler, add explicit integer/currency-unit validation and method-specific destination validation, and test malformed JSON, strings, fractional/oversized values, unknown methods and missing bank details. This is a source-level validation gap; it does not prove invalid withdrawals have occurred.


## 15. Verified gateway callback has a concurrent duplicate-settlement window

The current src/app/api/gateway/callback/route.ts performs provider verification before opening a database transaction. Inside the transaction it reads PaymentGatewayLog.status, returns early only if it sees VERIFIED, and otherwise accepts REDIRECTED. It then conditionally changes the linked Payment from PENDING to SUCCEEDED. If that update affects zero rows, it deliberately continues when the Payment is already SUCCEEDED. The callback log itself is only changed to VERIFIED after purpose-specific settlement finishes.

This ordering supports retry after a failed settlement, but it does not atomically claim the REDIRECTED callback log. Two callbacks for the same verified gateway order can both read REDIRECTED before either commits. The second transaction can observe the Payment as already SUCCEEDED and continue into the same settlement branch instead of stopping. Under the usual PostgreSQL READ COMMITTED behavior, the source contains no explicit row lock, serializable transaction option, or conditional REDIRECTED-to-processing claim that prevents both transactions from entering settlement.

The purpose-specific effects have different duplicate risks:

- **PREPAY:** settlePrepay reads job.prepayPaid and rejects only if it is already true, then unconditionally updates the Job and creates PREPAY and COMMISSION WalletTransaction rows. The schema has an index on WalletTransaction.jobId but no unique constraint on [jobId, kind]. Concurrent callbacks that both read prepayPaid === false can therefore attempt duplicate wallet transaction creation and balance increments.
- **VIP:** the callback searches for a subscription by paymentId and creates one only when none is found. The schema has no unique constraint on UserVipSubscription.paymentId. Concurrent callbacks can both observe no subscription and create duplicates, and both can send activation notifications.
- **Invoice:** the callback reads the invoice status and rejects PAID, then updates it to PAID without a conditional status predicate. Concurrent callbacks can both read a payable status and continue to complete the job, upsert warranty and send notifications. Payment.invoiceId is unique, but that does not serialize the callback's invoice side effects.

The inspected test tree contains provider create/verify contract tests and pure prepay fee-calculation tests, but no dedicated gateway callback settlement test covering simultaneous duplicate callbacks, retries after partial settlement, or the three purpose branches.

**Required controls:** atomically claim a callback log with a conditional UPDATE ... WHERE status = REDIRECTED and require exactly one winner before applying side effects; keep the claim and settlement in one transaction so rollback permits safe retry; add database uniqueness constraints as a second line of defense (for example one PREPAY transaction per job/kind and one VIP subscription per payment); use conditional invoice/job state transitions; and add PostgreSQL integration tests that execute concurrent duplicate callbacks for PREPAY, VIP and invoice payments. Preserve the existing behavior that transient provider verification failures remain retryable. This is a source-level concurrency risk, not evidence of duplicate production credits or subscriptions.


## 16. Unverified negative callback can cancel a pending payment

In src/app/api/gateway/callback/route.ts, after matching a callback to a REDIRECTED PaymentGatewayLog, the handler reads the browser/provider callback Status field. For Zarinpal, any Status other than OK causes the handler to set the gateway log to CANCELLED and the linked PENDING Payment to FAILED. For IDPay, any status other than 100, 101 or the special pending status 10 takes the same cancellation path. These negative branches do not call verifyPayment or otherwise make a server-to-server status inquiry before mutating the database.

The callback query/form fields are external input. Matching an unpredictable authority/reference and order id reduces exposure, but it is not a provider-authenticated proof that the payment attempt was cancelled. If an attacker obtains or guesses the callback identifiers, a forged negative callback could prematurely close an otherwise valid pending attempt. This source review does not establish that identifiers are guessable or that an attack has occurred; it identifies an avoidable trust-boundary weakness.

**Required controls:** treat callback fields only as a trigger to query the provider. For both positive and negative outcomes, use a provider-authenticated server-to-server status/verification result before changing Payment or PaymentGatewayLog to a terminal state. If the provider does not expose a reliable negative-status lookup, leave the attempt pending and resolve it through a safe expiry/reconciliation job. Add tests proving that forged Status values cannot mark a payment FAILED/CANCELLED, while genuine provider cancellation can be reconciled safely.

## 17. Development simulator verification amount mismatch

The simulator provider's verify function returns success with amount 0, while the gateway callback requires Number(verified.amount) to equal the positive expected checkout amount. As a result, simulator callbacks for the gateway-backed VIP and PREPAY paths cannot pass the callback's amount equality check. The invoice development simulator uses a separate local branch and does not exercise this callback path. This is a development/test integration inconsistency, not a production payment vulnerability.

**Required controls:** have simulator verification echo the server-supplied expected amount (and a deterministic reference) or add a dedicated test-only simulator verification contract. Keep simulator activation unreachable in production and test that guard explicitly.


## 18. Concurrent checkout creation can open multiple bank payment attempts

The checkout handlers in src/app/api/payments/route.ts perform an active REDIRECTED checkout lookup before creating a new Payment and PaymentGatewayLog. The lookup and subsequent creation are not protected by one transaction, lock, idempotency key, or database uniqueness constraint.

- **VIP:** two concurrent requests for the same user and plan can both observe no active checkout, then create separate PENDING Payment rows and separate gateway logs, and each can call the external provider to create a bank checkout.
- **PREPAY:** the same check-then-create sequence exists for a job. Concurrent requests can create separate payments and gateway attempts for the same prepay fee.
- **Invoice:** when a pending Payment already exists, concurrent requests can each create a separate gateway log linked to that same Payment because PaymentGatewayLog.paymentId is not unique. If no Payment exists yet, Payment.invoiceId uniqueness may reject one competing Payment creation, but this does not protect the existing-PENDING case.

A customer could therefore receive more than one valid bank checkout for a single intended VIP/prepay action (or multiple gateway attempts against one invoice payment). If more than one attempt is paid, the callback settlement race described in section 15 increases the risk of duplicate collection or conflicting fulfillment. The source review does not prove that customers have been charged twice; it identifies a concurrent request path that can create multiple live checkout sessions.

**Required controls:** accept a client-generated idempotency key scoped to user + purpose + business reference and persist it under a unique constraint; enforce one active checkout per business action using a transaction-safe claim/lease or database constraint appropriate to the supported databases; re-use the same Payment and gateway attempt on retry; reconcile/cancel superseded attempts with provider confirmation; and add concurrent integration tests for VIP, PREPAY and invoice checkout creation. Do not rely on an application-level findFirst followed by create as a uniqueness guarantee.
