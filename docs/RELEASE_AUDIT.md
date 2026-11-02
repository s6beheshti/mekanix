# MEKANIX Release Audit — 2026-11-02

## Scope and source of truth
- Repository: s6beheshti/mekanix
- Base branch: main
- Base commit reviewed: fbb4bcc672033e774bbc25a200b6855668bba363 (2026-10-08)
- Hardening branch: release/v1.0.1-hardening
- This audit distinguishes repository work from actions that require production infrastructure or third-party credentials.

## Changes made on this branch
1. Initialize the payment provider in src/lib/init.ts.
2. Prevent production from silently falling back to a successful payment simulator when the configured provider is missing or unsupported.
3. Mark NextPay as unsupported until its actual create/verify integration is implemented.
4. Disable all simulated settlement paths in production: /api/gateway/initiate, /api/gateway/verify, and /api/payments. In development they remain available for local UI testing only.
5. Hide card/CVV collection in the production payment dialog and keep /api/ready blocked until the real gateway create → redirect → callback → verify → idempotent settlement flow is connected to the customer payment UI.
6. Require PostgreSQL URL format in production readiness.
7. Treat missing MeliPayamak/Farapayamak sender IDs as provider misconfiguration.
8. Require production secrets and explicit production SMS/payment providers in Docker Compose; enable Redis AOF.
9. Make scripts/deploy.sh validate strong secrets/provider credentials and poll both liveness and production readiness.
10. Avoid returning raw dependency error messages from the public health endpoint.
11. Reconcile the checklist: 204 rows = 102 Done, 32 Prepared, 64 Pending, 6 Partial. The former 137-item summary was inconsistent.
12. Add regression tests for all three production payment blocks. Add v1.0.1 unreleased notes and clarify development-only placeholders in .env.example.

## Critical findings still open
- Payment is not launch-ready: the payment abstraction is not wired into the current customer-facing gateway routes. The legacy fake flow is blocked in production; the real callback, amount verification, ownership binding, idempotency, and settlement transaction still need implementation and provider sandbox testing.
- No CI result exists yet for this branch: a PR to main is required to run the repository workflows.
- No staging environment has been deployed: PostgreSQL migration, Redis persistence, production image, backup/restore, and full workflow need an actual host.
- External integrations are not verified: real OTP delivery, payment sandbox/live transaction, and routing provider require credentials and test accounts.
- Operational security is not verified: branch protection is disabled on main; no release exists; OWASP ZAP, penetration test, load test, monitoring/alerts, and restore drill need execution.
- Launch-day work remains: domain/DNS/TLS, firewall/SSH hardening, admin bootstrap, monitoring, real user acceptance tests, and 24-hour observation.

## Release decision
**NO-GO for public production release.** The code changes above reduce the risk of accidental fake payments and make deployment fail closed, but they do not replace the missing real payment integration or live staging verification.

## Required sequence to reach GO
1. Complete the payment callback and settlement integration; add unit/integration/E2E tests.
2. Open and pass the release PR checks.
3. Deploy to isolated staging with PostgreSQL and Redis; verify migrations, OTP, payments, admin, customer/technician flows, backup/restore.
4. Run OWASP ZAP, dependency audit, load test, and mobile/browser QA; resolve all critical/high findings.
5. Provision production secrets and infrastructure; execute deployment and require /api/ready = 200.
6. Complete real SMS and payment sandbox/live transaction checks; confirm no simulator path is exposed.
7. Create signed/tagged release and observe service for 24 hours after launch.
