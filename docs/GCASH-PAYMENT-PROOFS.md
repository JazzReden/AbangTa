# Tenant GCash Payment Proofs

## Workflow

1. Tenant opens **Bills**, expands **Submit GCash proof**, and enters the amount, payment date, reference number, and a JPG/PNG screenshot (up to 4 MB).
2. The proof appears as **Awaiting verification**. It does not create a payment, change collections, reserve the GCash reference, settle the bill, or create a receipt.
3. The landlord opens the notification's **Review GCash proof** link, or opens the bill marked **GCash proof awaiting verification** in the property's Bills tab.
4. The landlord checks the actual recipient account, reference and amount in GCash, not just the screenshot. Checking the received confirmation and submitting **Confirm GCash payment** records the payment and makes the receipt available.
5. A landlord can instead decline with a reason. The tenant can see the reason and submit corrected evidence. Rejection never changes money balances.

This is manual verification, not a GCash gateway or automatic transaction verification. Never approve a screenshot without checking the recipient's real transaction history. If the payment was already recorded manually, decline the duplicate proof rather than crediting it again.

## Landlord Dashboard Queue

The dashboard's **GCash proofs awaiting review** section shows the landlord's pending count and the oldest five submissions, with pagination for the rest. Each row identifies the tenant, property, room/bed, submitted amount and submission date. **Review proof** opens the exact proof on its bill, where the existing private screenshot, received confirmation and decline-with-reason controls are available. There is no blind dashboard approval or bulk confirmation.

Confirmed and declined proofs leave the queue. Corrected submissions enter as new pending proofs. Unresolved proofs remain visible if the bill was paid separately or cancelled, or the property was archived, so the landlord can resolve duplicates rather than lose them. These rows show a warning for paid/cancelled bills; approval still checks the current bill balance. Queue queries exclude screenshot bytes, transaction references and internal request keys, enforce property ownership, and do not affect financial totals. Invalid or out-of-range page numbers recover to a valid page.

## Automatic Dashboard Updates

While the landlord dashboard is visible and online, it checks a private queue revision every 15 seconds. A changed revision triggers a Next.js data refresh, not a full-page reload. The existing queue, pagination and styling are unchanged. The fingerprint covers the selected page and pending count, so replacing one proof with another also triggers an update even when the count stays the same.

Polling pauses in hidden/offline tabs and checks again when the dashboard becomes active and the next check is due. Only one request can run at a time, with an eight-second timeout. Temporary failures retry with exponential backoff (up to five minutes); shared rate-limit responses honor Retry-After within that bound. Focus events cannot bypass the cooldown. Expired/revoked access stops polling and refreshes authentication. Leaving the dashboard cancels requests and removes timers/listeners, so bill review forms are not automatically refreshed.

The read-only endpoint `/api/landlord/payment-proofs/revision` requires a current landlord session, uses the existing owner-scoped queue query, returns only an owner-specific SHA-256 revision, sets private/no-store response headers, and enforces a shared limit of 60 checks per landlord per minute. No new database migration or external subscription service is needed. Unchanged revisions do not refresh the dashboard. These checks never record a payment, approve a proof or issue a receipt.

## Accounting And Concurrency

- Proofs are separate from payments and deposits/advances. Only confirmed payments count toward monthly bill balances and collections.
- Partial amounts are supported with decimal/centavo arithmetic. Approval checks the latest unpaid balance, including any intervening cash or advance applications. A stale claim is not silently reduced or overpaid.
- Approval, GCash reference reservation, payment, bill balance, notification and receipt snapshot commit in one transaction. If receipt creation fails, the entire approval rolls back.
- The existing property, tenancy and bill lock order serializes concurrent payments. Approval retries return the same payment without double-crediting. Approved evidence is immutable; reversing a payment removes receipt access and shows **Payment reversed**.
- References are unique across an owner's confirmed GCash bill payments and deposit/advance ledger. Unverified claims do not reserve references, preventing tenants from blocking legitimate transactions.
- Paid/cancelled bills reject new claims and cannot accept stale approvals. Pending claims do not suppress genuine unpaid-bill reminders. Existing shared reminder cooldowns remain in force.

## Private Evidence And Limits

- Screenshots are held in the database, not a public uploads directory or third-party URL. Only the bill's tenant and property landlord can access the authenticated image endpoint.
- List queries exclude image bytes and internal request keys. Image responses are private/no-store, same-origin, and nosniff. Anonymous requests receive 401; unrelated accounts receive 404.
- Only correctly typed JPEG/PNG files are accepted. Content signatures and actual decoding are validated. Pixel count, processing time, request size, uploaded file size and stored output size are bounded. Images are re-encoded as JPEG without original metadata or appended content.
- Shared database rate limits: ten submission attempts per tenant per 24 hours, sixty reviews per landlord per minute, sixty image views per account per minute. There can be one pending proof per bill and ten retained submissions per bill. Contact the landlord when the limit is reached.
- Next.js Server Actions retain their same-origin checks; roles, ownership, confirmation checkbox and rejection reason are checked on the server.
- Migration `20261017000300_gcash_payment_proofs` is additive. Existing payments and receipts are preserved. Database backups now contain private payment screenshots and need the same access controls as other tenant records.

## Verification

Run `ABANGTA_DB_TESTS=1 npm test -- --runInBand`, `npm run test:scheduler`, `npm run typecheck`, `npm run lint`, and `npm run build`.

The proof suites cover pending-only accounting, exact partial balances, approval idempotency and races, ownership/private images, duplicate references across deposits, stale balances, rejected/corrected claims, voided receipts, complete rollback on receipt failure, shared submission limits, corrupt/active/spoofed uploads, metadata removal, and excessive pixel counts. Real authenticated multipart HTTP and desktop/mobile browser checks were also performed using disposable fixtures.
