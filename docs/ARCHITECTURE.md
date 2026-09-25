# MEKANIX

# System Architecture Blueprint v1.0

---

# 0. معرفی پروژه

## نام پروژه

**MEKANIX**

شبکه تعمیرات سیار هوشمند برای:

- ماشین‌آلات سنگین
- خودروهای سواری منتخب
- شبکه تکنسین‌ها
- سرویس دوره‌ای
- تعمیرات
- گارانتی خدمات
- مدیریت ناوگان

---

# 1. Vision Architecture

هدف MEKANIX:

ساخت یک زیرساخت خدماتی که بین:

```text
مالک دستگاه / خودرو

        ↓

MEKANIX Platform

        ↓

تکنسین متخصص

        ↓

خدمات، تعمیر، نگهداری
```

ارتباط هوشمند ایجاد کند.

MEKANIX فقط یک اپ درخواست تعمیر نیست.

بلکه:

```text
Service Network

+

Technician Marketplace

+

Maintenance Intelligence

+

Fleet Management
```

است.

---

# 2. High Level Architecture

معماری کل:

```
                 MEKANIX PLATFORM


              ┌─────────────────┐
              │   Customer App  │
              └────────┬────────┘

                       │

              ┌────────▼────────┐
              │   Core Backend  │
              └────────┬────────┘

                       │


 ┌───────────────┬───────────────┬───────────────┐

 Auth Core       Asset Core      Service Core


 ┌───────────────┬───────────────┬───────────────┐

 CARE Engine     Dispatch        Pricing Engine


 ┌───────────────┬───────────────┬───────────────┐

 Wallet          Notification    Analytics


                       │

              ┌────────▼────────┐
              │ Technician App  │
              └─────────────────┘
```

---

# 3. Technology Architecture

## Frontend

پیشنهاد:

```text
Next.js

React

TypeScript

TailwindCSS

Shadcn UI

Framer Motion

GSAP
```

---

## Backend

```text
Next.js API Routes

Node.js

Prisma ORM

PostgreSQL
```

---

## Validation

```text
Zod
```

---

## Authentication

```text
OTP Authentication

JWT / Session

Role Based Access
```

---

# 4. Project Folder Architecture

ساختار پیشنهادی:

```
src/

├── app/

│   ├── api/

│   ├── dashboard/

│   ├── technician/

│   └── customer/


├── modules/


│   ├── auth/

│   ├── users/

│   ├── assets/

│   ├── services/

│   ├── dispatch/

│   ├── care/

│   ├── pricing/

│   ├── wallet/

│   └── notifications/


├── components/


├── lib/


├── database/


└── types/
```

---

# 5. User Architecture

## User Model

کاربر اصلی:

```typescript
User {
  id
  phone
  phoneVerified
  role
  status
  createdAt
  updatedAt
}
```

---

## Role System

```
USER
├── CUSTOMER
├── TECHNICIAN
├── ADMIN
├── FLEET_MANAGER
└── PARTNER
```

---

# 6. Authentication Architecture

## تصمیم نهایی:

عدم استفاده از Password.

فقط:

```
Mobile Number

↓

OTP

↓

Verify

↓

Session

↓

Access
```

---

## OTP Model

Prisma:

```prisma
model OTP {
  id String @id @default(uuid())
  phone String
  codeHash String
  expiresAt DateTime
  verified Boolean @default(false)
  createdAt DateTime @default(now())
}
```

---

## Session Model

```prisma
model Session {
  id String @id @default(uuid())
  userId String
  token String
  device String?
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## Demo Endpoints (`/api/auth/demo`) — Production Stripping

`/api/auth/demo/*` is a dev-only convenience endpoint that returns pre-seeded
demo users for one-click sign-in. It MUST NOT exist in production builds.

Two layers of defense:

1. **Handler-level guard** (`src/app/api/auth/demo/route.ts`): the route
   handler short-circuits with a bare `404` (no DB query, no JSON body)
   whenever `process.env.NODE_ENV === "production"`. This is defense-in-depth.

2. **Build-time stripping** (recommended): production `next.config.ts`
   should add a rewrite that short-circuits `/api/auth/demo/*` → `/404`
   before the route handler ever runs. Example:

   ```ts
   // next.config.ts
   const nextConfig: NextConfig = {
     async rewrites() {
       if (process.env.NODE_ENV === "production") {
         return [
           { source: "/api/auth/demo/:path*", destination: "/api/404" },
         ];
       }
       return [];
     },
   };
   ```

   This guarantees the route's code (and therefore any DB queries it would
   run) is never executed in production even if the handler guard is
   accidentally removed in a future refactor.

---

# 7. Asset Architecture

هسته اصلی MEKANIX:

به جای جدا کردن خودرو و ماشین‌آلات:

```
Asset
  |
  ├── Vehicle
  |
  └── Machinery
```

---

## Asset Model

```prisma
model Asset {
  id String @id @default(uuid())
  ownerId String
  type String
  brand String
  model String
  year Int?
  location String?
  createdAt DateTime @default(now())
}
```

---

## Vehicle

مثال:

```
BMW
Farda Motor
Kerman Motor
Modiran Khodro
```

اطلاعات:

```text
VIN
Plate
Mileage
Fuel
Service History
```

---

## Machinery

مثال:

```
Loader
Excavator
Crane
Mining Equipment
```

اطلاعات:

```text
Serial Number
Working Hours
Engine Hours
Maintenance Cycle
```

---

# 8. Service Architecture

درخواست تعمیر:

یک State Machine است.

---

Flow:

```
REQUEST CREATED
        ↓
MATCHING
        ↓
TECHNICIAN ASSIGNED
        ↓
TECHNICIAN MOVING
        ↓
ARRIVED
        ↓
DIAGNOSIS
        ↓
PRICE APPROVAL
        ↓
REPAIR
        ↓
PAYMENT
        ↓
COMPLETED
        ↓
WARRANTY
```

---

## Service Model

```prisma
model ServiceRequest {
  id String @id @default(uuid())
  userId String
  assetId String
  technicianId String?
  status String
  description String
  createdAt DateTime @default(now())
}
```

---

# 9. Technician Architecture

تکنسین فقط یک User نیست.

Profile جدا دارد:

```typescript
TechnicianProfile {
  userId
  skills
  experience
  serviceArea
  rating
  availability
  verificationStatus
}
```

---

# 10. Dispatch Engine

وظیفه:

انتخاب بهترین تکنسین.

---

Algorithm:

```
Request
↓
Location
↓
Required Skill
↓
Available Technician
↓
Score
↓
Mission
```

---

Score:

```typescript
score =
  (distance * 0.4)
  + (skill * 0.3)
  + (rating * 0.2)
  + (speed * 0.1)
```

---

# 11. CARE Engine

نگهداری پیشگیرانه.

---

مثال:

ماشین‌آلات:

```
CAT Loader
Hours: 2450
Next Service: 2500
```

---

قابلیت:

- Reminder
- Maintenance History
- Prediction

---

# 12. Pricing Engine

قیمت مرکزی:

```
Final Price
=
Labor
+ Parts
+ Travel
+ Emergency
- Discount
```

---

مدل:

```typescript
Pricing {
  labor
  parts
  travel
  discount
  currency
}
```

---

# 13. VIP Engine

قانون:

VIP:
دارد:

```
Annual Subscription
+ Free Periodic Visit
+ Priority Service
```

ندارد:

```
Free Repair
Free Parts
```

---

# 14. Wallet Engine

برای تکنسین:

```
Completed Job
↓
Invoice
↓
Commission
↓
Balance
↓
Withdrawal
```

---

# 15. Notification Architecture

مرکز اعلان:

```
Notification
├ OTP
├ Service Update
├ Technician Movement
├ Payment
├ Warranty
└ Reminder
```

---

# 16. Lite Mode Architecture

برای اینترنت ضعیف ایران:

خیلی مهم.

---

## Offline Strategy

```
User Action
↓
Local Storage
↓
Queue
↓
Internet Available
↓
Sync Server
```

---

## API Lite

به جای:

```
Full Response
```

می‌شود:

```
Lite Response
```

مثال:

```json
{
  "id": 123,
  "status": "moving",
  "tech": "Ali"
}
```

---

# 17. Security Architecture

## Rate Limit

مثال:

```
OTP Request
5 times / hour
```

---

## Permission Guard

```typescript
can("user.create.service")
can("technician.accept.mission")
```

---

# 18. Admin Architecture

پنل مدیریت:

```
Admin Dashboard
├ Users
├ Technicians
├ Services
├ Payments
├ Reports
└ Settings
```

---

# 19. Development Roadmap

## Phase 01

Architecture
✅ انجام شد

---

## Phase 02

Security + Environment

---

## Phase 03

Core Refactor

شامل:

- Auth
- User
- Asset
- Service

---

## Phase 04

Business Engines

- CARE
- Dispatch
- Pricing
- VIP
- Wallet

---

## Phase 05

Lite Mode

---

## Phase 06

Testing

```
Unit Test
Integration Test
Security Test
Performance Test
```

---

## Phase 07

Release

```
MEKANIX v1.0
```

---

# نتیجه نهایی معماری

MEKANIX تبدیل می‌شود به:

```
                 MEKANIX


       Intelligent Service Network


Customer
   +
Technician
   +
Asset Intelligence
   +
Maintenance Engine
   +
Dispatch System
   +
Fleet Management
```

---

این سند، نقشه مادر پروژه است.
از اینجا به بعد هر کدی که نوشته شود باید زیر یکی از همین Moduleها قرار بگیرد تا پروژه در آینده مجبور به بازنویسی نشود.
