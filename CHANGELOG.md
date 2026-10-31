# Changelog

## [Unreleased]

### Payments & Security
- Replaced the client-side card/OTP simulator with bank-hosted payment redirects.
- Production simulator and unimplemented providers fail closed; Zarinpal and IDPay use server-to-server verification.
- Production/staging readiness and deploy scripts reject obvious development/example placeholders for JWT, PostgreSQL, and Redis secrets.
- Payment amounts and payer ownership are resolved server-side for VIP, invoice, and pre-service payments.
- All operational prices are stored as USD base amounts and converted to IRR for display; gateway requests use a fresh server-side exchange-rate snapshot.
- The client must acknowledge the exact calculated Rial amount; if the rate changed, the flow refreshes the displayed amount and asks for confirmation before redirecting.
- Renamed VIP plan `priceIrr` to `priceUsd` with SQLite and PostgreSQL migrations.
- Added a configurable Telegram rate collector that treats unitless NerkhDollarIRT quotes as Toman, prefers sell quotes, normalizes to Rial, and blocks production collection unless a fresh Telegram-sourced quote is available.
- Payment-rate freshness is measured from the original Telegram post timestamp (not scrape time); stale quotes cannot authorize production payment collection.
- Pending hosted bank redirects are persisted and reused for up to 24 hours; abandoned initialization reservations expire after five minutes so customers can retry without generating duplicate charges.
- Added idempotent payment settlement, pending payment reservations, callback handling, and post-payment VIP/invoice/wallet fulfillment.
- Legacy `/api/payments`, `/api/prepay`, and `/api/vip/subscribe` endpoints now delegate to the gateway flow instead of simulating success.
- Live bank acceptance testing remains pending until gateway credentials and public HTTPS `APP_URL` are configured.
- Added SQLite/PostgreSQL partial unique indexes to prevent concurrent pending VIP/prepayment intents per customer.
- Production payment redirects are restricted to official Zarinpal/IDPay hosts; callback origins must be public HTTPS origins.
- Staging is explicitly isolated and may use the simulator; production cannot.
- Production/staging readiness requires live Redis, PostgreSQL, a 24+ character Redis password, a 16+ character database password, and a 32+ character JWT secret.
- Redis failures now fail closed for distributed rate limiting/idempotency instead of silently switching to per-instance memory; connection recovery is retried.
- Production health/readiness responses hide internal diagnostics; detailed failures remain in server logs.
- Deployment and backup/restore scripts now validate secrets, use the readiness gate, copy all migrations, and refuse unsafe restore targets.
- Added payment, callback-origin, Redis recovery, rate-limit, and database-index tests; Playwright browser E2E is wired into CI.
- Regenerated `bun.lock` with Bun 1.4.4; `bun audit` reports no known vulnerabilities across 980 packages (2026-10-31). Full CI rerun against the regenerated lockfile remains pending.

## [1.0.0] - 2026-09-25

### Added
- Customer service workflow (request → matching → dispatch → tracking → completion)
- Heavy machinery support (excavators, loaders, graders, bulldozers, tractors)
- Passenger vehicle support (28 Iranian car companies with full catalog)
- Technician workflow (missions, inspection, findings, health reports)
- Admin panel (users, technicians, applications, verification, categories)
- MEKANIX CARE module (maintenance engine, service packages, bookings)
- Fleet management dashboard
- VIP subscription system
- Insurance & referral modules
- Unified Service facade (read + write)
- Offline mode with queue, sync, and idempotency
- Lite API responses (?lite=true for weak internet)
- Payment gateway abstraction (Zarinpal, IDPay; development-only simulator)
- SMS provider abstraction (Kavenegar, MeliPayamak, Farapayamak)
- ETA provider abstraction (Neshan, Google Maps, OSRM)
- Redis adapter for distributed rate limiting and idempotency
- PostgreSQL + SQLite dual migration support
- Docker production stack (multi-stage build, compose, migrate service)
- Health (/api/health) and Readiness (/api/ready) endpoints
- Caddy reverse proxy config with HTTPS, HSTS, CSP
- Production readiness checklist (31 phases)
- Backup/restore scripts
- Security audit script (12 automated checks)
- Rollback documentation

### Security
- OTP security: CSPRNG (crypto.randomInt) + SHA-256 hashed storage
- OTP rate limiting: 5/10min per phone, 20/hour per IP (Redis-backed)
- Session: DB-backed revocation (tokenHash + revokedAt)
- HttpOnly + Secure cookies (no X-Token header)
- BOLA protection on 23 API routes (requireBookingParticipant, requireAssignedTechnician, etc.)
- Service state machine (role-based transitions, optimistic concurrency)
- Mass assignment protection (FORBIDDEN_FIELDS, sanitizeInput)
- Zod input validation (6 schema files)
- Permission guard (can() function, 14 permissions, 5 roles)
- Demo endpoint hard-blocked in production (handler + rewrite)
- Admin auth: no default password in production (ADMIN_BOOTSTRAP_PASSWORD)
- JWT: no fallback secret in production (throws if missing)
- Security headers via Caddy (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Repository hygiene script (forbidden artifacts scanner)
- Production safety gates (SMS/Payment/PostgreSQL in /api/ready)

### Testing
- 333 tests across 13 files
- Unit tests (permissions, care-auth, pricing, dispatch, offline-queue, lite-response, session-lifecycle, service-unified)
- Integration tests (auth OTP flow, CARE BOLA protection)
- Business E2E tests (47 tests, 14 flow stages)
- Failure scenario tests (28 tests, 8 categories)
- Security tests (42 tests, BOLA/IDOR/mass-assignment/OTP-crypto)
- CI: SQLite (ci.yml)
- CI: PostgreSQL 16 (postgresql-ci.yml with service container)
- CI: Production Readiness (build + check:repo)
- CI: Docker E2E (full stack: build → compose → migrate → health → OTP test)

### Architecture
- Next.js 16 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui
- Prisma ORM with 60 models
- 70 API routes
- 105 React components
- 2,968 i18n translation keys (fa/en)
- 102 Iranian vehicle brand entries (Persian names)
- Decimal.js for money-safe calculations (IRR currency)
- src/modules/ structure (9 module barrels)

### Deferred Integrations
- Real SMS provider (needs Kavenegar API key + real phone test)
- Real Zarinpal payment (needs merchant ID + real transaction test)
- Real routing provider (needs Neshan API key + real route test)
- Production VPS deployment
- Domain + DNS + HTTPS
- Production monitoring (Prometheus/Grafana)
- Load test execution (k6 script ready)
- Playwright browser E2E
- OWASP ZAP scan

- Added production GPG-encrypted backup streaming, encrypted restore support, a private daily backup-scheduler service, and optional HTTPS failure alerts.
- Enabled Redis AOF persistence in production/staging Compose, added configurable container memory/CPU ceilings, and propagated request IDs through the Next.js 16 proxy.
