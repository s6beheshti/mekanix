# Financial Currency Contract and Safe Migration Plan

**Status:** Audit in progress — do not merge the financial-unit changes from PR #3 until the contract and migration tests are complete.

**Scope:** Current `main` compared with `fix/payment-provider-production-wiring` (PR #3). This document records repository evidence and defines the safety gates. It does not claim that any historical production data has been inspected.

## 1. Findings confirmed in source

### Current `main` contract

The current `main` codebase is **not internally consistent enough to infer one unit for every stored amount**:

- `Invoice` and `Payment` have `currency` fields defaulting to `IRR`; the invoice route persists `currency: "IRR"`.
- Wallet and wallet-transaction comments describe their amounts as IRR; `WithdrawalRequest.amount` is also commented IRR.
- `VipPlan.priceIrr` is named and commented as IRR.
- `PaymentGatewayLog.amount` is commented IRR and has `currency` defaulting to `IRR`.
- `WalletLedger` has no currency field and no explicit unit comment; it cannot be safely assumed to be IRR without tracing its writers and deployed data.
- Several other monetary fields have no currency field, including technician rates/fees, part prices, job fees/earnings, service-package prices and pricing snapshots.

There are important contradictions even before PR #3: `Technician.hourlyRate`, `travelFeeBase`, `inspectionFee` and `inspectionFeeHeavy` have small defaults (15, 3, 7 and 20) while comments call them IRR. The invoice route uses those values to calculate an invoice and labels it IRR. Separately, the pricing engine uses a 50,000 IRR base labor rate and returns IRR. The seed also uses VIP prices 9/19/39 under `priceIrr`. These facts mean schema names/comments alone do not prove the actual unit of all historical values.

The invoice creation route calculates amounts using technician rates and part prices, then persists the invoice with `currency: "IRR"`. The pricing engine independently returns `currency: "IRR"` and documents integer IRR values; the two pricing paths still need to be reconciled.

### Confirmed pre-service settlement unit conflict

The current `main` pre-service path in `src/lib/prepay-settlement.ts` reads technician inspection/travel fee fields as direct numeric values, calculates the gross/commission/net amounts, and writes those same numbers into `Job`, `WalletTransaction`, and `Wallet` fields whose schema comments describe IRR.

PR #3 instead treats the technician fee fields as USD base, multiplies the gross amount by the USD/IRR rate for the gateway request, but its fulfillment path posts the unconverted USD gross/commission/net values into those same `Job` and wallet columns. It also writes the USD numeric amount into `Payment.amount` while setting `Payment.currency: "IRR"`. This is a second, independent unit mismatch affecting technician earnings and platform commission—not only the invoice path.

The exact unit of the existing technician fee rows remains unresolved. Do not resolve this by assuming that the values 3/7/20 are USD or IRR; inspect the actual deployed configuration and reconcile the business pricing policy first.

### PR #3 changes the meaning of existing columns

The PR documents Invoice, Payment, Wallet, WalletTransaction, WithdrawalRequest and WalletLedger values as USD base amounts. It also changes `VipPlan.priceIrr` to `priceUsd`.

The migration `20261031180000_rename_vip_price_to_usd_base` exists for both SQLite and PostgreSQL, but it only renames the column:

```sql
ALTER TABLE "VipPlan" RENAME COLUMN "priceIrr" TO "priceUsd";
```

This preserves the numeric value; it does not convert the value or prove that the old value was USD.

### Confirmed invoice/payment unit mismatch in PR #3

- The invoice route still persists `Invoice.total` with `currency: "IRR"`.
- The payment fulfillment code reads `metadata.amountUsd` and compares it directly with `invoice.total`.
- The reserved Payment record is compared to the USD metadata amount, then written with `currency: "IRR"`.
- Gateway logs separately store the converted gateway amount in IRR.

Those boundaries need one explicit, tested unit contract. A currency label must describe the unit actually stored in that row.

### Seed data needs explicit treatment

The current seed defines VIP prices as `priceIrr: 9, 19, 39`. These values are seed/demo data, not proof of production pricing or of the unit of any deployed records. The intended unit and scale must be confirmed before treating them as conversion examples.

## 2. Non-negotiable migration safety rules

1. Never relabel an existing amount by renaming a column or changing a code comment.
2. Never convert historical balances using today's exchange rate.
3. Never infer a historical currency from the magnitude of a number.
4. Keep gateway amounts and provider verification amounts in the exact unit required by the provider; persist that unit explicitly.
5. Use integer minor units (or an explicitly documented decimal precision) consistently. Do not mix toman, rial, USD, and display-formatted values.
6. Persist the exchange-rate value, source, timestamp and rounding rule with each conversion that affects a payable amount.
7. Apply equivalent schema and data changes to SQLite and PostgreSQL.
8. Migrations must be tested against populated pre-migration databases, not only empty databases.
9. Preserve a recoverable backup and verify row counts, totals and checksums before/after any production migration.
10. No real gateway, SMS or production credentials are required for this migration phase.

## 3. Required target contract before implementation

The repository evidence does not yet justify silently declaring every existing value to be IRR or USD. The implementation must first produce a field-by-field unit inventory and reconcile the two existing pricing paths.

The target contract must then guarantee:

- Every persisted monetary amount has an explicit, validated currency/unit.
- Every value used in a calculation is either in the same currency or converted through one shared conversion function with a persisted rate snapshot and documented rounding rule.
- Invoice creation, payment reservation, provider verification, fulfillment, wallet/ledger posting, refunds and withdrawals all use the same declared unit at each boundary.
- No field is called `priceUsd` while holding an unconverted legacy IRR value, or called `amount` with an implicit unit.
- Wallet balances and ledgers cannot aggregate unlike currencies. If more than one currency is supported, balances and ledger postings must be separated by currency.
- The final canonical unit for domestic customer charges and technician settlement must be explicitly approved before changing writers.

A domestic IRR settlement model may be the simplest target for Iran, but it must not be assumed until the actual units of existing rate fields, seed data and any deployed rows have been reconciled.

## 4. Implementation sequence

### Phase A — Freeze and inventory

- Keep PR #3 unmerged.
- Inventory every monetary Prisma field, API write, API read, UI formatter, seed, background task and settlement job.
- Record the unit, precision and source of truth for each field; explicitly flag fields whose units are unknown or contradictory.
- Reconcile the legacy invoice route with the newer pricing engine and technician/part rates.
- Identify every calculation that combines values from more than one model.
- Confirm whether any production database exists and obtain a verified backup before planning a data migration.

### Phase B — Establish one unit contract

- Approve one canonical unit policy for domestic MEKANIX charges and settlements.
- Correct PR #3's USD-base assumptions or isolate them to explicit, separately typed fields.
- Keep the gateway amount in the provider's required unit and verify that the amount sent to the provider exactly matches the persisted gateway log.
- Ensure invoice creation, payment initiation, callback verification, fulfillment, refunds, VIP activation, technician wallet credit and withdrawal all use the same unit.

### Phase C — Additive schema migration

- Add explicit currency fields where absent (including wallet, wallet transactions, withdrawals, wallet ledger and other monetary models).
- Backfill a currency only where repository history and deployed data prove the unit. Keep ambiguous legacy rows explicitly unresolved; do not default them to IRR or USD merely to satisfy a non-null constraint.
- Retain the legacy VIP price field/value until its unit is proven or a separately reviewed conversion source and policy are available.
- Avoid destructive column drops/renames until all code paths have moved and a compatibility window has passed.
- Produce matching SQLite and PostgreSQL migrations.

### Phase D — Tests and reconciliation

For both SQLite and PostgreSQL, test:

- A populated database created from the current `main` schema.
- Exact preservation of every legacy amount and its verified unit after migration; ambiguous rows must remain flagged and must not become payable/settleable until reconciled.
- Invoice → payment initiation → provider verification → fulfillment.
- Duplicate and concurrent callbacks (exactly-once fulfillment).
- Failed/cancelled payment retry.
- VIP subscription activation only after provider verification.
- Technician wallet, ledger and withdrawal amounts.
- Refund and reversal behavior.
- Decimal/rounding boundaries and very large amounts.
- Migration rollback/recovery procedure.

The tests must assert numeric values and currency labels together.

### Phase E — Release gate

Do not mark the payment work production-ready until all of the following are true:

- SQLite migration tests pass.
- PostgreSQL migration tests pass.
- Payment integration tests pass.
- Docker E2E passes on the exact final commit.
- A populated-database migration rehearsal and reconciliation report are reviewed.
- Production backup/restore has been rehearsed.
- Only then can PR #3 be reconsidered for merge.

## 5. Open questions that cannot be answered from repository code alone

- Is there an existing production database with real customer, invoice, wallet or VIP records?
- If so, what is the actual stored unit of each historical amount? Schema/comments alone cannot prove deployed data semantics.
- What are the intended units for technician rates/fees (defaults 15/3/7/20), part prices, invoice totals and the two pricing paths?
- Were VIP seed values `9 / 19 / 39` intended as USD, IRR, toman, or another display unit?
- Is IRR the approved canonical unit for every domestic settlement, including technician payouts?

Until these are confirmed, no historical currency conversion should be run.

## 6. Current decision

**No financial data migration is approved or executed by this audit.** The next implementation change must be additive and data-preserving, with populated-database tests in both database engines. Do not assign a currency to ambiguous historical values until the unit inventory is complete. PR #3 remains blocked until the invoice/payment unit mismatch and all legacy-value semantics are resolved.

## Appendix A — Initial monetary-field inventory

This is a source-level inventory, not a statement about deployed rows. “Unresolved” means the schema or current write path does not prove the unit consistently.

| Model / field group | Current `main` evidence | PR #3 evidence | Migration status |
|---|---|---|---|
| `Technician.hourlyRate`, `travelFeeBase`, `inspectionFee`, `inspectionFeeHeavy` | Comments say IRR; defaults are 15 / 3 / 7 / 20 | Comments and seed values are changed to USD | No value conversion; historical unit unresolved |
| `Part.unitPrice` | No explicit currency field/unit on the model field | Not converted by a migration | Unresolved; used in invoice calculations |
| `Job.inspectionFee`, `travelFee`, `platformCommission`, `netEarnings` | No currency field on these fields | Fulfillment writes USD-base amounts | No per-row currency tagging/backfill |
| `Invoice` components and `total` | `currency` defaults to IRR; invoice route writes IRR | `total` is documented as USD base | No numeric conversion; initiation treats total as USD |
| `Payment.amount` | `currency` defaults to IRR | `amount` is documented as USD base | No numeric conversion; initiation writes USD numeric value with IRR label |
| `Wallet` balances and lifetime totals | Comments say IRR | Comments say USD base | No numeric conversion or currency field |
| `WalletTransaction` gross / commission / net | Comments say IRR | Comments say USD base | No numeric conversion or currency field |
| `WithdrawalRequest.amount` | Comment says IRR | Comment says USD base | No numeric conversion or currency field |
| `VipPlan.priceIrr` | Named/commented IRR | Renamed to `priceUsd` | Migration only renames the column; numeric values unchanged |
| `PaymentGatewayLog.amount` | Explicit IRR comment and currency default | Remains IRR | This is the gateway-facing amount; compare it to the exact provider request/verification unit |
| `WalletLedger.amount`, `balanceBefore`, `balanceAfter` | No currency field and no explicit unit comment | `amount` documented USD base | No numeric conversion or currency field |
| `PricingSnapshot` price components and `total` | Has `currency` defaulting to IRR | No equivalent USD migration in the inspected change | Must be traced through all writers and readers |
| `ServicePackage.basePrice` | No currency field | No equivalent currency migration | Unresolved |
| Referral / insurance amounts | Some fields are explicitly commented IRR | Not comprehensively migrated | Trace all writers and readers before changing units |
| `Job.inspectionFee`, `travelFee`, `platformCommission`, `netEarnings` | Decimal fields; wallet comments describe IRR but Job fields themselves have no currency column/comment | PR #3 writes prepay gross/commission/net from USD-base calculations into these fields without converting the posted values | Critical settlement unit conflict; explicit per-record currency or one enforced settlement currency required |
| `Part.unitPrice` | Decimal with no currency field/comment | No explicit currency migration | Unresolved; invoice route consumes part prices in the invoice total |
| `Invoice.laborRate`, `laborTotal`, `partsTotal`, `travelFee`, `subtotal`, `taxTotal`, `discount`, `total` | Decimal; Invoice.currency defaults to IRR | PR #3 invoice initiation treats Invoice.total as USD metadata | Must reconcile all components, not only total; don't infer old rows from default alone |
| `Payment.amount` | Decimal; Payment.currency defaults to IRR | PR #3 fulfillment persists USD amount with IRR currency label in the audited path | Critical mismatch; amount and currency must be written atomically from verified provider settlement |
| `Wallet.balance`, `pendingBalance`, `totalEarned`, `totalCommission`, `totalWithdrawn` | Schema comments explicitly describe IRR | PR #3 treats these as USD-base balances without historical numeric conversion | Do not relabel existing balances; reconcile opening balances and ledger first |
| `WalletTransaction.grossAmount`, `commissionAmount`, `netAmount` | Schema comments explicitly describe IRR | PR #3 writes USD-base settlement values into these columns | Same unit must be enforced across transaction, wallet, Job and Payment |
| `WithdrawalRequest.amount` | Schema comment explicitly says IRR | No verified historical conversion or per-row currency marker | Payouts must be blocked for ambiguous legacy balances until reconciled |
| `WalletLedger.amount`, `balanceBefore`, `balanceAfter` | No currency field or explicit unit comment | PR #3 describes wallet ledger values as USD base | A ledger currency must be explicit; balances must reconcile to transaction history |
| `VipPlan.priceIrr` | Explicit IRR field name/comment on main | PR #3 renames it to `priceUsd` without numeric conversion | Rename does not convert values; validate deployed plan rows and subscriptions |
| `ServiceCategory.basePrice` | Decimal amount with no currency field or unit comment | No explicit unit conversion in the PR migration | Unresolved; must trace category pricing consumers |
| `DiscountCode.value`, `minAmount` | Decimal fields; `type` determines percent/fixed semantics, but fixed-value currency is not stored | No explicit currency migration | Separate percentage discounts from fixed monetary discounts; fixed unit unresolved |
| `ServicePackage.basePrice` | Decimal amount without currency field | No explicit currency migration | Unresolved; package base price is currently fetched by pricing engine but documented as informational |
| `CustomerApproval.partPrice`, `laborPrice`, `totalPrice` | Decimal amounts without currency field | No explicit currency migration | Unresolved; customer-approved extras must use the same unit as invoice settlement |
| `PartUsage.unitPrice`, `totalPrice` | Decimal amounts without currency field | No explicit currency migration | Unresolved; separate from legacy `Part.unitPrice`; trace CARE booking writers/readers |
| `Referral.rewardAmount` | Comment says IRR credit; no currency field | Not comprehensively migrated | Comment is evidence of intended unit, not proof of deployed rows |
| `InsurancePolicy.premiumAmount`, `coverageAmount`; `InsuranceClaim.amount` | Premium and claim amount comments say IRR; coverage has no explicit unit comment | Not comprehensively migrated | Preserve intended IRR comments but inspect deployed data and all partner flows |

### Required follow-up before writing SQL

For each row above, enumerate every create/update path and every consumer. In particular, verify that the invoice route and pricing engine are not creating different unit conventions, and that wallet posting, withdrawal, refund and admin adjustment code all use the same unit as the underlying wallet. The migration must not proceed from this table alone; the inventory must be completed against the entire repository and representative database fixtures.


## 7. Additional writer/consumer trace — CARE, referrals and insurance

The following findings were verified against the current `main` source after the initial inventory. They are source-level findings only; they do not establish the unit of any deployed row.

### CARE pricing and booking

- `src/lib/pricing.ts` explicitly documents its outputs as integer IRR values (toman × 10), uses Decimal arithmetic, and returns `currency: "IRR"`. Its current base labor and visit prices are hard-coded as 50,000 IRR/hour and 15,000 IRR respectively; parts cost is accepted as an input.
- `calculatePrice()` fetches `ServicePackage.basePrice`, but explicitly treats it as informational and does not include it in the calculated total. Therefore package basePrice is not currently a source for the booking total in this path.
- `src/app/api/care/bookings/route.ts` creates a ServiceBooking and PricingSnapshot in one transaction. It stores the pricing result's component amounts and currency in the snapshot. At initial booking, parts and travel distance are both passed as zero; the snapshot is therefore an initial estimate, not a final repair invoice.
- `src/app/api/payments/route.ts` accepts `invoiceId`, `planId`, or `jobId`; it has no `bookingId` checkout branch. The inspected CARE booking route creates a snapshot but does not initiate a payment. Do not treat CARE PricingSnapshot.total as a settled or paid amount.
- `CustomerApproval.partPrice/laborPrice/totalPrice` and `PartUsage.unitPrice/totalPrice` have no currency field in the schema. The inspected booking-detail endpoint reads these records, but the corresponding write/approval/settlement paths still need to be located and traced before assigning a currency or designing a migration.

### Referral reward

- `Referral.rewardAmount` has a schema comment/default indicating an IRR credit (default 5), but no currency column.
- `src/app/api/referral/route.ts` calculates referral statistics by summing `rewardAmount` and its PATCH handler changes `rewardClaimed` to true and status to `rewarded`, then sends a notification whose text says the user earned that amount in IRR.
- That PATCH handler does not itself create a Wallet, WalletTransaction, WalletLedger, Payment, or other monetary credit. A separate reward-credit workflow may exist; it must be identified and reconciled before this is treated as an actual paid/credited reward. Do not infer that setting `rewardClaimed=true` proves funds were transferred.

### Insurance amounts

- `InsurancePolicy.premiumAmount` is commented IRR in the schema; `InsuranceClaim.amount` is also commented IRR. `coverageAmount` has no explicit currency/unit comment and none of these fields has a currency column.
- `src/app/api/insurance/route.ts` accepts `premiumAmount` and `coverageAmount` from the authenticated user's request body (after field whitelisting), parses them as numbers, and persists them without a currency field or conversion. This is policy-record entry, not evidence of an insurer checkout or a verified claim payout.
- No insurance-claim write/settlement route was identified in the inspected paths. Trace partner/claim processing before migration; do not assume coverageAmount has the same unit as premiumAmount solely because they share a model.

### Follow-up status

This expands the source-level inventory but does not complete the whole-repository trace. In particular, CARE approval/PartUsage writers, customer reward credit, insurance claim settlement, wallet release/withdrawal/refund/admin adjustment paths, and any data import/seed writers remain open. No schema or historical data changes are authorized by these findings.


### Invoice callback and technician earnings — additional verified gap

- `src/app/api/gateway/callback/route.ts` verifies the provider transaction server-to-server, checks that the gateway log is IRR, checks the stored Payment owner and amount, then for invoice payments verifies that the invoice is still payable, has `currency === "IRR"`, and its rounded total exactly matches the verified gateway amount.
- On successful invoice verification, the callback marks the Invoice `PAID`, marks the Job `COMPLETED`, activates/upserts the Warranty, and sends notifications. In the inspected invoice branch it does **not** create a `WalletTransaction`, update the technician `Wallet`, or create a `WalletLedger` entry. The notification to the technician says payment was received, but the inspected transaction does not post an earning. This is a settlement-completeness gap separate from the USD/IRR mismatch in PR #3.
- The same callback's `prepay` branch calls `settlePrepay()`; that function writes Job fee/commission/net fields, creates PREPAY and COMMISSION WalletTransactions, and increments Wallet pending balance and lifetime totals. Those are direct fee values from Technician configuration; the current schema documents Wallet and WalletTransaction amounts as IRR, but the Technician fee fields still have contradictory comments/default magnitudes as recorded above.
- Do not solve the missing invoice wallet credit by simply copying PR #3's USD-base settlement logic. First approve the canonical settlement unit, define the invoice-to-technician earning/commission/hold/refund rules, and add populated-database tests proving invoice, Payment, Job, WalletTransaction, Wallet, WalletLedger and WithdrawalRequest reconcile.
