# Ishi - AbangTa Assistant

## What Is Available

- One full-body mascot launcher shared by authenticated landlord and tenant pages, with an occasional four-frame wave based on the supplied Ishi reference. The compact launcher defaults to the lower left above navigation/sign-out controls and can be repositioned. It no longer performs the earlier periodic hop. The original image remains unchanged. Motion runs automatically without a pause/play button; it pauses on hover, keyboard focus and while chatting, and is disabled for reduced-motion users. The compact keyboard-accessible chat, supported-question suggestions, linked records, close/minimize controls and Escape-to-close stay above mobile navigation. Landlords retain the property scope selector; tenants have only their own records. Sign-in pages do not mount Ishi.
- Owner-scoped read-only reports for unpaid monthly bills, overdue bills, room/bed availability, occupancy, confirmed collections and unresolved maintenance. Totals use Decimal arithmetic; dates and comparisons use Asia/Manila. Every answer names its property scope, period and as-of time.
- Editable English and Cebuano reminder wording, verified previews, separate explicit send confirmation, opt-in one-time schedules, cancellation and durable delivery outcomes. Only the existing AbangTa in-app notification channel is used. No SMS, email or push delivery is implied.

## Moving Ishi And Asking Follow-Ups

Drag the mascot with a pointer/touch, or focus its launcher and use arrow keys. A normal tap still opens chat; crossing the drag threshold suppresses accidental opening. Each protected role layout keeps one widget and conversation mounted across client-side navigation. Only the preferred normalized position is saved in this browser's local storage, separately per account and landlord/tenant mode, after dragging or keyboard movement. Positions restore on reload and scale to the current viewport; malformed values and storage failures safely fall back to normal dragging. No conversation, tenant details, payments or AI credentials are saved alongside the position. Clearing browser storage resets it; preferences do not sync between devices.

Screen edges, actual links/buttons and full-width mobile navigation are checked after dropping, scrolling, resizing, visual-viewport changes and page control updates. Empty desktop sidebar space is available for placement. The assistant is portalled to the document body above the sidebar, so white page sections cannot clip or cover her. Blocked drops prefer nearby free space; if none exists, she stays visible at the bounded position rather than disappearing. Temporary collision adjustments do not overwrite the preferred location. The chat chooses space above/below the mascot and stays above bottom navigation. Opening chat intentionally overlays page content. Route changes and existing dashboard record refreshes invalidate open reports without repeated AI calls.

Additional question phrasing includes outstanding balances, tenants who still owe money, vacancies/empty beds, income/received payments and who lives in rooms, plus common Bisaya report phrases. After an unpaid/collections report, a short follow-up such as "what about last month?" retains that report topic. Only a validated enum plan is reused; no IDs, SQL or financial values can be supplied through conversational context.

Ishi also provides labelled app-workflow guidance about cash/GCash proof review and receipts, Wi-Fi/parking billing, separate deposits and advances, invitations and reminders, in English or Cebuano. These are application explanations, not claims about a particular tenant's actual payments or utility rates. Historical/custom ranges and unsupported questions still require clarification. These additions work without an AI key; the optional provider remains an intent classifier, not an unrestricted chatbot.

## Tenant Scope

Tenant mode uses a separate read-only `/api/tenant/assistant/chat` endpoint. It accepts only a question and strictly validated report/follow-up enums, never caller-supplied user, tenant, landlord, property or bill IDs. Every report rechecks the current tenant role and filters through the authenticated user's own tenancy; payments additionally match both their payment tenancy and bill tenancy. Maintenance is restricted to requests created by that tenant for their tenancy. Other tenants in the same room or property remain inaccessible.

Supported reports: monthly bills and charge treatment, unpaid/overdue balances, confirmed bill-payment history, own GCash proof statuses, current active/pending room and bed assignment, and own maintenance requests. Bills/payment periods support this month, last month and this week; unsupported dates ask for clarification. Remaining balances use exact nonvoid payment amounts. Confirmed payment history excludes unconfirmed/voided payments, displays advance applications separately from new money, and never treats pending/declined proofs as payment. Proof statuses and maintenance history explicitly identify their all-recorded-dates scope. Full reports are bounded at 1,000 rows with at most 20 displayed links.

Tenants have no property-wide reports, landlord reminder controls or financial writes. The original landlord chat/reminder endpoints still reject tenants. Receipts and proof approval remain in existing landlord-controlled workflows. Tenant questions and stored records are not sent to an AI provider; all answers come from constrained application routing and verified own records. An unassigned tenant can open Ishi and receives an honest empty-assignment response. The tenant launcher keeps the same artwork, colors, drag behavior, motion preferences and chat controls.

## Landlord AI Setup

The verified-records mode works without an AI key and is clearly labelled **AI not configured**. Common supported questions use deterministic routing without a paid provider request. An optional server-side OpenAI adapter classifies other questions into a strict reporting enum. Unknown, ambiguous or unsupported requests ask for clarification.

Configure these only in local/deployment environment files, never client-side variables:

```dotenv
NADINE_AI_PROVIDER=openai
NADINE_AI_MODEL=your-enabled-responses-model
OPENAI_API_KEY=your-server-side-api-key
```

Choose a model enabled for your API account that supports Responses API structured outputs. No model is assumed to be available. No additional npm package is needed. Restart the server after configuration changes.

The adapter sends only the current question (up to 500 characters, with email/mobile-like values redacted), a fixed intent schema and instructions. It does not send database rows, tenant-name fields, maintenance text, payment screenshots, transaction references, landlord IDs or conversation history. User-typed questions can still contain private details; avoid typing unnecessary personal information. Requests use the official Responses API with `store: false`, a ten-second timeout, no redirects, no executable tools and strict output validation. See [official structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Deliberate constraint: AI selects a read-only reporting intent; numeric narratives and reminder wording are generated in application code from verified records/templates rather than allowing arbitrary model-written financial claims. Stored text is displayed as escaped record content, never submitted as model instructions. Live provider connectivity has not been verified without credentials; mocked success, invalid output, failure and timeout paths are tested. Other AI providers are not implemented yet.

## Accounting Rules

- Unpaid totals are whole-bill balances, including separate charges, not guessed rent-only or electricity-only allocations. Existing payment records, including historical legacy payments, determine bill balances. Pending/declined proofs never count as payments.
- Confirmed collections include nonvoid confirmed direct payments plus confirmed advance receipts minus advance refunds. They exclude deposits, unconfirmed/voided payments, pending/declined proofs and advance applications, which are not new money. Historical unconfirmed records may therefore differ from older dashboard collection summaries until confirmed by their owner.
- This week starts on Monday in Manila. Current week/month collections are period-to-date and compared with matching elapsed prior periods. Last month compares complete calendar months. A shorter prior month is labelled non-comparable; a zero comparison amount has no invented percentage change. Missing history is described as zero recorded collections, not an inferred decline in real-world income.
- Availability excludes pending reservations and maintenance beds/rooms. Occupancy states the number of rooms with active occupants, not pending reservations. Per-bed availability is reported separately.
- Reports are bounded at 1,000 bills/rooms/requests, with at most 20 linked records displayed. Oversized reports ask the landlord to narrow the property scope rather than display an inaccurate partial total. The scope selector lists the first 100 active properties; all-property reports retain the normal bounded-report safeguard.

## Reminder Safety And Scheduling

Open an unpaid/overdue answer, choose the recipient's bill, choose English/Cebuano, and preview the reminder. Wording is editable using `{tenant}`, `{balance}`, `{due}`, `{property}`, and `{room}`. Required verified fields cannot be omitted. Preview alone sends nothing. Edits require another preview. Drafts expire after 15 minutes.

Sending is a separate authorized action with explicit recipient/message confirmation. If the bill changed after a manual preview, a new preview is required. Automatic delivery requires a separate enable checkbox and a selected Asia/Manila time (one minute to 90 days ahead). Each schedule targets one chosen bill/recipient. This implementation supports one-time schedules, not recurring assistant campaigns.

Schedules are durable in MySQL. The existing private `/api/jobs/bill-reminders` job processes enabled Ishi schedules before legacy automatic reminders. Standard `npm run dev` / `npm run start` launchers invoke the private scheduler every five minutes while the server is alive. Serverless or sleeping deployments require an external scheduler to POST to that job with a strong `BILL_REMINDERS_SECRET` Bearer value. Never expose that secret to the browser. Existing enabled automatic reminder policy is preserved; Ishi creates no new custom schedule until explicitly enabled. Disabling `BILL_REMINDERS_AUTOMATIC` also disables the bundled scheduler.

At delivery, the server locks and rechecks the bill, current ownership/role, actual remaining balance, pending payment proofs and tenant cooldown. Scheduled templates render current values, not stale preview amounts. Payments, cancellation, inactive tenancies, pending proofs, ownership changes and shared 24-hour anti-spam limits prevent inappropriate or duplicate delivery. Generic automatic reminders also pause while a GCash proof is awaiting verification; existing explicit manual bill reminders remain landlord-controlled.

Status/outcome records distinguish sent, skipped, cancelled and failed deliveries. Notification creation and the final schedule status commit together. Concurrent workers/retries do not send the same reminder twice. Failed schedules are recorded and require an explicit new preview/schedule; there is no uncontrolled retry campaign. A payment racing a reminder uses the same bill locks as existing billing, and payment confirmation marks stale bill reminders read. No assistant tool approves payments, changes balances or issues receipts.

## Privacy And Refresh

Every private endpoint checks its expected role and record ownership on the server. POST operations require the configured application Origin, strict schemas and an 8 KB request limit. Shared MySQL rate limiting allows 20 Ishi requests per account per minute. Chat responses and schedule history are private/no-store. Anonymous pages do not mount the widget; tenant pages mount only tenant mode.

Conversation history is in memory only, limited to six turns; it is not saved in local storage or sent to the provider. Reopening/focusing the panel and relevant dashboard changes refresh verified answers without another provider call. A manual refresh icon remains available. Landlord mode retains its existing focus/dashboard-triggered refresh behavior.

While tenant chat is open and contains at least one supported record report, a bounded batch check runs every 15 seconds. It refreshes every report still present in the six-turn conversation, not just the last reply. `/api/tenant/assistant/refresh` accepts up to six strict tenant report plans and uses the authenticated tenant identity only. Duplicate plans share one query result. A private content digest ignores volatile query timestamps, so unchanged reports do not cause repeated message replacement. Changes to relevant balances, confirmed payments, proofs, room assignments and maintenance status update the existing answers in place without appending messages, clearing typed text, replacing greetings or forcing the chat scroll position. The underlying tenant page/form is not refreshed.

Checks stop when chat closes, there are no record reports, or the component unmounts. Hidden/offline tabs pause and resume automatically. Requests never overlap; timeouts and transient failures back off up to five minutes, 429 Retry-After is honored, and revoked access clears private answers and stops checks. Automatic checks share the existing 20-per-account-per-minute limiter. No extra AI calls, reminders, notifications, payments or receipts are created. Answers retain an as-of timestamp; background failures keep the last verified answer rather than inventing updates. Changes may take a polling interval to appear, or longer during outages/backoff.

Ishi welcomes users according to Asia/Manila time and responds to a constrained set of greetings, thanks and wellbeing questions in English or Cebuano. These replies run locally without querying private financial records, and the tenant chat API also handles authorized greeting requests without financial-report queries. A greeting never authorizes a financial action. The last real report remains available for follow-ups after a thank-you. This is friendly app conversation, not an unrestricted AI chatbot or an unsolicited notification campaign.

## Checks

Live-answer/greeting update on October 18, 2026: the 356-test baseline passed before changes; final 387 tests across 45 suites passed. The existing PDF stress test timed out during one concurrent run and passed unchanged when rerun alone. TypeScript, lint and production build passed. New tests cover unchanged-content stability, tenant-isolated revisions, bill/payment/proof/repair changes, batch authorization/bounds, greetings, visibility/offline pausing, timeout/cleanup behavior, invalid replies, rate-limit backoff and access revocation. Real browser verification confirmed that a disposable tenant's balance changed from PHP 1,200 to PHP 1,100 after a separately recorded PHP 100 test payment, payment history updated, and a repair changed to IN_PROGRESS without a page refresh; the greeting, five-turn conversation and unsent draft remained intact. The assistant itself remains read-only.

Tenant assistant verification on October 18, 2026: baseline 328 tests passed before changes; final 356 tests across 42 suites passed. TypeScript, lint and production build passed. Tenant coverage includes cross-role rejection, caller-ID/schema rejection, origin/rate limits, same-room/same-property isolation, role revocation, pending/declined proof exclusion, exact partial balances, confirmed/nonvoid payment rules, advance-credit separation, month/due boundaries, inert stored titles and unassigned accounts. Real authenticated local HTTP tests passed, and browser checks confirmed own bill/room answers, absence of landlord tools, page-switch/reload position persistence and mobile/short-screen navigation/input clearance. Disposable fixtures were used; no payments or receipts were created by assistant reads.

Baseline: 243 existing application/database tests passed before the original assistant implementation. Latest drag/question update on October 18, 2026: 313 tests across 40 suites passed, including drag bounds, control/navigation avoidance, dense-screen handling, broader phrases, follow-up plan validation and workflow ownership isolation. Lint and production build/type checking were also checked. The six scheduler tests passed during the original assistant verification; no scheduler code was changed in the drag/question update. The Ishi suites also cover partial balances, confirmed-only collections, separate deposits/advances, pending/declined proofs, empty records, date/year/week boundaries, stored-text injection, AI absence/failures, preview/edit/expiry, explicit scheduling, duplicate workers, cancellation, paid-bill suppression, pending-proof holds, delivery failures and API security.

Real authenticated local HTTP checks passed for reporting isolation, origin/schema validation, current English/Cebuano previews, separate send confirmation, stale-preview protection, duplicate prevention, durable scheduling/cancellation and suppression after payment. Browser checks covered desktop (1440 x 1000), mobile (390 x 844), a short input viewport (390 x 400), keyboard opening, Escape/focus restoration, exact supplied mascot rendering and a disposable tenant reminder delivery. No browser console errors were observed in that verification session. Live AI connectivity remains unverified without provider credentials.

```bash
npm run prisma:generate
npm run prisma:migrate:prod
ABANGTA_DB_TESTS=1 npm test -- --runInBand
npm run test:scheduler
npm run typecheck
npm run lint
npm run build
```

Protect database backups: reminder audit rows contain tenant-directed wording and belong to the same privacy boundary as financial records.
