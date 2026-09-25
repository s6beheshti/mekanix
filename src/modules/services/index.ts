// MEKANIX — Services module barrel.
//
// "Services" here = the on-demand repair flow (ServiceRequest + Job). This is
// distinct from the CARE module which covers scheduled maintenance bookings.
//
// Re-exports:
//   - Zod schemas for service requests, job status updates, job diagnosis.
//   - Prisma-derived ServiceRequest / Job / Invoice domain types.
//   - Server-side BOLA helpers for jobs (requireJobParticipant).

export {
  serviceRequestCreateSchema,
  jobStatusUpdateSchema,
  jobDiagnosisSchema,
  URGENCY_LEVELS,
  type ServiceRequestCreateInput,
  type JobStatusUpdateInput,
  type JobDiagnosisInput,
} from "@/lib/schemas/service";

export {
  type ServiceRequest,
  type Job,
  type Invoice,
  type ServiceCategory,
} from "@/lib/api";

export {
  requireJobParticipant,
  type Session,
} from "@/lib/auth";
