// Dispatch Engine — selects the best technician for a service request.
//
// Score formula (per ARCHITECTURE.md §10):
//   score = (distance * 0.4) + (skill * 0.3) + (rating * 0.2) + (speed * 0.1)
//
// All inputs are normalized to 0..1 before weighting.
//
// Schema mapping notes:
//   - The Prisma `DispatchCandidate` model stores ETA in `eta` (Int?, minutes)
//     and rank in `finalRank` (Int?). The public DispatchCandidate interface
//     exposes them as `etaMins` / `rank` for caller ergonomics — the mapping
//     happens inside `autoAssignTechnician()` when persisting.

import { db } from "./db";

export interface DispatchInput {
  lat: number;
  lng: number;
  requiredSkills: string[]; // e.g. ["engine", "diagnostic"]
  vehicleType?: string; // "CAR" | "TRUCK" | etc.
}

export interface DispatchCandidate {
  technicianId: string;
  userId: string;
  name: string;
  score: number;
  distance: number; // km
  etaMins: number;
  skillsMatched: number;
  skillsTotal: number;
  rating: number;
  level: string;
  available: boolean;
}

// Haversine distance (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Normalize a value to 0..1 given a min and max
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ETA estimate: assume 40 km/h average urban speed
function estimateEta(distanceKm: number): number {
  return Math.ceil((distanceKm / 40) * 60);
}

// Rank technicians for a dispatch request
export async function findBestTechnicians(input: DispatchInput, limit = 5): Promise<DispatchCandidate[]> {
  // Fetch available technicians with their specialties
  const technicians = await db.technician.findMany({
    where: { availableNow: true, status: "ONLINE" },
    include: {
      user: { select: { id: true, name: true } },
      specialties: true,
    },
    take: 50, // pre-filter pool
  });

  const candidates: DispatchCandidate[] = [];

  for (const tech of technicians) {
    const distance = haversineKm(input.lat, input.lng, tech.lat ?? input.lat, tech.lng ?? input.lng);

    // Skip if too far (50km radius)
    if (distance > 50) continue;

    // Skill matching
    const techSkills = tech.specialties.map((s) => s.category);
    const skillsMatched = input.requiredSkills.filter((s) => techSkills.includes(s)).length;
    const skillsTotal = input.requiredSkills.length;
    const skillRatio = skillsTotal > 0 ? skillsMatched / skillsTotal : 0.5;

    // Normalize metrics
    const distScore = 1 - normalize(distance, 0, 50); // closer = higher score
    const ratingScore = normalize(tech.rating ?? 0, 0, 5);
    const speedScore = normalize(tech.responseMins ?? 30, 5, 60);
    const speedNormalized = 1 - speedScore; // faster response = higher score

    // Weighted score per ARCHITECTURE.md §10
    const score = distScore * 0.4 + skillRatio * 0.3 + ratingScore * 0.2 + speedNormalized * 0.1;

    candidates.push({
      technicianId: tech.id,
      userId: tech.user.id,
      name: tech.user.name ?? "Unknown",
      score: Math.round(score * 100) / 100,
      distance: Math.round(distance * 10) / 10,
      etaMins: estimateEta(distance),
      skillsMatched,
      skillsTotal,
      rating: tech.rating ?? 0,
      level: tech.level,
      available: tech.availableNow,
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// Auto-assign: pick the top candidate and persist all ranked candidates for audit.
//
// Schema mapping (DispatchCandidate Prisma model):
//   - `etaMins`  → `eta`       (Int?, minutes)
//   - `rank`     → `finalRank` (Int?)
export async function autoAssignTechnician(jobId: string, input: DispatchInput): Promise<DispatchCandidate | null> {
  const candidates = await findBestTechnicians(input, 5);
  if (candidates.length === 0) return null;

  const best = candidates[0];

  // Store all candidates in DB for audit
  await db.dispatchCandidate.createMany({
    data: candidates.map((c, idx) => ({
      bookingId: jobId,
      technicianId: c.technicianId,
      score: c.score,
      distance: c.distance,
      eta: c.etaMins,
      finalRank: idx + 1,
    })),
  });

  return best;
}
