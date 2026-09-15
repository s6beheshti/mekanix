"use client";
// MEKANIX — global UI state (Zustand). Handles role-switch + view navigation
// for the single-route SPA, plus auth context for the active demo identity.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "./api";

export type CustomerView =
  | "home"
  | "vehicles"
  | "request-type"
  | "describe"
  | "matching"
  | "technician-profile"
  | "track"
  | "invoice"
  | "completion"
  | "service-history"
  | "chat"
  | "notifications"
  | "settings";

export type TechView =
  | "dashboard"
  | "requests"
  | "job-detail"
  | "earnings"
  | "schedule"
  | "profile"
  | "reviews"
  | "notifications";

export type AdminView =
  | "overview"
  | "customers"
  | "technicians"
  | "jobs"
  | "payments"
  | "reviews"
  | "disputes"
  | "categories"
  | "verification"
  | "settings";

interface NavState {
  view: string;
  params: Record<string, any>;
  go: (view: string, params?: Record<string, any>) => void;
  back: () => void;
  reset: (view: string) => void;
}

interface RoleState extends NavState {
  role: Role;
  userId: string | null; // active demo user id per role
  history: { view: string; params: Record<string, any> }[];
  setRole: (role: Role) => void;
  setUserId: (id: string) => void;
}

export const useApp = create<RoleState>()(
  persist(
    (set, get) => ({
      role: "CUSTOMER",
      userId: null,
      view: "home",
      params: {},
      history: [],
      setRole: (role) =>
        set({ role, view: role === "CUSTOMER" ? "home" : role === "TECHNICIAN" ? "dashboard" : "overview", params: {}, history: [] }),
      setUserId: (userId) => set({ userId }),
      go: (view, params = {}) => {
        const { view: cur, params: curParams, history } = get();
        set({ view, params, history: [...history, { view: cur, params: curParams }].slice(-30) });
      },
      back: () => {
        const { history } = get();
        if (history.length === 0) return;
        const last = history[history.length - 1];
        set({ view: last.view, params: last.params, history: history.slice(0, -1) });
      },
      reset: (view) => set({ view, params: {}, history: [] }),
    }),
    { name: "mekanix-app" }
  )
);

// Demo identity map: which seeded user represents each role by default.
export const DEMO_USERS = {
  CUSTOMER: "cus_demo",   // resolved at runtime from /api/auth/demo
  TECHNICIAN: "tech_demo",
  ADMIN: "admin_demo",
} as const;
