# AbangTa

Your boarding house, all in one place. A Next.js application for Philippine landlords and tenants, with rooms and beds, itemized bills, verified payments, maintenance, property news, and Ishi assistance.

## What the application does

- **Landlords:** manage properties, room/bed assignments, monthly charges, payment verification, deposits, advances, repairs, and property updates.
- **Tenants:** join an approved room, view their own bills and payment records, submit GCash proof, download confirmed-payment receipts, and report repairs.
- **Both:** use a responsive web interface on desktop or mobile. There is no separate native mobile application. Google sign-in requires configuration; password accounts are also supported.

The landlord **Action Center** brings payment reviews, overdue bills, and open repairs across properties into searchable queues. Daily guidance highlights urgent work, while tenant next steps explain pending proof and payment corrections. See [product direction](docs/PRODUCT-DIRECTION.md) and [verification](docs/ACTION-CENTER-VERIFICATION.md).

GCash is a landlord-verified payment workflow, not an automatic checkout. Automatic reminders are in-app notifications while the scheduler is running. See [scope and current limitations](docs/PROJECT-STATUS.md) before planning a rollout.

## Local setup

Requires Node.js 22 LTS, npm, and MySQL 8. Use a development database.

```sh
npm ci
cp .env.example .env
cp .env.example .env.local
```

Fill in both local environment files with matching database and authentication values. Generate `AUTH_SECRET` with `openssl rand -base64 32`. Next.js prefers `.env.local`; Prisma CLI reads `.env`.

```sh
npm run prisma:generate
npm run prisma:migrate:prod
npm run dev
```

Open [localhost:3000](http://localhost:3000). For another port, run `npm run dev -- --port 3001` and set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the same address. Google sign-in additionally requires an OAuth web client; see the setup guide below.

**Never reset or seed a database containing real records.** The optional seed contains demonstration accounts for an empty development database only.

## Checks

```sh
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:scheduler
npm run test:ops
npm run build
```

Database integration tests are opt-in: set `ABANGTA_DB_TESTS=1` with a dedicated MySQL test database after applying migrations. CI uses an isolated database and runs these tests automatically. A build also performs lint and type checks.

## Running a production build

Configure deployment environment values, apply migrations with `npm run prisma:migrate:prod`, then run `npm run build` and `npm start`. Use HTTPS and matching authentication/invitation URLs. Keep the npm start wrapper: it also starts the reminder worker. Hosting that suspends the process needs an external scheduler; see [operations](docs/FEATURES-AND-OPERATIONS.md).

These commands describe how to run the application; they do not establish production readiness. Deployment, backups, account recovery, and live-provider verification remain rollout responsibilities.

## Project structure

| Folder | Purpose |
| --- | --- |
| `src/app` | Routes, layouts and server actions |
| `src/components` | Feature UI, shared controls, and `marketing/` scenery and motion |
| `src/services` | Billing, tenancy and other business operations |
| `src/lib` | Authentication, security and shared utilities |
| `src/__tests__` | Unit and database integration tests |
| `prisma` | Database schema, migration history and optional demo seed |
| `scripts` | Reminder scheduler and read-only integrity checks |
| `public`, `assets` | Application images and fonts |
| `vendor` | Local dependency security patches and their licenses |

## Documentation

- [Documentation index](docs/README.md) — entry points for owners, developers, and project managers
- [Architecture and code map](docs/ARCHITECTURE.md)
- [Scope, progress, limitations, and roadmap](docs/PROJECT-STATUS.md)
- [Organization audit and verification](docs/CODEBASE-ORGANIZATION.md)
- [Feature behavior and operations](docs/FEATURES-AND-OPERATIONS.md)
- [Google and payments setup](docs/GOOGLE-AND-PAYMENTS.md)
- [Ishi assistant](docs/NADINE-ASSISTANT.md)
- [React Bits attribution](docs/REACT-BITS.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Preparing the first GitHub push](docs/GITHUB.md)

## Data and security

Cash and GCash receipts require confirmed payments. Deposits are separate from rent. Tenant records are scoped to their account; landlord records are scoped by property ownership. Rate limiting uses shared MySQL counters.

Environment files, database exports, generated builds, and local uploads are excluded from Git. `.env.example` contains placeholders only. Keep asset and dependency licenses with their files. This repository does not grant an open-source license for the application.

Searchable billing/repair lists, form recovery, private readiness monitoring and the guarded restore rehearsal are documented in [lists, forms and operations](docs/LISTS-FORMS-OPERATIONS.md), with [local verification results](docs/LISTS-FORMS-OPERATIONS-VERIFICATION.md). Configure the operator secrets and apply the additive heartbeat migration in staging before enabling readiness monitoring.
