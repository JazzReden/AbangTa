# Occupancy and Billing Audit

Audit date: 17 October 2026. Existing orange/neutral design system retained.

## Verified baseline

All 154 existing tests passed with ABANGTA_DB_TESTS=1 before implementation.
Existing features include property-scoped announcements, room invitation/QR approval,
Decimal billing, saved utility allocations, per-tenant parking, Wi-Fi defaults,
partial Cash/GCash payments, verified receipts, and shared reminder cooldowns.

## Findings addressed

1. Capacity was not bed inventory. Added named beds, advertised rates, maintenance
   availability, tenancy history, and explicit whole-room/individual-bed rental.
2. Shared room cards displayed only the first occupant. They now list all active occupants.
3. Room status and archive writes could conflict with occupancy. They now lock the
   property and reject changes that contradict active or pending assignments.
4. Bed approval needs a single transaction. All invitation paths validate the
   selected/reserved bed under the same property lock. A unique activeBedKey also
   prevents duplicate active/pending reservations of one bed.
5. Utility cohorts used current ACTIVE tenants, not the billed period. Cohorts now
   include ACTIVE/ENDED tenancies overlapping the period and exclude future move-ins
   and newly cancelled, never-activated invitations. Existing saved shares stay immutable.
6. Final bills for former tenants were unavailable. Former noncancelled tenancies
   can now be billed only for overlapping periods. Old balances and receipts remain accessible.
7. Room-meter descriptions used current occupant counts after allocation. They now
   show the saved participant count used for the charge.
8. Tenant "Total due" showed only the latest bill. It now sums all uncancelled bills,
   subtracting actual nonvoided payments and clamping each balance at zero.
9. Rental configuration, bed writes, reviews, and tenancy endings use shared limits.
   Approval confirmation is also validated on the server, not only in the browser.
10. Utility policy could change while issuing bills for one period. Inconsistent
    method/fixed-rate or saved split changes are now rejected instead of silently
    billing roommates under different property utility rules.
11. Browser testing exposed native form resets disagreeing with retained controlled
    billing state. The monthly bill form now preserves its visible selections after
    submission, keeping tenant, Wi-Fi, and parking fields consistent with submitted data.

## Compatibility and billing policy

- The migration is additive. Existing rooms remain LEGACY_SHARED and preserve
  capacity-based assignments and agreed per-tenant rents. No beds are invented for
  occupied rooms and no historical bills are rewritten. Convert an empty room in
  Rental settings & beds. New rooms offer WHOLE_ROOM or PER_BED only.
- Whole-room mode means one tenancy for the entire room, regardless of capacity.
- New individual-bed rooms initially create one bed per capacity slot, using the
  entered advertised rate for each bed. Edit each bed independently afterward.
- A pending personal invitation reserves its selected bed until accepted or ended.
  Expired personal invitations remain reservations until the landlord ends them;
  expiry does not silently cancel an agreement. Reusable room links reserve nothing.
- Bed rate edits affect future assignments only. Current tenancies keep their agreed
  monthly rent; issued bills and already-issued receipt snapshots are unchanged.
- Rent and fixed charges retain the existing full-month policy. No automatic daily
  proration has been introduced. For a part-month agreement, an explicit proration
  policy and bill preview should be implemented before promising prorated rent.
- Room metered totals are split equally among overlapping tenancies. Property shared
  totals are split equally among occupied rooms, then each room's overlapping tenancies.
  These are equal monthly shares, not day-weighted consumption estimates.
- Included/free charges are zero; parking applies only to each tenancy's saved mode.
- A saved allocation is authoritative. A later newly entered tenancy not in that
  allocation is rejected rather than silently redistributing issued charges.

## Roadmap still outstanding

This milestone is the audit and individual-bed billing foundation, not completion
of the entire product roadmap. The separate deposit ledger and explicit advance-credit
allocation are now implemented; see [Deposits and advances](DEPOSITS-AND-ADVANCES.md).
Remaining separate work: Maya records; tenant payment-proof submission and review;
shareable statements and English/Bisaya reminder templates; optional SMS integration.
Proof submission must never count as a confirmed payment. Deposits must not be
counted as rent income. Credit allocation must be explicit and transactional.
Google OAuth still needs the owner's Google Cloud credentials to verify live login.

## Verification

Run npm run typecheck, npm run lint, ABANGTA_DB_TESTS=1 npm test -- --runInBand,
npm run test:scheduler, and npm run build. Database tests use isolated fixtures,
including concurrent bed approvals, authorization, whole-room exclusivity, pending
reservations, move-out/reuse, tenant-specific charges, exact meter reconciliation,
historical cohorts, payment/receipt privacy, and immutable prior bills.
