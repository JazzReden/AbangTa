# Contributing

Use Node.js 22 and `npm ci` with the committed lockfile. Follow the local setup in README.md.

Use the [architecture map](docs/ARCHITECTURE.md) to choose file locations and the [documentation index](docs/README.md) to find the relevant feature guide. Keep feature documentation and [project status](docs/PROJECT-STATUS.md) consistent with implemented behavior.

## Changes

- Keep route UI in `src/app`, shared UI in `src/components`, and business rules in `src/services`.
- Validate input and enforce the current account role and resource ownership on the server.
- Preserve decimal money calculations, transaction locking, payment confirmation rules, and audit history.
- Use focused changes. Avoid reformatting unrelated files or deleting migrations.
- Keep credentials, private records, payment proofs, and database exports out of commits and issue attachments.
- Preserve third-party notices in `vendor`, `assets/fonts`, and React Bits.
- Put shared marketing scenery/motion in `src/components/marketing`; keep CSS modules next to their components. Put application tests in `src/__tests__` and standalone scheduler tests beside their script.
- Before removing a file or dependency, check imports, dynamic/config references, assets, compatibility routes, and deployment scripts. Record uncertain candidates instead of deleting them.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test -- --runInBand`, `npm run test:scheduler`, and `npm run build`. For billing, tenancy, or database changes, also run database integration tests against a dedicated test database using `ABANGTA_DB_TESTS=1`. Never use a production database for tests.

Pull requests should explain the user-visible change, relevant validation, and any migration or configuration steps. Include mobile screenshots for visual changes. Follow SECURITY.md for vulnerability reports.
