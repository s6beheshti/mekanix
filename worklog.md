# MEKANIX — Build Worklog

This is the single shared worklog for the MEKANIX build. All agents append below.

---
Task ID: 0
Agent: orchestrator
Task: Initialize MEKANIX project plan and architecture

Work Log:
- Explored existing Next.js 16 + Tailwind 4 + shadcn/ui scaffold
- Confirmed Prisma (SQLite), Zustand, TanStack Query, recharts, framer-motion available
- Defined architecture: single-route SPA at `/` with role switcher (Customer/Technician/Admin)
- Persistence via Prisma + SQLite; API routes under /api/*; mock-ready service layer

Stage Summary:
- Foundation ready to build. Design language: graphite + amber industrial premium.
- Next: design system CSS, Prisma schema, seed data, core lib.

---
Task ID: 1-11
Agent: orchestrator
Task: Build complete MEKANIX platform (design system, schema, API, customer/technician/admin apps)

Work Log:
- Built MEKANIX brand design system: graphite + amber industrial palette, Space Grotesk display font, technical grid/dots/glow utilities, dark-first theme with light mode
- Prisma schema: 20+ entities with relations (User, Customer, Technician, Specialty, Certification, ServiceArea, Vehicle, ServiceRequest, Job, Diagnosis, Part, TrackingEvent, Invoice, Payment, Review, Message, Notification, Warranty, ServiceCategory)
- Seed script: 8 technicians (varied specialties/ratings/levels), 5 customers, 10 vehicles/machines (cars, trucks, buses, excavators, loaders, tractors, graders), 14 jobs across all statuses, invoices, payments, reviews, warranties, notifications
- API layer: 20+ route handlers (dashboard, technicians, vehicles, service-requests + assign, jobs + status/diagnosis/parts, invoices, payments, reviews, messages, notifications, admin resources, auth/demo, seed, categories)
- Shared components: premium SVG MapView (swappable for Mapbox/Google), JobStatusTimeline, NotificationCenter (polled), ChatPanel (bidirectional), TechnicianCard, VehicleCard, charts (recharts), StatCard, EmptyState, AdminTable (searchable/sortable/paginated), status/urgency badges, icon resolver
- Customer flow: hero home, fleet management (add/delete), request flow (select machine → describe → match → tech profile → request → tracking), real-time tracking with map+timeline, invoice approve&pay, completion+review+warranty, service history, chat, settings, notifications
- Technician flow: dashboard (online toggle, KPIs), requests (accept/decline), job detail (status advancement REQUESTED→...→COMPLETED, diagnosis, parts CRUD, auto-invoice on WAITING_APPROVAL), earnings (revenue chart + payouts), schedule (calendar + service areas), profile, reviews, chat
- Admin platform: operations overview (7 KPIs, revenue chart, status breakdown, category pie, satisfaction radial, geo activity map, tech performance table, recent activity), customers/technicians/jobs/payments/reviews tables, disputes queue, editable categories, verification queue, platform settings
- Fixed payment route (derive payer from invoice), messages route (fromUserId), added technician chat view, resolved all lint errors (setState-in-effect, empty-object-types)

Stage Summary:
- Lint: 0 errors, 0 warnings. Dev server clean (all 200s, no runtime errors).
- Agent Browser verified end-to-end lifecycle across all 3 roles:
  * Customer: request → match → technician profile → request → tracking → estimate ready → pay $143.88 → service complete → submit review ✓
  * Technician: dashboard → open job → advance status (REPAIRING→WAITING_APPROVAL, auto-invoice) → chat (sent message confirmed in DB) ✓
  * Admin: overview with live charts/tables, technicians table with verification toggles ✓
- Notifications: real lifecycle events (estimate ready, job completed, new message) appear with categories + read/unread ✓
- Mobile responsive verified (390x844); role switcher, nav, hero, cards all adapt ✓
- MEKANIX is a real, extensible product foundation — mock/service layer via typed API client replaceable with production API without UI changes.

---
Task ID: 12-22
Agent: orchestrator
Task: Add splash + OTP auth, mode selector (heavy/passenger), mechanic application portal, invoice issuance — without changing existing appearance

Work Log:
- Prisma: added OtpCode + MechanicApplication models, extended User (phone unique, phoneVerified)
- Store: rewrote with bootStage (splash→mode-select→app), portal (customer/mechanic/admin), auth (userId/phone/name/isGuest/verified), machineMode (heavy/passenger), enterApp/exitToSplash/signOut
- API routes: /api/auth/otp/send (+verify), /api/auth/session, /api/mechanic-applications (+[id]/approve +reject), enhanced /api/invoices (full job context + notify customer), added applications to admin resource handler
- Constants: added `mode` field to MACHINE_TYPES, MACHINE_MODES array (passenger=CAR, heavy=everything else), typesForMode() helper
- Splash screen: animated logo mark (uploaded logo.png), phone+OTP login (6-cell code input, demo code shown), "Continue as Guest" (browsing only), "Apply as Mechanic" link, "Operations" admin entry; ambient grid + scan line + glow
- Mode selector: two large premium cards (Passenger Vehicles |amamber / Heavy Machinery |emerald) with EN+FA labels, type chips, feature strip; guest badge shown
- Mechanic application form (public dialog): full name, phone, email, city, experience, specialties multi-select, bio, vehicle-owned checkbox → submits to admin queue with success screen + reference code
- Admin applications review: pending/reviewed lists, detail dialog with all applicant info, Approve (creates User+Technician profile) / Reject with notes; seeded 4 sample applications
- AppShell: added mode-switch button (Heavy↔Passenger) + sign-out button in header
- Customer app: vehicles/jobs/categories filtered by machineMode; home shows mode badge + guest restriction banner; describe-problem enforces guest block (dialog → sign in) on submit; AddVehicleDialog filters types by mode
- Invoice document: printable invoice view (INV code, bill-to, service-by, line items, totals, warranty, signatures, print/download); wired as "invoice-document" view + "View Invoice" button on paid invoices
- Technician job-detail: added explicit "Issue Invoice" action button
- Seed: added 4 mechanic applications (3 pending, 1 approved)
- Fixed: regenerated Prisma client + restarted dev server for new models; resolved all lint errors

Stage Summary:
- Lint: 0 errors. Dev server clean. No browser errors.
- Agent Browser verified end-to-end:
  * Splash → Sign in with Mobile → OTP (demo code shown) → verify → mode-select ✓
  * Mode selector → choose Heavy Machinery → customer app with "Heavy" mode badge + filtered fleet ✓
  * Mode switch (Heavy↔Passenger) from header ✓
  * Continue as Guest → mode-select → app → guest banner on home ✓
  * Guest tries to submit request → "Sign in required" dialog → returns to splash ✓
  * Apply as Mechanic → fill form → submit → "Application received" with reference code ✓
  * Admin → Applications → see new submission → approve → "APPROVED" + technician account created (POST 200) ✓
  * Invoice document view renders printable invoice with all details ✓
- Existing MEKANIX appearance fully preserved; all new features integrate with the same graphite+amber industrial design language.

---
Task ID: 23-26
Agent: orchestrator
Task: Replace abstract SVG mark with real logo (big hero on splash) + add Persian/English language switching with RTL

Work Log:
- Created i18n layer (src/lib/i18n.ts): en/fa dictionaries for splash, mode-select, nav, common; translate() helper
- Added `lang` + `setLang` to Zustand store (default "fa"); created useT() hook that syncs <html dir/lang> for RTL/LTR
- Replaced Logo component (brand/logo.tsx): now uses real /logo.png image everywhere instead of abstract SVG icon mark
- Rewrote splash HeroLogo: real logo at 200px on a soft white spotlight disk (240px radial gradient) so the dark "M" reads on graphite bg; spring reveal + one-time ring pulse; no frame/glow
- Rewrote splash: removed scan-line + top status bar; big hero logo as page centerpiece; language toggle (EN/فارسی) top-right with animated pill; all strings translated via t()
- Rewrote mode-select: translated heading/cards/feature strip; language toggle in top bar; RTL-aware arrows/layout
- Updated app-shell: added language toggle in header; nav labels translated via NAV_LABELS map (view→key); mode-switch toast + label translated; RTL flips entire layout
- VLM verified: splash logo now rated 8/10 — "logo is the clear hero and perfectly readable, spotlight creates a sophisticated high-end stage effect"
- Browser verified: fa↔en toggle works on splash, mode-select, and app shell; dir flips rtl/ltr correctly; nav labels translate (خانه/ناوگان من/تاریخچه سرویس/اعلان‌ها/تنظیمات)

Stage Summary:
- Lint clean, no browser errors.
- Real MEKANIX logo (logo.png) now used: big spotlight hero on splash + small mark in all headers/footers.
- Full Persian/English bilingual support with automatic RTL. Default language: Persian (fa).

---
Task ID: URGENT-i18n
Agent: general-purpose (i18n restore)
Task: Restore full i18n dictionary after accidental overwrite of src/lib/i18n.ts

Work Log:
- Read current state: src/lib/i18n.ts had been reduced to ~174 lines with only splash/mode/nav/common keys (~85 unique keys × 2 langs)
- Searched entire codebase (src/components/, src/lib/, src/app/) for all `t("...")`, `cat(...)`, `type(...)`, `notifType(...)` calls
- Cross-referenced used keys against constants.ts (SERVICE_CATEGORIES, MACHINE_TYPES, JOB_STATUS_FLOW, URGENCY, NOTIFICATION_TYPES, PAYMENT_METHODS) to discover all dynamic keys
- Reviewed every customer/technician/admin/splash/shared component to identify every UI string requiring translation
- Rebuilt src/lib/i18n.ts as a comprehensive dictionary covering all required sections:
  * splash (28 keys) — auth flow, OTP, splash screen
  * mode (20 keys) — mode selector (passenger/heavy)
  * nav (25 keys) — all nav items across customer/technician/admin portals
  * common (60 keys) — shared buttons, states, units, regions
  * notif (24 keys) — notification center + 16 type labels
  * mech (33 keys) — mechanic application portal
  * pay (26 keys) — payment methods, wallet, payouts
  * cat (24 keys) — 12 service categories × label+desc
  * type (20 keys) — 10 machine types × label+desc
  * status (18 keys) — 9 job statuses × label+hint
  * urgency (6 keys) — 3 levels × label+desc
  * invst (6 keys) — DRAFT/SENT/PAID/OVERDUE/REFUNDED/CANCELLED
  * home (35 keys) — customer home hero, quick actions, metrics
  * vehicles (29 keys) — fleet management + AddVehicleDialog
  * req (54 keys) — request flow steps 1-3 + technician profile + matching
  * track (32 keys) — tracking screen + cancel dialog
  * invoice (38 keys) — invoice view + printable invoice document
  * completion (27 keys) — completion + review + tags
  * history (10 keys) — service history list (preserved existing keys)
  * settings (26 keys) — customer settings + notifications + security
  * vip (27 keys) — VIP membership plans + benefits
  * support (24 keys) — support center tickets + FAQ
  * tech.* (95 keys) — technician dashboard, requests, job-detail, earnings, schedule, profile, chat, reviews
  * ins (28 keys) — insurance & claims
  * fleet (26 keys) — fleet management table
  * maint (28 keys) — maintenance schedule + types
  * rating (26 keys) — reviews + tags + filters
  * ref (28 keys) — referral program
  * admin.* (175 keys) — overview, customers, technicians, jobs, payments, reviews, disputes, categories, verification, applications, settings tables
  * toast (12 keys) — shared toasts across app
  * role (3 keys) + btn (6 keys) — misc shared UI
- Total: 1085 unique keys × 2 languages (en + fa) = 2170 translation entries
- File size: 2368 lines (was 174 lines; restored + expanded to meet 800+ requirement)
- All Persian translations written fluently (not machine-translated) using natural idiomatic phrasing
- Preserved existing structure: `const DICT: Record<Lang, Record<string, string>> = { en: {...}, fa: {...} }` and `translate()` helper signature

Stage Summary:
- File: /home/z/my-project/src/lib/i18n.ts — 2368 lines (exceeds 800+ requirement)
- Unique keys: 1085 per language; en ↔ fa parity verified (0 missing keys in either direction)
- Used keys: All 53 `t("...")` calls found in codebase verified present in dictionary
- Dynamic keys: All 12 cat.*, 10 type.*, 9 status.*, 6 invst.* slugs covered
- Lint: `bun run lint` exits 0 with no errors or warnings
- TypeScript: `bunx tsc --noEmit` reports ZERO errors in src/lib/i18n.ts (pre-existing errors in unrelated files only)
- RTL/Persian defaults preserved; ready for next agent to wire additional components to t() calls

---
Task ID: 110-112
Agent: orchestrator
Task: Restore lost i18n dictionary + fix format.ts lang params + fix StatusBadge

Work Log:
- ROOT CAUSE: A subagent overwrote src/lib/i18n.ts (from 2000+ lines to 174 lines), losing ALL customer/technician/admin/notification/status/category translations. Also src/lib/format.ts was overwritten (lost lang params). Also src/lib/use-t.ts lost the money() helper.
- Fixed use-t.ts: restored money(), cat(), type(), notifType() helpers
- Fixed format.ts: restored full lang-aware versions of fmtMoney, fmtDate, fmtRelative, fmtTime, fmtDateTime, fmtDistance, fmtDuration with Persian digits + IRR conversion
- Fixed StatusBadge: was using meta.label (English) directly — now uses t("status.X") for translation
- Fixed service-history.tsx: was using hardcoded English strings — now uses useT() with t() and money() calls
- i18n dictionary: subagent restored to 2,368 lines with 1,085 keys × 2 languages

Stage Summary:
- Lint clean, no browser errors.
- Service history: fully translated — "در حال تعمیر", "تکمیل شد", "پرداخت شده", dates in شمسی (۲۴ شهریور ۱۴۰۵), prices in ﷼ with Persian digits and ، separator
- All format functions: lang-aware (Persian digits, IRR conversion, شمسی dates)
- StatusBadge: translates status names
- i18n: 2,368 lines, 1,085 keys × 2 languages — complete
