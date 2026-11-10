# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to jasperredendumasig1@gmail.com. Include the affected feature, reproduction steps, and impact using test accounts. Do not post credentials, tenant records, payment images, or exploit details in a public issue. Do not test against accounts or properties you do not own.

## Repository practices

- Use local environment files; `.env.example` is the only committed environment template.
- If a credential is exposed, revoke or rotate it immediately. Removing a file from Git does not revoke a secret or remove its history.
- Keep dependency lockfiles, Prisma migrations, and third-party notices committed.
- Review dependency alerts and run the checks described in CONTRIBUTING.md before release.
- Production blocks framing. Direct localhost development requests allow editor previews; proxied requests retain framing protection.

These controls and automated checks do not constitute an independent security certification.
