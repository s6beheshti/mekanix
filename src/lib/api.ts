// MEKANIX — typed API client (browser fetch wrapper)
import type { Prisma } from "@prisma/client";
import type {
  User as UserModel,
  Vehicle as VehicleModel,
  Payment as PaymentModel,
  Notification as NotificationModel,
  ServiceCategory as ServiceCategoryModel,
} from "@prisma/client";

// Re-export Prisma-generated types so the rest of the app has full typing.
export type User = UserModel;
export type Customer = Prisma.CustomerGetPayload<{ include: { user: true } }>;
export type Technician = Prisma.TechnicianGetPayload<{
  include: {
    user: true;
    specialties: true;
    certifications: true;
    serviceAreas: true;
  };
}>;
export type Vehicle = VehicleModel;
export type ServiceRequest = Prisma.ServiceRequestGetPayload<{
  include: {
    customer: { include: { user: true } };
    vehicle: true;
    matchedTech: { include: { user: true } };
    job: { include: { technician: { include: { user: true } }; invoice: true; reviews: true } };
  };
}>;
export type Job = Prisma.JobGetPayload<{
  include: {
    request: { include: { customer: { include: { user: true } }; vehicle: true } };
    technician: { include: { user: true; specialties: true } };
    parts: true;
    diagnosisRecords: true;
    invoice: true;
    reviews: true;
    messages: { include: { fromUser: true } };
    tracking: true;
  };
}>;
export type Invoice = Prisma.InvoiceGetPayload<{ include: { job: true; payment: true } }>;
export type Payment = PaymentModel;
export type Review = Prisma.ReviewGetPayload<{ include: { fromUser: true } }>;
export type Message = Prisma.MessageGetPayload<{ include: { fromUser: true } }>;
export type Notification = NotificationModel;
export type ServiceCategory = ServiceCategoryModel;

export type Role = "CUSTOMER" | "TECHNICIAN" | "ADMIN";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Dashboard
  dashboardStats: () => req<{ data: DashboardStats }>("/api/dashboard").then((r) => r.data),

  // Technicians
  listTechnicians: (params?: { lat?: number; lng?: number; category?: string }) => {
    const q = new URLSearchParams();
    if (params?.lat != null) q.set("lat", String(params.lat));
    if (params?.lng != null) q.set("lng", String(params.lng));
    if (params?.category) q.set("category", params.category);
    return req<Technician[]>(`/api/technicians?${q.toString()}`);
  },
  getTechnician: (id: string) => req<Technician>(`/api/technicians/${id}`),

  // Vehicles
  listVehicles: (customerId: string) => req<Vehicle[]>(`/api/vehicles?customerId=${customerId}`).catch(() => []),
  createVehicle: (data: Partial<Vehicle> & { customerId: string }) =>
    req<Vehicle>(`/api/vehicles`, { method: "POST", body: JSON.stringify(data) }),
  deleteVehicle: (id: string) => req<{ ok: boolean }>(`/api/vehicles/${id}`, { method: "DELETE" }),

  // Service requests
  listRequests: (customerId?: string, technicianId?: string) => {
    const q = new URLSearchParams();
    if (customerId) q.set("customerId", customerId);
    if (technicianId) q.set("technicianId", technicianId);
    return req<ServiceRequest[]>(`/api/service-requests?${q.toString()}`);
  },
  createRequest: (data: any) =>
    req<ServiceRequest>(`/api/service-requests`, { method: "POST", body: JSON.stringify(data) }),

  // Jobs
  listJobs: (params?: { technicianId?: string; customerId?: string; status?: string }) => {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => v && q.set(k, v));
    return req<Job[]>(`/api/jobs?${q.toString()}`);
  },
  getJob: (id: string) => req<Job>(`/api/jobs/${id}`),
  updateJobStatus: (id: string, status: string, extra?: any) =>
    req<Job>(`/api/jobs/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...extra }),
    }),
  setJobDiagnosis: (id: string, diagnosis: string, severity?: string, faultCode?: string) =>
    req<Job>(`/api/jobs/${id}/diagnosis`, {
      method: "PATCH",
      body: JSON.stringify({ diagnosis, severity, faultCode }),
    }),
  addPart: (jobId: string, part: { name: string; sku?: string; quantity: number; unitPrice: number }) =>
    req<Job>(`/api/jobs/${jobId}/parts`, { method: "POST", body: JSON.stringify(part) }),
  removePart: (jobId: string, partId: string) =>
    req<Job>(`/api/jobs/${jobId}/parts`, { method: "DELETE", body: JSON.stringify({ partId }) }),

  // Invoices
  getInvoice: (jobId: string) => req<Invoice | null>(`/api/invoices?jobId=${jobId}`),
  createInvoice: (jobId: string, data: any) =>
    req<Invoice>(`/api/invoices`, { method: "POST", body: JSON.stringify({ jobId, ...data }) }),
  updateInvoice: (id: string, data: any) =>
    req<Invoice>(`/api/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Payments
  payInvoice: (invoiceId: string, method: string) =>
    req<Payment>(`/api/payments`, { method: "POST", body: JSON.stringify({ invoiceId, method }) }),

  // Reviews
  createReview: (data: { jobId: string; technicianId: string; rating: number; comment?: string }) =>
    req<Review>(`/api/reviews`, { method: "POST", body: JSON.stringify(data) }),

  // Messages
  listMessages: (jobId: string) => req<Message[]>(`/api/messages?jobId=${jobId}`),
  sendMessage: (jobId: string, body: string, fromUserId: string, kind = "text") =>
    req<Message>(`/api/messages`, { method: "POST", body: JSON.stringify({ jobId, body, kind, fromUserId }) }),

  // Notifications
  listNotifications: (userId: string) => req<Notification[]>(`/api/notifications?userId=${userId}`),
  markNotificationRead: (id: string) =>
    req<Notification>(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) }),
  markAllRead: (userId: string) =>
    req<{ ok: boolean }>(`/api/notifications?userId=${userId}`, { method: "PATCH", body: JSON.stringify({ read: true }) }),

  // Admin
  adminList: (resource: string) => req<any[]>(`/api/admin/${resource}`),
  adminUpdate: (resource: string, id: string, data: any) =>
    req<any>(`/api/admin/${resource}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Seed (for first run convenience)
  reseed: () => req<{ ok: boolean }>("/api/seed", { method: "POST" }),
};

export interface DashboardStats {
  kpis: {
    activeRequests: number;
    techniciansOnline: number;
    jobsInProgress: number;
    completedJobs30d: number;
    revenue30d: number;
    avgResponseMins: number;
    customerSatisfaction: number;
  };
  revenueSeries: { date: string; revenue: number; jobs: number }[];
  statusBreakdown: { status: string; count: number }[];
  categoryBreakdown: { category: string; count: number; revenue: number }[];
  techPerformance: { name: string; jobs: number; rating: number; revenue: number }[];
  recentActivity: { id: string; label: string; sub: string; tone: string; ts: string }[];
}
