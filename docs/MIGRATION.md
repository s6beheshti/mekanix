# MEKANIX — Production Migration Guide

This document covers the remaining architectural items that need to be
addressed before a production deployment.

---

## 1. SQLite → PostgreSQL Migration

### Current State
- Prisma `datasource db` uses `provider = "sqlite"`
- Suitable for development and demo, NOT for production

### Why PostgreSQL?
- Concurrent requests (SQLite has single-writer lock)
- JSON column support (for metadata fields)
- Better performance under load
- Decimal arithmetic precision
- Full-text search for vehicle catalog

### Migration Steps
1. Provision a PostgreSQL instance (e.g., Supabase, Neon, or self-hosted)
2. Set `DATABASE_URL` env var:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/mekanix
   ```
3. Change Prisma provider in `schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Run migration:
   ```bash
   bun run prisma migrate deploy
   ```
5. Seed the database:
   ```bash
   bun run prisma:seed
   ```

### env-based Provider Selection (future)
The schema can be made env-aware so dev uses SQLite and prod uses PostgreSQL:
```prisma
datasource db {
  provider = env("DATABASE_PROVIDER") // "sqlite" or "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 2. Redis for Distributed State

### Current State
- Rate limiting: in-memory `Map` (per-instance, not shared)
- Idempotency: in-memory `Map` (lost on restart)
- Session DB: Prisma (works, but Redis would be faster)

### Why Redis?
- Distributed rate limiting across multiple instances
- Persistent idempotency keys (survive restarts)
- Session storage (faster than DB for hot path)
- Pub/sub for real-time notifications

### Migration Steps
1. Provision Redis (e.g., Upstash, Redis Cloud, or self-hosted)
2. Set `REDIS_URL` env var:
   ```
   REDIS_URL=redis://localhost:6379
   ```
3. Install `ioredis`:
   ```bash
   bun add ioredis
   ```
4. Update `src/lib/rate-limit.ts` to use Redis:
   ```typescript
   import Redis from "ioredis";
   const redis = new Redis(process.env.REDIS_URL!);
   
   export async function rateLimit(key: string, max: number, windowMs: number) {
     const count = await redis.incr(key);
     if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000));
     return { success: count <= max, resetMs: windowMs };
   }
   ```
5. Update `src/lib/auth.ts` idempotency to use Redis instead of in-memory Map

---

## 3. Real ETA Provider (Routing API)

### Current State
- `estimateEta()` uses hardcoded 40 km/h average speed
- `EtaProvider` abstraction exists but uses default

### Why Real Routing?
- Traffic-aware ETA (Tehran traffic varies hugely)
- Accurate distance via road network (not haversine)
- Better technician matching

### Migration Steps
1. Choose a routing API (Google Maps, Mapbox, OSRM, Neshan)
2. Implement the `EtaProvider` interface:
   ```typescript
   import { setEtaProvider } from "@/lib/dispatch";
   
   const neshanProvider: EtaProvider = async (lat1, lng1, lat2, lng2) => {
     const res = await fetch(`https://api.neshan.org/v4/direction?type=car&origin=${lng1},${lat1}&destination=${lng2},${lat2}`, {
       headers: { "Api-Key": process.env.NESHAN_API_KEY! },
     });
     const data = await res.json();
     return data.routes[0].legs[0].duration.value / 60; // seconds → minutes
   };
   
   setEtaProvider(neshanProvider);
   ```
3. Set the API key in env:
   ```
   NESHAN_API_KEY=your_key_here
   ```

---

## 4. Service Write-Side Unification

### Current State
- `ServiceRequest → Job` (general repair)
- `ServiceBooking → Inspection/Finding/Approval` (CARE)
- Unified read facade exists (`src/lib/service-unified.ts`)
- Write-side is still split

### Why Unify Writes?
- Single state machine for all service types
- Simpler API surface
- Easier to add new service types

### Migration Steps (future, after production launch)
1. Create a unified `Service` table that merges both models
2. Migrate existing data (Job → Service, ServiceBooking → Service)
3. Update all API routes to use the unified model
4. Deprecate Job and ServiceBooking tables
5. This is a major refactor — defer until MVP is stable in production

---

## Summary Checklist

| Item | Status | Priority |
|------|--------|----------|
| PostgreSQL | Documented, env-based ready | High |
| Redis | Documented, interface ready | High |
| Real ETA | Abstraction ready, needs provider | Medium |
| Write-side unification | Read facade done, writes deferred | Low (post-MVP) |
| CI/CD | GitHub Actions workflow ready | High |
