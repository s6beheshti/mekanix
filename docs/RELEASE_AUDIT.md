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
4. Disable legacy simulator endpoints in production; use authenticated real-provider requests for invoice, pre-service, and VIP checkout, deriving amounts and payer identity from the database/session.
5. Implement real invoice, pre-service, and VIP create → redirect → callback → server verification → idempotent settlement paths for Zarinpal and IDPay, including the customer result redirect.
6. Require PostgreSQL URL format in production readiness.
7. Treat missing MeliPayamak/Farapayamak sender IDs as provider misconfiguration.
8. Require production secrets and explicit production SMS/payment providers in Docker Compose; enable Redis AOF. Separate staging mode from live production so only staging can use console OTP and provider sandbox credentials.
9. Make scripts/deploy.sh validate strong secrets/provider credentials and poll both liveness and production readiness.
10. Avoid returning raw dependency error messages from the public health endpoint.
11. Reconcile the checklist: 204 rows = 102 Done, 31 Prepared, 64 Pending, 7 Partial. The former 137-item summary was inconsistent.
12. Add regression tests for production payment guards and provider create/verify contracts. Add v1.0.1 notes and document APP_URL and gateway sandbox settings.

- Add an isolated staging profile with sandbox-only gateway settings, console OTP, HTTPS callback origin, and a step-by-step staging verification runbook. Staging must use a real sandbox provider, never the successful payment simulator.

## Encrypted backup implementation added on this branch

- Production/staging backup streams are compressed and encrypted with GPG AES-256 before the persistent backup volume is written.
- Production and staging Compose now include an isolated backup scheduler with a read-only root filesystem, a private tmpfs GPG home, resource limits, and no published host port.
- The scheduler creates a backup at startup and every 24 hours; manual backup and backup listing require a 32+ character Bearer token.
- Restore decrypts and validates the archive before applying it. PostgreSQL restore is transactional; SQLite restore is staged to a temporary file and checked with `PRAGMA integrity_check`.
- CI includes an offline encryption/restore regression test; Docker E2E checks that the service creates an encrypted artifact and does not leave a plaintext archive.
- This is repository implementation, not yet proof of operational recovery: CI must pass on this branch and staging must complete a restore into a separate disposable database. Off-site replication and an external alert destination remain operational tasks.

## Authentication session hardening added in PR #8

- Production/staging no longer issue a JWT when the Session row cannot be persisted.
- Production/staging reject JWT authentication if the Session store cannot be queried; development/test compatibility fallback remains limited to non-production.
- Single-session and user-wide revocation failures propagate instead of being reported as successful.
- Session verification checks that the persisted Session row belongs to the user encoded in the signed token.
- CI and PostgreSQL CI evidence is pending for the exact PR head; this implementation must not be called verified until those checks complete.

## Critical findings still open
- Invoice, pre-service, and VIP checkout code is now wired to Zarinpal v4 and IDPay v1.1 create/verify APIs. Amount and plan are server-derived, user ownership comes from the authenticated session, callbacks are verified server-to-server, and invoice settlement, technician prepay wallet credit, and VIP activation are transactional. VIP activation now requires a matching verified payment; the former free-activation endpoint is closed. These flows are **not yet proven against either provider sandbox**; valid merchant credentials and callback-domain registration are still required.
- CI is configured on the release PR. The latest revision's four workflows are running; only completed green checks count as validated.
- No staging environment has been deployed: PostgreSQL migration, Redis persistence, production image, encrypted backup/restore, and full workflow need an actual host.
- External integrations are not verified: real OTP delivery, payment sandbox/live transaction, and routing provider require credentials and test accounts.
- Operational security is not verified: branch protection is disabled on main; no release exists; OWASP ZAP, penetration test, load test, monitoring/alerts, and restore drill need execution.
- Wallet top-up remains disabled in production: the current schema models technician earnings wallets, but there is no approved customer/top-up ledger and settlement policy. It must not be activated until those accounting semantics are defined.
- Persian typography is not fully aligned with the preferred design specification: the app currently loads Vazirmatn; a licensed local IRANSans font package is not in the repository.
- Launch-day work remains: domain/DNS/TLS, firewall/SSH hardening, admin bootstrap, monitoring, real user acceptance tests, and 24-hour observation.

## Release decision
**NO-GO for public production release.** The real invoice, pre-service, and VIP gateway integration is implemented in code, but it has not been proven with provider sandbox credentials on a deployed staging host. Live SMS, DNS/TLS, operational security checks, recovery drills, and launch monitoring also remain unverified.

## Required sequence to reach GO
1. Pass all provider contract tests in CI, then deploy the isolated staging profile and perform real Zarinpal or IDPay sandbox transactions; verify callback delivery, amount matching, repeat-callback idempotency, and failed/cancelled flows.
2. Pass all release PR checks, including PostgreSQL migration and Docker E2E.
3. Deploy to isolated staging with PostgreSQL and Redis; verify migrations, OTP, payments, admin, customer/technician flows, backup/restore.
4. Run OWASP ZAP, dependency audit, load test, and mobile/browser QA; resolve all critical/high findings.
5. Provision production secrets and infrastructure; execute deployment and require /api/ready = 200.
6. Complete real SMS and payment sandbox/live transaction checks; confirm no simulator path is exposed. Keep wallet top-up disabled until its ledger/settlement policy is implemented.
7. Create signed/tagged release and observe service for 24 hours after launch.
