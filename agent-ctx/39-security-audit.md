# Task ID 39 — security-audit (API auth + BOLA/Mass Assignment)

## Scope
Apply `requireAuth` to all MEKANIX API routes and fix BOLA / Mass Assignment vulnerabilities. UI components untouched.

## Files modified (all under `src/app/api/...`)

1. `vehicles/route.ts` — GET derives customer from session (ignores `?customerId=`); POST sanitizes body via `ALLOWED_FIELDS.vehicle`, sets `customerId` from session.
2. `vehicles/[id]/route.ts` — DELETE + PATCH wrapped in `requireAuth` + `requireVehicleOwner`. PATCH sanitizes input via `ALLOWED_FIELDS.vehicle`.
3. `jobs/route.ts` — GET filters by session's customer/technician profile (or all for ADMIN). Client `customerId`/`technicianId` query params IGNORED.
4. `jobs/[id]/route.ts` — GET wrapped in `requireAuth` + `requireJobParticipant`.
5. `jobs/[id]/status/route.ts` — PATCH wrapped in `requireAuth` + `requireJobParticipant`. Implemented **Job State Machine**: per-role allowed transitions. Customer may CANCEL (limited) or set `customerApproved=true` only at WAITING_APPROVAL. Technician may advance through ACCEPTED → EN_ROUTE → ARRIVED → DIAGNOSING → REPAIRING → WAITING_APPROVAL → COMPLETED, plus REJECTED. ADMIN: all transitions. Confirms the calling technician is the ASSIGNED technician for tech transitions.
6. `jobs/[id]/diagnosis/route.ts` — PATCH wrapped in `requireAuth` + `requireJobParticipant`. Only the assigned technician (or admin) can set diagnosis.
7. `jobs/[id]/parts/route.ts` — POST + DELETE wrapped in `requireAuth` + `requireJobParticipant`. Only assigned tech/admin. Validates part actually belongs to the job on DELETE (defense in depth). Input sanitized/length-capped.
8. `invoices/route.ts` — GET wrapped in `requireAuth` + `requireJobParticipant` (by jobId). POST wrapped in `requireAuth`; only the assigned technician (or admin) can issue an invoice. **Prices are server-authoritative**: computed from technician's `hourlyRate` + `travelFeeBase` + job parts — client-supplied amounts IGNORED.
9. `invoices/[id]/route.ts` — PATCH wrapped in `requireAuth` + `requireJobParticipant` (by invoice's jobId). Customer CANNOT change amounts or set status=PAID. Customer can only set `customerApproved` (forwards to job) when invoice is WAITING_APPROVAL. Technician/Admin can only edit notes or change DRAFT→SENT/CANCELLED. Status=PAID is forbidden here — must go through `/api/payments` (gateway verify).
10. `messages/route.ts` — GET + POST wrapped in `requireAuth` + `requireJobParticipant`. `fromUserId` is server-authoritative (from session). Body sanitized.
11. `notifications/route.ts` — GET + PATCH wrapped in `requireAuth`. userId derived from session — `?userId=` query param IGNORED.
12. `notifications/[id]/route.ts` — PATCH wrapped in `requireAuth` + `requireNotificationOwner`.
13. `payments/route.ts` — POST wrapped in `requireAuth`. Payer = `session.userId` (NOT from body). Customer must own the invoice's job's request (BOLA). Tighter rate limit (`RATE_LIMITS.PAYMENT`).
14. `reviews/route.ts` — POST wrapped in `requireAuth` + `requireJobParticipant`. `fromUserId` from session. Prevents duplicate reviews. Validates `technicianId` matches the job's assigned tech.
15. `wallets/route.ts` — GET wrapped in `requireAuth`. `technicianId` derived from session (or explicit for ADMIN only).
16. `wallets/withdraw/route.ts` — POST wrapped in `requireAuth`. `technicianId` derived from session. Tighter rate limit (`RATE_LIMITS.WITHDRAW`). Body fields length-capped.
17. `service-requests/route.ts` — GET + POST wrapped in `requireAuth`. GET filters by session's customer/tech. POST derives `customerId` from session (NOT body) and verifies vehicle ownership when `vehicleId` is provided.
18. `service-requests/[id]/assign/route.ts` — POST wrapped in `requireAuth`. Customer must own the request (or be admin).
19. `support/tickets/route.ts` — GET + POST wrapped in `requireAuth`. `userId` from session. Body sanitized via `ALLOWED_FIELDS.ticket` (subject, category, priority, message). Category/priority enum-validated.
20. `insurance/route.ts` — GET + POST wrapped in `requireAuth`. `userId` from session. Body sanitized via `ALLOWED_FIELDS.insurance`. Vehicle ownership verified when `vehicleId` provided.
21. `insurance/claim/route.ts` — POST wrapped in `requireAuth` + `requirePolicyOwner` (BOLA). Validates amount > 0, description length, policy active. JobId participation checked when provided.
22. `referral/route.ts` — GET + POST + PATCH wrapped in `requireAuth`. `referrerId` from session (NOT body / query). PATCH verifies referral belongs to caller + self-referral prevention.
23. `maintenance/route.ts` — GET + POST + PATCH wrapped in `requireAuth`. Vehicle ownership verified (`requireVehicleOwner`). Body sanitized via `ALLOWED_FIELDS.maintenance`. Customer-only POST (technicians see only their jobs' vehicles).
24. `admin/[resource]/route.ts` — GET wrapped in `requireAuth` + `requireRole("ADMIN")`.
25. `admin/[resource]/[id]/route.ts` — PATCH wrapped in `requireAuth` + `requireRole("ADMIN")`. Per-resource allowed-field whitelists; `FORBIDDEN_FIELDS` stripped defense-in-depth.
26. `seed/route.ts` — POST: returns 404 in production; otherwise `requireAuth` + `requireRole("ADMIN")`.
27. `auth/demo/route.ts` — GET: returns 404 in production.
28. `exchange-rate/route.ts` — Public (no auth) but added **60-second in-memory cache** to limit upstream calls and avoid 500s on upstream timeouts.
29. `technicians/route.ts` — Public listing GET, but `user` relation is selected with `PUBLIC_USER_FIELDS` (no password, no email).
30. `technicians/[id]/route.ts` — GET public but uses `PUBLIC_USER_FIELDS`. PATCH wrapped in `requireAuth`; only the technician themselves (matching session.userId → technician.userId) or ADMIN may edit. Blocks changes to `verified`, `rating`, `reviewCount`, `completedJobs`, `level`, `status` (server-authoritative / admin-only). Body sanitized via `ALLOWED_FIELDS.technician`.
31. `dashboard/route.ts` — GET wrapped in `requireAuth`. Uses `select: { name: true }` instead of full user relation for tech performance + recent activity (avoids leaking PII).
32. `categories/route.ts` — Public read-only catalog (no auth). Already public — no change needed.
33. `mechanic-applications/route.ts` — POST public (anyone can apply). Body sanitized via `ALLOWED_APPLICATION_FIELDS`. GET admin-only.
34. `mechanic-applications/[id]/approve/route.ts` — POST wrapped in `verifySession` + `requireRole("ADMIN")`.
35. `mechanic-applications/[id]/reject/route.ts` — POST wrapped in `verifySession` + `requireRole("ADMIN")`.

## Routes NOT in scope (left untouched, no auth required or already public):
- `auth/otp/send`, `auth/otp/verify` — login flow (must be public)
- `auth/session` — session lookup (not in task list)
- `auth/demo` — addressed (prod 404)
- `onboarding` — public catalog
- `vip/plans` — public catalog
- `vip/my`, `vip/subscribe` — NOT in task list; left untouched (would require UI updates because they're called via raw `fetch` without JWT)
- `gateway/initiate`, `gateway/verify` — NOT in task list; left untouched (raw fetch UI)
- `prepay` — NOT in task list; left untouched (raw fetch UI)
- `admin-panel/*` — separate AdminUser auth system (`getAdminFromRequest`), not in scope

## Notes / known issues

### Routes that may break existing UI (called via raw `fetch` without JWT)
The following components use raw `fetch("/api/...")` without attaching the JWT Bearer header (the JWT is stored in `localStorage.mekanix-token` and only attached by the `api.ts` `req()` helper). After adding `requireAuth` to the routes these components call, they will receive 401 and the corresponding UI feature will fail until the component is updated to use the `api.ts` client (or otherwise attach the JWT):

- `src/components/mek/customer/support.tsx` → `/api/support/tickets`
- `src/components/mek/technician/earnings.tsx` → `/api/wallets`, `/api/wallets/withdraw`
- `src/components/mek/customer/referral.tsx` → `/api/referral`
- `src/components/mek/customer/maintenance.tsx`, `fleet-dashboard.tsx` → `/api/maintenance`
- `src/components/mek/customer/insurance.tsx` → `/api/insurance`, `/api/insurance/claim`
- `src/components/mek/admin/applications.tsx` → `/api/mechanic-applications/[id]/approve|reject`
- `src/components/mek/technician/dashboard.tsx` → `/api/technicians/[id]` PATCH
- `src/components/mek/shared/special-alert-banner.tsx`, `app-shell.tsx` → `/api/notifications`, `/api/notifications/[id]`
- `src/components/mek/app-shell.tsx` → `/api/seed` (reseed button now requires admin)

**Recommended follow-up task**: update these components to use the `api.ts` client (which attaches the JWT automatically) or attach `Authorization: Bearer ${localStorage.getItem("mekanix-token")}` to their raw `fetch` calls. The "do not change UI" constraint prevented me from doing this in Task 39.

### Routes called via `api.ts` (these CONTINUE to work)
All routes called via the typed `api.ts` client (`vehicles`, `jobs`, `invoices`, `payments`, `reviews`, `messages`, `notifications`, `service-requests`, `service-requests/[id]/assign`, `dashboard`, `admin/[resource]`, `technicians` GET) — these continue to work because `api.ts` attaches the JWT.

## Verification
- `bunx tsc --noEmit` — 0 errors in any modified API route file (pre-existing errors in `prisma/seed.ts`, `auth/session/route.ts`, `prepay/route.ts`, `mini-services/`, `examples/`, `skills/` remain untouched).
- `bun run lint` — 0 errors in any modified API route file (pre-existing errors in `src/app/admin-panel/page.tsx` remain untouched).
- Dev server: `GET /api/exchange-rate` returns 200 (cache hit after first fetch); intermittent upstream timeouts handled by 60s cache.
