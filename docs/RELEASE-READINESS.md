# Abang Ta release readiness

Reviewed on 12 November 2026. Abang Ta serves Philippine boarding-house owners and tenants. Owners manage properties, rooms and beds, rent and utility charges, collections, repairs, and notices. Tenants join a room, check bills, submit GCash proof for manual verification, and obtain receipts.

## Repository audit and requirements gaps

The application uses Next.js 15 App Router, React 19, Tailwind 3, Auth.js and Prisma 5 with MySQL. Server pages and actions call domain services. API route handlers serve protected proofs, receipts, assistant actions, and the reminder job. The Prisma schema connects users and role profiles to property ownership and tenancies, then to bills, allocations, payments and maintenance. Money writes use transactions, idempotency or uniqueness guards where applicable. Auth.js sessions are checked against current database roles and the affected records. See [architecture](ARCHITECTURE.md) and [project status](PROJECT-STATUS.md) for the full code map.

| Requirement | Classification | Evidence and remaining gap |
| --- | --- | --- |
| Password sign-in and landlord/tenant isolation | Implemented | Auth configuration, role guards, scoped services and access tests. |
| Google account creation, sign-in and linking | Partially Implemented | Provider and account logic exist and have database coverage. The live OAuth callback needs hosting credentials and a smoke test. |
| Self-service account recovery and contact verification | Missing | Password and Google account routes exist. There are no password reset or contact verification flows. |
| Room/bed inventory, invitations and approval | Implemented | Property, occupancy, invitation and join services with database tests. |
| Monthly bills, metered allocations and funds | Implemented | Billing, utility and tenant-funds services with transaction and fixture tests. |
| GCash proof, partial payments and receipts | Implemented | Owner review and tenant receipts exist, with authorization and ledger tests. |
| Automated GCash settlement, native apps and tenant screening | Out of Scope | The current product uses manual GCash verification and a web portal. |
| Repairs, announcements and in-app reminders | Implemented | Role-specific routes and services, plus scheduler and concurrency tests. Live delivery needs an active scheduler. |
| Landing, onboarding and workspace navigation | Needs Improvement | Existing role routes, forms, focus rules and responsive navigation provide a base. This pass improves dashboard task links, workspace feedback and action contrast. Broader screen reader and real-device acceptance remain open. |
| Search, filters and responsive tables | Needs Improvement | Existing filter chips and list-specific controls are implemented. Verify large portfolios and standardize table empty and pagination states as usage grows. |
| Dashboard data access | Needs Improvement | Landlord monetary aggregates and counts now run in MySQL. Tenant outstanding balance still reconciles payments across historical bills. Measure it with representative data before changing its accounting behavior. |
| Security and dependency maintenance | Needs Improvement | Role checks, private caching, shared rate limits and headers exist. Legacy auth code and unused dependency candidates are listed in [the codebase audit](CODEBASE-ORGANIZATION.md). Vendored patches still need review when updating dependencies. |
| Fresh database provisioning | Implemented | Added the nullable profile columns missing from migration history. Clean migration and schema comparison now pass. |
| Production operations | Partially Implemented | CI, a production build/start path, scheduler and HTTP health endpoint exist. Hosting, backups, alerts and rollback still need an environment-specific rehearsal. |

## Design research

- Buildium groups rent, repairs and property communication in one resident portal. Abang Ta uses the same task hierarchy on tenant home, with total due and a direct bill action ahead of secondary updates. Its own payment proof workflow and boarding-house vocabulary determine the actual screen. [Buildium Resident Center](https://www.buildium.com/features/resident-center/)
- Avail presents rent history as a ledger. That distinction supports keeping the balance and statement on tenant home and linking to the dedicated payment history for recorded transactions. [Avail rent ledger](https://www.avail.com/education/articles/what-is-a-rent-ledger)
- GOV.UK’s task list pairs actionable labels with written status, and its error summary gives users a clear recovery path. Use text alongside status color and offer one retry action on a failed workspace view. Field-specific validation remains a separate concern. [Task list](https://design-system.service.gov.uk/components/task-list/) · [Error summary](https://design-system.service.gov.uk/components/error-summary/)

Keep the existing warm paper, charcoal and orange identity. The owner requested restoration of the 11 November palette: warm orange primary actions and the brighter landing orange. Contrast acceptance remains a release review item. Reuse the shared page header, status badges and action styles. Keep route feedback lightweight and verify the primary actions at phone, tablet and desktop widths.

## Deployment runbook

1. Use a Node.js 22 build environment and a staging MySQL 8 database. Run `npm ci`, `npm run prisma:generate`, `npm run lint`, `npm run typecheck -- --incremental false`, and `npm run build`. Keep `vendor/` in the checkout so npm can install the local security backports.
2. Set `DATABASE_URL`, a generated `AUTH_SECRET`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL` through the hosting environment. Use the same public HTTPS origin for authentication and links. Set the public URL before building. Configure both Google credentials and register `/api/auth/callback/google` on that origin if Google sign-in is enabled. See [environment names](../.env.example) and [Google setup](GOOGLE-AND-PAYMENTS.md).
3. Back up the production database and verify a restore in staging before the release. Use `npm run prisma:migrate:prod` as a one-time release step with a migration account. The profile migration adds missing nullable fields and skips those already present. It does not reset tables or overwrite existing profile values. Check `prisma migrate status` before starting the new release.
4. Start with `npm start` behind the HTTPS gateway. Use `GET /api/health` for process health. Its no-cache response does not query MySQL. Separately alert on database connection errors, job failures and application errors. If hosting suspends the process, configure an authenticated external reminder scheduler and disable the bundled loop to avoid duplicate triggers. [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
5. Smoke test sign-in for both roles, a new room invitation and approval, bill viewing, proof review, receipt access, and a reminder on staging. Check that cross-account URLs are denied. Verify Google sign-in and proof uploads on representative phones in the actual hosting environment before enabling those flows for users.
6. Keep the previous application build available. The added profile fields are compatible with earlier builds. If application checks fail, switch back to the previous build and diagnose the migration or service failure before considering a database restore.

## Verification

- Existing baseline passed lint, TypeScript, 268 application tests and six scheduler tests. The default suite skipped 128 database tests.
- A clean, disposable MySQL run initially failed 21 tests. Account and room flows could not read missing landlord and tenant profile fields. With the additive migration, all 396 tests in 46 suites passed. The migration was replayed successfully, and Prisma reported an empty diff between the migrated schema and the data model.
- Production build and local Chrome smoke checks exercised landing and password sign-in, both authenticated dashboards at 320, 390, 768 and 1280 pixels, keyboard skip links, the tenant bill link and the no-cache process health endpoint.
- The runtime npm advisory audit reported zero findings. Local vendored patches remain covered by their regression tests.
- Production hosting, real device checks, external OAuth and backup restore remain release gates.
