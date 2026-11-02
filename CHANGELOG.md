# Changelog

## [1.0.1] - Unreleased

### Security and release hardening
- Initialize the configured payment provider during server startup.
- Fail closed in production when the payment provider is missing, unsupported, or not configured; simulator fallback is development-only.
- Keep legacy simulator endpoints blocked in production; route invoice payments through authenticated Zarinpal/IDPay checkout.
- Require a real PostgreSQL connection string, configured SMS sender credentials, and a verified payment integration before production readiness can pass.
- Require production secrets and real provider configuration in the production Docker Compose deployment.
- Enable Redis AOF persistence in the production Compose stack.
- Implement Zarinpal v4 and IDPay v1.1 create/verify requests, bank callback handling, amount verification, and transactional invoice settlement.
- Connect VIP plan checkout to the same verified payment flow; activate subscriptions only after server-side gateway verification.
- Connect pre-service inspection/travel fee checkout to the verified bank callback; update job, technician pending wallet balance, commission, notifications, and chat unlock atomically.
- Require authentication and a matching successful payment for the VIP subscription API.
- Keep sandbox mode configurable for staging and reject sandbox mode in production readiness/deployment.
- Make deployment verify /api/ready after liveness instead of treating /api/health alone as proof of readiness.
- Add an isolated staging profile that permits sandbox gateway credentials and console OTP only under APP_ENV=staging; add docs/STAGING_RUNBOOK.md.
- Avoid returning raw internal dependency errors from the public health endpoint.
- Correct the production readiness checklist totals and mark the existing changelog and payment-provider startup work accurately.
- Record the remaining local IRANSans font asset requirement; current runtime font is Vazirmatn.

### Known release blockers
- Wire the production gateway create → redirect → callback → verify → idempotent settlement flow to the existing customer payment UI.
- Complete provider-specific callback verification and test with provider sandbox credentials.
- Run CI on the release pull request and resolve any failures.
- Run a full PostgreSQL staging smoke test, OWASP ZAP scan, and cross-browser/mobile QA.
- Activate real SMS, payment credentials, domain, TLS, monitoring, backups, and alerts only when production credentials and infrastructure are supplied.
- Complete real provider sandbox transactions before marking payment integration as production-verified.

## [1.0.0] - 2026-09-25

### Added
- Customer service workflow (request → matching → dispatch → tracking → completion)
- Heavy machinery support (excavators, loaders, graders, bulldozers, tractors)
- Passenger vehicle support (vehicle catalogue and customer flows)
- Technician workflow (missions, inspection, findings, health reports)
- Admin panel (users, technicians, applications, verification, categories)
- MEKANIX CARE module (maintenance engine, service packages, bookings)
- Fleet management dashboard
- VIP subscription system
- Insurance & referral modules
- Unified Service facade (read + write)
- Offline mode with queue, sync, and idempotency
- Lite API responses (?lite=true for weak internet)
- Payment gateway abstraction (Zarinpal, IDPay; simulator for development)
- SMS provider abstraction (Kavenegar, MeliPayamak, Farapayamak)
- ETA provider abstraction (Neshan, Google Maps, OSRM)
- Redis adapter for distributed rate limiting and idempotency
- PostgreSQL + SQLite dual migration support
- Docker production stack (multi-stage build, compose, migrate service)
- Health (/api/health) and Readiness (/api/ready) endpoints
- Caddy reverse proxy config with HTTPS, HSTS, CSP
- Production readiness checklist
- Backup/restore scripts
- Security audit script

### Security
- OTP security: CSPRNG + SHA-256 hashed storage
- OTP rate limiting and DB-backed session revocation
- HttpOnly + Secure cookies in production
- BOLA protection helpers and Zod input validation
- Service state machine and mass-assignment protection
- Admin bootstrap requires an explicit production password
- JWT secret required in production
- Security headers via Caddy
- Repository hygiene script and production readiness gates

### Testing
- Unit, integration, business-flow, failure-scenario, and security tests are included in the repository.
- CI workflows cover SQLite, PostgreSQL, production readiness, and Docker E2E.

### Architecture
- Next.js 16 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui
- Prisma ORM
- PostgreSQL production database with SQLite development/test support
- Persian/English translation module and RTL support

### Deferred integrations
- Real SMS delivery (requires provider credentials and a real-phone test)
- Real payment transactions (requires merchant credentials and provider sandbox/live test)
- Real routing provider (requires Neshan or another routing API key)
- Production VPS deployment, domain, DNS, and HTTPS
- Production monitoring and alerting
- Load test execution and OWASP ZAP scan
- Post-launch observation and support
