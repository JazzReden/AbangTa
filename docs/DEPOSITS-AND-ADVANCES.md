# Deposits and Advance Payments

## Where to use it

- Landlord: Property > Tenants > Deposits & advances for the tenant's tenancy.
- Tenant: Bills > Payment history & balances. Old tenancy ledgers remain visible.
- Existing bill: Apply advance credit, entering the amount and confirming.
- New monthly bill: optionally check Apply available advance credit to this bill.
  This applies the smaller of unused advance and bill balance in the bill's transaction.
  It is unchecked by default; existing bills never consume credit merely because it was received.

## Separate accounts

The agreed security deposit is an agreement amount, not evidence that money was
received. Migration leaves all actual balances at zero until the landlord explicitly
records a confirmed receipt. No existing bill, payment, rent agreement, or receipt
snapshot is rewritten.

Deposit held = nonvoided deposit receipts - refunds - justified deductions.
Unused advance = nonvoided advance receipts - advance refunds - active bill applications.

Deposit deductions require a reason and are not new cash payments or monthly bill
payments. Deposits cannot automatically pay rent and are excluded from Collected.
There is no deposit-to-rent transfer feature in this release.

Advance applications settle the tenant's bill, without reducing the original rent,
utility or other bill items. Applications are recorded as ADVANCE, never as another
Cash/GCash receipt. They have no duplicate Cash/GCash bill-payment receipt download.
The deposit/advance receipts themselves are tracked in the funds ledger; this release
does not add a separate downloadable funds-receipt PDF.

## Collections

Collected uses the Philippine calendar month and a net cash-received basis:
direct bill payments (excluding ADVANCE) + advance receipts - advance refunds.
It excludes deposits, deposit refunds/deductions and subsequent credit applications.
An advance received in an earlier month is not collected again when allocated now.
This is an operational cash-collection figure, not a formal revenue/tax report.

## Corrections and move-out

- Funds are attached to the tenancy, not a globally spendable tenant wallet.
  They cannot be spent on a roommate's bill, another property, or a later tenancy.
- Partial applications and partial refunds are allowed within available balances.
- Void an ADVANCE bill payment to restore that credit and reopen the bill. An issued
  bill cannot be cancelled while it has any active payment, including advance credit.
- A received entry cannot be voided if doing so would make either balance negative.
  Reverse the related applications/refunds/deductions first. All reversals retain
  original records and require a reason. GCash references stay reserved after voiding.
- Move-out does not erase balances. Landlords can refund balances, correct entries,
  and apply remaining advance to existing final bills. New fund receipts are limited
  to active tenancies. Automatic transfer to a new tenancy is intentionally unsupported.
- Dates must be valid and not in the future. Recording a refund means the landlord
  confirms the refund happened; the application does not send money through GCash.
- Visible histories show the latest 50 entries/applications per tenancy. Balances
  always include the complete nonvoided ledger, not just those visible rows.

## Integrity and deployment

Run npm run prisma:generate and npm run prisma:migrate:prod before starting updated
servers. Restart long-running processes so they load the regenerated client.
Migration 20261017000200_tenant_funds is additive. It also reserves existing keyed
GCash references in the shared money_references table, including voided payments.
Older GCash rows without keys are checked before any new reference is reserved.

All arithmetic uses Decimal/DECIMAL and whole centavos. Shared database rate limits,
property/tenancy/bill row locks, transaction rollback and unique request keys protect
against duplicate submissions, concurrent refunds/allocations and overpayments.
GCash references are shared across direct payments and both funds ledgers, so a
single transfer cannot be credited twice in different records or properties.
Owners can write only their tenancies; tenants can only view their own records.
Server actions require confirmation for recording, allocating and reversing funds.

## Verification

ABANGTA_DB_TESTS=1 npm test -- --runInBand
npm run test:scheduler
npm run typecheck
npm run lint
npm run build

The accounting tests create and clean isolated fixtures. They cover deposit/rent
separation, agreement versus receipt, partial advances, carry-forward, Cash/credit
and refund/allocation races, idempotency, GCash deduplication, reversals, move-out,
ownership, confirmed-receipt privacy, collections and paid-bill reminder exclusion.
