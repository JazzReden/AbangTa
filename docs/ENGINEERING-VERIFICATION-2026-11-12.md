# Engineering verification — 12 November 2026

## Change summary

This pass builds on the repository's existing, uncommitted modernization work. It adds no new runtime dependency, provider integration, feature deletion or schema migration.

- Tenant payment history now reads a consistent 20-record page with stable date/ID ordering, total count, safe page clamping and minimal selected fields. Reversed records remain traceable, show the correction reason/date, and offer no invalid receipt. The view reuses the shared header and action styles, includes property and billing period, and provides bill instructions in its empty state.
- Payment reversal retries with the same normalized reason return success after ownership is checked, without rewriting the reversal timestamp or changing the balance twice. Different reasons remain errors.
- Reversals and bill cancellations invalidate both protected layouts so descendant bills, dashboard and history views refresh.
- CI explicitly type-checks and checks runtime dependencies for high/critical advisories in addition to its existing MySQL, lint, test, scheduler and build gates.
- Added financial action, history UI and database regression tests plus a guarded, repeatable fixture benchmark.

## Verification evidence

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Baseline default Jest | PASS | 268 passed, 128 database tests skipped; 46 suites in repository before this pass. |
| Baseline production build | PASS | Next.js 15.5.29 production build completed. |
| Final lint and strict TypeScript | PASS | `npm run lint`; `npm run typecheck -- --incremental false`. |
| Final default Jest | PASS | 273 passed, 130 database tests skipped. |
| Full isolated database Jest | PASS | 403 tests / 48 suites; includes 130 opt-in MySQL cases. |
| Scheduler | PASS | Six executed tests. |
| Fresh schema | PASS | All 17 migrations applied to disposable MySQL; Prisma schema diff empty. Includes the profile migration already present before this pass. |
| Production build | PASS | `npm run build` completed; no production deployment. |
| Runtime dependency audit | PASS | `npm audit --omit=dev --json`: zero advisories at time of execution. |
| All dependency audit | FAIL | 25 development-tree advisories: 21 moderate and four low. No high/critical findings. Suggested npm fixes include incompatible downgrades; upgrade review remains open. |
| Responsive browser verification | PASS | Local production Chrome: both role logins/dashboards, tenant bills, history pagination and reversal state. History checked at 320/390/768/1280px: no horizontal overflow, navigation targets at least 44px, no uncaught page errors. |

Local diagnostics are in `/tmp/abangta-engineering-pass/`; they are temporary, not committed customer data or durable CI artifacts. Initial UI test runs exposed the repository's classic JSX test transform; the new test supplies React to server-component rendering, and the complete rerun passes. Browser iterations found unreliable client-side transitions between payment-history query pages. Pagination now uses standard server navigation; the final next/previous browser checks pass. A transient streamed DOM was also encountered, so checks wait for the settled page before counting records. Existing unrelated edits remain intact.

## Performance before / after

Local MySQL 26.7, disposable synthetic tenant with 2,000 confirmed payments, warmed queries, 11 alternating samples each. Original unbounded query compared to first page of the new service, including its count/transaction overhead.

| Metric | Original | Paginated |
| --- | ---: | ---: |
| Returned payment rows | 2,000 | 20 |
| Serialized query result | 1,190,001 bytes | 5,962 bytes |
| Median service/query duration | 27.46 ms | 1.93 ms |

This is approximately 99.5% less serialized data and 93% lower median query duration in this fixture. JSON size is not compressed HTTP transfer size. No claim is made about production p75, Lighthouse, LCP, INP or CLS. Pagination bounds render work; count/offset cost can still grow on very large histories. Measure real portfolios before adding indexes or cursor navigation.

Reproduce with an empty disposable local database ending in `_test`, apply migrations, then run:

```sh
ABANGTA_DB_TESTS=1 DATABASE_URL='mysql://USER:PASSWORD@127.0.0.1:PORT/abangta_audit_test' node --import tsx scripts/benchmark-payment-history.mjs
```

The script refuses remote/non-test databases and cleans up its own fixtures. It does not read `.env` or reset/seed application data. Never aim integration tests at a real customer database.

## Approved payment scope

The owner selected **Keep landlord-verified GCash for this release** on 12 November 2026. No automatic checkout, provider settlement, webhooks, provider fee or rent-refund processing is included. Sandbox checkout verification is therefore not applicable to this release; it must be added as a gate if scope changes. Landlords must verify actual receipt in their own GCash account, not just a screenshot.

## Release quality gates

| Required gate | Status | Supporting evidence / next step |
| --- | --- | --- |
| Critical user journeys | NOT TESTED | Automated money/occupancy/account tests pass; complete staging and real-device acceptance is outstanding. |
| Supported payment workflows | PASS | Approved manual GCash flows pass MySQL tests (submit, reject, approve, duplicate/concurrent review, rollback, reversal and receipt authorization). Provider sandbox tests NOT TESTED and not applicable to the approved release. Real-device/manual acceptance remains outstanding. |
| Duplicate events safe | PASS | Manual proof concurrency, duplicate reference, idempotent approval and reversal retries pass in MySQL. Provider event replay NOT TESTED; outside approved release scope. |
| Database integrity | PASS | Fresh migration/schema equivalence and fixture accounting tests pass. No customer database reconciliation or restoration was performed. |
| No known critical security vulnerabilities | NOT TESTED | Runtime advisory audit has zero findings; independent security review remains open. Dev-tree findings are documented. |
| Responsive layouts | NOT TESTED | Targeted history layouts pass at four widths; physical-device and application-wide acceptance remain open. |
| Accessibility assessed | PASS | Targeted written status, escaping, page semantics and navigation-target checks; full WCAG 2.2 AA audit NOT TESTED. |
| Performance targets measured | NOT TESTED | Local query benchmark only. Representative Lighthouse and real-user p75 metrics absent. |
| Tests and production build | PASS | 403 application tests, six scheduler tests, lint/types/build pass locally; remote CI execution not established. |
| Operational monitoring | BLOCKED | Process health exists; error collection, scheduler freshness, financial discrepancy alerts and operators need environment configuration. |
| Deployment, backup and rollback | BLOCKED | Existing release runbook gives a starting procedure; staging deployment and protected restore/rollback rehearsals not executed. |
| Provider approvals / applicable compliance | BLOCKED | No integrated provider for this approved release. Responsible business owner still must establish the applicable business/account obligations; no compliance certification inferred. |
| Stakeholder risk acceptance | BLOCKED | Remaining risks have not been accepted. |

Overall: **not production-ready**. No production deployment or automated live payment processing enabled.

## Roadmap and approval proposals

1. P0 release validation: assign an operational owner, configure staging HTTPS/MySQL, prove encrypted backup restoration and app rollback, wire alerts for failed jobs, DB connectivity and integrity mismatches. Rehearse auth, invitations, bill generation, proof approval/rejection and receipt authorization on target phones. Preserve logs privately.
2. P1 identity: approve recovery/verification channels, then add expiring single-use hashed recovery tokens, shared abuse controls, session revocation policy and tested delivery. A provider/channel choice is required; do not assume SMTP/SMS infrastructure.
3. Future payment expansion: current manual GCash scope is approved for this release. For checkout, choose landlord/platform merchant ownership, payout recipient, fees and rent refunds before selecting PayMongo/Xendit and implementing sandbox verification. A ledger correction must never be represented as a completed refund.
4. P1 auditability: approve additive financial-event schema recording actor, operation, stable request ID, subject, timestamps and reason; define access and retention. Back up and review migrations before applying to working data.
5. P2 broader UX/performance: instrument representative authenticated routes, exercise large portfolios, paginate remaining bills/repairs/fund ledgers with complete record access, assess screen reader navigation and field error focus, run Lighthouse and collect privacy-conscious aggregate timings. Preserve existing branding pending design acceptance.
6. P2 dependency cleanup: review documented legacy actions, unused dependencies and vendored patches, obtain removal approval, then update lockfile and rerun full checks. No feature or data deletion is authorized by this report.

Useful product indicators: activation (approved tenancy plus first viewed bill), proof review turnaround, confirmed/rejected proof counts, correction rate, bill/receipt task completion, scheduler freshness and support contacts. Provider conversion/failure/fee economics require an actual provider and approved data collection. Revenue model, pricing and operating costs remain assumptions to validate with customers; no market result is asserted.

## Updated code map

Existing structure is preserved: `src/app` routes/actions, `src/components` UI, `src/services` business rules, `src/lib` security/utilities, `prisma` schema/migrations, `.github` CI, `scripts` operational tools, `docs` guides.

New artifacts: `src/__tests__/payment-history-ui.test.tsx`, `src/__tests__/financial-correction-actions.test.ts`, `scripts/benchmark-payment-history.mjs`, and the two dated engineering reports. Existing payment-proof database tests were extended. See ENGINEERING-AUDIT-2026-11-12.md for requirements gaps and official provider/WCAG research.

## Palette follow-up

At the owner’s request, restored the 11 November palette from commit `8ff4630`: workspace primary `24 80% 50%`, landing primary `24 85% 56%`, and landing buttons/CTA use the original orange. Layout and payment changes remain in place. Earlier accessibility observations do not establish contrast compliance for this restored palette.

## Follow-up: lists, forms and operations

The next approved workstream adds scoped search/pagination, mobile form error recovery and operational/recovery tooling. See [the new verification report](LISTS-FORMS-OPERATIONS-VERIFICATION.md) for 416-test results, the local backup/rollback rehearsal and remaining hosting prerequisites. Historical results above describe the earlier payment pass.
