# Project scope and status

Reviewed against repository code and feature guides on 12 November 2026. “Implemented” means code exists; it does not mean production deployment, independent security review, or stakeholder acceptance is complete.

## Objective

Help Philippine boarding-house owners manage occupancy, explain monthly charges, track verified collections, and communicate with tenants. Give each tenant a phone-friendly view of their own room, bills, payments and repair requests.

## Functional scope

| Area | Implemented in the repository | Boundary / remaining work |
| --- | --- | --- |
| Accounts | Landlord/tenant password accounts, optional Google sign-in/linking | Live OAuth needs configured credentials and callback verification; password recovery and email/mobile verification messages are not implemented |
| Occupancy | Properties, whole rooms, individual beds, invitations/QR, approval and tenancy history | Legacy room modes remain supported; expired personal invitations need explicit release |
| Monthly billing | Agreed tenant rent, utility readings/saved splits, Wi-Fi, tenant-specific parking, optional charges | No automatic daily proration; issued allocations retain their original participants and amounts |
| Collections | Cash/GCash records, partial payments, landlord proof confirmation, confirmed-payment PDF receipts | Manual verification, not GCash checkout or settlement integration |
| Funds | Separate deposit/advance ledgers, corrections and explicit advance applications | A deposit is not rent; old bills do not silently consume advances |
| Communication | Property-scoped news, maintenance, automatic unpaid-bill reminders | In-app notifications only; bundled automation requires an active server process |
| Daily resolution | Cross-property Action Center, priority guidance, exact repair links, tenant payment next steps | Deterministic guidance; local verification in [Action Center report](ACTION-CENTER-VERIFICATION.md); pilot outcomes not yet measured |
| Ishi | Scoped read-only reports, tenant answer refresh, landlord reminder workflow | Tenant answers use constrained record-based routing; optional landlord AI needs configuration; not unrestricted financial automation |
| Delivery | Responsive web UI, automated checks, GitHub CI definition | Production deployment, device acceptance and restore drills are not established by this audit |

## Milestones and evidence

| Workstream | Current state | Evidence / next gate |
| --- | --- | --- |
| Property and tenant workflows | Implemented | `src/app`, property/tenancy services; verify real-device onboarding before release |
| Financial record integrity | Implemented safeguards and regression coverage | Billing services, SQL constraints, opt-in MySQL concurrency tests; run against a dedicated test database for release |
| Security baseline | Implemented controls | Server authorization, validation, shared rate limiting, headers, transaction guards; independent review remains a separate gate |
| Repository organization | Focused cleanup implemented | [Change inventory and verification](CODEBASE-ORGANIZATION.md) |
| Production launch | Not verified | Deployment configuration, monitoring, backups, recovery and user acceptance still need evidence |

Historical audits document work at their stated dates. No release date, percentage complete, or production acceptance is inferred here.

## Known limitations and review items

- Do not confuse a successful build with verified Google login, external payment settlement, or production uptime.
- Financial history must be reconciled through authorized corrections, never guessed or reset during cleanup. The read-only integrity script can flag discrepancies; its output contains private identifiers and should not be committed.
- Default Jest runs skip MySQL integration unless explicitly enabled. Use an isolated database with migrations applied, not the application's working data.
- The legacy registration action and dependencies with no direct source references remain review candidates; see the cleanup report. They have not been removed.
- Local dependency backports need ongoing maintenance and eventual replacement with suitable upstream releases. Preserve their licenses and regression tests.

## Proposed roadmap (not a delivery commitment)

The current product increment and pilot measures are described in [Product direction](PRODUCT-DIRECTION.md). The items below remain longer-term release gates.

1. **Release validation:** run the full MySQL suite in CI, exercise landlord/tenant journeys on real phones, verify configured Google callbacks, and review financial reconciliation findings privately.
2. **Account recovery:** design verified identity and password recovery flows with abuse limits before expanding public signup.
3. **Operations:** document the hosting owner, scheduler health, protected backups, restore drill, error monitoring and incident contacts.
4. **Dependency simplification:** review the unused candidates, approve removal, update the lockfile and rerun all checks in a dedicated change.
5. **Billing policy extensions:** agree on proration and move-out rules before implementing them. Preserve old statement/receipt snapshots.
6. **Optional channels/integrations:** evaluate opt-in SMS and provider-confirmed payments only after requirements, costs and privacy expectations are agreed.
