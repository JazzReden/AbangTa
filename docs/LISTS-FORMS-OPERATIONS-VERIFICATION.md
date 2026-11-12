# Lists, forms and operations verification

Executed 12 November 2026 (Asia/Manila). This is local verification against disposable fixtures, not a production deployment. Existing unrelated edits and the approved orange palette were preserved.

## Executed results

| Check | Result | Evidence |
| --- | --- | --- |
| Strict TypeScript | PASS | `npm run typecheck -- --incremental false` |
| Lint | PASS | `npm run lint`, zero warnings allowed |
| Production build | PASS | `npm run build`; build ID `Dig7FRZvuwD7LDH0TnMPU` |
| Application unit/integration tests | PASS | **416 tests in 52 suites**, including 134 opt-in database tests against disposable MySQL 26.7 |
| Reminder scheduler tests | PASS | Six tests: retry, timeout recovery, authorization, non-overlap, shutdown and replica rate-limit behavior |
| Operational/recovery helper tests | PASS | Five tests: authenticated monitor, unhealthy/malformed responses, secure URL policy, narrow DDL normalization and exact data/schema differences |
| Fresh migration chain | PASS | All 18 migrations applied; Prisma diff from migrated database to schema is empty |
| Bill list database tests | PASS | 25 fixture bills across three pages; all IDs reachable, stable ties, search/month/status combination, unauthorized access rejected, stale/out-of-range page clamping |
| Repair list database tests | PASS | 25 fixture requests, search/status/priority combinations and legacy open-filter links; property/tenant isolation |
| Reminder failure handling | PASS | Persisted failures/recovery and staleness tested; partial assistant delivery failures cannot produce a successful job heartbeat |
| Browser list flows | PASS | Landlord and tenant bill filtering/pagination; repair search/status/priority; layouts at 320, 390, 768 and 1280px without horizontal overflow |
| Browser form recovery | PASS | Server-side title validation preserves title/description/category; summary receives focus, invalid field exposes ARIA state, message focuses field; interrupted POST preserves entries; corrected submission succeeds |
| Protected readiness | PASS | Anonymous 401, authenticated healthy 200, stale reminder heartbeat 503 |
| Database outage/recovery | PASS | Stopped the isolated MySQL server; monitor returned 503, then returned 200 after restart and stale pool connections were replaced. No application restart was required. |
| Backup restoration | PASS | Restored into a new disposable database; all **31 tables**, schema and row content verified |
| Application rollback | PASS | Switched from current build to preserved prior build `Py6zEndU-bizYJR81XGh1` against restored database. Both roles signed in and read protected data successfully. |
| Financial consistency after rollback | PASS | Read-only integrity check returned `ok: true`, zero bill-balance mismatches |
| Production alert delivery / production restore | NOT TESTED | Requires the actual hosting monitor, alert destination, secret configuration and protected backup service |
| Physical phone/screen reader acceptance | NOT TESTED | Browser viewport and focus checks do not establish physical-device or full WCAG acceptance |

## Restore evidence and safety boundary

Source raw dump SHA-256: `37ef92fbb0342dc716f19a0cf56f0f99cfe903c74f156c543a39b7d24dc21396`.

Restored raw dump SHA-256: `46a2143b7f6af81ca848a21645fb3d4b909f2c1a1de2dc8caa822f42287cba20`.

Verified schema/data SHA-256 after narrowly normalizing redundant DDL charset spelling: `37ef92fbb0342dc716f19a0cf56f0f99cfe903c74f156c543a39b7d24dc21396`.

The first comparison correctly stopped on a mismatch: MySQL made an implied `utf8mb4` declaration explicit. Examination showed no other differences. The final tool normalizes only this redundant spelling inside CREATE TABLE statements. Tests confirm that changed row data, changed column definitions and different collations are still rejected. No row content is normalized.

The rehearsal used freshly initialized MySQL, fixture accounts and newly created restore databases. No working database was backed up, migrated, restored over or reset. The local database servers and test web servers were stopped after verification. Temporary credential/dump files created by the recovery tool were deleted. This does not establish an encrypted offsite production backup or a recovery-time objective for real workloads.

Database readiness briefly remained 503 while the client pool discarded closed connections after restart, then recovered on repeated checks. Alert policy should allow transient failures while still notifying on a sustained outage; do not classify a single process-liveness response as database recovery.

## Implementation map

- `src/lib/lists/query.ts`: bounded query parsing, page clamping and filter-preserving URLs.
- `src/components/ui/ListControls.tsx`: native GET search/filter controls and ordinary pagination links.
- `src/services/billing/bill-list.service.ts`, `src/services/maintenance/maintenance-list.service.ts`: scoped, paginated database reads.
- Four bill/maintenance list pages: search and filters; tenant proof reads limited to displayed bills.
- `src/components/ui/StatefulForm.tsx`: error retention, pending protection, summary/field focus, success feedback and network recovery.
- `src/lib/actions/form.ts` and billing/maintenance actions: field-specific validation messages.
- `src/app/tenant/maintenance/TenantMaintenanceForm.tsx`: shared form handling and native validation constraints.
- `src/services/operations/health.service.ts`, `src/lib/operations/events.ts`, private readiness route: durable health and sanitized logs.
- `prisma/migrations/20261112000200_operation_heartbeats`: additive operational storage.
- Reminder job/scheduler: failure and recovery tracking, including partial scheduled-delivery failure.
- `scripts/operations-check.mjs`, `scripts/rehearse-recovery.mjs`, `scripts/recovery-compare.mjs`: operator tooling and guarded restore verification.
- CI runs the new operational/helper tests; execution of remote CI itself is not established by local tests.

Local browser/rollback scripts, screenshots and diagnostics are in `/tmp/abangta-lists-pass/`. These temporary fixture diagnostics are not committed production logs. Earlier browser iterations exposed timing between visible validation output and focus/ARIA effects; final assertions wait for the effect before checking focus. Tests use the labeled filter form to distinguish list filters from per-request status fields.

## Rollout requirements

1. Review and apply the additive heartbeat migration in staging with `npm run prisma:migrate:prod` after backing up the target. No working database migration was performed here.
2. Configure separate `OPS_MONITOR_SECRET`, `OPS_HEALTH_URL` and the reminder-job credentials in the hosting environment. Keep reminder readiness enabled unless reminder delivery is deliberately disabled.
3. Connect `npm run ops:check` to the host's external monitor/cron and route sustained failures/recovery events to the responsible operator. Structured logs alone do not deliver an alert.
4. Repeat restoration and rollback using the actual staging MySQL version, immutable application artifacts and protected backup storage. Pin matching dependency artifacts; the local previous-build check used the installed compatible dependencies.
5. Obtain production deployment authorization and complete real-device acceptance. See [operator/user guide](LISTS-FORMS-OPERATIONS.md) for commands, failure response and rollback boundaries.
