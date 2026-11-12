# Engineering audit and execution plan — 12 November 2026

## Scope and evidence

Repository: `/Users/jazzreden/Documents/Startup/abangta`. The initially open Jazi folder is unrelated. Existing uncommitted UI, documentation and schema work predates this pass and must be preserved. This is a source and local verification audit, not a penetration test or launch certification.

Abang Ta is a Philippine boarding-house management web application for landlords and tenants. Its core value is explaining charges and tracking occupancy and verified collections in one place. No revenue, adoption or acquisition outcomes are established. Architecture remains Next.js App Router / React / Tailwind / Auth.js JWT sessions / Prisma / MySQL. Domain services own billing, funds, occupancy, notices, maintenance and scoped assistant operations. See ARCHITECTURE.md for relationships and repository map.

Review covered the route/service inventory, schema and migration history, financial services, role/ownership guards, login, upload controls, scheduler, CI and existing tests/documentation. Baseline executed: lint passed; 268 tests passed and 128 database tests skipped. Baseline production build passed. Additional evidence is recorded below after implementation.

## Prioritized findings

| Priority | Finding / evidence | Action |
| --- | --- | --- |
| Critical release gate | Automated provider settlement is absent. GCash is human verified; screenshots are evidence, never proof of settlement. | Preserve current business workflow. Do not advertise automatic checkout or enable live payments. |
| High | Tenant payment history queries all active payments and omits reversals (`PaymentService.getTenantPayments`). Query payload/render work grows with lifetime history, and a reversed receipt disappears without context. | Add bounded pages with written reversal state, context and recovery links. Measure fixture payload before/after. |
| High | Payment void retries return an error after a successful commit; corrections invalidate only `/landlord` and `/tenant` pages, not descendant layouts. | Accept exact authorized reversal retries; invalidate both workspaces so bill/history/receipt links refresh. Regression coverage for conflicting/unauthorized retries. |
| High | Self-service password recovery/contact verification, real-device acceptance, restore drills, live OAuth callbacks, alert ownership and production configuration remain unverified. | Release blockers; separate implementation and operator work. |
| Medium | Bills, repairs and some history/funds views have unbounded or silently capped queries; tenant dashboard reads historical payment rows for reconciliation. | Profile representative portfolios; paginate without changing accounting semantics or silently truncating totals. |
| Medium | Financial correction reason/time are retained, but explicit reversal actor/event audit records and a rent-refund workflow are absent. | Propose additive audit schema and explicit refund policy before implementation. Voiding is a ledger correction, not a money refund. |
| Medium | Full npm audit finds 25 dev-tree advisories (21 moderate, four low), zero high/critical; local vendored patches need continuing review. | Separate tested upstream upgrade; do not apply suggested incompatible downgrades blindly. Verify runtime audit separately. |
| Medium | CI includes isolated MySQL, lint, tests, scheduler and build but no explicit dependency security scan. | Add runtime audit and explicit typecheck; document dev-tree findings. |
| Medium | Operational process health exists; database readiness, scheduler freshness and financial discrepancy alerts are not wired to an operator. | Define environment-specific alerting/restore evidence; keep health endpoint free of database details. |
| Low | Legacy registration and apparently unused dependencies already documented as removal candidates. | Inventory/reference review and explicit removal approval; no deletion in this pass. |

No exploitable critical source defect was confirmed during this review. That statement is limited to reviewed code and executed tests.

## Payment architecture and requirements traceability

Existing flow: tenant sends funds outside the app → submits screenshot/reference → PENDING proof → authorized landlord verifies amount/recipient/reference in their account → APPROVED and confirmed payment, balance and immutable receipt commit together. Rejection creates no money. Approval/rejection replay is guarded. Transactions lock property, tenancy and bill; unique references span bill and funds ledgers. Amounts use Decimal and remaining balance is server checked. Screenshots are bounded, decoded/re-encoded and privately served after authorization. No card data or provider secrets are required by this workflow.

| Requirement | Current state / gap |
| --- | --- |
| Initiation, checkout, authorization, expiration and cancellation | No provider sessions; not applicable to manual proof submission. Never map browser return URLs to paid status. |
| Pending/success/failure | Pending/approved/rejected proof states and actionable errors exist; failed operations roll back. |
| Duplicates/concurrency/interruption | UUID request keys, shared reference uniqueness, locks and retry logic exist; verify with real MySQL fixtures. |
| Receipts/history | Confirmed Cash/GCash snapshots exist; improve bounded history and reversed-record visibility. Bank/other/advance receipts are intentionally unsupported. |
| Refunds | Deposit/advance refunds exist; rent correction does not transfer funds. Rent refunds need approved requirements. |
| Reconciliation/fees | Read-only balance integrity script exists; no automated provider reconciliation or fee ledger. |
| Webhooks/signatures/provider sandbox | Not implemented; blocked on approved provider architecture, merchant account and test credentials. |
| Authentication/authorization | Auth.js plus current DB role guards, ownership-scoped actions and private image/receipt routes. |
| Performance/accessibility/operations | Existing responsive dashboard changes predate this pass; validate new financial UI and document remaining gates. |

## Approved release scope

The owner explicitly selected **Keep landlord-verified GCash for this release** in this chat on 12 November 2026. Provider checkout, fees and settlement integrations are deferred. Provider sandbox gates are not applicable to the approved manual release; manual verification and operational acceptance remain required.

## Provider research and decision boundary

Official documentation checked on 12 November 2026: [PayMongo hosted checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout) lists GCash and a successful-checkout webhook; [PayMongo events](https://docs.paymongo.com/docs/developer-tools-webhooks-events) says checkout expiry has no event, requiring explicit reconciliation. [Xendit payment methods](https://docs.xendit.co/docs/available-payment-methods) lists GCash; [webhook guidance](https://docs.xendit.co/docs/handling-webhooks/) describes verification tokens and retries. This establishes possible candidates, not merchant eligibility, fees or approval for this product.

Before a provider change, approve who is merchant of record (each landlord versus platform), settlement recipient, fees, refund authority, ledger/accounting rules and supported methods. Then design server-created PHP minor-unit amounts, persistent attempts and unique provider events, authenticated raw webhook verification per selected provider, monotonic state transitions, async reconciliation and sandbox failure/concurrency tests. No provider code is added before that decision.

## Incremental implementation plan

1. Preserve existing edits and capture baseline checks/build.
2. Bound tenant payment history, expose reversals with truthful receipt state, and measure payload on isolated fixtures.
3. Improve reversal retry behavior and financial cache invalidation with regression coverage.
4. Strengthen CI checks; run lint, types, unit/scheduler and isolated database tests, then build and responsive browser checks.
5. Record actual results and all unverified release gates. Propose provider integration, audit schema, deletions and broad redesign separately for approval.

Use the warm-paper/orange design (11 November palette restored at the owner’s request) and shared PageHeader/empty state/action controls. History prioritizes amount, method, date, property/billing period and explicit status. Written states avoid color-only meaning; pagination uses comfortable targets. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the assessment reference, not an assertion of compliance.
