# AbangTa: from records to daily resolution

## Product aim

Make running a small rental property feel manageable: landlords know what needs attention, tenants know what to do next, and both can understand how a payment or repair reached its current state.

The first market remains Philippine boarding houses and small rental properties. The existing orange identity, PHP billing, Asia/Manila dates, and landlord-verified GCash remain intentional. International readiness requires validated local demand, currencies, payment arrangements, language support, and operational requirements; this release does not claim those capabilities.

## Implemented product increment — November 12, 2026

- A landlord Action Center combines work across owned properties, including unresolved obligations on archived properties. Desktop and mobile navigation expose it directly.
- Three queues cover GCash proof reviews, overdue balances, and open repairs. Search accepts property, tenant, and room names; repairs also accept titles. Each page contains at most 12 items.
- Payment proofs sort oldest first; bills sort by earliest due date; repairs sort by priority, then oldest first. Stable ID ordering prevents ties from duplicating or skipping records across pages. Filters survive pagination.
- The daily focus highlights urgent repairs first, then payment reviews, overdue bills, and other open repairs. It explains the selection and links to the corresponding queue. This is deterministic guidance from stored records, not an AI prediction.
- A repair opens its exact detail page, independent of its position in the property list. The existing status-update workflow is shared by list and detail pages. Saving updates refreshes the action queue and dashboards.
- Tenant next steps distinguish unpaid bills, pending proof, and rejected proof. An actionable unpaid bill comes before one awaiting verification. If all unpaid bills have pending proof, the page advises checking the submission before paying again.
- Tenant bill links select the exact bill, including older statements, with ownership enforced in the database query and a clear return to all bills.
- Submitted amounts are labeled separately from confirmed payments. Proofs on settled or cancelled bills remain reviewable, with warnings. Overdue bills with pending proof tell landlords to review it before following up.

## Product measures to validate with a pilot

These are proposed measures, not measured improvements or claims of market success. Establish a baseline with consenting pilot users before setting numeric targets.

| Outcome | Measure | Guardrail |
| --- | --- | --- |
| Faster daily work | Median time from opening the dashboard to completing the intended task | Track completion, not clicks alone |
| Clearer payment status | Time from proof submission to review; repeat submissions per bill | Pending proof never counts as collected money |
| Better repair communication | Time to acknowledgement and completion, grouped by priority | A status change alone does not prove a repair was fixed |
| Successful onboarding | Properties reaching first active tenancy and first issued bill | Keep practice accounts out of results |
| Continued value | Weekly active properties and repeat tenant use | Interpret with interviews, not retention numbers alone |

No external analytics SDK, tracking export, or automatic outbound messages were added.

## Next release gates

1. Validate the new workflows with landlords and tenants managing real properties. Observe where users hesitate, and confirm that the priority ordering matches their daily work.
2. Complete staging rollout and external alert routing from the existing operations runbook. Repeat backup restoration and application rollback using the deployed database version and protected backup storage.
3. Resolve account recovery and onboarding friction before increasing acquisition. Measure first-value completion before adding more features.
4. Scale from measured constraints: profile database queries with representative portfolio sizes, test access boundaries and load, and set a service-level objective supported by the actual hosting arrangement.
5. Expand one market at a time. Separate currency, timezone, language, and provider capabilities before enabling additional countries. Automatic payment collection remains a distinct product decision requiring merchant onboarding.

## Engineering boundaries

This increment adds no migration or dependency. Existing migrations from earlier work still need their own staging rollout. It reuses authorization and payment/maintenance mutation services. Reads never approve proofs, mark bills paid, or send reminders. Summary counts and selected list results are independent snapshots and can differ briefly during concurrent updates; the target workflow checks current state before mutations.

The change does not certify production readiness, international compliance, accessibility across all assistive technologies, or performance at large scale. See `ACTION-CENTER-VERIFICATION.md` for actual local checks and `LISTS-FORMS-OPERATIONS.md` for deployment operations.
