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
