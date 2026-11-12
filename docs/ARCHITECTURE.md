# Architecture and code map

AbangTa is a single Next.js App Router application backed by MySQL through Prisma. React renders the interface, Tailwind and CSS modules provide styling, and Auth.js handles sessions and Google authentication. Node.js 22 is the documented development/CI baseline; `package.json` supports Node 22–24.

## Request flow

1. A route renders a server page or a client component submits a form/API request.
2. Server actions and API handlers validate input and authenticate the request.
3. Services enforce account roles and record ownership, apply domain rules, and execute Prisma queries/transactions.
4. Pages or responses return permitted data; interactive components render it.

Middleware is an early routing boundary, not the sole authorization check. Services and protected handlers must still verify identity and ownership. Financial operations use Decimal arithmetic, database constraints and transaction/row locking; preserve those boundaries when refactoring.

## Directory responsibilities

```text
abangta/
├── .github/                  CI, dependency updates, pull request template
├── assets/fonts/             Receipt fonts and their licenses
├── docs/                     Architecture, status, setup, feature guides
├── prisma/
│   ├── schema.prisma         Persistent models and constraints
│   ├── migrations/           Ordered SQL history; never rewrite applied migrations
│   └── seed.ts               Optional empty-development-database demo data
├── public/assistant/         Public mascot images (never private payment proofs)
├── scripts/                  Server/reminder launcher, scheduler, integrity check
├── src/
│   ├── app/                  Routes, layouts, API handlers and server actions
│   ├── components/
│   │   ├── assistant/        Shared Ishi UI and its position hook
│   │   ├── auth/             Account portal and account controls
│   │   ├── billing/          Payment, receipt and funds UI
│   │   ├── landlord/         Landlord-specific controls/navigation
│   │   ├── marketing/        Public-page scenery and motion
│   │   ├── tenant/           Tenant navigation and joining controls
│   │   ├── providers/        Client context providers
│   │   ├── react-bits/       Attributed third-party UI component
│   │   ├── ui/               Reusable presentation/form controls
│   │   └── SiteFooter.*      Shared public footer and styles
│   ├── lib/                  Auth, security, validation, DB, PDF, pure helpers
│   ├── services/             Assistant, billing, property, tenancy, repair, news rules
│   ├── types/                Shared contracts and authentication type augmentation
│   ├── __tests__/            Application unit and opt-in MySQL integration tests
│   └── middleware.ts         Early request routing/access checks
├── vendor/                   Licensed dependency security backports
└── configuration files       Next, TypeScript, Tailwind, ESLint, Jest and npm
```

Frontend and backend share this repository intentionally. Splitting them into separate applications would change deployment and runtime boundaries without helping this cleanup.

## Placement and naming rules

- Route filenames follow Next.js conventions (`page.tsx`, `layout.tsx`, `route.ts`). Keep route-specific server actions with their route.
- Reusable React components use PascalCase; CSS modules remain beside their component. Keep a feature-specific hook with its feature until other features need it.
- Domain services use `*.service.ts`. Pure helpers and schemas belong under `src/lib`; do not put client rendering or network side effects in a pure helper.
- Use `@/` for cross-directory source imports. Use relative paths for a neighboring style/module. Avoid adding barrel files solely to shorten paths.
- New application tests go in `src/__tests__`. The Node scheduler test stays beside its standalone `.mjs` script because it uses Node's test runner, not Jest.
- Keep framework configuration at the root, runtime scripts in `scripts`, and stakeholder documentation in `docs`.

## Compatibility and assets

The `(auth)` route group provides `/login` and `/register`; `/auth/login` and `/auth/register` re-export those pages. These are supported route aliases, not redundant files to delete. Internal `Nadine` names and `NADINE_AI_*` environment variables remain compatibility names for Ishi.

`public` is directly accessible from the browser. Receipt fonts in `assets/fonts` are server resources. Preserve both image assets, CSS modules, font licenses, React Bits notices and `vendor/*/SECURITY-PATCH.md`. Private uploads and local generated output must stay ignored.

## Persistence and background work

Prisma owns schema evolution. Apply committed migrations with `prisma:migrate:prod`; generate a new migration for a schema change. The demo seed is not required to run existing installations. Do not reset an existing database during setup or cleanup.

Shared MySQL rate-limit buckets coordinate application instances. The npm development/production launcher starts a reminder scheduler; durable reminder state lives in MySQL. Sleeping/serverless hosting needs an external scheduler. Request-scoped caches must not become shared caches of account-specific records.

See [operations](FEATURES-AND-OPERATIONS.md) and the [assistant guide](NADINE-ASSISTANT.md) for security boundaries, job authentication, and provider setup.
