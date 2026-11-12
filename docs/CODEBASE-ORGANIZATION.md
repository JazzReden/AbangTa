# Codebase organization audit

Audit date: 12 November 2026. Scope: repository organization and documentation, preserving application behavior and design. Pre-existing working-tree UI changes were retained. Changes remain unstaged for owner review.

## Original structure

The project already used Next.js App Router with separate `src/app`, `src/components`, `src/services`, `src/lib`, `src/types`, Prisma migrations, runtime scripts, static assets, tests and vendored security patches. Configuration and contribution/security files were appropriately at the root.

The audit inventoried 285 non-ignored files before this cleanup. No byte-identical duplicate files were found. This is not proof that all code is semantically unique or reachable. Main organizational issues:

- Public scenery/motion components were mixed into the components root.
- One currency test lived under `src/lib/utils/__tests__`, unlike the other application tests.
- Documentation had no audience-oriented index, architecture map, or consolidated status/roadmap.
- Operational documentation retained an older Node requirement, an outdated mascot description, and a mislabeled link to a private audit.
- Several dependencies and a legacy action need usage review before any removal.

## Improved structure

The existing architecture remains intact. Changes are concentrated here; see the [full directory map](ARCHITECTURE.md#directory-responsibilities).

```text
docs/
  README.md                    Documentation entry point
  ARCHITECTURE.md              Layers, file placement and compatibility
  PROJECT-STATUS.md            Actual scope, limitations, proposed roadmap
  CODEBASE-ORGANIZATION.md     This audit and verification
  ...                         Existing feature/setup guides retained
src/components/
  marketing/
    BoardingHouseScenery.tsx
    BoardingHouseScenery.module.css
    LandingMotion.tsx
  ...                         Existing feature/shared components retained
src/__tests__/
  currency.test.ts            Now beside other application tests
  ...
```

## File change inventory

| Original path | New path / action |
| --- | --- |
| `src/components/BoardingHouseScenery.tsx` | `src/components/marketing/BoardingHouseScenery.tsx` |
| `src/components/BoardingHouseScenery.module.css` | `src/components/marketing/BoardingHouseScenery.module.css` |
| `src/components/LandingMotion.tsx` | `src/components/marketing/LandingMotion.tsx`; update Magnet import |
| `src/lib/utils/__tests__/currency.test.ts` | `src/__tests__/currency.test.ts`; use the `@/lib/utils/currency` import |
| `src/app/page.tsx`, `src/components/auth/AccountPortal.tsx` | Update marketing imports only |
| `README.md`, `CONTRIBUTING.md` | Add product scope, navigation, file-placement rules and runtime guidance |
| `docs/FEATURES-AND-OPERATIONS.md` | Correct setup/security/verification guidance and audit reference |
| `docs/NADINE-ASSISTANT.md` | Match compact launcher and current wave behavior |
| `docs/GITHUB.md` | Support existing repositories and owner-controlled staging |
| Four new documentation files listed above | Add architecture, navigation, status and this audit |

No files were discarded, dependencies removed, migrations rewritten, database records altered, or environment values changed by this cleanup. Git may display a moved file as a deletion plus an untracked addition until staged; the replacement paths above retain its contents.

## Candidates preserved for approval

A literal-reference scan of non-vendored source/configuration found no direct references to these 19 runtime dependencies:

- `@auth/prisma-adapter`, `@hookform/resolvers`, `react-hook-form`, `class-variance-authority`, `date-fns`.
- `@radix-ui/react-alert-dialog`, `@radix-ui/react-avatar`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-tooltip`.

These are candidates, not approved deletions. A removal change must also inspect package relationships and implicit loading, update the lockfile with npm, and rerun verification. The legacy `src/app/(auth)/register/actions.ts` exports an older Google-only registration response and has no current caller found; preserve it until compatibility needs are reviewed. Utility exports such as `generateToken` also warrant a caller audit; do not substitute them for the cryptographic invitation helpers.

Keep the `/login` and `/register` route aliases, `vendor` patches, both mascot images, receipt fonts, all licenses and the complete Prisma migration history. Ignored dependency/build directories are local output, not source to commit; this audit did not delete them. Unknown files and private local audit material remain untouched.

## Verification

Baseline before moves: lint passed; Jest passed 268 tests in 34 suites, with 128 database-gated tests skipped.

Post-change checks on 12 November 2026:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed with no warnings |
| `npm run typecheck -- --incremental false` | Passed |
| `npm test -- --runInBand` | 268 passed; 128 skipped; 34 passed suites and 12 skipped suites |
| `npm run test:scheduler` | All 6 tests passed |
| `npm run build` | Passed compilation, type/lint checks, static generation and build tracing |
| Local Markdown file links | All resolved |
| Moved-file content comparison | Identical to previous contents except the two required import-path adjustments |
| `git diff --check` | Passed |
| Git index | Empty; nothing staged or committed by this cleanup |
| HTTP smoke checks on port 3001 | Landing, sign-in, sign-up and both auth aliases returned 200; unauthenticated landlord/tenant dashboards redirected to sign-in |

Database integration was not enabled: the configured database contains application records, and a dedicated test database was not established for this run. The CI definition supplies an isolated MySQL service for those tests; no GitHub Actions result was inspected. Authenticated browser/mobile journeys and live Google OAuth were not retested. HTTP checks establish route availability, not visual or end-to-end acceptance.

## Follow-up recommendations

1. Review and approve dependency/legacy-code removals as a separate, testable change.
2. Run MySQL integration tests in the existing isolated CI service before merging; never repoint them at live financial records.
3. Keep documentation tied to behavior changes, and record production acceptance separately from automated test results.
4. Keep future reorganization small and domain-based. Do not split this Next.js application into frontend/backend projects merely for appearance.
