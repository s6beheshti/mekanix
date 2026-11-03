# Financial Currency Contract and Safe Migration Plan

**Status:** Audit in progress — do not merge the financial-unit changes from PR #3 until the contract and migration tests are complete.

**Scope:** Current `main` compared with `fix/payment-provider-production-wiring` (PR #3). This document records repository evidence and defines the safety gates. It does not claim that any historical production data has been inspected.

## 1. Findings confirmed in source

### Current `main` contract

The current Prisma schema and initial SQLite/PostgreSQL migrations describe these values as IRR:

- `Invoice.total` and related invoice components; `Invoice.currency` defaults to `IRR`.
- `Payment.amount`; `Payment.currency` defaults to `IRR`.
- `Wallet.balance`, `pendingBalance`, `totalEarned`, `totalCommission`, and `totalWithdrawn`.
- `WalletTransaction.grossAmount`, `commissionAmount`, and `netAmount`.
- `WithdrawalRequest.amount`.
- `VipPlan.priceIrr`.
- `PaymentGatewayLog.amount` and `currency`.
- `WalletLedger.amount`.

The invoice creation route calculates amounts using the technician's stored rates and parts prices, then persists the invoice with `currency: "IRR"`. The pricing engine also returns `currency: "IRR"` and documents integer IRR values.

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

## 3. Recommended target contract for MEKANIX

For the domestic Iranian payment and settlement flow, the safest default is:

- Persist customer invoices, payment records, technician wallets, wallet ledger entries, withdrawals and VIP prices in **IRR**.
- Keep `currency = "IRR"` explicit on every persisted financial entity, including wallet and ledger records that currently lack a currency column.
- Convert only at a boundary (for example, a USD-denominated external price displayed to a user or a provider requiring a different unit); store the conversion snapshot alongside the resulting transaction.
- Do not store a USD value in a field labelled IRR.
- Do not aggregate wallet amounts across different currencies. If multi-currency wallets are ever required, introduce separate per-currency balances and ledger accounting first.

This is a recommendation based on the repository's current IRR invoice, pricing and Iranian gateway model. It is not a claim that production currency policy has already been approved.

## 4. Implementation sequence

### Phase A — Freeze and inventory

- Keep PR #3 unmerged.
- Inventory every monetary Prisma field, API write, API read, UI formatter, seed, background task and settlement job.
- Record the unit and precision for each field.
- Identify every calculation that combines values from more than one model.
- Confirm whether any production database exists and obtain a verified backup before planning a data migration.

### Phase B — Establish one unit contract

- Confirm IRR as the canonical persisted unit for domestic MEKANIX financial records.
- Correct PR #3's USD-base assumptions or isolate them to explicit, separately typed fields.
- Keep the gateway amount in IRR and verify that the amount sent to the provider exactly matches the persisted gateway log.
- Ensure invoice creation, payment initiation, callback verification, fulfillment, refunds, VIP activation, technician wallet credit and withdrawal all use the same unit.

### Phase C — Additive schema migration

- Add explicit currency fields where absent (wallet, wallet transactions, withdrawals and wallet ledger).
- Backfill existing rows to `IRR` without changing their numeric values.
- Retain `VipPlan.priceIrr` for existing data unless a separately reviewed conversion source and policy are proven.
- Avoid destructive column drops/renames until all code paths have moved and a compatibility window has passed.
- Produce matching SQLite and PostgreSQL migrations.

### Phase D — Tests and reconciliation

For both SQLite and PostgreSQL, test:

- A populated database created from the current `main` schema.
- Exact preservation of every legacy amount and its IRR unit after migration.
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
- If so, what is the actual stored unit of each historical amount? The schema/comments alone cannot prove deployed data semantics.
- Were VIP seed values `9 / 19 / 39` intended as USD, IRR, or another display unit?
- Is IRR the approved canonical unit for every domestic settlement, including technician payouts?

Until these are confirmed, no historical currency conversion should be run.

## 6. Current decision

**No financial data migration is approved or executed by this audit.** The next implementation change must be additive and data-preserving, with populated-database tests in both database engines. PR #3 remains blocked until the invoice/payment unit mismatch and all legacy-value semantics are resolved.
