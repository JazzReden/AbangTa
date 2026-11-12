# Lists, form recovery and operations

Updated 12 November 2026. The original orange palette and manual landlord-verified GCash workflow remain the approved design and payment scope.

## Finding bills and repairs

Tenant bills and landlord property bills now use 12-record pages. Search by property/room (and tenant name for landlords), filter by status and billing month, and use Previous/Next records to reach older records. Filters remain in the URL and survive pagination. Applying or clearing filters starts at the first page; an out-of-range page clamps to the last available page. No matching results offers a clear-filter path. Counts describe the filtered list, not a total financial balance.

Tenant and landlord maintenance lists support search, status (including all open requests) and priority. Queries apply all filters together before pagination. Legacy landlord `?filter=open|completed|cancelled` links still work. Sorting is newest first, with an ID tie-breaker; filter to Open requests to focus on outstanding repairs.

List count and rows share a repeatable-read snapshot. Every query includes tenancy/creator ownership or property/landlord ownership. Tenant payment proofs are loaded only for the displayed bill IDs. Landlord list rows select only necessary information and a pending-proof indicator; room/bed inventories are not fetched to render a property list header. The billing-status filter uses current amounts and due dates rather than relying on a stale stored overdue flag. Cancelled bills retain the existing hidden-from-active-bills policy; this change does not remove financial records.

Search is bounded to 100 characters and parameterized through Prisma. Contains search and page offsets are suitable for the current product scale, not a claim of constant latency at millions of rows. Measure representative workloads before adding a search engine or more indexes.

## Form behavior

Shared `StatefulForm` forms retain entries after returned validation errors or failed network requests. Submitting is disabled while a request is pending. Successful forms reset unless explicitly configured to preserve values. Values stay in the mounted form; they are not saved to local storage or logged. Retention across a full reload, sign-out, browser crash or a remounted page is not promised. In-flight status is marked with `aria-busy`; completion uses a status announcement.

Billing and maintenance validation errors include field messages. The error summary receives focus, and each message can focus the corresponding field; invalid controls expose `aria-invalid` and `aria-describedby`. Maintenance inputs additionally have native length constraints. Phone inputs use 16px text and at least 44px height to improve editing without changing the palette. Browser file-input selection remains subject to browser restrictions.

The behavior follows React's [form action/reset model](https://react.dev/reference/react-dom/components/form) and [action-state error guidance](https://react.dev/reference/react/useActionState). Existing forms outside `StatefulForm`, such as the separate authentication portal, keep their own validation handling.

## Monitoring

- `GET /api/health`: public, no-cache process liveness. It does not establish database health.
- `GET /api/health/ready`: private/no-cache readiness, requiring `Authorization: Bearer <OPS_MONITOR_SECRET>` with a separate secret of at least 32 characters. Anonymous requests receive 401. Authorized healthy checks receive 200; database failures, failed reminders or stale reminder success receive 503. The endpoint returns only coarse states, not errors, identities or connection strings.
- Reminder health lives in `operation_heartbeats`. Runs record start/success/failure across restarts and replicas. Readiness requires a successful reminder run in the last 15 minutes and zero consecutive failures. A missing heartbeat is unhealthy. Readiness uses bounded transaction wait/timeout; external monitoring also has an eight-second request timeout.
- API and Prisma errors emit structured, sanitized events (`database.error`, `reminders.failed`, `reminders.recovered`). The scheduler emits `reminders.scheduler.failed` once per failure episode and logs recovery even if zero reminders were sent. No raw exception text, SQL, payment data or credentials is emitted by these logging helpers.

Apply `20261112000200_operation_heartbeats` through `npm run prisma:migrate:prod` in staging before enabling readiness checks. Set `OPS_REQUIRE_REMINDERS=0` only when reminder delivery is intentionally disabled. External cron deployments leave it enabled so freshness is still checked. The public liveness endpoint stays useful during database trouble.

Run the monitor from a separate process/host with environment variables supplied by the operator's secret manager:

```sh
npm run ops:check
```

`OPS_HEALTH_URL` must point to `/api/health/ready` over HTTPS (loopback HTTP is allowed locally). Redirects are refused. Exit 0 means healthy, 1 means unhealthy/unreachable, 2 means monitor configuration is invalid. The script reads process environment, not `.env`; supply credentials without placing them in shell history or URLs. Run it every minute using the deployment monitor/cron, alert on a sustained failure, and notify on recovery. Collect the JSON events in the hosting log service and route alerts to the responsible operator. An unconfigured hosted monitor or alert destination is not established merely by adding these files.

First response to a reminder alert: check worker process/external cron and the job's bearer configuration, confirm database connectivity and migration state, then inspect sanitized failure events. Do not mark proofs paid, reset balances or delete financial data to clear an alert. Successful subsequent jobs clear the failure count; stale timestamps require an actual healthy job.

## Backup, restoration and rollback

The guarded `npm run ops:rehearse-recovery` tool operates only with `ABANGTA_DB_TESTS=1` and a loopback MySQL database whose name ends in `_test`. It does not load `.env`, reset/seed the source or restore over an existing database. It requires matching MySQL client tools and permission to create/drop a disposable restore database. Its temporary option file is mode 0600, inside a private temporary directory; credentials never appear in process arguments or the report.

The rehearsal uses a transaction-consistent `mysqldump` with primary-key ordering, hex blobs and no tablespace metadata, then restores into a newly named database. It compares complete data and schema dumps, narrowly normalizing MySQL's redundant explicit utf8mb4 character-set spelling in table DDL. Row content is compared without normalization. Raw backup/restored hashes and the verified canonical hash are reported. A mismatch fails the rehearsal. Temporary dump/credential files and the tool-created restore database are removed on exit; `ABANGTA_RECOVERY_KEEP=1` retains only the restored **test** database for a subsequent application rollback smoke test. No existing database is dropped by this tool.

[MySQL dump guidance](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html) documents required privileges and the transactional backup boundary. Do not run DDL/migrations while taking a backup. This project schema has no stored routines/events; installations adding those objects must include and verify them separately. Avoid source writes during the comparison rehearsal so an intentional concurrent change does not produce a false mismatch. For real backups, use managed encrypted storage, restricted backup credentials, retention and an isolated staging restore; do not use this local-only rehearsal as the production backup scheduler.

Production release procedure:

1. Record the release build ID/image digest and keep the previous immutable application artifact with its matching dependencies and configuration.
2. Take a protected backup and verify its restore in an isolated staging database. Record timestamps, hashes, table/row verification and measured recovery time; never commit dumps or private identifiers.
3. Apply the additive heartbeat migration once, deploy the new artifact to staging, then verify both-role sign-in, scoped lists, form error recovery, manual GCash/receipts, readiness and reminder jobs.
4. Release to production only with explicit authorization. Monitor readiness, error events and reminder freshness.
5. For application rollback, switch to the previous immutable artifact with matching environment and dependencies. This migration is additive; leave the heartbeat table in place. Verify sign-in, protected reads, financial consistency and the previous worker behavior. Repeated reminder delivery remains protected by the database cooldown and job rate limit.
6. Database restoration is a separate, reviewed incident action: stop writes, preserve the current database, restore to a new target and reconcile any post-backup payments before switching connections. Never blindly replace financial records with an old snapshot.

## Verification

Current execution results and limits are recorded in `LISTS-FORMS-OPERATIONS-VERIFICATION.md`. Local fixture checks do not prove production backup retention, alert delivery, physical-device acceptance or deployment readiness.
