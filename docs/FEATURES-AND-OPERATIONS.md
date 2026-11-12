# Features and operations

[Documentation index](README.md) · [Current scope and limitations](PROJECT-STATUS.md)

AbangTa manages Philippine boarding houses: properties, rooms, tenancy history, rent, independent water/electricity configuration, payment recording, maintenance and announcements. Accounts can sign in with email/mobile and password, or Google.

## Run locally
Use Node.js 22 LTS and MySQL 8. Follow the [local setup](../README.md#local-setup) before running these commands. The supported Node range is recorded in `package.json`.

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:prod
npm run dev
```

Open http://localhost:3000. Do not reset or seed a database that contains real records.

The normal `npm run dev` and `npm run start` commands also run automatic in-app unpaid-bill reminders. They check after startup and every five minutes while the server is running. Paid/cancelled bills are skipped; database-backed limits allow at most one bill reminder per tenant per 24 hours across all bills, workers, restarts and manual sends. No UI or color changes are involved. Use the npm commands rather than invoking `next` directly. Serverless hosting still requires a hosting scheduler; see the setup guide. Test the loop with `npm run test:scheduler`.

Development builds use a separate cache per port (`.next-dev-3000`, for example), isolated from the production `.next` directory. Use `npm run dev -- --port 3002` for an additional server instead of sharing generated assets.

Set DATABASE_URL, AUTH_SECRET, AUTH_URL, NEXT_PUBLIC_APP_URL, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in .env and .env.local consistently. Next.js prefers .env.local; Prisma CLI loads .env. Use .env.example for names and placeholders; never commit credentials.

See [Google and payments setup](GOOGLE-AND-PAYMENTS.md) for Google Cloud steps, connecting existing password accounts, saved property Wi-Fi/parking defaults, optional custom bill items, and landlord-verified Cash/GCash payments. Wi-Fi/parking defaults apply per tenant to new monthly bills and can be overridden for an individual bill; changes never recalculate existing bills. Custom charges remain bill-specific. Production authentication and invitation URLs must use your HTTPS domain.

## Google sign-in
Create a Web application OAuth client in Google Cloud. Configure the consent screen and add test users while it is in testing mode.
- Authorized JavaScript origin: http://localhost:3000
- Authorized redirect URI: http://localhost:3000/api/auth/callback/google
- Put the client ID in AUTH_GOOGLE_ID and client secret in AUTH_GOOGLE_SECRET.
- Add the equivalent HTTPS production origin and callback when deploying.
- Restart the development server after editing environment variables.

The access screen offers Sign in and Create account, with separate landlord and tenant portals. Registration asks for full name, email or Philippine mobile number, and a password of at least eight characters. Passwords use bcrypt with cost 12; email/mobile identifiers are unique and normalized. A mobile-only account stores no invented email. Signup creates the matching landlord/tenant profile and signs the user in.

Google is an alternative button beneath the form. It is clickable even before OAuth setup; clicking without configured credentials shows an actionable message. Real Google authentication requires the credentials described above. New Google users must use Create account. Existing accounts retain their role. A password user must sign in with their password first before linking Google with the same email. An authenticated mobile-only account can attach its verified Google email. Google cannot take over a password account by matching its email alone.

The users table keeps name, optional unique email, unique normalized mobileLogin, contact phone, passwordHash, role and optional Google identity. Contact phone is separate from the login identifier so editing profile contact information cannot change a login credential.

Email/mobile password signup does not send verification codes or password-reset messages yet. Matching invited accounts can join directly; a different account must receive landlord approval before gaining room access.

The selected role, sign-in/registration mode and invitation destination are kept in a signed, HTTP-only cookie for the OAuth round trip. Modified or expired intents are rejected, and external callback destinations are discarded. An invitation-created tenant record can activate through the tenant flow using its invited Google email.

## Tenant invitations and QR codes
1. Sign in as a landlord, create a property, configure both utilities and add rooms.
2. Open the property's Tenants page. Each room has its own reusable invitation link and QR code, generated automatically without creating a tenant account or reserving a tenancy.
3. Copy/share the room link, or display/download the QR. Name is optional and only personalizes the message. Choose email OR mobile in the single optional contact field to open a prefilled email/SMS draft in your device's app. No message is sent automatically and recipient details are not saved as account credentials.
4. Tenants see their dashboard, bills, payment history, maintenance and profile even without an assigned room. Select Join a room, paste the link/code, or upload a QR image. QR images are decoded locally, without uploading them to a server.
5. Preview the property, room and rent, then request to join. Room links always require landlord approval; a link alone never grants access to tenant records. Approval creates an active tenancy at the room's current monthly rent, starting on the current Philippine calendar day.
6. Landlords approve/decline requests from the property's Tenants page. Transactions check ownership, current room availability, capacity and conflicting assignments. Existing active tenancies cannot be claimed with an invitation.

Invitations expire after 48 hours and can be accepted once. Tokens and short codes are cryptographically random and only SHA-256 digests are stored. Old invitations without a code still work as links. Cancel pending assignments using End tenancy to release capacity.

The 48-hour limit applies to older tenant-specific invitations, which remain supported. Their matching accounts can still join directly. New room links are reusable HMAC-signed URLs tied to room and owner, using AUTH_SECRET. Archiving the room/property disables joining; rotating AUTH_SECRET invalidates previous room links as well as sessions. No raw reusable room token or recipient credentials are stored in the database.

For QR scanning on another device, NEXT_PUBLIC_APP_URL must be reachable from that device. `localhost` only refers to the device scanning the code. During same-Wi-Fi testing, use this computer's LAN address and port, update OAuth callback configuration if using Google, and restart the server. Use a public HTTPS address for deployment.

## Property News
Open a property's News tab to publish a title and plain-text update. Repairs, safety notices, service interruptions and Wi-Fi changes all use the same concise post format. Updates can be edited, given an optional Philippine-calendar expiry date, or archived without deleting their history.

Only the property's landlord can publish/edit/archive. Only its current approved (ACTIVE) tenants can read live updates; pending invitees, former tenants and other properties' tenants cannot. Publishing creates one in-app notification per active tenant account in the same database transaction. Tenant navigation and dashboards link to News.

News writes are limited to 20 per minute per landlord. Maintenance submission is limited to 10 per minute per tenant, and status updates to 30 per minute per landlord. These limits use the shared MySQL limiter below. Rendered posts are plain text, not executable HTML.

## Billing rules
See [Deposits and advance payments](DEPOSITS-AND-ADVANCES.md) for separate
deposit/advance ledgers, refunds, deductions, explicit bill-credit allocation,
collections accounting, corrections and deployment. Agreed deposits are not
automatically treated as received money. Existing bills never silently spend advances.

Individual beds and the occupancy/billing audit are documented in
[Occupancy and billing audit](OCCUPANCY-BILLING-AUDIT.md). New rooms support
whole-room or individual-bed rental. Existing rooms and agreed rents are preserved;
convert empty rooms under Rental settings & beds. Choose a specific available bed
when approving a room request. Each tenancy is billed its own agreed rent.

- Monetary calculations use Decimal and MySQL DECIMAL.
- Included utility statement markers display "Included in Rent" and never add to the charge.
- Fixed rates and meter rates are saved on issued bill items.
- A meter reading must match the utility, property, room and exact billing period.
- Electricity: (current kWh - previous kWh) x rate. Example: (1280 - 1250) x PHP 15 = PHP 450.
- Normal readings cannot decrease; a reset is explicit. Subsequent readings must match the previous reading and cannot overlap.
- Room meters are divided between tenancies overlapping the billed period, including former occupants and excluding future move-ins.
- Shared property utilities split equally across occupied rooms, then across each room's occupants.
- Whole centavos are allocated deterministically; shares sum exactly to the source charge. Allocations and participants are saved for the period, so later occupancy changes cannot recalculate earlier shares.
- Generating overlapping bills for a tenancy is rejected.
- Payment recording, voiding and cancellation lock the bill row and update related records in one transaction. Payments cannot exceed the remaining balance.
- Philippine calendar due dates remain current until 23:59:59 in Asia/Manila. Unpaid balances become overdue after that, including partially paid bills.
- Rent is charged at the tenancy's monthly rate; automatic move-in/out proration is not implemented.

After changing a utility configuration, issue future bills using that configuration. Issued statements retain their history. Former tenancies can receive final bills only for overlapping periods; saved utility allocations remain authoritative.

## Verification
The app uses React 19 and matching type definitions, with `useActionState` for forms. Type checking includes tests; Jest's globals have explicit type definitions so editor diagnostics match CLI checks. ESLint runs non-interactively and fails on warnings.

```bash
npm run typecheck
npm test -- --runInBand
ABANGTA_DB_TESTS=1 npm test -- --runInBand
npm run build
npm audit --omit=dev
```

Run database tests only against a dedicated test database with migrations applied and `DATABASE_URL` explicitly set. Database tests create uniquely named temporary fixtures and remove those fixtures. They cover simultaneous bill generation/payment recording, authorization, electricity meters, saved shared allocations, invitation expiry and replay. Default tests skip database integration unless ABANGTA_DB_TESTS=1 is set.

## Demo seed
Optional; only works on an empty development database. The seed refuses production or nonempty databases and never clears existing records.
Set DEMO_LANDLORD_EMAIL and DEMO_TENANT_EMAIL to Google emails you control to sign in to seeded accounts. Otherwise the seed uses example emails for data inspection.
```bash
npm run prisma:seed
```
Seed data demonstrates included, fixed and metered scenarios, partial/full payments, maintenance and announcements.

## Security and deployment
Server actions and services verify current account roles and record ownership. Google identities must have verified emails. Auth.js handles OAuth state/PKCE, secure session cookies and authentication CSRF protection. Database role checks run on protected operations; middleware does not grant access based solely on a JWT role.

Production response headers block framing, prevent MIME sniffing, restrict base/object embedding, suppress invitation-token referrers and enable HSTS. Direct loopback development requests allow editor iframe previews; non-loopback and proxied development requests retain framing restrictions. Remote optimized images are restricted to Google profile images. Database errors are not returned verbatim from forms.

### Shared rate limiting
Authentication, registration, invitation creation/acceptance, room previews/joins, News writes and maintenance operations use shared `rate_limit_buckets` in MySQL. Run `npm run prisma:migrate:prod` before starting the updated app. No Redis service, API token or additional environment variable is required. Every app instance must connect to the SAME writable database, not an asynchronous read replica.

Bucket keys are SHA-256 digests; emails, mobile numbers and raw tokens are not stored in this table. Checks use database UTC time and short InnoDB row-locking transactions, so concurrent processes cannot each grant a separate allowance. Limits are fixed windows. Successful password sign-in resets that account's login bucket. Policy changes use separate buckets. Invalid policies are rejected, and unavailable shared storage denies protected operations rather than falling back to local memory.

An index supports bounded cleanup of expired buckets (up to 100 rows on a small random fraction of checks). Expired rows never affect enforcement. A gateway/WAF is still recommended for volumetric attacks and distributed attempts against many different account identifiers; account limits are not network-level DDoS protection. Also use HTTPS, restricted database credentials, protected backups and request-size limits. No system is guaranteed immune to attacks.

### Dependency security backports
The test tooling is updated to Jest 30. Two advisories had no patched upstream releases: GHSA-vfj7-8cjw-p6xm (`braces`) and GHSA-hp3w-g68c-fv3c (`sprintf-js`). To preserve Tailwind 3 and the existing UI/colors, this repository includes MIT/BSD-licensed source backports as private npm workspaces in `vendor/braces` and `vendor/sprintf-js`. Their version build metadata identifies local changes; these are NOT new upstream releases. Original licenses and `SECURITY-PATCH.md` files are included.

The brace parser and AST walkers enforce a safe nesting limit. The formatter bounds padding, precision and format size before allocation. Regression tests cover the attacks and ordinary glob/formatter behavior. Keep untrusted build globs out of the build pipeline. Registry audits do NOT cover private workspace code: a clean audit does not replace these tests or patch review. Replace the backports with official patched releases when available. Include `vendor/` with `package.json` and `package-lock.json` in deployment/CI, install with `npm ci`, and retain the same lockfile.

Run both `npm audit` (all dependencies) and `npm audit --omit=dev` (runtime only).

Deployment: install build dependencies, generate Prisma client, deploy migrations, run the production build, then start with npm run start. Configure production OAuth origins/callbacks and environment variables. The SQL migration adds Google identity and allocation tables without resetting existing data.

## Product references
- [Ishi assistant, AI setup and reminder scheduling](NADINE-ASSISTANT.md).
- [Tenant GCash proof submission and landlord verification](GCASH-PAYMENT-PROOFS.md).
- [RentRedi tenant charges and portal](https://help.rentredi.com/en/articles/3964761-how-payments-work): tenant-visible itemized charges.
- [Avail rent ledger](https://www.avail.com/education/articles/what-is-a-rent-ledger): preserve payer, unit, date, amount, charge type and status.
- [Auth.js Google provider](https://authjs.dev/reference/core/providers/google).
- [OWASP HTTP headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

## Maintenance checks

See the [security policy](../SECURITY.md) for vulnerability reporting and the [organization report](CODEBASE-ORGANIZATION.md) for this cleanup’s verification. Historical private security audits are not part of the public documentation.

Run `node scripts/check-data-integrity.mjs` for a read-only bill/ledger check. Exit code 0 means no mismatches were found, 1 means records need reconciliation, and 2 means the check could not complete. The report can contain private bill identifiers: review locally, do not publish it, and do not automatically rewrite financial history.
