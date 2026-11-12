# Documentation

Start with the [project README](../README.md) for the product overview and setup. These documents describe the repository; implementation is not evidence of a live deployment or completed user acceptance testing.

| Audience / question | Read |
| --- | --- |
| Owners and project managers: what works and what is next? | [Project status and roadmap](PROJECT-STATUS.md) |
| Daily workflows and the next product milestone | [Product direction](PRODUCT-DIRECTION.md), [Action Center verification](ACTION-CENTER-VERIFICATION.md) |
| Developers: where should code live? | [Architecture and code map](ARCHITECTURE.md), [contributing](../CONTRIBUTING.md) |
| Current engineering audit and release gates | [Prioritized audit](ENGINEERING-AUDIT-2026-11-12.md), [executed verification and roadmap](ENGINEERING-VERIFICATION-2026-11-12.md) |
| Release owners | [Release readiness and design research](RELEASE-READINESS.md) |
| Maintainers: what changed in the cleanup? | [Organization audit](CODEBASE-ORGANIZATION.md) |
| Searchable lists, form recovery and health monitoring | [User/operator guide](LISTS-FORMS-OPERATIONS.md), [executed verification](LISTS-FORMS-OPERATIONS-VERIFICATION.md) |
| Operators: how do accounts, billing, and reminders work? | [Features and operations](FEATURES-AND-OPERATIONS.md) |
| Configure Google, Wi-Fi, parking, or payments | [Google and payment setup](GOOGLE-AND-PAYMENTS.md) |
| Understand deposits, advances, and corrections | [Funds tracking](DEPOSITS-AND-ADVANCES.md) |
| Submit and review payment proof | [GCash proofs](GCASH-PAYMENT-PROOFS.md) |
| Configure Ishi and understand its access boundaries | [Assistant guide](NADINE-ASSISTANT.md) |
| Understand bed assignments and monthly allocation policy | [Occupancy and billing audit](OCCUPANCY-BILLING-AUDIT.md) |
| Prepare a GitHub contribution | [GitHub checklist](GITHUB.md) |
| Report a vulnerability or review third-party attribution | [Security policy](../SECURITY.md), [React Bits attribution](REACT-BITS.md) |

## Keeping documentation accurate

Update the relevant feature guide when behavior changes. Update project status when work is implemented or verified; distinguish those two states. Dated audits retain their historical results and are not current test certificates. Record current verification in the organization report rather than copying old test counts into setup instructions.

Do not put credentials, customer records, payment proofs, private audit findings, or database exports in documentation. The assistant guide retains its historical `NADINE-ASSISTANT.md` filename for existing links; the product name is Ishi.
